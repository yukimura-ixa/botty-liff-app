"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { theme as t } from "@/lib/theme";
import {
  openApproverSession, getApproverToken, endApproverSession,
  ApiError, type ApproverTokenInfo,
} from "@/lib/api";
import { shouldAutoShow } from "@/components/tutorial/logic";

// Guards against an auto-show redirect loop when localStorage writes are blocked
// (LIFF private mode): markSeen can't persist, so without this in-memory guard the
// council tutorial would re-trigger every time the user is routed back to /approver.
// Module-level state survives client-side navigation (the module isn't reloaded),
// so the auto-show fires at most once per loaded session.
let councilTutorialAutoShown = false;

type Stand = {
  sessionId: string;
  expiresAtMs: number;
  tok: ApproverTokenInfo;
};

export default function ApproverPage() {
  const router = useRouter();
  const [stand, setStand] = useState<Stand | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [expired, setExpired] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Holds the latest scheduleRefetch so the timer callback can re-arm itself
  // without referencing the const before its initializer completes.
  const scheduleRefetchRef = useRef<(sessionId: string, validUntilSec: number) => void>(() => {});

  // First time a staff member opens this screen, show the council tutorial once.
  useEffect(() => {
    if (!councilTutorialAutoShown && shouldAutoShow("council", (k) => localStorage.getItem(k))) {
      councilTutorialAutoShown = true;
      router.replace("/tutorial?deck=council");
    }
  }, [router]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const clearRefetch = useCallback(() => {
    if (refetchTimer.current) {
      clearTimeout(refetchTimer.current);
      refetchTimer.current = null;
    }
  }, []);

  // Schedules the next current-token fetch ~2s before the active token expires.
  const scheduleRefetch = useCallback((sessionId: string, validUntilSec: number) => {
    clearRefetch();
    const leadMs = 2000;
    const delay = Math.max(1000, validUntilSec * 1000 - Date.now() - leadMs);
    refetchTimer.current = setTimeout(async () => {
      try {
        const tok = await getApproverToken(sessionId);
        setStand((s) => (s ? { ...s, tok } : s));
        scheduleRefetchRef.current(sessionId, tok.validUntil);
      } catch (e: unknown) {
        if (e instanceof ApiError && e.status === 410) {
          setExpired(true);
          return;
        }
        // Transient failure: keep the stale QR; a manual refresh button is shown.
        setErr(e instanceof Error ? e.message : "รีเฟรชไม่สำเร็จ");
      }
    }, delay);
  }, [clearRefetch]);
  useEffect(() => {
    scheduleRefetchRef.current = scheduleRefetch;
  }, [scheduleRefetch]);

  const startSession = useCallback(async () => {
    setBusy(true); setErr(""); setExpired(false);
    try {
      const r = await openApproverSession();
      const tok: ApproverTokenInfo = {
        token: r.token, slot: r.slot, validFrom: r.validFrom, validUntil: r.validUntil, awardsCount: r.awardsCount,
      };
      setStand({ sessionId: r.sessionId, expiresAtMs: new Date(r.expiresAt).getTime(), tok });
      scheduleRefetch(r.sessionId, r.validUntil);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally { setBusy(false); }
  }, [scheduleRefetch]);

  const manualRefresh = useCallback(async () => {
    if (!stand) return;
    setErr("");
    try {
      const tok = await getApproverToken(stand.sessionId);
      setStand((s) => (s ? { ...s, tok } : s));
      scheduleRefetch(stand.sessionId, tok.validUntil);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 410) { setExpired(true); return; }
      setErr(e instanceof Error ? e.message : "รีเฟรชไม่สำเร็จ");
    }
  }, [stand, scheduleRefetch]);

  const stopSession = useCallback(async () => {
    if (!stand) return;
    setBusy(true);
    clearRefetch();
    try {
      await endApproverSession(stand.sessionId);
      setStand(null);
      setQrDataUrl("");
      setExpired(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally { setBusy(false); }
  }, [stand, clearRefetch]);

  useEffect(() => () => clearRefetch(), [clearRefetch]);

  // Render the QR whenever the active token changes.
  useEffect(() => {
    if (!stand || expired) return;
    let cancelled = false;
    (async () => {
      const QRCode = (await import("qrcode")).default;
      const url = await QRCode.toDataURL(stand.tok.token, { errorCorrectionLevel: "M", width: 512, margin: 1 });
      if (!cancelled) setQrDataUrl(url);
    })().catch((e) => console.error("qr render failed", e));
    return () => { cancelled = true; };
  }, [stand, expired]);

  const secsLeftInSlot = stand ? Math.max(0, Math.ceil(stand.tok.validUntil - now / 1000)) : 0;

  return (
    <main style={{ minHeight: "100dvh", background: t.bone, padding: "32px 20px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button
          onClick={() => router.replace("/home")}
          style={{
            background: "transparent", border: "none", color: t.muted,
            fontSize: 13, padding: 0, cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ← กลับ
        </button>
        <button
          onClick={() => router.push("/tutorial?deck=council")}
          style={{
            background: "transparent", border: "none", color: t.moss,
            fontSize: 13, padding: 0, cursor: "pointer", fontWeight: 700,
            fontFamily: "inherit",
          }}
        >
          วิธีใช้ ?
        </button>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 800, color: t.forest, margin: "0 0 6px" }}>
        QR เจ้าหน้าที่
      </h1>
      <p style={{ fontSize: 13, color: t.muted, margin: "0 0 22px", lineHeight: 1.5 }}>
        นักเรียนสแกน QR นี้เพื่อรับคะแนน · QR เปลี่ยนทุก 5 นาที · นักเรียนสแกนรับคะแนนได้หลายคน
      </p>

      {err && (
        <div style={{ padding: 12, background: `${t.coral}22`, color: t.coral, borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
          {err}
        </div>
      )}

      {!stand && (
        <button
          onClick={startSession}
          disabled={busy}
          style={{
            width: "100%", height: 56, borderRadius: 14, border: "none",
            background: t.forest, color: "white",
            fontSize: 16, fontWeight: 800, cursor: busy ? "default" : "pointer",
            fontFamily: "inherit", opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? "กำลังเปิด..." : "เปิด QR เจ้าหน้าที่"}
        </button>
      )}

      {stand && !expired && (
        <>
          <div style={{
            background: "white", border: `1px solid ${t.mint}`, borderRadius: 18,
            padding: 18, textAlign: "center",
          }}>
            <div style={{
              fontSize: 11, color: t.muted, letterSpacing: 0.8, fontWeight: 600,
              textTransform: "uppercase", marginBottom: 6,
            }}>
              ให้คะแนนแล้ว {stand.tok.awardsCount} ครั้ง
            </div>
            {qrDataUrl ? (
              // base64 data URI — next/image cannot optimize data: sources
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt="staff QR"
                style={{ width: "100%", maxWidth: 320, borderRadius: 10, margin: "0 auto", display: "block" }}
              />
            ) : (
              <div style={{ width: "100%", aspectRatio: "1", maxWidth: 320, margin: "0 auto", background: t.mint, borderRadius: 10 }} />
            )}
            <div style={{
              marginTop: 10, fontSize: 11, color: t.moss, fontWeight: 700,
            }}>
              QR จะเปลี่ยนใน {secsLeftInSlot} วิ
            </div>
          </div>

          <button
            onClick={manualRefresh}
            disabled={busy}
            style={{
              marginTop: 16, width: "100%", height: 44, borderRadius: 12,
              background: "white", color: t.forest, border: `1px solid ${t.mint}`,
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            รีเฟรช QR
          </button>
          <button
            onClick={stopSession}
            disabled={busy}
            style={{
              marginTop: 10, width: "100%", height: 44, borderRadius: 12,
              background: "white", color: t.coral, border: `1px solid ${t.coral}`,
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            ปิด QR
          </button>
        </>
      )}

      {stand && expired && (
        <div style={{
          background: "white", border: `1px solid ${t.mint}`, borderRadius: 18,
          padding: 22, textAlign: "center",
        }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⏱️</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.ink, marginBottom: 14 }}>
            เซสชันหมดเวลา
          </div>
          <button
            onClick={() => { setStand(null); setQrDataUrl(""); setExpired(false); startSession(); }}
            disabled={busy}
            style={{
              width: "100%", height: 44, borderRadius: 12, border: "none",
              background: t.forest, color: "white",
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            เปิดใหม่
          </button>
        </div>
      )}
    </main>
  );
}

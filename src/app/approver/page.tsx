"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { theme as t } from "@/lib/theme";
import {
  openApproverSession, endApproverSession,
  type ApproverSlotToken,
} from "@/lib/api";

const SLOT_MS = 30_000;

type Session = {
  sessionId: string;
  startedAtMs: number;
  expiresAtMs: number;
  tokens: ApproverSlotToken[];
};

export default function ApproverPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const startSession = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      const r = await openApproverSession();
      setSession({
        sessionId: r.sessionId,
        startedAtMs: new Date(r.startedAt).getTime(),
        expiresAtMs: new Date(r.expiresAt).getTime(),
        tokens: r.tokens,
      });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally { setBusy(false); }
  }, []);

  const stopSession = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      await endApproverSession(session.sessionId);
      setSession(null);
      setQrDataUrl("");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally { setBusy(false); }
  }, [session]);

  const slotIdx = session
    ? Math.max(0, Math.min(session.tokens.length - 1, Math.floor((now - session.startedAtMs) / SLOT_MS)))
    : -1;
  const currentToken = session && slotIdx >= 0 ? session.tokens[slotIdx] : null;
  const sessionEnded = session ? now >= session.expiresAtMs : false;
  const secsLeftInSlot = currentToken ? Math.max(0, Math.ceil((currentToken.validUntil * 1000 - now) / 1000)) : 0;
  const secsLeftInSession = session ? Math.max(0, Math.ceil((session.expiresAtMs - now) / 1000)) : 0;
  const mins = Math.floor(secsLeftInSession / 60);
  const secs = secsLeftInSession % 60;

  useEffect(() => {
    if (!currentToken || sessionEnded) return;
    let cancelled = false;
    (async () => {
      const QRCode = (await import("qrcode")).default;
      const url = await QRCode.toDataURL(currentToken.token, { errorCorrectionLevel: "M", width: 512, margin: 1 });
      if (!cancelled) setQrDataUrl(url);
    })().catch((e) => console.error("qr render failed", e));
    return () => { cancelled = true; };
  }, [currentToken, sessionEnded]);

  return (
    <main style={{ minHeight: "100dvh", background: t.bone, padding: "32px 20px 40px" }}>
      <button
        onClick={() => router.replace("/home")}
        style={{
          background: "transparent", border: "none", color: t.muted,
          fontSize: 13, padding: 0, cursor: "pointer", marginBottom: 16,
          fontFamily: "inherit",
        }}
      >
        ← กลับ
      </button>

      <h1 style={{ fontSize: 24, fontWeight: 800, color: t.forest, margin: "0 0 6px" }}>
        QR เจ้าหน้าที่
      </h1>
      <p style={{ fontSize: 13, color: t.muted, margin: "0 0 22px", lineHeight: 1.5 }}>
        นักเรียนสแกน QR นี้เพื่อรับคะแนน · QR เปลี่ยนทุก 30 วินาที · เซสชัน 15 นาที
      </p>

      {err && (
        <div style={{ padding: 12, background: `${t.coral}22`, color: t.coral, borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
          {err}
        </div>
      )}

      {!session && (
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
          {busy ? "กำลังเปิด..." : "เปิดเซสชัน 15 นาที"}
        </button>
      )}

      {session && !sessionEnded && (
        <>
          <div style={{
            background: "white", border: `1px solid ${t.mint}`, borderRadius: 18,
            padding: 18, textAlign: "center",
          }}>
            <div style={{
              fontSize: 11, color: t.muted, letterSpacing: 0.8, fontWeight: 600,
              textTransform: "uppercase", marginBottom: 6,
            }}>
              เหลือ {mins}:{String(secs).padStart(2, "0")} นาที · ช่อง {slotIdx + 1}/30
            </div>
            {qrDataUrl ? (
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
            onClick={stopSession}
            disabled={busy}
            style={{
              marginTop: 16, width: "100%", height: 44, borderRadius: 12,
              background: "white", color: t.coral, border: `1px solid ${t.coral}`,
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            ปิดเซสชัน
          </button>
        </>
      )}

      {session && sessionEnded && (
        <div style={{
          background: "white", border: `1px solid ${t.mint}`, borderRadius: 18,
          padding: 22, textAlign: "center",
        }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⏱️</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.ink, marginBottom: 14 }}>
            เซสชันหมดเวลา
          </div>
          <button
            onClick={() => { setSession(null); setQrDataUrl(""); startSession(); }}
            disabled={busy}
            style={{
              width: "100%", height: 44, borderRadius: 12, border: "none",
              background: t.forest, color: "white",
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            เปิดเซสชันใหม่
          </button>
        </div>
      )}
    </main>
  );
}

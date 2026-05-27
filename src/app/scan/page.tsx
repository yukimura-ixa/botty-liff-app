"use client";
import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { theme as t } from "@/lib/theme";
import { uploadScan, ApiError, type ScanResult } from "@/lib/api";
import { RankTree } from '@/components/botty/RankTree'
import { ulid } from "ulidx";

type State = "idle" | "scanning" | "uploading" | "result" | "error" | "notbottle" | "duplicate" | "cooldown" | "dailylimit" | "slow";

export default function ScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(0);
  // Retained so a slow/failed upload can be resubmitted with the SAME idempotency
  // key (scanId) — the server replays the result instead of awarding twice.
  const lastBlobRef = useRef<Blob | null>(null);
  const lastScanIdRef = useRef<string>("");
  useEffect(() => {
    if (state !== "cooldown" || retryAfter <= 0) return;
    const id = setInterval(() => {
      setRetryAfter((s) => {
        if (s <= 1) {
          setState("idle");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state, retryAfter]);

  // Set srcObject after video element mounts (stream state change triggers re-render first)
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const startCamera = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      setStream(s);
      setState("scanning");
    } catch {
      setError("ไม่สามารถเข้าถึงกล้องได้ กรุณาให้สิทธิ์การใช้กล้อง");
      setState("error");
    }
  }, []);

  const submit = useCallback(async (blob: Blob, scanId: string) => {
    setState("uploading");
    try {
      const file = new File([blob], "scan.jpg", { type: "image/jpeg" });
      const res = await uploadScan(file, scanId);
      setResult(res);
      setState("result");
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        // Timeout / network drop on a slow connection: keep the photo so the user
        // can resend without re-capturing (resend reuses the same scanId).
        if (e.code === "timeout" || e.code === "network") {
          setState("slow");
          return;
        }
        if (e.status === 429 && e.code === "cooldown") {
          setRetryAfter(Number(e.data?.retryAfter) || 60);
          setState("cooldown");
          return;
        }
        if (e.status === 429 && e.code === "daily_limit") {
          setDailyLimit(Number(e.data?.limit) || 20);
          setState("dailylimit");
          return;
        }
        if (e.status === 422 || /PET/i.test(e.message)) {
          setState("notbottle");
          return;
        }
        if (e.status === 409 || /duplicate/i.test(e.message)) {
          setState("duplicate");
          return;
        }
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "การสแกนล้มเหลว");
      }
      setState("error");
    }
  }, []);

  const capture = useCallback(() => {
    if (!videoRef.current || !stream) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d")!.drawImage(videoRef.current, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        stream.getTracks().forEach((tr) => tr.stop());
        const scanId = ulid();
        lastBlobRef.current = blob;
        lastScanIdRef.current = scanId;
        void submit(blob, scanId);
      },
      "image/jpeg",
      0.9,
    );
  }, [stream, submit]);

  const resend = useCallback(() => {
    if (lastBlobRef.current && lastScanIdRef.current) {
      void submit(lastBlobRef.current, lastScanIdRef.current);
    } else {
      setState("idle");
    }
  }, [submit]);

  if (state === "idle")
    return (
      <main
        style={{
          minHeight: "100dvh",
          background: "#0A0F0C",
          color: "white",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}
      >
        <div style={{ fontSize: 64 }}>♻️</div>
        <div style={{ fontSize: 18, fontWeight: 700, textAlign: "center" }}>
          สแกนขวด PET
        </div>
        {/* <div
          style={{
            fontSize: 13,
            opacity: 0.6,
            textAlign: "center",
            maxWidth: 260,
            lineHeight: 1.5,
          }}
        >
          ใช้กล้องเท่านั้น · ระบบจะตรวจสอบว่าเป็นขวด PET จริง
        </div> */}
        <button
          onClick={startCamera}
          style={{
            background: t.moss,
            color: "white",
            border: "none",
            padding: "14px 36px",
            borderRadius: 16,
            fontSize: 16,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          เปิดกล้อง
        </button>
        <button
          onClick={() => router.back()}
          style={{
            background: "transparent",
            color: "rgba(255,255,255,0.5)",
            border: "none",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ← ย้อนกลับ
        </button>
      </main>
    );

  if (state === "result" && result)
    return (
      <main
        style={{
          minHeight: "100dvh",
          background: `linear-gradient(180deg, ${t.forest} 0%, ${t.moss} 70%, ${t.leaf} 100%)`,
          color: "white",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "60px 28px 40px",
          gap: 12,
        }}
      >
        {result.preview && (
          <div
            style={{
              width: "100%",
              maxWidth: 360,
              background: "rgba(255,193,7,0.12)",
              border: "1px solid rgba(255,193,7,0.4)",
              borderRadius: 14,
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 600,
              color: "rgba(255,255,255,0.95)",
              textAlign: "center",
            }}
          >
            โหมดทดสอบ — ไม่ได้รับคะแนน
          </div>
        )}
        {result.annotatedImage && (
          <img
            src={`data:image/jpeg;base64,${result.annotatedImage}`}
            alt="ผลการตรวจจับ"
            loading="lazy"
            style={{
              width: "100%",
              maxWidth: 360,
              borderRadius: 12,
              display: "block",
              marginBottom: 12,
              objectFit: "contain",
            }}
          />
        )}
        <div style={{ fontSize: 20, fontWeight: 800 }}>
          {result.preview ? "ตรวจพบขวด PET (โหมดทดสอบ)" : "สแกนสำเร็จ! 🎉"}
        </div>
        <div
          style={{
            width: 130, height: 130, borderRadius: "50%",
            background: "rgba(255,255,255,0.12)",
            border: "2px solid rgba(255,255,255,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 56,
          }}
        >
          {result.preview ? "🧪" : "♻️"}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
          <span style={{ fontSize: 11, background: "rgba(255,255,255,0.15)", padding: "6px 12px", borderRadius: 999 }}>
            {result.detectedClass || "PET Bottle"}
          </span>
          <span style={{ fontSize: 11, background: "rgba(255,255,255,0.15)", padding: "6px 12px", borderRadius: 999 }}>
            {(result.confidence * 100).toFixed(0)}% มั่นใจ
          </span>
          <span style={{ fontSize: 11, background: "rgba(255,255,255,0.15)", padding: "6px 12px", borderRadius: 999 }}>
            {result.itemCount} ชิ้น
          </span>
        </div>
        {result.pointedItems !== result.itemCount && (
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
            นับให้สูงสุด {result.pointedItems} ขวด/สแกน
          </div>
        )}
        {result.preview ? (
          <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 600, textAlign: "center", maxWidth: 280, lineHeight: 1.5 }}>
            สแกนตรวจสอบเรียบร้อย
          </div>
        ) : (
          <>
            <div style={{ fontSize: 72, fontWeight: 900, color: t.gold, lineHeight: 1 }}>
              +{result.totalPoints}
            </div>
            <div style={{ fontSize: 14, opacity: 0.9, fontWeight: 600 }}>
              คะแนนที่ได้รับ
            </div>
            <div
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 14, padding: "12px 16px", width: "100%", fontSize: 12,
              }}
            >
              {[
                ["ขวด PET พื้นฐาน", `+${result.basePoints}`],
                ["โบนัสสตรีค", `+${result.streakBonus}`],
              ].map(([k, v], i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", padding: "4px 0",
                  borderBottom: i === 0 ? "1px dashed rgba(255,255,255,0.2)" : "none",
                }}>
                  <span style={{ opacity: 0.85 }}>{k}</span>
                  <span style={{ fontWeight: 700, color: t.gold }}>{v}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {/* Rank tree */}
        {!result.preview && (
          <div style={{ textAlign: 'center', paddingTop: 8 }}>
            {result.newRank !== result.prevRank && (
              <div style={{
                fontSize: 13, fontWeight: 700, color: t.gold, marginBottom: 8,
                animation: 'rankBadgePop 0.4s ease-out',
              }}>
                🎊 เลื่อนระดับแล้ว!
              </div>
            )}
            <RankTree
              rank={result.newRank || 'ต้นกล้า'}
              animate={result.newRank !== result.prevRank}
              size={80}
            />
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 6 }}>
              {result.newRank || 'ต้นกล้า'}
            </div>
            <style>{`
              @keyframes rankBadgePop {
                from { transform: scale(0.5); opacity: 0; }
                to   { transform: scale(1);   opacity: 1; }
              }
            `}</style>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 10, width: "100%" }}>
          <button
            onClick={() => router.replace("/home")}
            style={{
              flex: 1,
              height: 50,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.3)",
              background: "rgba(255,255,255,0.1)",
              color: "white",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            เสร็จสิ้น
          </button>
          <button
            onClick={() => setState("idle")}
            style={{
              flex: 1.4,
              height: 50,
              borderRadius: 14,
              border: "none",
              background: "white",
              color: t.forest,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            สแกนต่อ →
          </button>
        </div>
      </main>
    );

  if (state === "cooldown")
    return (
      <main style={{ minHeight: "100dvh", background: "#0A0F0C", color: "white", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
        <div style={{ fontSize: 56 }}>⏱️</div>
        <div style={{ fontSize: 17, fontWeight: 700, textAlign: "center" }}>รอสักครู่</div>
        <div style={{ fontSize: 48, fontWeight: 900, color: t.gold, lineHeight: 1 }}>{retryAfter}s</div>
        <div style={{ fontSize: 13, opacity: 0.7, textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
          ป้องกันการสแกนถี่เกินไป<br/>กรุณารอครบเวลา
        </div>
        <button onClick={() => router.replace("/home")} style={{ background: "transparent", color: "rgba(255,255,255,0.5)", border: "none", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          กลับหน้าหลัก
        </button>
      </main>
    );

  if (state === "dailylimit")
    return (
      <main style={{ minHeight: "100dvh", background: "#0A0F0C", color: "white", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
        <div style={{ fontSize: 56 }}>🌙</div>
        <div style={{ fontSize: 17, fontWeight: 700, textAlign: "center" }}>ครบโควต้าวันนี้แล้ว</div>
        <div style={{ fontSize: 13, opacity: 0.7, textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
          สแกนได้สูงสุด {dailyLimit} ครั้งต่อวัน<br/>กลับมาใหม่พรุ่งนี้
        </div>
        <button onClick={() => router.replace("/home")} style={{ background: t.moss, color: "white", border: "none", padding: "12px 28px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          กลับหน้าหลัก
        </button>
      </main>
    );

  if (state === "slow")
    return (
      <main style={{ minHeight: "100dvh", background: "#0A0F0C", color: "white", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
        <div style={{ fontSize: 56 }}>🐢</div>
        <div style={{ fontSize: 17, fontWeight: 700, textAlign: "center" }}>การเชื่อมต่อช้า</div>
        <div style={{ fontSize: 13, opacity: 0.7, textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
          ส่งรูปไม่สำเร็จเพราะเน็ตช้า<br/>กดส่งอีกครั้งได้เลย ไม่เสียคะแนนซ้ำ
        </div>
        <button onClick={resend} style={{ background: t.moss, color: "white", border: "none", padding: "12px 28px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          ส่งอีกครั้ง
        </button>
        <button onClick={() => router.replace("/home")} style={{ background: "transparent", color: "rgba(255,255,255,0.5)", border: "none", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          กลับหน้าหลัก
        </button>
      </main>
    );

  if (state === "notbottle")
    return (
      <main style={{ minHeight: "100dvh", background: "#0A0F0C", color: "white", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
        <div style={{ fontSize: 56 }}>🤔</div>
        <div style={{ fontSize: 17, fontWeight: 700, textAlign: "center" }}>ไม่พบขวด PET ในรูป</div>
        <div style={{ fontSize: 13, opacity: 0.7, textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
          ลองจัดขวดให้อยู่กลางจอ<br/>แสงสว่างพอ · พื้นหลังไม่ซับซ้อน
        </div>
        <button onClick={() => setState("idle")} style={{ background: t.moss, color: "white", border: "none", padding: "12px 28px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          ลองอีกครั้ง
        </button>
        <button onClick={() => router.back()} style={{ background: "transparent", color: "rgba(255,255,255,0.5)", border: "none", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          ← กลับ
        </button>
      </main>
    );

  if (state === "duplicate")
    return (
      <main style={{ minHeight: "100dvh", background: "#0A0F0C", color: "white", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
        <div style={{ fontSize: 56 }}>♻️</div>
        <div style={{ fontSize: 17, fontWeight: 700, textAlign: "center" }}>ขวดนี้สแกนไปแล้ว</div>
        <div style={{ fontSize: 13, opacity: 0.7, textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
          ระบบป้องกันการสแกนซ้ำใน 24 ชม.<br/>ลองสแกนขวดใหม่
        </div>
        <button onClick={() => setState("idle")} style={{ background: t.moss, color: "white", border: "none", padding: "12px 28px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          สแกนขวดใหม่
        </button>
        <button onClick={() => router.replace("/home")} style={{ background: "transparent", color: "rgba(255,255,255,0.5)", border: "none", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          กลับหน้าหลัก
        </button>
      </main>
    );

  if (state === "error")
    return (
      <main
        style={{
          minHeight: "100dvh",
          background: "#0A0F0C",
          color: "white",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <div style={{ fontSize: 48 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>เกิดข้อผิดพลาด</div>
        <div
          style={{
            fontSize: 13,
            opacity: 0.6,
            textAlign: "center",
            maxWidth: 260,
          }}
        >
          {error}
        </div>
        <button
          onClick={() => {
            setState("idle");
            setError("");
          }}
          style={{
            background: t.moss,
            color: "white",
            border: "none",
            padding: "12px 28px",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ลองอีกครั้ง
        </button>
      </main>
    );

  // scanning / uploading
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "#0A0F0C",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0.9,
        }}
      />

      {/* Viewfinder */}
      <div
        style={{
          position: "absolute",
          left: 40,
          right: 40,
          top: 120,
          bottom: 280,
        }}
      >
        {(["tl", "tr", "bl", "br"] as const).map((k) => (
          <div
            key={k}
            style={{
              position: "absolute",
              top: k.startsWith("t") ? -2 : undefined,
              bottom: k.startsWith("b") ? -2 : undefined,
              left: k.endsWith("l") ? -2 : undefined,
              right: k.endsWith("r") ? -2 : undefined,
              width: 28,
              height: 28,
              borderTop: k.startsWith("t") ? `3px solid ${t.leaf}` : "none",
              borderBottom: k.startsWith("b") ? `3px solid ${t.leaf}` : "none",
              borderLeft: k.endsWith("l") ? `3px solid ${t.leaf}` : "none",
              borderRight: k.endsWith("r") ? `3px solid ${t.leaf}` : "none",
              borderRadius: 6,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "40%",
            height: 2,
            background: `linear-gradient(90deg, transparent, ${t.leaf}, transparent)`,
            boxShadow: `0 0 20px ${t.leaf}`,
          }}
        />
      </div>

      {/* Top bar */}
      <div
        style={{
          position: "absolute",
          top: 52,
          left: 16,
          right: 16,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <button
          onClick={() => {
            stream?.getTracks().forEach((tr) => tr.stop());
            router.back();
          }}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            background: "rgba(0,0,0,0.4)",
            border: "1px solid rgba(255,255,255,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 18l-6-6 6-6"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div
          style={{
            background: "rgba(0,0,0,0.4)",
            padding: "8px 14px",
            borderRadius: 999,
            color: "white",
            fontSize: 13,
            fontWeight: 600,
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          {state === "uploading"
            ? "⏳ กำลังตรวจสอบ..."
            : "📸 จัดขวดให้อยู่กลางจอ"}
        </div>
        <div style={{ width: 38 }} />
      </div>

      {/* Shutter */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 60,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <button
          onClick={state === "scanning" ? capture : undefined}
          disabled={state !== "scanning"}
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            background: "white",
            border: `5px solid ${t.leaf}`,
            boxShadow: `0 0 0 4px rgba(63,166,107,0.3), 0 8px 24px rgba(0,0,0,0.4)`,
            cursor: state === "scanning" ? "pointer" : "default",
            opacity: state === "scanning" ? 1 : 0.5,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              background: t.leaf,
              margin: "7px auto",
            }}
          />
        </button>
      </div>

      {/* <div
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 16,
          textAlign: "center",
          color: "rgba(255,255,255,0.5)",
          fontSize: 11,
        }}
      >
        🔒 ใช้ได้เฉพาะกล้องเท่านั้น · ป้องกันการอัปโหลดรูปขวด
      </div> */}
    </main>
  );
}

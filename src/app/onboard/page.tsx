"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { theme as t } from "@/lib/theme";
import { onboard } from "@/lib/api";
import { GRADE_LEVELS, ROOM_LEVELS } from "@/lib/class-options";

export default function OnboardPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [nickname, setNick] = useState("");
  const [grade, setGrade] = useState("");
  const [room, setRoom] = useState("");
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const ready =
    fullName.trim() &&
    nickname.trim() &&
    grade !== "" &&
    room !== "" &&
    consent;

  async function handleSubmit() {
    if (!ready) return;
    try {
      setSaving(true);
      await onboard({
        fullName: fullName.trim(),
        nickname: nickname.trim(),
        grade: Number(grade),
        room: Number(room),
        consent: true,
      });
      router.replace("/home");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setSaving(false);
    }
  }

  return (
    <main
      style={{ minHeight: "100dvh", background: t.bone, paddingBottom: 40 }}
    >
      <div style={{ padding: "16px 24px 0" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: `linear-gradient(135deg, ${t.leaf}, ${t.moss})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: 22,
              fontWeight: 800,
            }}
          >
            B
          </div>
          <div>
            <div style={{ fontSize: 12, color: t.muted }}>ยินดีต้อนรับ</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.ink }}>
              Botty 🌱
            </div>
          </div>
        </div>

        <h1
          style={{
            fontSize: 26,
            fontWeight: 800,
            lineHeight: 1.25,
            color: t.forest,
            marginBottom: 6,
            letterSpacing: -0.3,
          }}
        >
          แนะนำตัวสักหน่อย
        </h1>
        <p
          style={{
            fontSize: 13,
            color: t.muted,
            marginBottom: 24,
            lineHeight: 1.5,
          }}
        >
          ข้อมูลนี้จะใช้แสดงในกระดานอันดับและให้คุณครูเห็น
        </p>

        {/* Full name */}
        <Field label="ชื่อ-นามสกุล (ภาษาไทย)">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="เช่น พิมพ์ชนก ศรีสุวรรณ"
            style={inputStyle(!!fullName)}
          />
        </Field>

        {/* Nickname */}
        <Field
          label={
            <>
              ชื่อเล่น{" "}
              <span style={{ color: t.muted, fontWeight: 500 }}>
                · แสดงในกระดานอันดับ
              </span>
            </>
          }
        >
          <div style={{ position: "relative" }}>
            <input
              value={nickname}
              maxLength={12}
              onChange={(e) => setNick(e.target.value.slice(0, 12))}
              placeholder="เช่น พิมพ์"
              style={inputStyle(!!nickname)}
            />
            <span
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 11,
                color: t.muted,
              }}
            >
              {nickname.length}/12
            </span>
          </div>
        </Field>

        {/* Class picker */}
        <Field label="ชั้นเรียน">
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 15, color: t.muted, fontWeight: 600 }}>
              ม.
            </span>
            <Segmented
              options={GRADE_LEVELS}
              value={grade}
              onChange={setGrade}
            />
            <span style={{ fontSize: 18, color: t.muted, fontWeight: 700 }}>
              /
            </span>
            <Segmented options={ROOM_LEVELS} value={room} onChange={setRoom} />
          </div>
        </Field>

        {/* Preview */}
        <div
          style={{
            background: `linear-gradient(135deg, ${t.mint}, ${t.bone})`,
            border: `1px solid ${t.mint}`,
            borderRadius: 18,
            padding: 14,
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: 16,
              background: t.moss,
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
            }}
          >
            🌱
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 10.5,
                color: t.muted,
                letterSpacing: 0.5,
                fontWeight: 600,
              }}
            >
              ตัวอย่างในกระดาน
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: t.ink,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {nickname || "ชื่อเล่น"} ·{" "}
              <span style={{ color: t.muted, fontWeight: 500 }}>
                {fullName || "ชื่อ-นามสกุล"}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: t.muted }}>
              ม.{grade}/{room} · ระดับ ต้นกล้า
            </div>
          </div>
        </div>

        {/* PDPA consent — required by Thai PDPA */}
        <label
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            background: "white",
            border: `1px solid ${consent ? t.moss : t.mint}`,
            borderRadius: 14,
            padding: "14px",
            marginBottom: 20,
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              flexShrink: 0,
              marginTop: 1,
              border: `2px solid ${consent ? t.moss : t.muted}`,
              background: consent ? t.moss : "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {consent && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 6l3 3L10 3"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
          <input
            type="checkbox"
            hidden
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <div style={{ fontSize: 12, color: t.ink, lineHeight: 1.55 }}>
            ฉันยินยอมให้โรงเรียนเก็บรวบรวมและใช้ข้อมูลส่วนบุคคล (ชื่อ,
            ชั้นเรียน, ข้อมูลการสแกน)
            เพื่อวัตถุประสงค์ด้านการศึกษาและสิ่งแวดล้อม ตาม{" "}
            <span style={{ color: t.moss, fontWeight: 600 }}>
              พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
            </span>
          </div>
        </label>

        {error && (
          <div style={{ fontSize: 13, color: t.coral, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!ready || saving}
          style={{
            width: "100%",
            height: 50,
            borderRadius: 14,
            border: "none",
            background: t.forest,
            color: "white",
            fontSize: 15,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            cursor: ready && !saving ? "pointer" : "default",
            fontFamily: "inherit",
            opacity: ready && !saving ? 1 : 0.5,
          }}
        >
          {saving ? "กำลังบันทึก..." : "เริ่มเก็บแต้ม →"}
        </button>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: t.forest,
          marginBottom: 6,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function inputStyle(filled: boolean): React.CSSProperties {
  return {
    width: "100%",
    height: 52,
    borderRadius: 12,
    padding: "0 14px",
    border: `1.5px solid ${filled ? t.moss : t.mint}`,
    background: "white",
    fontSize: 15,
    color: t.ink,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  };
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        background: "white",
        borderRadius: 12,
        padding: 4,
        gap: 2,
        border: `1px solid ${t.mint}`,
      }}
    >
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          style={{
            padding: "8px 14px",
            borderRadius: 9,
            fontSize: 15,
            fontWeight: 700,
            background: o === value ? t.moss : "transparent",
            color: o === value ? "white" : t.muted,
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

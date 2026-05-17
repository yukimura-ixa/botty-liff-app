"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { theme as t } from "@/lib/theme";
import {
  getTeacherKPIs,
  getStudents,
  getForestStages,
  updateForestStages,
  formatClassKey,
  type StudentProfile,
  type TeacherKPIs,
} from "@/lib/api";
import { CLASS_KEY_OPTIONS } from "@/lib/class-options";
import { SheetsExportModal } from "@/components/SheetsExportModal";

const KANIT = "var(--font-kanit), system-ui";
const BODY = "var(--font-ibm-plex-thai), system-ui";

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 1.8,
  textTransform: "uppercase",
  color: t.muted,
  fontWeight: 600,
};

const hairline: React.CSSProperties = {
  height: 1,
  background: `linear-gradient(90deg, transparent, ${t.mint}, transparent)`,
};

const surface: React.CSSProperties = {
  background: "white",
  border: `1px solid ${t.mint}`,
  borderRadius: 18,
  boxShadow: "0 1px 0 rgba(0,0,0,0.02)",
};

function rankEmoji(pts: number): string {
  if (pts >= 125) return "🌲";
  if (pts >= 80) return "🌳";
  if (pts >= 50) return "🌿";
  return "🌱";
}

export default function TeacherDashPage() {
  const [kpis, setKpis] = useState<TeacherKPIs | null>(null);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [q, setQ] = useState("");
  const [classKey, setClassKey] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [forestThresholds, setForestThresholds] = useState<[number, number, number]>([25, 75, 175]);
  const [forestSaving, setForestSaving] = useState(false);
  const [forestSaveError, setForestSaveError] = useState("");
  const [forestSaveOk, setForestSaveOk] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getTeacherKPIs()
      .then(setKpis)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "โหลด KPI ไม่สำเร็จ"));
  }, []);

  useEffect(() => {
    setStudentsLoading(true);
    getStudents({ q, classKey })
      .then((r) => setStudents(r.students ?? []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "โหลดรายชื่อไม่สำเร็จ"))
      .finally(() => setStudentsLoading(false));
  }, [q, classKey]);

  useEffect(() => {
    getForestStages().then((cfg) => setForestThresholds(cfg.thresholds as [number, number, number]));
  }, []);

  async function handleSaveForest() {
    setForestSaving(true);
    setForestSaveError("");
    setForestSaveOk(false);
    try {
      await updateForestStages(forestThresholds);
      setForestSaveOk(true);
    } catch (e: unknown) {
      setForestSaveError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setForestSaving(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: t.bone,
        paddingBottom: 96,
        fontFamily: BODY,
        color: t.ink,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <svg
        viewBox="0 0 200 200"
        style={{
          position: "absolute",
          top: 28,
          right: -40,
          width: 180,
          height: 180,
          opacity: 0.08,
          pointerEvents: "none",
        }}
      >
        <path
          d="M100 20 C 140 60, 160 100, 140 160 C 100 140, 60 120, 60 80 C 70 50, 85 30, 100 20 Z"
          fill={t.forest}
        />
      </svg>

      <header style={{ padding: "60px 22px 18px", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 9,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              padding: "4px 10px",
              borderRadius: 999,
              background: t.forest,
              color: "white",
              fontWeight: 700,
            }}
          >
            โหมดครู
          </span>
          <span style={{ fontSize: 11, color: t.muted, letterSpacing: 0.5 }}>· Field Dashboard</span>
        </div>
        <h1
          style={{
            margin: "12px 0 4px",
            fontFamily: KANIT,
            fontWeight: 800,
            fontSize: 32,
            letterSpacing: -0.5,
            color: t.forest,
          }}
        >
          แดชบอร์ดห้องเรียน
        </h1>
        <div style={{ fontSize: 12, color: t.muted, maxWidth: 280, lineHeight: 1.5 }}>
          ภาพรวมการรีไซเคิลของนักเรียน · ปรับด่านต้นไม้ · ส่งออกรายงาน
        </div>
      </header>

      <div style={hairline} />

      <section style={{ padding: "20px 22px 0" }}>
        <div style={{ ...labelStyle, marginBottom: 10 }}>ตัวเลขสำคัญ</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { l: "นักเรียน", v: kpis?.studentCount.toLocaleString() ?? "—", u: "คน", c: t.forest },
            { l: "ขวดวันนี้", v: kpis?.bottlesToday.toLocaleString() ?? "—", u: "ขวด", c: t.moss },
            { l: "คะแนนรวม", v: kpis?.totalPoints.toLocaleString() ?? "—", u: "แต้ม", c: t.leaf },
            { l: "CO₂ ลดได้", v: kpis ? kpis.co2KgReduced.toFixed(1) : "—", u: "kg", c: t.gold },
          ].map((k, i) => (
            <div key={i} style={{ ...surface, padding: 14 }}>
              <div style={labelStyle}>{k.l}</div>
              <div
                style={{
                  fontFamily: KANIT,
                  fontWeight: 800,
                  fontSize: 28,
                  color: k.c,
                  lineHeight: 1.1,
                  marginTop: 4,
                  letterSpacing: -0.5,
                }}
              >
                {k.v}
              </div>
              <div style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>{k.u}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "28px 22px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 }}>
          <div>
            <div style={labelStyle}>นักเรียน</div>
            <div style={{ fontFamily: KANIT, fontWeight: 700, fontSize: 16, color: t.forest, marginTop: 2 }}>
              รายชื่อ{classKey && ` · ม.${classKey}`}
            </div>
          </div>
          <div style={{ fontSize: 11, color: t.muted }}>{students.length} คน</div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <div
            style={{
              flex: 1,
              background: "white",
              border: `1px solid ${t.mint}`,
              borderRadius: 12,
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="6" stroke={t.muted} strokeWidth="1.6" />
              <path d="M16 16l4 4" stroke={t.muted} strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ"
              style={{
                flex: 1, border: "none", outline: "none", fontSize: 13,
                fontFamily: BODY, background: "transparent", color: t.ink,
              }}
            />
          </div>
          <select
            value={classKey}
            onChange={(e) => setClassKey(e.target.value)}
            style={{
              padding: "10px 12px",
              background: "white",
              border: `1px solid ${t.mint}`,
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 600,
              color: t.forest,
              fontFamily: BODY,
            }}
          >
            <option value="">ทุกห้อง</option>
            {CLASS_KEY_OPTIONS.map((k) => <option key={k} value={k}>ม.{k}</option>)}
          </select>
        </div>

        {error && (
          <div style={{ padding: 12, background: `${t.coral}15`, color: t.coral, borderRadius: 10, fontSize: 12, marginBottom: 8 }}>
            {error}
          </div>
        )}

        {studentsLoading && students.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", color: t.muted, fontSize: 13 }}>กำลังโหลด...</div>
        )}
        {!studentsLoading && students.length === 0 && !error && (
          <div style={{ padding: 32, textAlign: "center", color: t.muted, fontSize: 13 }}>ไม่พบนักเรียน</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {students.map((s, i) => (
            <Link key={s.uid} href={`/teacher/student?uid=${s.uid}`} style={{ textDecoration: "none" }}>
              <div
                style={{
                  ...surface,
                  display: "grid",
                  gridTemplateColumns: "20px 36px 1fr auto",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                }}
              >
                <div style={{ fontFamily: KANIT, fontSize: 11, color: t.muted, fontWeight: 700, textAlign: "right" }}>
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div
                  style={{
                    width: 36, height: 36, borderRadius: 12,
                    background: `${t.mint}66`, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18,
                  }}
                >
                  {rankEmoji(s.totalPoints)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.fullName}
                  </div>
                  <div style={{ fontSize: 10.5, color: t.muted, marginTop: 1, display: "flex", gap: 8 }}>
                    <span style={{ padding: "1px 6px", background: `${t.mint}88`, borderRadius: 4, color: t.forest, fontWeight: 600 }}>
                      {formatClassKey(s.classKey)}
                    </span>
                    <span>🔥 {s.streakDays}</span>
                    <span>· {s.totalScans} ขวด</span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: KANIT, fontSize: 18, fontWeight: 800, color: t.forest, lineHeight: 1 }}>
                    {s.totalPoints.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 9, color: t.muted, letterSpacing: 1, marginTop: 2 }}>PTS</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section style={{ padding: "28px 22px 0" }}>
        <div style={labelStyle}>ตั้งค่าด่านต้นไม้</div>
        <div style={{ fontFamily: KANIT, fontWeight: 700, fontSize: 16, color: t.forest, marginTop: 2, marginBottom: 10 }}>
          ป่าของห้องเรียน
        </div>
        <div style={{ ...surface, padding: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
            {(["🌱", "🌿", "🌳"] as const).map((icon, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 4 }}>{icon}</div>
                <div style={{ ...labelStyle, fontSize: 9, marginBottom: 6 }}>ด่าน {i + 1}</div>
                <input
                  type="number"
                  value={forestThresholds[i]}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setForestThresholds((prev) => {
                      const next = [...prev] as [number, number, number];
                      next[i] = v;
                      return next;
                    });
                  }}
                  style={{
                    width: "100%", padding: "8px 6px", borderRadius: 8,
                    border: `1px solid ${t.mint}`, fontSize: 14, textAlign: "center",
                    fontFamily: KANIT, fontWeight: 700, color: t.forest, outline: "none",
                  }}
                />
              </div>
            ))}
          </div>
          {forestSaveError && <div style={{ fontSize: 11, color: t.coral, marginBottom: 8 }}>{forestSaveError}</div>}
          {forestSaveOk && <div style={{ fontSize: 11, color: t.moss, marginBottom: 8 }}>✓ บันทึกแล้ว</div>}
          <button
            onClick={handleSaveForest}
            disabled={forestSaving}
            style={{
              width: "100%", padding: 12, borderRadius: 10, border: "none",
              background: forestSaving ? t.muted : t.forest,
              color: "white", fontSize: 13, fontWeight: 700, fontFamily: BODY,
              cursor: forestSaving ? "default" : "pointer",
              letterSpacing: 0.5,
            }}
          >
            {forestSaving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </section>

      <button
        onClick={() => setShowExport(true)}
        style={{
          position: "fixed",
          bottom: 24,
          right: 22,
          padding: "12px 18px",
          borderRadius: 999,
          background: t.gold,
          color: t.ink,
          border: "none",
          fontFamily: KANIT,
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: 0.5,
          boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)",
          cursor: "pointer",
          zIndex: 50,
        }}
      >
        📊 ส่งออก Sheets
      </button>

      {showExport && <SheetsExportModal onClose={() => setShowExport(false)} />}
    </main>
  );
}

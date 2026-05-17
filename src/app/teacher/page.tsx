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

export default function TeacherDashPage() {
  const [kpis, setKpis] = useState<TeacherKPIs | null>(null);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [q, setQ] = useState("");
  const [classKey, setClassKey] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [error, setError] = useState("");
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [forestThresholds, setForestThresholds] = useState<[number, number, number]>([25, 75, 175])
  const [forestSaving,     setForestSaving]     = useState(false)
  const [forestSaveError,  setForestSaveError]  = useState('')
  const [forestSaveOk,     setForestSaveOk]     = useState(false)

  useEffect(() => {
    getTeacherKPIs()
      .then(setKpis)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "โหลด KPI ไม่สำเร็จ"),
      );
  }, []);

  useEffect(() => {
    setStudentsLoading(true);
    getStudents({ q, classKey })
      .then((r) => setStudents(r.students ?? []))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "โหลดรายชื่อไม่สำเร็จ"),
      )
      .finally(() => setStudentsLoading(false));
  }, [q, classKey]);

  useEffect(() => {
    getForestStages().then(cfg => setForestThresholds(cfg.thresholds))
  }, [])

  async function handleSaveForest() {
    setForestSaving(true)
    setForestSaveError('')
    setForestSaveOk(false)
    try {
      await updateForestStages(forestThresholds)
      setForestSaveOk(true)
    } catch (e: unknown) {
      setForestSaveError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setForestSaving(false)
    }
  }

  return (
    <main
      style={{ minHeight: "100dvh", background: t.bone, paddingBottom: 24 }}
    >
      {/* Top bar */}
      <div
        style={{
          padding: "56px 18px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: `1px solid ${t.mint}`,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: t.muted,
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            โหมดครู
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: t.forest }}>
            แดชบอร์ด
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowExport(true)}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              background: t.forest,
              color: "white",
              border: "none",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            📊 Sheets
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div
        style={{
          padding: "14px 18px 0",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        {[
          {
            l: "นักเรียนทั้งหมด",
            v: kpis?.studentCount.toLocaleString() ?? "—",
            d: "คน",
            c: t.forest,
          },
          {
            l: "ขวดวันนี้",
            v: kpis?.bottlesToday.toLocaleString() ?? "—",
            d: "ขวด",
            c: t.moss,
          },
          {
            l: "คะแนนรวม",
            v: kpis?.totalPoints.toLocaleString() ?? "—",
            d: "pts",
            c: t.leaf,
          },
          {
            l: "CO₂ ลดได้",
            v: kpis ? `${kpis.co2KgReduced.toFixed(1)} kg` : "—",
            d: `= ต้นไม้ ${((kpis?.co2KgReduced ?? 0) / 21.7).toFixed(1)} ต้น`,
            c: t.gold,
          },
        ].map((k, i) => (
          <div
            key={i}
            style={{
              background: "white",
              borderRadius: 14,
              padding: 12,
              border: `1px solid ${t.mint}`,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                color: t.muted,
                fontWeight: 600,
                letterSpacing: 0.4,
              }}
            >
              {k.l}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: k.c,
                marginTop: 2,
                lineHeight: 1.1,
              }}
            >
              {k.v}
            </div>
            <div style={{ fontSize: 10.5, color: t.muted, marginTop: 2 }}>
              {k.d}
            </div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ padding: "14px 18px 6px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div
            style={{
              flex: 1,
              background: "white",
              border: `1px solid ${t.mint}`,
              borderRadius: 10,
              padding: "8px 12px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: t.muted,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle
                cx="11"
                cy="11"
                r="6"
                stroke={t.muted}
                strokeWidth="1.6"
              />
              <path
                d="M16 16l4 4"
                stroke={t.muted}
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหานักเรียน, ห้อง..."
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                fontSize: 13,
                fontFamily: "inherit",
                background: "transparent",
              }}
            />
          </div>
          <select
            value={classKey}
            onChange={(e) => setClassKey(e.target.value)}
            style={{
              padding: "8px 12px",
              background: "white",
              border: `1px solid ${t.mint}`,
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 600,
              color: t.forest,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            <option value="">ทุกห้อง</option>
            {CLASS_KEY_OPTIONS.map((k) => (
              <option key={k} value={k}>
                ม.{k}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Student table */}
      <div style={{ padding: "4px 14px 0" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "20px 1fr 56px 50px 50px 18px",
            gap: 8,
            padding: "8px 8px",
            fontSize: 10,
            fontWeight: 700,
            color: t.muted,
            letterSpacing: 0.5,
            borderBottom: `1px solid ${t.mint}`,
          }}
        >
          <div>#</div>
          <div>ชื่อ · ห้อง</div>
          <div style={{ textAlign: "right" }}>คะแนน</div>
          <div style={{ textAlign: "right" }}>สตรีค</div>
          <div style={{ textAlign: "right" }}>ขวด</div>
          <div />
        </div>
        {studentsLoading && students.length === 0 && (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: t.muted,
              fontSize: 13,
            }}
          >
            กำลังโหลด...
          </div>
        )}
        {!studentsLoading && students.length === 0 && (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: t.muted,
              fontSize: 13,
            }}
          >
            ไม่พบนักเรียน
          </div>
        )}
        {error && (
          <div
            style={{
              padding: 16,
              textAlign: "center",
              color: t.coral,
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}
        {students.map((s, i) => (
          <Link
            key={s.uid}
            href={`/teacher/student?uid=${s.uid}`}
            style={{ textDecoration: "none" }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "20px 1fr 56px 50px 50px 18px",
                gap: 8,
                padding: "10px 8px",
                alignItems: "center",
                borderBottom: `1px solid ${t.mint}55`,
              }}
            >
              <div style={{ fontSize: 12, color: t.muted, fontWeight: 700 }}>
                {i + 1}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    background: t.mint,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                  }}
                >
                  🌱
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: t.ink,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.fullName}
                  </div>
                  <div style={{ fontSize: 10.5, color: t.muted }}>
                    {formatClassKey(s.classKey)}
                  </div>
                </div>
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontSize: 13,
                  fontWeight: 700,
                  color: t.forest,
                }}
              >
                {s.totalPoints.toLocaleString()}
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontSize: 12,
                  color: s.streakDays > 7 ? t.coral : t.muted,
                  fontWeight: 600,
                }}
              >
                🔥 {s.streakDays}
              </div>
              <div style={{ textAlign: "right", fontSize: 12, color: t.muted }}>
                {s.totalScans}
              </div>
              <div style={{ color: t.muted, textAlign: "right" }}>›</div>
            </div>
          </Link>
        ))}
        {students.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: t.muted,
              padding: "32px 0",
              fontSize: 13,
            }}
          >
            ไม่พบข้อมูล
          </div>
        )}
      </div>

      {/* Forest stages config */}
      <section style={{ margin: '24px 18px 0' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.forest, marginBottom: 12 }}>
          ตั้งค่าป่า
        </div>
        <div style={{ background: 'white', borderRadius: 16, padding: 16, border: `1px solid ${t.mint}` }}>
          <div style={{ fontSize: 12, color: t.muted, marginBottom: 12 }}>
            คะแนนขั้นต่ำของแต่ละด่าน (ต่อห้อง)
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            {(['ด่าน 1', 'ด่าน 2', 'ด่าน 3'] as const).map((label, i) => (
              <div key={i} style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: t.muted, fontWeight: 600, marginBottom: 4 }}>{label}</div>
                <input
                  type="number"
                  value={forestThresholds[i]}
                  onChange={e => {
                    const val = Number(e.target.value)
                    setForestThresholds(prev => {
                      const next = [...prev] as [number, number, number]
                      next[i] = val
                      return next
                    })
                  }}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: `1px solid ${t.mint}`, fontSize: 14,
                    fontFamily: 'inherit', outline: 'none',
                  }}
                />
              </div>
            ))}
          </div>
          {forestSaveError && (
            <div style={{ fontSize: 12, color: t.coral, marginBottom: 8 }}>{forestSaveError}</div>
          )}
          {forestSaveOk && (
            <div style={{ fontSize: 12, color: t.moss, marginBottom: 8 }}>บันทึกแล้ว ✓</div>
          )}
          <button
            onClick={handleSaveForest}
            disabled={forestSaving}
            style={{
              width: '100%', height: 42, borderRadius: 10, border: 'none',
              background: forestSaving ? t.muted : t.forest,
              color: 'white', fontSize: 13, fontWeight: 700,
              cursor: forestSaving ? 'default' : 'pointer',
              fontFamily: 'inherit', opacity: forestSaving ? 0.6 : 1,
            }}
          >
            {forestSaving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
          </button>
        </div>
      </section>
      {showExport && <SheetsExportModal onClose={() => setShowExport(false)} />}
    </main>
  );
}

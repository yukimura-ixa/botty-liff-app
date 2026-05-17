"use client";
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { theme as t } from "@/lib/theme";
import { exportToSheets, type SheetsExportBody } from "@/lib/api";
import { CLASS_KEY_OPTIONS } from "@/lib/class-options";

const ALL_COLUMNS = [
  "date", "time", "fullName", "classKey", "detectedClass",
  "itemCount", "basePoints", "streakBonus", "totalPoints", "confidence", "imageUrl",
];

export function SheetsExportModal({ onClose }: { onClose: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [classKey, setClassKey] = useState("");
  const [groupBy, setGroupBy] = useState<"scan" | "student" | "class">("scan");
  const [columns, setColumns] = useState<string[]>(ALL_COLUMNS);
  const [includeAdjustments, setIncludeAdjustments] = useState(false);
  const [includeImageLinks, setIncludeImageLinks] = useState(false);
  const [reuseSheet, setReuseSheet] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const body: SheetsExportBody = {
        from, to, groupBy, includeAdjustments, includeImageLinks, reuseSheet,
      };
      if (classKey) body.classKey = classKey;
      if (groupBy === "scan" && columns.length < ALL_COLUMNS.length) body.columns = columns;
      const { url } = await exportToSheets(body);
      window.open(url, "_blank");
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "export failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleCol(c: string) {
    setColumns((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));
  }

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ fontWeight: 800, color: t.forest, marginBottom: 12 }}>ส่งออก Google Sheets</div>

        <Label text="ช่วงวันที่">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
            <span>—</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
          </div>
        </Label>

        <Label text="ห้อง">
          <select value={classKey} onChange={(e) => setClassKey(e.target.value)} style={inputStyle}>
            <option value="">ทุกห้อง</option>
            {CLASS_KEY_OPTIONS.map((k) => <option key={k} value={k}>ม.{k}</option>)}
          </select>
        </Label>

        <Label text="จัดกลุ่ม">
          {(["scan", "student", "class"] as const).map((g) => (
            <label key={g} style={{ marginRight: 12, fontSize: 12 }}>
              <input type="radio" checked={groupBy === g} onChange={() => setGroupBy(g)} /> {g}
            </label>
          ))}
        </Label>

        {groupBy === "scan" && (
          <Label text="คอลัมน์">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {ALL_COLUMNS.map((c) => (
                <label key={c} style={{ fontSize: 12 }}>
                  <input type="checkbox" checked={columns.includes(c)} onChange={() => toggleCol(c)} /> {c}
                </label>
              ))}
            </div>
          </Label>
        )}

        <Label text="ตัวเลือก">
          <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
            <input type="checkbox" checked={includeAdjustments} onChange={(e) => setIncludeAdjustments(e.target.checked)} /> รวมการปรับคะแนน
          </label>
          <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
            <input type="checkbox" checked={includeImageLinks} onChange={(e) => setIncludeImageLinks(e.target.checked)} /> ลิงก์รูปภาพ
          </label>
          <label style={{ display: "block", fontSize: 12 }}>
            <input type="checkbox" checked={reuseSheet} onChange={(e) => setReuseSheet(e.target.checked)} /> ใช้ชีตเดิมของเดือนนี้
          </label>
        </Label>

        {err && <div style={{ color: t.coral, fontSize: 12, marginBottom: 8 }}>{err}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={onClose} disabled={busy} style={{ flex: 1, padding: 10, borderRadius: 10, background: t.mint, border: "none", cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>ยกเลิก</button>
          <button onClick={submit} disabled={busy} style={{ flex: 2, padding: 10, borderRadius: 10, background: t.forest, color: "white", border: "none", cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>{busy ? "..." : "ส่งออก"}</button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
};

const cardStyle: CSSProperties = {
  background: "white", borderRadius: 16, padding: 20,
  width: "92%", maxWidth: 420, maxHeight: "90dvh", overflowY: "auto",
};

const inputStyle: CSSProperties = {
  padding: 6, borderRadius: 6, border: "1px solid #ccc",
  fontFamily: "inherit", fontSize: 13,
};

function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#666", marginBottom: 4 }}>{text}</div>
      <div>{children}</div>
    </div>
  );
}

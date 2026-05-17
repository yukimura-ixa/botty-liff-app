"use client";
import { useEffect, useState } from "react";
import { theme as t } from "@/lib/theme";
import {
  adminListUsers, adminChangeRole, adminListRoleChanges,
  adminListBins, adminCreateBin, adminPatchBin,
  type UserRow, type RoleChange, type BinRow,
} from "@/lib/api";

const KANIT = "var(--font-kanit), system-ui";
const BODY = "var(--font-ibm-plex-thai), system-ui";
const MONO = "ui-monospace, 'SF Mono', Menlo, monospace";

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 1.8,
  textTransform: "uppercase",
  color: t.muted,
  fontWeight: 600,
};

const surfaceDark: React.CSSProperties = {
  background: t.ink,
  border: `1px solid ${t.forest}`,
  borderRadius: 14,
};

const surface: React.CSSProperties = {
  background: "white",
  border: `1px solid ${t.mint}`,
  borderRadius: 14,
};

type Tab = "users" | "bins" | "audit";

function roleChip(role: string) {
  const map: Record<string, { bg: string; fg: string }> = {
    admin: { bg: t.gold, fg: t.ink },
    teacher: { bg: t.moss, fg: "white" },
    student: { bg: `${t.mint}cc`, fg: t.forest },
  };
  const c = map[role] ?? map.student;
  return (
    <span
      style={{
        fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase",
        padding: "2px 7px", borderRadius: 999,
        background: c.bg, color: c.fg, fontWeight: 700,
      }}
    >
      {role}
    </span>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("users");

  const [users, setUsers] = useState<UserRow[]>([]);
  const [roleFilter, setRoleFilter] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState("");

  const [changes, setChanges] = useState<RoleChange[]>([]);

  const [bins, setBins] = useState<BinRow[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [createdQr, setCreatedQr] = useState<{ id: string; label: string; png: string } | null>(null);
  const [binBusy, setBinBusy] = useState(false);

  async function refreshUsers() {
    try {
      const r = await adminListUsers({ role: roleFilter, q });
      setUsers(r.users ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "load failed");
    }
  }
  async function refreshChanges() {
    try {
      const r = await adminListRoleChanges();
      setChanges(r.changes ?? []);
    } catch { /* ignore */ }
  }
  async function refreshBins() {
    try {
      const r = await adminListBins();
      setBins(r.bins ?? []);
    } catch { /* ignore */ }
  }

  useEffect(() => { refreshUsers(); }, [roleFilter, q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { refreshChanges(); refreshBins(); }, []);

  async function promote(u: UserRow) {
    const reason = prompt(`เลื่อน ${u.fullName} เป็นครู? เหตุผล:`);
    if (!reason) return;
    setBusy(u.uid);
    try {
      await adminChangeRole(u.uid, "teacher", reason);
      await refreshUsers();
      await refreshChanges();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "failed");
    } finally { setBusy(""); }
  }

  async function demote(u: UserRow) {
    const reason = prompt(`ถอด ${u.fullName} กลับเป็นนักเรียน? เหตุผล:`);
    if (!reason) return;
    setBusy(u.uid);
    try {
      await adminChangeRole(u.uid, "student", reason);
      await refreshUsers();
      await refreshChanges();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "failed");
    } finally { setBusy(""); }
  }

  async function createBin() {
    if (!newLabel.trim() || binBusy) return;
    setBinBusy(true);
    try {
      const r = await adminCreateBin(newLabel.trim());
      setCreatedQr({ id: r.binId, label: r.label, png: r.qrPngBase64 });
      setNewLabel("");
      await refreshBins();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "create failed");
    } finally { setBinBusy(false); }
  }

  async function toggleBin(b: BinRow) {
    setBinBusy(true);
    try {
      await adminPatchBin(b.id, { active: !b.active });
      await refreshBins();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "update failed");
    } finally { setBinBusy(false); }
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: `linear-gradient(180deg, ${t.ink} 0%, #0a1612 100%)`,
        color: "white",
        fontFamily: BODY,
        paddingBottom: 32,
      }}
    >
      <div
        style={{
          position: "fixed", inset: 0, pointerEvents: "none",
          backgroundImage: `linear-gradient(${t.forest}22 1px, transparent 1px), linear-gradient(90deg, ${t.forest}22 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse at top, black, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at top, black, transparent 70%)",
          zIndex: 0,
        }}
      />

      <header style={{ position: "relative", padding: "60px 22px 18px", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 9, letterSpacing: 1.6, textTransform: "uppercase",
              padding: "4px 10px", borderRadius: 999,
              background: t.gold, color: t.ink, fontWeight: 800,
            }}
          >
            แอดมิน
          </span>
          <span style={{ fontSize: 11, color: t.mint, letterSpacing: 0.5, opacity: 0.7, fontFamily: MONO }}>
            CONTROL · SYSTEM
          </span>
        </div>
        <h1
          style={{
            margin: "12px 0 4px",
            fontFamily: KANIT, fontWeight: 800, fontSize: 32, letterSpacing: -0.5,
            color: "white",
          }}
        >
          จัดการระบบ
        </h1>
        <div style={{ fontSize: 11.5, color: `${t.mint}aa`, maxWidth: 320, lineHeight: 1.55 }}>
          จัดการสิทธิ์ผู้ใช้และถังขยะ · ดูข้อมูลนักเรียนผ่านบัญชีครูเท่านั้น
        </div>
      </header>

      <nav
        style={{
          position: "relative", zIndex: 1,
          padding: "0 22px",
          display: "flex", gap: 4,
          borderBottom: `1px solid ${t.forest}66`,
        }}
      >
        {([
          { k: "users" as const, label: "ผู้ใช้", count: users.length },
          { k: "bins" as const, label: "ถังขยะ", count: bins.length },
          { k: "audit" as const, label: "ประวัติ", count: changes.length },
        ]).map((it) => {
          const active = tab === it.k;
          return (
            <button
              key={it.k}
              onClick={() => setTab(it.k)}
              style={{
                padding: "12px 14px", background: "transparent", border: "none",
                color: active ? t.gold : `${t.mint}99`,
                fontFamily: BODY, fontWeight: 700, fontSize: 13,
                cursor: "pointer", position: "relative",
                borderBottom: active ? `2px solid ${t.gold}` : "2px solid transparent",
                marginBottom: -1,
                letterSpacing: 0.3,
              }}
            >
              {it.label}
              <span style={{ marginLeft: 6, fontFamily: MONO, fontSize: 10, opacity: 0.6 }}>
                {it.count}
              </span>
            </button>
          );
        })}
      </nav>

      <div style={{ position: "relative", zIndex: 1, padding: "20px 22px 0" }}>
        {tab === "users" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาชื่อ..."
                style={{
                  flex: 1, padding: "10px 12px", borderRadius: 10,
                  background: t.ink, border: `1px solid ${t.forest}`,
                  color: "white", fontFamily: BODY, fontSize: 13, outline: "none",
                }}
              />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                style={{
                  padding: "10px 12px", borderRadius: 10,
                  background: t.ink, border: `1px solid ${t.forest}`,
                  color: t.gold, fontFamily: MONO, fontSize: 11, fontWeight: 700,
                  letterSpacing: 0.5,
                }}
              >
                <option value="">ALL</option>
                <option value="student">STUDENT</option>
                <option value="teacher">TEACHER</option>
                <option value="admin">ADMIN</option>
              </select>
            </div>

            {err && (
              <div style={{ padding: 10, background: `${t.coral}25`, color: t.coral, borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
                {err}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {users.map((u, i) => (
                <div
                  key={u.uid}
                  style={{
                    ...surfaceDark,
                    display: "grid",
                    gridTemplateColumns: "24px 1fr auto auto",
                    alignItems: "center", gap: 10,
                    padding: "11px 14px",
                  }}
                >
                  <div style={{ fontFamily: MONO, fontSize: 10, color: `${t.mint}77`, textAlign: "right" }}>
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.fullName || <span style={{ color: t.muted, fontStyle: "italic" }}>(ยังไม่กรอกข้อมูล)</span>}
                    </div>
                    <div style={{ fontSize: 10.5, color: `${t.mint}88`, marginTop: 2, display: "flex", alignItems: "center", gap: 6, fontFamily: MONO }}>
                      <span>{u.classKey || "—"}</span>
                      <span style={{ opacity: 0.4 }}>·</span>
                      <span>{u.totalPoints.toLocaleString()} pts</span>
                    </div>
                  </div>
                  <div>{roleChip(u.role)}</div>
                  <div>
                    {u.role === "student" && (
                      <button
                        disabled={busy === u.uid}
                        onClick={() => promote(u)}
                        style={{
                          padding: "6px 10px", borderRadius: 8, border: "none",
                          background: t.moss, color: "white", fontSize: 11, fontWeight: 700,
                          cursor: "pointer", fontFamily: BODY,
                        }}
                      >
                        ↑ ครู
                      </button>
                    )}
                    {u.role === "teacher" && (
                      <button
                        disabled={busy === u.uid}
                        onClick={() => demote(u)}
                        style={{
                          padding: "6px 10px", borderRadius: 8, border: `1px solid ${t.coral}`,
                          background: "transparent", color: t.coral, fontSize: 11, fontWeight: 700,
                          cursor: "pointer", fontFamily: BODY,
                        }}
                      >
                        ↓ ถอด
                      </button>
                    )}
                    {u.role === "admin" && (
                      <span style={{ fontSize: 10, color: t.gold, fontFamily: MONO, letterSpacing: 0.5 }}>
                        LOCKED
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {users.length === 0 && (
                <div style={{ padding: 32, textAlign: "center", color: t.muted, fontSize: 13 }}>ไม่พบผู้ใช้</div>
              )}
            </div>
          </>
        )}

        {tab === "bins" && (
          <>
            <div style={{ ...surfaceDark, padding: 14, marginBottom: 14 }}>
              <div style={{ ...labelStyle, color: t.gold, marginBottom: 8 }}>สร้างถังใหม่</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="ป้ายถัง เช่น อาคาร 3 ชั้น 1"
                  style={{
                    flex: 1, padding: "10px 12px", borderRadius: 10,
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${t.forest}`,
                    color: "white", fontFamily: BODY, fontSize: 13, outline: "none",
                  }}
                />
                <button
                  onClick={createBin}
                  disabled={binBusy || !newLabel.trim()}
                  style={{
                    padding: "10px 16px", borderRadius: 10, border: "none",
                    background: t.gold, color: t.ink,
                    fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
                    fontFamily: BODY,
                    cursor: binBusy || !newLabel.trim() ? "default" : "pointer",
                    opacity: binBusy || !newLabel.trim() ? 0.5 : 1,
                  }}
                >
                  สร้าง QR
                </button>
              </div>
            </div>

            {createdQr && (
              <div
                style={{
                  ...surface,
                  padding: 16, marginBottom: 14, textAlign: "center",
                  color: t.ink, position: "relative",
                }}
              >
                <button
                  onClick={() => setCreatedQr(null)}
                  style={{
                    position: "absolute", top: 8, right: 10, background: "transparent",
                    border: "none", fontSize: 18, color: t.muted, cursor: "pointer",
                  }}
                >
                  ×
                </button>
                <div style={labelStyle}>QR ใหม่</div>
                <div style={{ fontFamily: KANIT, fontWeight: 700, fontSize: 16, color: t.forest, margin: "6px 0 12px" }}>
                  {createdQr.label}
                </div>
                <img
                  src={`data:image/png;base64,${createdQr.png}`}
                  alt="bin QR"
                  style={{ width: 200, height: 200, borderRadius: 8, border: `1px solid ${t.mint}` }}
                />
                <div style={{ marginTop: 10 }}>
                  <a
                    href={`data:image/png;base64,${createdQr.png}`}
                    download={`bin-${createdQr.label}.png`}
                    style={{
                      display: "inline-block",
                      padding: "8px 16px", borderRadius: 8,
                      background: t.forest, color: "white", fontSize: 12,
                      fontWeight: 700, textDecoration: "none",
                      fontFamily: BODY, letterSpacing: 0.5,
                    }}
                  >
                    ⬇ ดาวน์โหลด PNG
                  </a>
                </div>
                <div style={{ fontSize: 10, color: t.muted, marginTop: 8, fontFamily: MONO }}>
                  ID {createdQr.id}
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {bins.map((b) => (
                <div
                  key={b.id}
                  style={{
                    ...surfaceDark,
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    alignItems: "center", gap: 10,
                    padding: "11px 14px",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.label}
                    </div>
                    <div style={{ fontSize: 9.5, color: `${t.mint}66`, marginTop: 2, fontFamily: MONO, letterSpacing: 0.5 }}>
                      {b.id.slice(0, 12)}…
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase",
                      padding: "2px 7px", borderRadius: 999, fontWeight: 700,
                      background: b.active ? `${t.moss}cc` : `${t.coral}cc`,
                      color: "white",
                    }}
                  >
                    {b.active ? "active" : "off"}
                  </span>
                  <button
                    onClick={() => toggleBin(b)}
                    disabled={binBusy}
                    style={{
                      padding: "6px 10px", borderRadius: 8,
                      background: "transparent",
                      border: `1px solid ${b.active ? t.coral : t.moss}`,
                      color: b.active ? t.coral : t.moss,
                      fontSize: 11, fontWeight: 700, fontFamily: BODY,
                      cursor: "pointer",
                    }}
                  >
                    {b.active ? "ปิด" : "เปิด"}
                  </button>
                </div>
              ))}
              {bins.length === 0 && (
                <div style={{ padding: 32, textAlign: "center", color: t.muted, fontSize: 13 }}>ยังไม่มีถัง</div>
              )}
            </div>
          </>
        )}

        {tab === "audit" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {changes.map((c) => (
              <div
                key={c.id}
                style={{
                  ...surfaceDark,
                  padding: "11px 14px",
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "white", display: "flex", gap: 6, alignItems: "center", fontFamily: MONO }}>
                    <span style={{ color: t.muted }}>{c.fromRole}</span>
                    <span style={{ color: t.gold }}>→</span>
                    <span style={{ color: "white", fontWeight: 700 }}>{c.toRole}</span>
                  </div>
                  <div style={{ fontSize: 11, color: `${t.mint}99`, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.reason}
                  </div>
                </div>
                <div style={{ fontSize: 9.5, color: t.muted, fontFamily: MONO, whiteSpace: "nowrap" }}>
                  {c.createdAt?.slice(0, 16).replace("T", " ")}
                </div>
              </div>
            ))}
            {changes.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: t.muted, fontSize: 13 }}>ยังไม่มีประวัติ</div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

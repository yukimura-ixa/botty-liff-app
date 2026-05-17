"use client";
import { useEffect, useState } from "react";
import { theme as t } from "@/lib/theme";
import {
  adminListUsers, adminChangeRole, adminListRoleChanges,
  type UserRow, type RoleChange,
} from "@/lib/api";

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [changes, setChanges] = useState<RoleChange[]>([]);
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState("");

  async function refresh() {
    try {
      const r = await adminListUsers({ role, q });
      setUsers(r.users ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "load failed");
    }
  }
  useEffect(() => { refresh(); }, [role, q]);
  useEffect(() => { adminListRoleChanges().then((r) => setChanges(r.changes ?? [])); }, []);

  async function promote(u: UserRow) {
    const reason = prompt(`เลื่อน ${u.fullName} เป็นครู? เหตุผล:`);
    if (!reason) return;
    setBusy(u.uid);
    try {
      await adminChangeRole(u.uid, "teacher", reason);
      await refresh();
      const c = await adminListRoleChanges();
      setChanges(c.changes ?? []);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy("");
    }
  }

  async function demote(u: UserRow) {
    const reason = prompt(`ถอด ${u.fullName} กลับเป็นนักเรียน? เหตุผล:`);
    if (!reason) return;
    setBusy(u.uid);
    try {
      await adminChangeRole(u.uid, "student", reason);
      await refresh();
      const c = await adminListRoleChanges();
      setChanges(c.changes ?? []);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <main style={{ minHeight: "100dvh", background: t.bone, padding: "56px 18px 24px" }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: t.forest, marginBottom: 16 }}>โหมดแอดมิน</div>

      <section style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.forest, marginBottom: 8 }}>จัดการสิทธิ์ครู</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา..."
            style={{ flex: 1, padding: 8, borderRadius: 8, border: `1px solid ${t.mint}`, fontFamily: "inherit" }}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{ padding: 8, borderRadius: 8, border: `1px solid ${t.mint}`, fontFamily: "inherit" }}
          >
            <option value="">ทุกบทบาท</option>
            <option value="student">นักเรียน</option>
            <option value="teacher">ครู</option>
            <option value="admin">แอดมิน</option>
          </select>
        </div>
        {err && <div style={{ color: t.coral, fontSize: 12 }}>{err}</div>}
        {users.map((u) => (
          <div
            key={u.uid}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: 10, borderBottom: `1px solid ${t.mint}55`, gap: 8,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.fullName}</div>
              <div style={{ fontSize: 11, color: t.muted }}>{u.role} · {u.classKey}</div>
            </div>
            {u.role === "student" && (
              <button
                disabled={busy === u.uid}
                onClick={() => promote(u)}
                style={{ padding: "6px 10px", borderRadius: 8, background: t.forest, color: "white", border: "none", fontSize: 12, fontWeight: 600 }}
              >
                เลื่อนเป็นครู
              </button>
            )}
            {u.role === "teacher" && (
              <button
                disabled={busy === u.uid}
                onClick={() => demote(u)}
                style={{ padding: "6px 10px", borderRadius: 8, background: t.mint, color: t.forest, border: "none", fontSize: 12, fontWeight: 600 }}
              >
                ถอดสิทธิ์
              </button>
            )}
          </div>
        ))}
      </section>

      <section>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.forest, marginBottom: 8 }}>ประวัติการเปลี่ยนสิทธิ์</div>
        {changes.map((c) => (
          <div key={c.id} style={{ padding: 8, fontSize: 12, color: t.muted, borderBottom: `1px solid ${t.mint}55` }}>
            {c.createdAt}: {c.fromRole} → {c.toRole} ({c.reason})
          </div>
        ))}
        {changes.length === 0 && (
          <div style={{ padding: 12, fontSize: 12, color: t.muted, textAlign: "center" }}>ยังไม่มีประวัติ</div>
        )}
      </section>
    </main>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { theme as t } from "@/lib/theme";
import {
  adminListUsers, adminListRoleChanges, adminListUserEdits,
  adminListAdjustments, adminListAdjustRequests, adminDecideAdjustRequest,
  adminUpdateUser, adminDeleteUser,
  type UserRow, type RoleChange, type UserEdit,
  type Adjustment, type AdjustRequest,
  type UserPatch,
} from "@/lib/api";

const KANIT = "var(--font-kanit), system-ui";
const BODY = "var(--font-ibm-plex-thai), system-ui";
const MONO = "ui-monospace, 'SF Mono', Menlo, monospace";

const surfaceDark: React.CSSProperties = {
  background: t.ink,
  border: `1px solid ${t.forest}`,
  borderRadius: 14,
};

type Tab = "users" | "adjust" | "audit";

function roleChip(role: string) {
  const map: Record<string, { bg: string; fg: string }> = {
    admin: { bg: t.gold, fg: t.ink },
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
  const [err, setErr] = useState("");

  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    fullName: string;
    classGrade: string;
    classRoom: string;
    totalPoints: string;
    status: 'active' | 'inactive';
  }>({ fullName: '', classGrade: '0', classRoom: '0', totalPoints: '0', status: 'active' });
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState('');
  const [editToast, setEditToast] = useState('');
  const [confirmEditOpen, setConfirmEditOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [changes, setChanges] = useState<RoleChange[]>([]);
  const [changesErr, setChangesErr] = useState("");

  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [adjustmentsErr, setAdjustmentsErr] = useState("");
  const [userEdits, setUserEdits] = useState<UserEdit[]>([]);
  const [userEditsErr, setUserEditsErr] = useState("");
  const [adjustReqs, setAdjustReqs] = useState<AdjustRequest[]>([]);
  const [adjustReqsErr, setAdjustReqsErr] = useState("");
  const [adjustReqBusy, setAdjustReqBusy] = useState("");

  // monotonically increasing token, used to discard stale responses when the
  // user types fast and earlier requests resolve after later ones.
  const usersReqSeq = useRef(0);

  async function refreshChanges() {
    try {
      const r = await adminListRoleChanges();
      setChanges(r.changes ?? []);
      setChangesErr("");
    } catch (e: unknown) {
      setChangesErr(e instanceof Error ? e.message : "load failed");
    }
  }
  async function refreshAdjustments() {
    try {
      const r = await adminListAdjustments({ limit: 100 });
      setAdjustments(r.adjustments ?? []);
      setAdjustmentsErr("");
    } catch (e: unknown) {
      setAdjustmentsErr(e instanceof Error ? e.message : "load failed");
    }
  }
  async function refreshUserEdits() {
    try {
      const r = await adminListUserEdits();
      setUserEdits(r.edits ?? []);
      setUserEditsErr("");
    } catch (e: unknown) {
      setUserEditsErr(e instanceof Error ? e.message : "load failed");
    }
  }
  async function refreshAdjustReqs() {
    try {
      const r = await adminListAdjustRequests();
      setAdjustReqs(r.requests ?? []);
      setAdjustReqsErr("");
    } catch (e: unknown) {
      setAdjustReqsErr(e instanceof Error ? e.message : "load failed");
    }
  }
  async function decideAdjust(rq: AdjustRequest, approve: boolean) {
    const sign = rq.delta > 0 ? "+" : "";
    if (!confirm(approve ? `อนุมัติปรับ ${sign}${rq.delta}?` : `ปฏิเสธคำขอ?`)) return;
    setAdjustReqBusy(rq.id);
    try {
      await adminDecideAdjustRequest(rq.id, approve);
      await refreshAdjustReqs();
      await refreshAdjustments();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "failed");
    } finally { setAdjustReqBusy(""); }
  }

  useEffect(() => {
    // debounce + stale-guard so each keystroke fires at most one request and
    // the latest response wins.
    const myReq = ++usersReqSeq.current;
    const handle = setTimeout(async () => {
      try {
        const r = await adminListUsers({ role: roleFilter, q });
        if (myReq !== usersReqSeq.current) return;
        setUsers(r.users ?? []);
        setErr("");
      } catch (e: unknown) {
        if (myReq !== usersReqSeq.current) return;
        setErr(e instanceof Error ? e.message : "load failed");
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [roleFilter, q]);

  useEffect(() => {
    if (!editToast) return;
    const t = setTimeout(() => setEditToast(''), 2000);
    return () => clearTimeout(t);
  }, [editToast]);

  function openEdit(u: UserRow) {
    setExpandedUid(u.uid);
    setEditErr('');
    setConfirmEditOpen(false);
    setEditForm({
      fullName: u.fullName ?? '',
      classGrade: String(u.classGrade),
      classRoom: String(u.classRoom),
      totalPoints: String(u.totalPoints ?? 0),
      status: (u.status === 'inactive' ? 'inactive' : 'active'),
    });
  }

  function closeEdit() {
    setExpandedUid(null);
    setEditErr('');
    setConfirmEditOpen(false);
    setConfirmDeleteOpen(false);
  }

  function isDestructive(u: UserRow): boolean {
    const origPoints = u.totalPoints ?? 0;
    const origStatus = u.status === 'inactive' ? 'inactive' : 'active';
    const newPoints = Number(editForm.totalPoints);
    const statusDestructive = origStatus === 'active' && editForm.status === 'inactive';
    const pointsZero = newPoints === 0 && origPoints > 0;
    const pointsBigDrop = origPoints > 0 && newPoints < origPoints * 0.5;
    return statusDestructive || pointsZero || pointsBigDrop;
  }

  function changedFields(u: UserRow): Array<{ label: string; oldValue: string; newValue: string }> {
    const out: Array<{ label: string; oldValue: string; newValue: string }> = [];
    const newFullName = editForm.fullName.trim();
    if (newFullName !== (u.fullName ?? '')) {
      out.push({ label: 'ชื่อ-สกุล', oldValue: u.fullName || '—', newValue: newFullName || '—' });
    }
    const newGrade = Number(editForm.classGrade);
    if (newGrade !== (u.classGrade ?? 0)) {
      out.push({ label: 'ชั้น', oldValue: String(u.classGrade ?? 0), newValue: String(newGrade) });
    }
    const newRoom = Number(editForm.classRoom);
    if (newRoom !== (u.classRoom ?? 0)) {
      out.push({ label: 'ห้อง', oldValue: String(u.classRoom ?? 0), newValue: String(newRoom) });
    }
    const newPoints = Number(editForm.totalPoints);
    if (newPoints !== u.totalPoints) {
      out.push({ label: 'คะแนน', oldValue: u.totalPoints.toLocaleString(), newValue: newPoints.toLocaleString() });
    }
    const origStatus = u.status === 'inactive' ? 'inactive' : 'active';
    if (editForm.status !== origStatus) {
      out.push({
        label: 'สถานะ',
        oldValue: origStatus === 'inactive' ? 'ไม่ใช้งาน' : 'ใช้งาน',
        newValue: editForm.status === 'inactive' ? 'ไม่ใช้งาน' : 'ใช้งาน',
      });
    }
    return out;
  }

  async function submitEdit(u: UserRow) {
    setEditBusy(true);
    setEditErr('');
    try {
      const patch: UserPatch = {};
      const newFullName = editForm.fullName.trim();
      if (newFullName !== (u.fullName ?? '')) patch.fullName = newFullName;
      const newGrade = Number(editForm.classGrade);
      const origGrade = u.classGrade;
      if (newGrade !== origGrade) patch.classGrade = newGrade;
      const newRoom = Number(editForm.classRoom);
      const origRoom = u.classRoom;
      if (newRoom !== origRoom) patch.classRoom = newRoom;
      const newPoints = Number(editForm.totalPoints);
      if (newPoints !== u.totalPoints) patch.totalPoints = newPoints;
      const origStatus = u.status === 'inactive' ? 'inactive' : 'active';
      if (editForm.status !== origStatus) patch.status = editForm.status;

      if (Object.keys(patch).length === 0) {
        setEditToast('ไม่มีการเปลี่ยนแปลง');
        closeEdit();
        return;
      }

      const r = await adminUpdateUser(u.uid, patch);
      const list = await adminListUsers({ role: roleFilter, q });
      setUsers(list.users ?? []);
      if (!r.noop) await refreshUserEdits();
      setEditToast(r.noop ? 'ไม่มีการเปลี่ยนแปลง' : 'บันทึกแล้ว');
      closeEdit();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'failed';
      setEditErr(msg);
    } finally {
      setEditBusy(false);
      setConfirmEditOpen(false);
    }
  }


  async function submitDelete(u: UserRow) {
    setEditBusy(true);
    setEditErr('');
    try {
      const r = await adminDeleteUser(u.uid);
      const list = await adminListUsers({ role: roleFilter, q });
      setUsers(list.users ?? []);
      await refreshUserEdits();
      setEditToast(r.warning ? 'ลบแล้ว (auth บางส่วนล้มเหลว)' : 'ลบผู้ใช้แล้ว');
      closeEdit();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'failed';
      setEditErr(msg);
    } finally {
      setEditBusy(false);
      setConfirmDeleteOpen(false);
    }
  }

  useEffect(() => { refreshChanges(); refreshAdjustments(); refreshAdjustReqs(); refreshUserEdits(); }, []);

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
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
          { k: "adjust" as const, label: "ปรับคะแนน", count: adjustReqs.length },
          { k: "audit" as const, label: "ประวัติ", count: changes.length + adjustments.length },
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
                <option value="admin">ADMIN</option>
              </select>
            </div>

            {err && (
              <div style={{ padding: 10, background: `${t.coral}25`, color: t.coral, borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
                {err}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {users.map((u, i) => {
                const isInactive = u.status === 'inactive';
                const expanded = expandedUid === u.uid;
                return (
                  <div key={u.uid} style={{
                    ...surfaceDark,
                    opacity: isInactive ? 0.55 : 1,
                  }}>
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "24px 1fr auto auto",
                      alignItems: "center", gap: 10,
                      padding: "11px 14px",
                    }}>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: `${t.mint}77`, textAlign: "right" }}>
                        {String(i + 1).padStart(2, "0")}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {u.fullName || <span style={{ color: t.muted, fontStyle: "italic" }}>(ยังไม่กรอกข้อมูล)</span>}
                          {isInactive && (
                            <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 6px', borderRadius: 999, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                              (ไม่ใช้งาน)
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10.5, color: `${t.mint}88`, marginTop: 2, display: "flex", alignItems: "center", gap: 6, fontFamily: MONO }}>
                          <span>{u.classKey || "—"}</span>
                          <span style={{ opacity: 0.4 }}>·</span>
                          <span>{u.totalPoints.toLocaleString()} pts</span>
                        </div>
                      </div>
                      <div>{roleChip(u.role)}</div>
                      <div>
                        {u.role !== 'admin' && (
                          <button
                            type="button"
                            onClick={() => expanded ? closeEdit() : openEdit(u)}
                            style={{
                              fontSize: 10, padding: '6px 8px', borderRadius: 8,
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              color: 'white', cursor: 'pointer', fontFamily: MONO,
                            }}
                          >
                            {expanded ? '▴' : '▾'}
                          </button>
                        )}
                      </div>
                    </div>
                    {expanded && (
                      <div style={{ padding: '0 14px 14px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 10 }}>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: `${t.mint}aa`, fontFamily: MONO, letterSpacing: 0.4 }}>
                            ชื่อ-สกุล
                            <input
                              value={editForm.fullName}
                              onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                              disabled={editBusy}
                              maxLength={80}
                              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', padding: '6px 8px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12 }}
                            />
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: `${t.mint}aa`, fontFamily: MONO, letterSpacing: 0.4 }}>
                            สถานะ
                            <select
                              value={editForm.status}
                              onChange={(e) => setEditForm({ ...editForm, status: e.target.value as 'active' | 'inactive' })}
                              disabled={editBusy}
                              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', padding: '6px 8px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12 }}
                            >
                              <option value="active">ใช้งาน</option>
                              <option value="inactive">ไม่ใช้งาน</option>
                            </select>
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: `${t.mint}aa`, fontFamily: MONO, letterSpacing: 0.4 }}>
                            ชั้น
                            <input
                              type="number"
                              min={0} max={13}
                              value={editForm.classGrade}
                              onChange={(e) => setEditForm({ ...editForm, classGrade: e.target.value })}
                              disabled={editBusy}
                              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', padding: '6px 8px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12 }}
                            />
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: `${t.mint}aa`, fontFamily: MONO, letterSpacing: 0.4 }}>
                            ห้อง
                            <input
                              type="number"
                              min={0} max={99}
                              value={editForm.classRoom}
                              onChange={(e) => setEditForm({ ...editForm, classRoom: e.target.value })}
                              disabled={editBusy}
                              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', padding: '6px 8px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12 }}
                            />
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: `${t.mint}aa`, fontFamily: MONO, letterSpacing: 0.4, gridColumn: '1 / 3' }}>
                            คะแนนรวม
                            <input
                              type="number"
                              min={0} max={1000000}
                              value={editForm.totalPoints}
                              onChange={(e) => setEditForm({ ...editForm, totalPoints: e.target.value })}
                              disabled={editBusy}
                              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', padding: '6px 8px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12 }}
                            />
                          </label>
                        </div>
                        {editErr && (
                          <div style={{ color: t.coral, fontSize: 11, marginTop: 8 }}>{editErr}</div>
                        )}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteOpen(true)}
                            disabled={editBusy}
                            style={{ fontSize: 11, padding: '6px 12px', borderRadius: 8, background: 'transparent', border: `1px solid ${t.coral}`, color: t.coral, cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            ลบผู้ใช้
                          </button>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              type="button"
                              onClick={closeEdit}
                              disabled={editBusy}
                              style={{ fontSize: 11, padding: '6px 12px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                              ยกเลิก
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (isDestructive(u)) {
                                  setConfirmEditOpen(true);
                                } else {
                                  submitEdit(u);
                                }
                              }}
                              disabled={editBusy}
                              style={{ fontSize: 11, padding: '6px 14px', borderRadius: 8, background: t.forest, border: 'none', color: 'white', cursor: 'pointer', fontFamily: 'inherit', opacity: editBusy ? 0.7 : 1 }}
                            >
                              {editBusy ? 'กำลังบันทึก...' : 'บันทึก'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {expanded && confirmDeleteOpen && (
                      <div style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50,
                      }}>
                        <div style={{ background: t.ink, borderRadius: 14, padding: 20, maxWidth: 360, width: '100%', border: `1px solid ${t.coral}` }}>
                          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: t.coral }}>
                            ยืนยันการลบผู้ใช้
                          </div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginBottom: 8 }}>
                            ลบ <strong style={{ color: 'white' }}>{u.fullName || u.uid}</strong>?
                          </div>
                          <div style={{ fontSize: 11, color: `${t.coral}cc`, marginBottom: 14, lineHeight: 1.6 }}>
                            ดำเนินการนี้ไม่สามารถย้อนกลับได้. ผู้ใช้จะถูกลบจาก Firestore + Firebase Auth. ประวัติสแกน/audit จะยังอยู่ในระบบ.
                          </div>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteOpen(false)}
                              disabled={editBusy}
                              style={{ fontSize: 11, padding: '6px 12px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                              ยกเลิก
                            </button>
                            <button
                              type="button"
                              onClick={() => submitDelete(u)}
                              disabled={editBusy}
                              style={{ fontSize: 11, padding: '6px 14px', borderRadius: 8, background: t.coral, border: 'none', color: 'white', cursor: 'pointer', fontFamily: 'inherit', opacity: editBusy ? 0.7 : 1, fontWeight: 700 }}
                            >
                              {editBusy ? 'กำลังลบ...' : 'ลบถาวร'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {expanded && confirmEditOpen && (
                      <div style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50,
                      }}>
                        <div style={{ background: t.ink, borderRadius: 14, padding: 20, maxWidth: 360, width: '100%', border: `1px solid ${t.forest}` }}>
                          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'white' }}>
                            ยืนยันการเปลี่ยนแปลง
                          </div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 10 }}>
                            ตรวจสอบการเปลี่ยนแปลง:
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                            {changedFields(u).map((c) => (
                              <div key={c.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 11, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <span style={{ color: `${t.mint}aa`, fontFamily: MONO, letterSpacing: 0.4 }}>{c.label}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'white', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  <span style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'line-through' }}>{c.oldValue}</span>
                                  <span style={{ color: t.gold }}>→</span>
                                  <span style={{ fontWeight: 700 }}>{c.newValue}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              onClick={() => setConfirmEditOpen(false)}
                              disabled={editBusy}
                              style={{ fontSize: 11, padding: '6px 12px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                              ยกเลิก
                            </button>
                            <button
                              type="button"
                              onClick={() => submitEdit(u)}
                              disabled={editBusy}
                              style={{ fontSize: 11, padding: '6px 14px', borderRadius: 8, background: t.coral, border: 'none', color: 'white', cursor: 'pointer', fontFamily: 'inherit', opacity: editBusy ? 0.7 : 1 }}
                            >
                              {editBusy ? '...' : 'ยืนยัน'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {users.length === 0 && (
                <div style={{ padding: 32, textAlign: "center", color: t.muted, fontSize: 13 }}>ไม่พบผู้ใช้</div>
              )}
            </div>
          </>
        )}

        {tab === "adjust" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {adjustReqsErr && (
              <div style={{ padding: 10, background: `${t.coral}25`, color: t.coral, borderRadius: 8, fontSize: 12 }}>
                {adjustReqsErr}
              </div>
            )}
            {adjustReqs.map((rq) => {
              const sign = rq.delta > 0 ? "+" : "";
              const color = rq.delta > 0 ? t.moss : t.coral;
              return (
                <div key={rq.id} style={{ ...surfaceDark, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: MONO, fontSize: 10.5, color: `${t.mint}88` }}>
                        target {rq.targetUid.slice(0, 10)}…
                      </div>
                      <div style={{ fontSize: 13, color: "white", marginTop: 2 }}>
                        <strong style={{ color, fontFamily: KANIT, fontSize: 18 }}>{sign}{rq.delta}</strong>
                        <span style={{ fontSize: 10, color: t.muted, marginLeft: 6 }}>pts</span>
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 9.5, color: `${t.mint}66`, marginTop: 2 }}>
                        by {rq.teacherUid.slice(0, 10)}…
                      </div>
                    </div>
                    <span style={{ fontSize: 9, letterSpacing: 1.2, padding: "2px 7px", borderRadius: 999, background: `${t.gold}33`, color: t.gold, fontWeight: 700 }}>
                      PENDING
                    </span>
                  </div>
                  {rq.reason && (
                    <div style={{ fontSize: 11.5, color: `${t.mint}aa`, lineHeight: 1.4 }}>
                      {rq.reason}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => decideAdjust(rq, true)}
                      disabled={adjustReqBusy === rq.id}
                      style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: t.moss, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: BODY }}
                    >✓ อนุมัติ</button>
                    <button
                      onClick={() => decideAdjust(rq, false)}
                      disabled={adjustReqBusy === rq.id}
                      style={{ flex: 1, padding: "8px 0", borderRadius: 8, background: "transparent", color: t.coral, border: `1px solid ${t.coral}`, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: BODY }}
                    >✕ ปฏิเสธ</button>
                  </div>
                </div>
              );
            })}
            {adjustReqs.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: t.muted, fontSize: 13 }}>ไม่มีคำขอปรับคะแนน</div>
            )}
          </div>
        )}

        {tab === "audit" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(changesErr || adjustmentsErr) && (
              <div style={{ padding: 10, background: `${t.coral}25`, color: t.coral, borderRadius: 8, fontSize: 12 }}>
                {changesErr || adjustmentsErr}
              </div>
            )}
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, color: `${t.mint}aa`, marginBottom: 4 }}>
              ROLE CHANGES · {changes.length}
            </div>
            {changes.map((c) => (
              <div
                key={c.id}
                style={{ ...surfaceDark, padding: "11px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
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
              <div style={{ padding: 16, textAlign: "center", color: t.muted, fontSize: 12 }}>ยังไม่มีประวัติ</div>
            )}

            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, color: `${t.mint}aa`, margin: "16px 0 4px" }}>
              POINT ADJUSTMENTS · {adjustments.length}
            </div>
            {adjustments.map((a) => {
              const sign = a.delta > 0 ? "+" : "";
              const color = a.delta > 0 ? t.moss : t.coral;
              return (
                <div key={a.id} style={{ ...surfaceDark, padding: "11px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "white", fontFamily: MONO, display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ color, fontWeight: 700 }}>{sign}{a.delta}</span>
                      <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 999, background: `${t.forest}66`, color: t.mint, letterSpacing: 0.5 }}>
                        {a.bucket.toUpperCase()}
                      </span>
                      {a.source === "admin_approved" && (
                        <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 999, background: `${t.gold}33`, color: t.gold, letterSpacing: 0.5 }}>
                          APPROVED
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: `${t.mint}99`, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.reason}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 9.5, color: `${t.mint}66`, marginTop: 2 }}>
                      target {a.targetUid.slice(0, 10)}… · by {a.teacherUid.slice(0, 10)}…
                    </div>
                  </div>
                  <div style={{ fontSize: 9.5, color: t.muted, fontFamily: MONO, whiteSpace: "nowrap" }}>
                    {a.createdAt?.slice(0, 16).replace("T", " ")}
                  </div>
                </div>
              );
            })}
            {adjustments.length === 0 && (
              <div style={{ padding: 16, textAlign: "center", color: t.muted, fontSize: 12 }}>ยังไม่มีการปรับคะแนน</div>
            )}

            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, color: `${t.mint}aa`, margin: "16px 0 4px" }}>
              USER EDITS · {userEdits.length}
            </div>
            {userEditsErr && (
              <div style={{ padding: 10, background: `${t.coral}25`, color: t.coral, borderRadius: 8, fontSize: 12 }}>
                {userEditsErr}
              </div>
            )}
            {userEdits.map((e) => (
              <div key={e.id} style={{ ...surfaceDark, padding: "11px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9.5, color: `${t.mint}66`, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    target {e.targetUid.slice(0, 10)}… · by {e.byUid.slice(0, 10)}…
                  </div>
                  <div style={{ fontSize: 9.5, color: t.muted, fontFamily: MONO, whiteSpace: "nowrap" }}>
                    {e.createdAt?.slice(0, 16).replace("T", " ")}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {e.changes.map((c, i) => (
                    <div key={i} style={{ fontSize: 11, color: "white", fontFamily: MONO, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ color: `${t.mint}aa`, fontSize: 10 }}>{c.field}</span>
                      <span style={{ color: t.muted, textDecoration: "line-through" }}>{String(c.oldValue ?? "—")}</span>
                      <span style={{ color: t.gold }}>→</span>
                      <span style={{ fontWeight: 700 }}>{String(c.newValue ?? "—")}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {userEdits.length === 0 && (
              <div style={{ padding: 16, textAlign: "center", color: t.muted, fontSize: 12 }}>ยังไม่มีการแก้ไขโปรไฟล์</div>
            )}
          </div>
        )}
      </div>
      {editToast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: t.forest, color: 'white', padding: '8px 16px',
          borderRadius: 999, fontSize: 12, fontWeight: 600,
          zIndex: 100,
        }}>
          {editToast}
        </div>
      )}
    </main>
  );
}

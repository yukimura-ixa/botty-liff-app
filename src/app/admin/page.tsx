"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { theme as t } from "@/lib/theme";
import {
  adminListUsers, adminChangeRole, adminListRoleChanges,
  adminListRoleRequests, adminDecideRoleRequest,
  adminListAdjustments, adminListAdjustRequests, adminDecideAdjustRequest,
  type UserRow, type RoleChange, type AssignableRole, type RoleRequest,
  type Adjustment, type AdjustRequest,
} from "@/lib/api";

const KANIT = "var(--font-kanit), system-ui";
const BODY = "var(--font-ibm-plex-thai), system-ui";
const MONO = "ui-monospace, 'SF Mono', Menlo, monospace";

const surfaceDark: React.CSSProperties = {
  background: t.ink,
  border: `1px solid ${t.forest}`,
  borderRadius: 14,
};

type Tab = "users" | "requests" | "adjust" | "audit";

function roleChip(role: string) {
  const map: Record<string, { bg: string; fg: string }> = {
    admin: { bg: t.gold, fg: t.ink },
    teacher: { bg: t.moss, fg: "white" },
    council: { bg: t.forest, fg: "white" },
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
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("users");

  const [users, setUsers] = useState<UserRow[]>([]);
  const [roleFilter, setRoleFilter] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState("");

  const [changes, setChanges] = useState<RoleChange[]>([]);
  const [changesErr, setChangesErr] = useState("");

  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [requestsErr, setRequestsErr] = useState("");
  const [reqBusy, setReqBusy] = useState("");

  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [adjustmentsErr, setAdjustmentsErr] = useState("");
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
  async function refreshRequests() {
    try {
      const r = await adminListRoleRequests();
      setRequests(r.requests ?? []);
      setRequestsErr("");
    } catch (e: unknown) {
      setRequestsErr(e instanceof Error ? e.message : "load failed");
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

  async function decideRequest(rq: RoleRequest, approve: boolean) {
    if (!confirm(approve ? `อนุมัติ ${rq.requestedRole}?` : `ปฏิเสธคำขอ?`)) return;
    setReqBusy(rq.id);
    try {
      await adminDecideRoleRequest(rq.id, approve);
      await refreshRequests();
      await refreshChanges();
      await refreshUsers();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "failed");
    } finally { setReqBusy(""); }
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

  async function refreshUsers() {
    const myReq = ++usersReqSeq.current;
    try {
      const r = await adminListUsers({ role: roleFilter, q });
      if (myReq !== usersReqSeq.current) return;
      setUsers(r.users ?? []);
      setErr("");
    } catch (e: unknown) {
      if (myReq !== usersReqSeq.current) return;
      setErr(e instanceof Error ? e.message : "load failed");
    }
  }

  useEffect(() => { refreshChanges(); refreshRequests(); refreshAdjustments(); refreshAdjustReqs(); }, []);

  async function changeRoleTo(u: UserRow, target: AssignableRole) {
    if (u.role === target) return;
    const labels: Record<AssignableRole, string> = { student: "นักเรียน", council: "สภานักเรียน", teacher: "ครู" };
    if (!confirm(`เปลี่ยน ${u.fullName} → ${labels[target]}?`)) return;
    setBusy(u.uid);
    try {
      await adminChangeRole(u.uid, target);
      await refreshUsers();
      await refreshChanges();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "failed");
    } finally { setBusy(""); }
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
          <button
            onClick={() => router.push("/approver")}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 12px", borderRadius: 10,
              background: t.gold, color: t.ink, border: "none",
              fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
              fontFamily: MONO, cursor: "pointer", textTransform: "uppercase",
            }}
            aria-label="เปิด QR เจ้าหน้าที่"
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>▦</span>
            QR
          </button>
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
          { k: "requests" as const, label: "คำขอบทบาท", count: requests.length },
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
                <option value="council">COUNCIL</option>
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
                    {u.role === "admin" ? (
                      <span style={{ fontSize: 10, color: t.gold, fontFamily: MONO, letterSpacing: 0.5 }}>
                        LOCKED
                      </span>
                    ) : (
                      <select
                        disabled={busy === u.uid}
                        value={u.role}
                        onChange={(e) => changeRoleTo(u, e.target.value as AssignableRole)}
                        style={{
                          padding: "6px 8px", borderRadius: 8,
                          background: t.ink, color: t.gold, border: `1px solid ${t.forest}`,
                          fontSize: 11, fontWeight: 700, fontFamily: MONO, letterSpacing: 0.4,
                          cursor: busy === u.uid ? "default" : "pointer",
                        }}
                      >
                        <option value="student">STUDENT</option>
                        <option value="council">COUNCIL</option>
                        <option value="teacher">TEACHER</option>
                      </select>
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

        {tab === "requests" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {requestsErr && (
              <div style={{ padding: 10, background: `${t.coral}25`, color: t.coral, borderRadius: 8, fontSize: 12 }}>
                {requestsErr}
              </div>
            )}
            {requests.map((rq) => (
              <div
                key={rq.id}
                style={{
                  ...surfaceDark,
                  padding: "12px 14px",
                  display: "flex", flexDirection: "column", gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: MONO, fontSize: 10.5, color: `${t.mint}88` }}>
                      uid {rq.uid.slice(0, 10)}…
                    </div>
                    <div style={{ fontSize: 13, color: "white", marginTop: 2 }}>
                      → <strong>{rq.requestedRole.toUpperCase()}</strong>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 9, letterSpacing: 1.2, padding: "2px 7px", borderRadius: 999,
                    background: `${t.gold}33`, color: t.gold, fontWeight: 700,
                  }}>
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
                    onClick={() => decideRequest(rq, true)}
                    disabled={reqBusy === rq.id}
                    style={{
                      flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                      background: t.moss, color: "white", fontSize: 12, fontWeight: 700,
                      cursor: "pointer", fontFamily: BODY,
                    }}
                  >✓ อนุมัติ</button>
                  <button
                    onClick={() => decideRequest(rq, false)}
                    disabled={reqBusy === rq.id}
                    style={{
                      flex: 1, padding: "8px 0", borderRadius: 8,
                      background: "transparent", color: t.coral,
                      border: `1px solid ${t.coral}`, fontSize: 12, fontWeight: 700,
                      cursor: "pointer", fontFamily: BODY,
                    }}
                  >✕ ปฏิเสธ</button>
                </div>
              </div>
            ))}
            {requests.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: t.muted, fontSize: 13 }}>ไม่มีคำขอใหม่</div>
            )}
          </div>
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
          </div>
        )}
      </div>
    </main>
  );
}

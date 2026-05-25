"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { theme as t } from "@/lib/theme";
import {
  teacherListRoleRequests,
  teacherDecideRoleRequest,
  type RoleRequest,
} from "@/lib/api";

const KANIT = "var(--font-kanit), system-ui";
const BODY = "var(--font-ibm-plex-thai), system-ui";

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 1.8,
  textTransform: "uppercase",
  color: t.muted,
  fontWeight: 600,
};

const surface: React.CSSProperties = {
  background: "white",
  border: `1px solid ${t.mint}`,
  borderRadius: 18,
  boxShadow: "0 1px 0 rgba(0,0,0,0.02)",
};

export default function TeacherRoleRequestsPage() {
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string>("");

  function load() {
    setLoading(true);
    setError("");
    teacherListRoleRequests()
      .then((r) => setRequests(r.requests ?? []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(id: string, approve: boolean) {
    const reason = approve ? "" : prompt("เหตุผลที่ปฏิเสธ (ไม่จำเป็น)") ?? "";
    setBusyId(id);
    try {
      await teacherDecideRoleRequest(id, approve, reason || undefined);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ผิดพลาด");
    } finally {
      setBusyId("");
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
      }}
    >
      <header style={{ padding: "60px 22px 18px" }}>
        <Link href="/teacher" style={{ fontSize: 12, color: t.muted, textDecoration: "none" }}>
          ← แดชบอร์ด
        </Link>
        <h1
          style={{
            margin: "12px 0 4px",
            fontFamily: KANIT,
            fontWeight: 800,
            fontSize: 28,
            letterSpacing: -0.5,
            color: t.forest,
          }}
        >
          คำขอเป็นสภานักเรียน
        </h1>
        <div style={{ fontSize: 12, color: t.muted, lineHeight: 1.5 }}>
          อนุมัติหรือปฏิเสธคำขอจากนักเรียน · ครูอนุมัติได้เฉพาะระดับสภานักเรียน
        </div>
      </header>

      <section style={{ padding: "0 22px" }}>
        {error && (
          <div style={{ padding: 12, background: `${t.coral}15`, color: t.coral, borderRadius: 10, fontSize: 12, marginBottom: 10 }}>
            {error}
          </div>
        )}

        {loading && <div style={{ padding: 32, textAlign: "center", color: t.muted, fontSize: 13 }}>กำลังโหลด...</div>}

        {!loading && requests.length === 0 && !error && (
          <div style={{ ...surface, padding: 32, textAlign: "center", color: t.muted, fontSize: 13 }}>
            ไม่มีคำขอรอดำเนินการ
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {requests.map((r) => {
            const busy = busyId === r.id;
            return (
              <div key={r.id} style={{ ...surface, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ ...labelStyle, color: t.forest }}>{r.requestedRole}</div>
                  <div style={{ fontSize: 10, color: t.muted }}>
                    {new Date(r.createdAt).toLocaleString("th-TH")}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.ink, fontFamily: KANIT, marginBottom: 4 }}>
                  uid: {r.uid}
                </div>
                {r.reason && (
                  <div style={{ fontSize: 12, color: t.muted, marginBottom: 10, lineHeight: 1.5 }}>
                    “{r.reason}”
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => decide(r.id, true)}
                    disabled={busy}
                    style={{
                      flex: 1,
                      padding: 10,
                      borderRadius: 10,
                      border: "none",
                      background: busy ? t.muted : t.forest,
                      color: "white",
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: BODY,
                      cursor: busy ? "default" : "pointer",
                    }}
                  >
                    {busy ? "..." : "อนุมัติ"}
                  </button>
                  <button
                    onClick={() => decide(r.id, false)}
                    disabled={busy}
                    style={{
                      flex: 1,
                      padding: 10,
                      borderRadius: 10,
                      border: `1px solid ${t.coral}`,
                      background: "white",
                      color: t.coral,
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: BODY,
                      cursor: busy ? "default" : "pointer",
                    }}
                  >
                    ปฏิเสธ
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

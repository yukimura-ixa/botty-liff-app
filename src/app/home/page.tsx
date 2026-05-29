"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BottomNav from "@/components/shared/BottomNav";
import BottleProgress from "@/components/botty/BottleProgress";
import { theme as t, getRank, getNextRank, RANKS } from "@/lib/theme";
import {
  getMe,
  getSchoolGoal,
  ApiError,
  type StudentProfile,
  type SchoolGoal,
} from "@/lib/api";
import { RankTree } from "@/components/botty/RankTree";

export default function HomePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [goal, setGoal] = useState<SchoolGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    setError("");
    Promise.all([
      getMe().catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) {
          router.replace("/onboard");
          return null;
        }
        throw e;
      }),
      getSchoolGoal().catch(() => null),
    ])
      .then(([p, g]) => {
        if (p) setProfile(p);
        setGoal(g);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
        setLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; load() resets loading/error and is reused by the retry button
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const pts = profile?.totalPoints ?? 0;
  const [displayPts, setDisplayPts] = useState(0);

  useEffect(() => {
    if (pts === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset count-up animation when points drop to 0
      setDisplayPts(0);
      return;
    }
    const duration = 900;
    const start = performance.now();
    let raf: number;
    function tick(now: number) {
      const p = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplayPts(Math.round(ease * pts));
      if (p < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pts]);

  const cur = getRank(pts);
  const next = getNextRank(pts);
  const curDef = RANKS.find((r) => r.k === cur.k) ?? RANKS[0];
  const nextDef = RANKS.find((r) => r.k === next.k) ?? RANKS[RANKS.length - 1];
  const goalPct =
    goal && goal.targetBottles > 0
      ? Math.min(100, (goal.currentBottles / goal.targetBottles) * 100)
      : 0;
  const firstName = profile?.fullName?.split(" ")[0] ?? null;

  const [greeting, setGreeting] = useState("สวัสดี");
  useEffect(() => {
    // client-only time read; computing in render would cause a hydration mismatch (server hour ≠ client hour)
    const h = new Date().getHours();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setGreeting(h < 12 ? "สวัสดีตอนเช้า" : h < 17 ? "สวัสดีตอนบ่าย" : "สวัสดีตอนเย็น");
  }, []);

  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    // sessionStorage is undefined during SSR; reading it must happen client-side in an effect
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setRole(sessionStorage.getItem("role"));
  }, []);
  const isAdmin = role === "admin";

  if (error) {
    return (
      <main
        style={{
          minHeight: "100dvh",
          background: t.bone,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
        }}
      >
        <div style={{ fontSize: 48 }}>⚠️</div>
        <div
          style={{
            fontSize: 14,
            color: t.coral,
            textAlign: "center",
            maxWidth: 320,
          }}
        >
          {error}
        </div>
        <button
          onClick={load}
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
          ลองใหม่
        </button>
      </main>
    );
  }

  return (
    <main
      style={{ minHeight: "100dvh", background: t.bone, paddingBottom: 120 }}
    >
      {/* Hero */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background: `linear-gradient(160deg, ${t.forest} 0%, ${t.moss} 100%)`,
          padding: "56px 22px 84px",
          color: "white",
          borderBottomLeftRadius: 32,
          borderBottomRightRadius: 32,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>{greeting},</div>
            {loading ? (
              <div
                style={{
                  width: 120,
                  height: 22,
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.2)",
                  marginTop: 4,
                }}
              />
            ) : (
              <div style={{ fontSize: 19, fontWeight: 700 }}>
                {firstName} 👋
              </div>
            )}
          </div>
          {!loading && (profile?.streakDays ?? 0) > 0 && (
            <div
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.16)",
                border: "1px solid rgba(255,255,255,0.2)",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              🔥 {profile!.streakDays} วันติด
            </div>
          )}
        </div>

        <div style={{ marginTop: 20 }}>
          <div
            style={{
              fontSize: 11,
              opacity: 0.7,
              letterSpacing: 1.5,
              fontWeight: 600,
            }}
          >
            คะแนนรวม
          </div>
          {loading ? (
            <div
              style={{
                width: 180,
                height: 64,
                borderRadius: 8,
                background: "rgba(255,255,255,0.2)",
                marginTop: 4,
              }}
            />
          ) : (
            <div
              style={{
                fontSize: 64,
                fontWeight: 800,
                letterSpacing: -2,
                lineHeight: 1,
                marginTop: 2,
                fontFamily: "var(--font-kanit), inherit",
              }}
            >
              {displayPts.toLocaleString()}
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  opacity: 0.7,
                  marginLeft: 6,
                  fontFamily: "inherit",
                }}
              >
                pts
              </span>
            </div>
          )}
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
            {loading ? (
              <span style={{ opacity: 0 }}>—</span>
            ) : (
              `${profile?.totalScans ?? 0} ขวด`
            )}
          </div>
        </div>
      </div>

      {/* Rank card */}
      <div
        style={{
          margin: "-64px 18px 0",
          position: "relative",
          zIndex: 3,
          background: "white",
          borderRadius: 22,
          padding: 18,
          boxShadow: "0 12px 40px rgba(15,61,46,0.14)",
          border: `1px solid ${t.mint}`,
        }}
      >
        {loading ? (
          <div
            style={{
              height: 100,
              borderRadius: 10,
              background: t.mint,
              opacity: 0.4,
            }}
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <RankTree rank={curDef.k} size={80} />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 11,
                  color: t.muted,
                  letterSpacing: 1,
                  fontWeight: 700,
                }}
              >
                ระดับปัจจุบัน
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: t.forest,
                  marginTop: 2,
                }}
              >
                {curDef.k}
              </div>
              <div style={{ fontSize: 12, color: t.moss, marginTop: 4 }}>
                {nextDef.k !== curDef.k
                  ? `อีก ${Math.max(0, nextDef.min - pts).toLocaleString()} pts → ${nextDef.emoji} ${nextDef.k}`
                  : "🌲 ระดับสูงสุด"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* School goal */}
      {goal && goal.targetBottles > 0 && (
        <section style={{ margin: "20px 18px 0" }}>
          <SectionHeader
            title="เป้าหมายของโรงเรียน"
            right={`${goal.currentBottles.toLocaleString()} / ${goal.targetBottles.toLocaleString()}`}
          />
          <div
            style={{
              background: "white",
              borderRadius: 18,
              padding: 16,
              border: `1px solid ${t.mint}`,
              marginTop: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                color: t.muted,
                marginBottom: 10,
              }}
            >
              <span>
                🎯 รีไซเคิล {goal.targetBottles.toLocaleString()} ขวด
                ภายในปีการศึกษานี้
              </span>
              <span style={{ fontWeight: 700, color: t.moss }}>
                {Math.round(goalPct)}%
              </span>
            </div>
            <BottleProgress
              pct={goalPct}
              label={`${goal.currentBottles.toLocaleString()} / ${goal.targetBottles.toLocaleString()}`}
              height={32}
            />
          </div>
        </section>
      )}
      {loading && !goal && (
        <section style={{ margin: "20px 18px 0" }}>
          <div
            style={{
              background: t.mint,
              opacity: 0.4,
              borderRadius: 18,
              height: 90,
            }}
          />
        </section>
      )}

      {/* Quick actions */}
      <section style={{ margin: "20px 18px 0" }}>
        <SectionHeader title="ทางลัด" />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginTop: 8,
          }}
        >
          {[
            { href: "/scan", emoji: "📸", label: "สแกนขวด", bg: t.moss },
            {
              href: "/leaderboard",
              emoji: "🏆",
              label: "กระดานอันดับ",
              bg: t.forest,
            },
            { href: "/history", emoji: "📋", label: "ประวัติสแกน", bg: t.leaf },
            { href: "/profile", emoji: "🌱", label: "โปรไฟล์", bg: "#2A5E3F" },
            ...(isAdmin
              ? [
                  { href: "/teacher", emoji: "📊", label: "แดชบอร์ด", bg: t.ink },
                  { href: "/admin", emoji: "⚙️", label: "จัดการระบบ", bg: t.ink },
                ]
              : []),
          ].map(({ href, emoji, label, bg }) => (
            <Link
              key={href}
              href={href}
              style={{
                background: bg,
                color: "white",
                borderRadius: 16,
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                textDecoration: "none",
              }}
            >
              <span style={{ fontSize: 28 }}>{emoji}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
            </Link>
          ))}
        </div>
      </section>
      <BottomNav />
    </main>
  );
}

function SectionHeader({ title, right }: { title: string; right?: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: t.forest }}>
        {title}
      </div>
      {right && (
        <div style={{ fontSize: 12, color: t.muted, fontWeight: 600 }}>
          {right}
        </div>
      )}
    </div>
  );
}

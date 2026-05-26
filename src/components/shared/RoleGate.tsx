"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { initLiff, getLineIdToken } from "@/lib/liff";
import { authLine, getMe, ApiError } from "@/lib/api";
import { theme as t } from "@/lib/theme";

type State = "loading" | "ok" | "denied" | "error";

export type Role = "student" | "admin";

async function ensureAuth(): Promise<void> {
  if (sessionStorage.getItem("firebaseIdToken")) return;
  const liff = await initLiff();

  if (liff.getOS() === "web") {
    const isMobile =
      window.innerWidth < 768 ||
      /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!isMobile) throw new Error("เปิดบนมือถือผ่าน LINE");
    liff.login({ redirectUri: window.location.href });
    return;
  }
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
    return;
  }

  const idToken = await getLineIdToken();
  let result;
  try {
    result = await authLine(idToken);
  } catch (e) {
    if (e instanceof ApiError && e.message.includes("invalid LINE token")) {
      sessionStorage.removeItem("firebaseIdToken");
      sessionStorage.removeItem("role");
      await liff.logout();
      await liff.login({ redirectUri: window.location.href });
      return;
    }
    throw e;
  }
  const cred = await signInWithCustomToken(auth, result.customToken);
  const firebaseIdToken = await cred.user.getIdToken();
  sessionStorage.setItem("firebaseIdToken", firebaseIdToken);
  sessionStorage.setItem("role", result.role);
}

export default function RoleGate({
  allow,
  children,
  deniedRedirect = "/home",
}: {
  allow: Role[];
  children: ReactNode;
  deniedRedirect?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureAuth();
        if (cancelled) return;
        if (!sessionStorage.getItem("firebaseIdToken")) return;

        const me = await getMe().catch((e: unknown) => {
          if (e instanceof ApiError && e.status === 404) {
            router.replace("/onboard");
            return null;
          }
          throw e;
        });
        if (cancelled || !me) return;

        sessionStorage.setItem("role", me.role);
        if (!allow.includes(me.role as Role)) {
          setState("denied");
          router.replace(deniedRedirect);
          return;
        }
        setState("ok");
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allow, deniedRedirect, router]);

  if (state === "ok") return <>{children}</>;
  if (state === "denied") {
    return (
      <main
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: t.bone,
          color: t.muted,
          fontSize: 13,
        }}
      >
        ไม่มีสิทธิ์เข้าถึง · กำลังพากลับ...
      </main>
    );
  }
  if (state === "error") {
    return (
      <main
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          background: t.bone,
          color: t.ink,
          padding: 24,
        }}
      >
        <div style={{ fontSize: 13, color: t.coral, textAlign: "center", maxWidth: 320 }}>
          {error}
        </div>
        <button
          onClick={() => location.reload()}
          style={{
            padding: "10px 22px",
            borderRadius: 999,
            background: t.moss,
            color: "white",
            border: "none",
            fontSize: 13,
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
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: t.bone,
        color: t.muted,
        fontFamily: "ui-monospace, monospace",
        fontSize: 11,
        letterSpacing: 2,
        opacity: 0.6,
      }}
    >
      AUTH · CHECK
    </main>
  );
}

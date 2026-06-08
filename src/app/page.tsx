"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Botty from "@/components/botty/Botty";
import DesktopBlock from "@/components/shared/DesktopBlock";
import { theme as t } from "@/lib/theme";
import { initLiff, getLineIdToken } from "@/lib/liff";
import { authLine, ApiError } from "@/lib/api";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";

type Phase = "init" | "authenticating" | "redirecting" | "error" | "desktop";

export default function LoginPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("init");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        await auth.authStateReady();
        // Always re-run authLine so the custom token's `role` claim stays
        // fresh — an admin promoting/demoting a user must take effect on the
        // next LIFF open, not after a manual sign-out. signInWithCustomToken
        // replaces the existing session, so this is safe when already signed in.
        sessionStorage.removeItem("firebaseIdToken");
        sessionStorage.removeItem("role");

        const liff = await initLiff();

        // Desktop browser (outside LINE): the LIFF UI is mobile-only — block it.
        if (liff.getOS() === 'web') {
          const isMobile = window.innerWidth < 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
          if (!isMobile) {
            if (!cancelled) setPhase('desktop');
            return;
          }
        }

        // Kick off LINE login ONLY when not already authenticated. Calling
        // liff.login() unconditionally in an external mobile browser caused a
        // redirect loop: login → LINE → back here → login again. Once logged in
        // (in-app or external browser) we fall through to the auth flow.
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }

        // Line login succeeded; continue with auth flow

        if (!cancelled) setPhase("authenticating");

        // Try to authenticate, with a one-shot retry on an expired LINE token.
        // The retry guard lives in sessionStorage (NOT the per-run cleared keys)
        // so it survives the login redirect/reload — otherwise a persistently
        // rejected token loops logout→login forever.
        async function tryAuth() {
          const idToken = await getLineIdToken();
          try {
            const result = await authLine(idToken);
            // Success — clear the one-shot guard so a future expiry can retry.
            sessionStorage.removeItem("lineAuthRetried");
            return result;
          } catch (authErr) {
            if (
              authErr instanceof ApiError &&
              authErr.message.includes("invalid LINE token") &&
              sessionStorage.getItem("lineAuthRetried") !== "1"
            ) {
              sessionStorage.setItem("lineAuthRetried", "1");
              // Clear app session state and force one fresh LIFF login.
              sessionStorage.removeItem("firebaseIdToken");
              sessionStorage.removeItem("role");
              await liff.logout();
              await liff.login({ redirectUri: window.location.href });
              // Page reload triggers the next (final) auth attempt.
              return null;
            }
            throw authErr;
          }
        }

        const authResult = await tryAuth();
        if (!authResult) {
          // Retry triggered; page reload should handle the next attempt
          return;
        }

        const { customToken, role, onboarded } = authResult;
        const cred = await signInWithCustomToken(auth, customToken);
        const firebaseIdToken = await cred.user.getIdToken();

        sessionStorage.setItem("firebaseIdToken", firebaseIdToken);
        sessionStorage.setItem("role", role);

        if (cancelled) return;
        setPhase("redirecting");
        router.replace(onboarded ? "/home" : "/onboard");
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
        setPhase("error");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (phase === 'desktop') return <DesktopBlock />;

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 32px",
        background: `linear-gradient(180deg, ${t.forest} 0%, ${t.moss} 100%)`,
        color: "white",
        gap: 24,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 148,
          height: 148,
          borderRadius: "50%",
          background: `radial-gradient(circle at 30% 30%, ${t.leaf}33, ${t.forest}66)`,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          boxShadow: `0 30px 60px ${t.forest}88, inset 0 2px 0 rgba(255,255,255,0.25)`,
          border: "1px solid rgba(255,255,255,0.18)",
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", bottom: -8 }}>
          <Botty pose="wave" size={110} />
        </div>
      </div>

      <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1 }}>
        Botty
      </div>

      {phase === "error" ? (
        <>
          <div style={{ fontSize: 14, color: t.coral, maxWidth: 320 }}>
            {error}
          </div>
          <button
            onClick={() => location.reload()}
            style={{
              padding: "12px 28px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.3)",
              background: "rgba(255,255,255,0.1)",
              color: "white",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ลองใหม่
          </button>
        </>
      ) : (
        <div style={{ fontSize: 15, opacity: 0.85 }}>
          {phase === "authenticating" || phase === "redirecting"
            ? "กำลังเข้าสู่ระบบ..."
            : "กำลังโหลด..."}
        </div>
      )}
    </main>
  );
}

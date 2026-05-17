"use client";
import { useEffect, useState, type ReactNode } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { initLiff, getLineIdToken } from "@/lib/liff";
import { authLine, getMe, ApiError } from "@/lib/api";

type State = "loading" | "ok" | "denied" | "error";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function ensureAuth(): Promise<void> {
      if (sessionStorage.getItem("firebaseIdToken")) return;
      const liff = await initLiff();
      if (liff.getOS() === "web") {
        const isMobile = window.innerWidth < 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (!isMobile) {
          throw new Error("กรุณาเปิดบนมือถือผ่าน LINE");
        }
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

    async function run() {
      try {
        await ensureAuth();
        if (cancelled) return;
        if (!sessionStorage.getItem("firebaseIdToken")) return;

        // First /me call triggers backend EnsureAdminRole (sets Firestore + custom claim).
        const me = await getMe();
        if (cancelled) return;

        // If profile says admin → done. Otherwise, refresh token once to pick up newly-set claim.
        if (me.role === "admin") {
          setState("ok");
          return;
        }
        if (auth.currentUser) {
          const fresh = await auth.currentUser.getIdToken(true);
          sessionStorage.setItem("firebaseIdToken", fresh);
          const me2 = await getMe();
          if (cancelled) return;
          setState(me2.role === "admin" ? "ok" : "denied");
          return;
        }
        setState("denied");
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
        setState("error");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return <main style={{ padding: 40, textAlign: "center" }}>กำลังตรวจสอบสิทธิ์...</main>;
  }
  if (state === "denied") {
    return <main style={{ padding: 40, textAlign: "center" }}>ไม่มีสิทธิ์เข้าถึง</main>;
  }
  if (state === "error") {
    return (
      <main style={{ padding: 40, textAlign: "center" }}>
        <div style={{ marginBottom: 12, color: "#c44" }}>{error}</div>
        <button
          onClick={() => location.reload()}
          style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ccc", background: "white", cursor: "pointer", fontFamily: "inherit" }}
        >
          ลองใหม่
        </button>
      </main>
    );
  }
  return <>{children}</>;
}

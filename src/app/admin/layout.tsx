"use client";
import { useEffect, useState, type ReactNode } from "react";
import { signInWithCustomToken, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { initLiff, getLineIdToken } from "@/lib/liff";
import { authLine, getMe, ApiError } from "@/lib/api";

type State = "loading" | "ok" | "denied" | "error";

function log(...args: unknown[]) {
  console.log("[admin]", ...args);
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function ensureAuth(): Promise<void> {
      if (sessionStorage.getItem("firebaseIdToken")) return;
      const liff = await initLiff();
      log(`liff init os=${liff.getOS()} loggedIn=${liff.isLoggedIn()}`);

      if (liff.getOS() === "web") {
        const isMobile = window.innerWidth < 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
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

    async function run() {
      try {
        await ensureAuth();
        if (cancelled) return;
        if (!sessionStorage.getItem("firebaseIdToken")) return;

        const me = await getMe();
        if (cancelled) return;
        log(`me #1 role=${me.role}`);

        if (me.role !== "admin") {
          setState("denied");
          return;
        }

        // Firestore says admin, but the ID token claim may still be stale
        // (e.g. EnsureAdminRole just promoted us during /me). Force-refresh
        // so subsequent /v1/admin/* calls carry role=admin in claims.
        if (auth.currentUser) {
          const fresh = await auth.currentUser.getIdToken(true);
          sessionStorage.setItem("firebaseIdToken", fresh);
        }
        setState("ok");
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        log(`ERROR ${msg}`);
        setError(msg);
        setState("error");
      }
    }

    run();
    return () => { cancelled = true; };
  }, []);

  async function fullLogout() {
    try {
      sessionStorage.clear();
      localStorage.clear();
      await signOut(auth);
      try {
        const liff = await initLiff();
        if (liff.isLoggedIn()) await liff.logout();
      } catch { /* ignore */ }
      location.href = "/";
    } catch {
      location.href = "/";
    }
  }

  if (state === "loading") {
    return (
      <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a1612", color: "#C8E6D2" }}>
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: 2, opacity: 0.6 }}>
          AUTH · CHECK
        </div>
      </main>
    );
  }
  if (state === "denied") {
    return (
      <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center", background: "#0a1612", color: "white", padding: 32 }}>
        <div style={{ fontSize: 14, color: "#C8E6D2", textAlign: "center" }}>ไม่มีสิทธิ์เข้าถึง</div>
        <button
          onClick={fullLogout}
          style={{ padding: "8px 18px", borderRadius: 999, background: "#D9A441", color: "#1A2620", fontWeight: 700, border: "none", cursor: "pointer" }}
        >
          ออกจากระบบ
        </button>
      </main>
    );
  }
  if (state === "error") {
    return (
      <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center", background: "#0a1612", color: "white", padding: 32 }}>
        <div style={{ fontSize: 13, color: "#E07856", textAlign: "center", maxWidth: 320 }}>{error}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => location.reload()}
            style={{ padding: "8px 18px", borderRadius: 999, background: "#1F6E4A", color: "white", fontWeight: 700, border: "none", cursor: "pointer" }}
          >
            ลองใหม่
          </button>
          <button
            onClick={fullLogout}
            style={{ padding: "8px 18px", borderRadius: 999, background: "transparent", border: "1px solid #C8E6D2", color: "#C8E6D2", fontWeight: 700, cursor: "pointer" }}
          >
            ออกจากระบบ
          </button>
        </div>
      </main>
    );
  }
  return (
    <>
      {children}
      <button
        onClick={fullLogout}
        title="logout"
        style={{
          position: "fixed", top: 18, right: 18, zIndex: 100,
          width: 36, height: 36, borderRadius: 18,
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(217,164,65,0.4)",
          color: "#D9A441", fontSize: 14, cursor: "pointer",
        }}
      >
        ⏻
      </button>
    </>
  );
}

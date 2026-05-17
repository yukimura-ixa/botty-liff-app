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
  const [trace, setTrace] = useState<string[]>([]);

  function push(msg: string) {
    log(msg);
    setTrace((t) => [...t, `${new Date().toISOString().slice(11, 19)} ${msg}`]);
  }

  useEffect(() => {
    let cancelled = false;
    push("mount");

    async function ensureAuth(): Promise<void> {
      const cached = sessionStorage.getItem("firebaseIdToken");
      push(`cached token: ${cached ? "yes" : "no"}`);
      if (cached) return;

      push("initLiff start");
      const liff = await initLiff();
      push(`initLiff ok os=${liff.getOS()} inClient=${liff.isInClient()} loggedIn=${liff.isLoggedIn()}`);

      if (liff.getOS() === "web") {
        const isMobile = window.innerWidth < 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (!isMobile) {
          throw new Error("เปิดบนมือถือผ่าน LINE");
        }
        push("web mobile → liff.login");
        liff.login({ redirectUri: window.location.href });
        return;
      }
      if (!liff.isLoggedIn()) {
        push("not logged in → liff.login");
        liff.login({ redirectUri: window.location.href });
        return;
      }

      push("getLineIdToken");
      const idToken = await getLineIdToken();
      push(`idToken length=${idToken.length}`);

      let result;
      try {
        push("authLine call");
        result = await authLine(idToken);
        push(`authLine ok role=${result.role}`);
      } catch (e) {
        push(`authLine err: ${e instanceof Error ? e.message : String(e)}`);
        if (e instanceof ApiError && e.message.includes("invalid LINE token")) {
          sessionStorage.removeItem("firebaseIdToken");
          sessionStorage.removeItem("role");
          await liff.logout();
          await liff.login({ redirectUri: window.location.href });
          return;
        }
        throw e;
      }

      push("signInWithCustomToken");
      const cred = await signInWithCustomToken(auth, result.customToken);
      const firebaseIdToken = await cred.user.getIdToken();
      sessionStorage.setItem("firebaseIdToken", firebaseIdToken);
      sessionStorage.setItem("role", result.role);
      push("firebase signed in");
    }

    async function run() {
      try {
        await ensureAuth();
        if (cancelled) return;
        if (!sessionStorage.getItem("firebaseIdToken")) {
          push("no token after ensureAuth — likely mid-redirect");
          return;
        }

        push("getMe #1");
        const me = await getMe();
        if (cancelled) return;
        push(`me #1 role=${me.role}`);

        if (me.role === "admin") {
          setState("ok");
          return;
        }
        if (auth.currentUser) {
          push("refreshing firebase token");
          const fresh = await auth.currentUser.getIdToken(true);
          sessionStorage.setItem("firebaseIdToken", fresh);
          push("getMe #2");
          const me2 = await getMe();
          if (cancelled) return;
          push(`me #2 role=${me2.role}`);
          setState(me2.role === "admin" ? "ok" : "denied");
          return;
        }
        setState("denied");
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        push(`ERROR: ${msg}`);
        setError(msg);
        setState("error");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function fullLogout() {
    push("manual logout");
    try {
      sessionStorage.clear();
      localStorage.clear();
      await signOut(auth);
      try {
        const liff = await initLiff();
        if (liff.isLoggedIn()) await liff.logout();
      } catch {}
      location.href = "/";
    } catch (e) {
      push(`logout err: ${e instanceof Error ? e.message : String(e)}`);
      location.href = "/";
    }
  }

  const debugBox = (
    <div
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        maxHeight: "40dvh", overflow: "auto",
        background: "rgba(0,0,0,0.85)", color: "#9f9",
        fontFamily: "monospace", fontSize: 10, padding: 8, zIndex: 9999,
      }}
    >
      <div style={{ color: "#ff9", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
        <span>state={state}</span>
        <button
          onClick={fullLogout}
          style={{
            background: "#c44", color: "white", border: "none",
            padding: "2px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer",
          }}
        >
          logout
        </button>
      </div>
      {trace.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
      {error && <div style={{ color: "#f99" }}>ERR {error}</div>}
    </div>
  );

  if (state === "loading") {
    return (
      <>
        <main style={{ padding: 40, textAlign: "center" }}>กำลังตรวจสอบสิทธิ์...</main>
        {debugBox}
      </>
    );
  }
  if (state === "denied") {
    return (
      <>
        <main style={{ padding: 40, textAlign: "center" }}>ไม่มีสิทธิ์เข้าถึง</main>
        {debugBox}
      </>
    );
  }
  if (state === "error") {
    return (
      <>
        <main style={{ padding: 40, textAlign: "center" }}>
          <div style={{ marginBottom: 12, color: "#c44" }}>{error}</div>
          <button
            onClick={() => location.reload()}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ccc", background: "white", cursor: "pointer", fontFamily: "inherit" }}
          >
            ลองใหม่
          </button>
        </main>
        {debugBox}
      </>
    );
  }
  return (
    <>
      {children}
      {debugBox}
    </>
  );
}

"use client";
import { useEffect, useState, type ReactNode } from "react";
import { getMe } from "@/lib/api";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "ok" | "denied">("loading");

  useEffect(() => {
    getMe()
      .then((me) => setState(me.role === "admin" ? "ok" : "denied"))
      .catch(() => setState("denied"));
  }, []);

  if (state === "loading") {
    return <main style={{ padding: 40, textAlign: "center" }}>กำลังตรวจสอบสิทธิ์...</main>;
  }
  if (state === "denied") {
    return <main style={{ padding: 40, textAlign: "center" }}>ไม่มีสิทธิ์เข้าถึง</main>;
  }
  return <>{children}</>;
}

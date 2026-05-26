import type { ReactNode } from "react";
import RoleGate from "@/components/shared/RoleGate";

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return <RoleGate allow={["admin"]}>{children}</RoleGate>;
}

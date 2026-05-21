import type { ReactNode } from "react";
import RoleGate from "@/components/shared/RoleGate";

export default function ApproverLayout({ children }: { children: ReactNode }) {
  return <RoleGate allow={["council", "teacher", "admin"]}>{children}</RoleGate>;
}

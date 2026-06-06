import type { AuthContext } from "./auth";

export type Role = AuthContext["role"];
export type ApproverRole = "council" | "admin";

export function hasRole(ctx: AuthContext, required: "admin"): boolean {
  return ctx.role === required;
}

// Council members and admins may approve student scans via the staff-QR flow.
export function canApprove(role: Role): boolean {
  return role === "council" || role === "admin";
}

import type { AuthContext } from "./auth";

export type Role = AuthContext["role"];
export type ApproverRole = "council" | "teacher" | "admin";

export function hasRole(ctx: AuthContext, required: "teacher" | "admin"): boolean {
  if (ctx.role === "admin") return true;
  return ctx.role === required;
}

export function canApprove(role: Role): boolean {
  return role === "council" || role === "teacher" || role === "admin";
}

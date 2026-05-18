import type { AuthContext } from "./auth";

export function hasRole(ctx: AuthContext, required: "teacher" | "admin"): boolean {
  if (ctx.role === "admin") return true;
  return ctx.role === required;
}

import type { AuthContext } from "./auth";

export type Role = AuthContext["role"];

export function hasRole(ctx: AuthContext, required: "admin"): boolean {
  return ctx.role === required;
}

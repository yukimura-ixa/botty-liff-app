import { fbAuth } from "./firebase";
import { getUser } from "@/server/user/repo";

export type AuthContext = {
  uid: string;
  role: "student" | "council" | "teacher" | "admin" | "unknown";
};

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function verifyBearerToken(req: Request): Promise<AuthContext> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    throw new AuthError(401, "missing token");
  }
  const token = header.slice("bearer ".length).trim();
  try {
    const decoded = await fbAuth().verifyIdToken(token);
    const role =
      typeof decoded.role === "string"
        ? (decoded.role as AuthContext["role"])
        : "unknown";
    return { uid: decoded.uid, role };
  } catch {
    throw new AuthError(401, "invalid token");
  }
}

// Re-reads role from Firestore (60s cached via getUser) and rejects if the
// token-claim role disagrees. Use on privileged endpoints where a stale
// token (e.g. demoted user still holding a valid ID token) would be dangerous.
export async function verifyBearerTokenWithFreshRole(req: Request): Promise<AuthContext> {
  const ctx = await verifyBearerToken(req);
  const prof = await getUser(ctx.uid);
  if (!prof) throw new AuthError(401, "profile not found");
  if (prof.role !== ctx.role) {
    throw new AuthError(403, "role changed; please sign in again");
  }
  return { uid: ctx.uid, role: prof.role as AuthContext["role"] };
}

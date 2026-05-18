import { fbAuth } from "./firebase";

export type AuthContext = {
  uid: string;
  role: "student" | "teacher" | "admin" | "unknown";
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

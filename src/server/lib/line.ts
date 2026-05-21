export type LineClaims = {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  name?: string;
  picture?: string;
  email?: string;
};

const LINE_VERIFY = "https://api.line.me/oauth2/v2.1/verify";
const MAX_TOKEN_AGE_SEC = 5 * 60;
const MAX_CLOCK_SKEW_SEC = 60;

export async function verifyLineIdToken(
  idToken: string,
  channelId: string,
  now: number = Math.floor(Date.now() / 1000),
): Promise<LineClaims> {
  const body = new URLSearchParams();
  body.set("id_token", idToken);
  body.set("client_id", channelId);

  const res = await fetch(LINE_VERIFY, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`invalid LINE token (${res.status}): ${detail}`);
  }
  const claims = (await res.json()) as LineClaims;
  if (claims.aud !== channelId) {
    throw new Error(`aud mismatch: token=${claims.aud} channel=${channelId}`);
  }
  if (claims.iss !== "https://access.line.me") {
    throw new Error(`iss mismatch: ${claims.iss}`);
  }
  if (typeof claims.exp !== "number" || claims.exp <= now) {
    throw new Error("token expired");
  }
  if (typeof claims.iat === "number") {
    if (claims.iat > now + MAX_CLOCK_SKEW_SEC) {
      throw new Error("token from future");
    }
    if (now - claims.iat > MAX_TOKEN_AGE_SEC) {
      throw new Error("token too old (replay window)");
    }
  }
  return claims;
}

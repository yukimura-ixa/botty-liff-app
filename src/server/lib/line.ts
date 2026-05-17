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

export async function verifyLineIdToken(
  idToken: string,
  channelId: string,
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
  return claims;
}

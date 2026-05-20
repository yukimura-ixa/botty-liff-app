export function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type JsonOkOptions = {
  headers?: Record<string, string>;
};

export function jsonOk<T extends object>(body: T, options: JsonOkOptions = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
}

type CachedOptions = {
  maxAge: number;
  swr?: number;
  headers?: Record<string, string>;
};

export function jsonOkCached<T extends object>(body: T, options: CachedOptions): Response {
  const parts = [`private`, `max-age=${options.maxAge}`];
  if (typeof options.swr === "number") parts.push(`stale-while-revalidate=${options.swr}`);
  return jsonOk(body, {
    headers: { "Cache-Control": parts.join(", "), ...(options.headers ?? {}) },
  });
}

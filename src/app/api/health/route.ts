export const runtime = "nodejs";
export const maxDuration = 5;

export async function GET() {
  return new Response(JSON.stringify({ ok: true, ts: new Date().toISOString() }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

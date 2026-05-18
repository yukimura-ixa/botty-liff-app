export type DetectorConfig = {
  url: string;
  apiKey: string;
  bottleClass: string;
  acceptThreshold: number;
};

export type DetectResult = {
  accepted: boolean;
  confidence: number;
  class: string;
  itemCount: number;
};

type WorkflowPrediction = { class: string; confidence: number };
type WorkflowResponse = {
  outputs?: { predictions?: { predictions?: WorkflowPrediction[] } }[];
  error_type?: string;
  message?: string;
};

export function classMatches(predicted: string, want: string): boolean {
  return predicted.trim().toLowerCase() === want.trim().toLowerCase();
}

export async function detect(cfg: DetectorConfig, imageBytes: Buffer | Uint8Array): Promise<DetectResult> {
  if (imageBytes.length === 0) throw new Error("empty image bytes");
  const encoded = Buffer.from(imageBytes).toString("base64");
  const body = JSON.stringify({
    api_key: cfg.apiKey,
    inputs: {
      image: { type: "base64", value: encoded },
    },
  });
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`roboflow status ${res.status}: ${text.slice(0, 200)}`);
  }
  const out = (await res.json()) as WorkflowResponse;
  if (out.error_type) throw new Error(`roboflow workflow: ${out.error_type}`);

  const preds = out.outputs?.[0]?.predictions?.predictions ?? [];
  let best: { conf: number; cls: string } | null = null;
  let count = 0;
  for (const p of preds) {
    if (!classMatches(p.class, cfg.bottleClass)) continue;
    count++;
    if (!best || p.confidence > best.conf) best = { conf: p.confidence, cls: p.class };
  }
  if (!best) return { accepted: false, confidence: 0, class: "", itemCount: 0 };
  return {
    accepted: best.conf >= cfg.acceptThreshold,
    confidence: best.conf,
    class: best.cls,
    itemCount: count,
  };
}

export function detectorConfigFromEnv(): DetectorConfig {
  const host = (process.env.ROBOFLOW_HOST ?? "https://serverless.roboflow.com").replace(/\/+$/, "");
  const model = (process.env.ROBOFLOW_MODEL ?? "napat-pbd-gmail-com/workflows/botty-infer").replace(/^\/+|\/+$/g, "");
  const apiKey = process.env.ROBOFLOW_API_KEY;
  if (!apiKey) throw new Error("ROBOFLOW_API_KEY missing");
  return {
    url: `${host}/${model}`,
    apiKey,
    bottleClass: process.env.ROBOFLOW_BOTTLE_CLASS ?? "PET Bottle",
    acceptThreshold: process.env.BOTTLE_ACCEPT_THRESHOLD ? Number(process.env.BOTTLE_ACCEPT_THRESHOLD) : 0.7,
  };
}

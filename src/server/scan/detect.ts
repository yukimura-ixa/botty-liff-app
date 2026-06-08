export type DetectorConfig = {
  url: string;
  apiKey: string;
  // Accepted bottle class labels (case-insensitive, trimmed). A list so ops can
  // tolerate model label variants (e.g. "PET Bottle", "pet-bottle") without a
  // redeploy — set ROBOFLOW_BOTTLE_CLASS to a comma-separated list.
  bottleClasses: string[];
  acceptThreshold: number;
};

// Why a rejection happened, so "not PET" is diagnosable:
//   no_match  — no prediction matched any accepted class label. observedClass /
//               observedConfidence carry the model's top guess so a class-label
//               config mismatch is visible (model saw X but we wanted Y).
//   low_conf  — a matching class was found but below acceptThreshold.
export type RejectReason = "no_match" | "low_conf";

export type DetectResult = {
  accepted: boolean;
  confidence: number;
  class: string;
  itemCount: number;
  annotatedImage?: string;
  rejectReason?: RejectReason;
  observedClass?: string;
  observedConfidence?: number;
};

type WorkflowPrediction = { class: string; confidence: number };
type WorkflowOutput = {
  predictions?: { predictions?: WorkflowPrediction[] };
  output_image?: { value?: string; type?: string };
  count_objects?: { output?: number };
};
type WorkflowResponse = {
  outputs?: WorkflowOutput[];
  error_type?: string;
  message?: string;
};

export function classMatches(predicted: string, want: string): boolean {
  return predicted.trim().toLowerCase() === want.trim().toLowerCase();
}

export function classMatchesAny(predicted: string, wants: string[]): boolean {
  return wants.some((w) => classMatches(predicted, w));
}

function stripDataUriPrefix(s: string): string {
  const i = s.indexOf("base64,");
  return i >= 0 && s.startsWith("data:") ? s.slice(i + "base64,".length) : s;
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

  const first = out.outputs?.[0];
  const preds = first?.predictions?.predictions ?? [];
  let best: { conf: number; cls: string } | null = null; // best matching prediction
  let bestAny: { conf: number; cls: string } | null = null; // best across all classes
  let count = 0;
  for (const p of preds) {
    if (!bestAny || p.confidence > bestAny.conf) bestAny = { conf: p.confidence, cls: p.class };
    if (!classMatchesAny(p.class, cfg.bottleClasses)) continue;
    count++;
    if (!best || p.confidence > best.conf) best = { conf: p.confidence, cls: p.class };
  }

  const rawImg = first?.output_image?.value;
  const annotatedImage = typeof rawImg === "string" && rawImg.length > 0 ? stripDataUriPrefix(rawImg) : undefined;

  const cntFromBlock = first?.count_objects?.output;
  const itemCount = typeof cntFromBlock === "number" ? cntFromBlock : count;

  // No accepted class matched: surface the model's top guess so a label/config
  // mismatch (model emits "pet-bottle", we expect "PET Bottle") is diagnosable.
  if (!best) {
    return {
      accepted: false,
      confidence: 0,
      class: "",
      itemCount: 0,
      annotatedImage,
      rejectReason: "no_match",
      observedClass: bestAny?.cls,
      observedConfidence: bestAny?.conf,
    };
  }
  const accepted = best.conf >= cfg.acceptThreshold;
  return {
    accepted,
    confidence: best.conf,
    class: best.cls,
    itemCount,
    annotatedImage,
    ...(accepted ? {} : { rejectReason: "low_conf" as const }),
  };
}

export function detectorConfigFromEnv(): DetectorConfig {
  const host = (process.env.ROBOFLOW_HOST ?? "https://serverless.roboflow.com").replace(/\/+$/, "");
  const model = (process.env.ROBOFLOW_MODEL ?? "napat-pbd-gmail-com/workflows/botty-infer").replace(/^\/+|\/+$/g, "");
  const apiKey = process.env.ROBOFLOW_API_KEY;
  if (!apiKey) throw new Error("ROBOFLOW_API_KEY missing");
  const rawClasses = process.env.ROBOFLOW_BOTTLE_CLASS ?? "PET Bottle";
  const bottleClasses = rawClasses.split(",").map((s) => s.trim()).filter(Boolean);
  return {
    url: `${host}/${model}`,
    apiKey,
    bottleClasses: bottleClasses.length ? bottleClasses : ["PET Bottle"],
    acceptThreshold: process.env.BOTTLE_ACCEPT_THRESHOLD ? Number(process.env.BOTTLE_ACCEPT_THRESHOLD) : 0.7,
  };
}

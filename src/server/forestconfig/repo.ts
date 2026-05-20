import { fbFirestore } from "@/server/lib/firebase";
import { pickConfig, type ForestConfig } from "./validate";
import { TtlCache } from "@/server/leaderboard/cache";
import { registerBuster, bust } from "@/server/lib/cache-bus";

const forestCache = new TtlCache<ForestConfig>(300_000, 4);
registerBuster("forest", () => forestCache.bust());

export async function getForestStages(): Promise<ForestConfig> {
  const cached = forestCache.get("stages");
  if (cached) return cached;
  try {
    const doc = await fbFirestore().collection("config").doc("forestStages").get();
    const cfg = doc.exists ? pickConfig(doc.data() ?? null) : pickConfig(null);
    forestCache.set("stages", cfg);
    return cfg;
  } catch (err) {
    console.error("forest-stages read failed", err);
    return pickConfig(null);
  }
}

export async function updateForestStages(thresholds: [number, number, number]): Promise<void> {
  await fbFirestore().collection("config").doc("forestStages").set({ thresholds });
  bust("forest");
}

import { fbFirestore } from "@/server/lib/firebase";
import { pickConfig, type ForestConfig } from "./validate";

export async function getForestStages(): Promise<ForestConfig> {
  try {
    const doc = await fbFirestore().collection("config").doc("forestStages").get();
    if (!doc.exists) return pickConfig(null);
    return pickConfig(doc.data() ?? null);
  } catch (err) {
    console.error("forest-stages read failed", err);
    return pickConfig(null);
  }
}

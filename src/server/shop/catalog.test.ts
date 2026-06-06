import { describe, it, expect } from "vitest";
import { ALL_ITEMS, TREE_VARIANTS, DECORATIONS, TERRAINS, findItem, findVariant } from "./catalog";

const KNOWN_GATES = new Set(["rank_forest", "streak_7", "goal_half"]);

describe("catalog integrity", () => {
  it("has unique ids across every item kind", () => {
    const ids = ALL_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every gate references a known achievement", () => {
    for (const item of ALL_ITEMS) {
      if (item.gate) expect(KNOWN_GATES.has(item.gate)).toBe(true);
    }
  });

  it("tags every tree as kind=tree and every decoration as kind=decoration", () => {
    expect(TREE_VARIANTS.every((i) => i.kind === "tree")).toBe(true);
    expect(DECORATIONS.every((i) => i.kind === "decoration")).toBe(true);
  });

  it("tags every terrain as kind=terrain and includes a free grass default", () => {
    expect(TERRAINS.every((i) => i.kind === "terrain")).toBe(true);
    const grass = TERRAINS.find((i) => i.id === "grass");
    expect(grass?.priceCoins).toBe(0);
    expect(grass?.gate).toBeUndefined();
    expect(findItem("cosmic")?.kind).toBe("terrain");
    expect(ALL_ITEMS.filter((i) => i.kind === "terrain").length).toBe(6);
  });

  it("findItem resolves both kinds; findVariant resolves trees only", () => {
    expect(findItem("oak")?.kind).toBe("tree");
    expect(findItem("flower_patch")?.kind).toBe("decoration");
    expect(findVariant("flower_patch")).toBeUndefined();
    expect(findVariant("oak")?.id).toBe("oak");
  });
});

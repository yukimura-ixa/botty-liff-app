import { describe, it, expect } from "vitest";
import {
  GARDEN_DECORATION_SLOTS, defaultSlot, defaultLayout, clientToFraction,
} from "./garden";

describe("garden slots", () => {
  it("caps placed decorations at 8", () => {
    expect(GARDEN_DECORATION_SLOTS).toBe(8);
  });
});

describe("defaultSlot", () => {
  it("returns fractions in [0,1] across rows of 4", () => {
    for (let i = 0; i < 8; i++) {
      const s = defaultSlot(i);
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(1);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(1);
    }
    expect(defaultSlot(0).x).toBeCloseTo(0.125);
    expect(defaultSlot(4).y).toBeGreaterThan(defaultSlot(0).y); // row 2 lower
  });
});

describe("defaultLayout", () => {
  it("positions each id, in order, within [0,1]", () => {
    const out = defaultLayout(["a", "b", "c"]);
    expect(out.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(out.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)).toBe(true);
  });
});

describe("clientToFraction", () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };
  it("maps a pointer inside the rect to a fraction", () => {
    expect(clientToFraction(200, 100, rect)).toEqual({ x: 0.5, y: 0.5 });
  });
  it("clamps outside the rect to [0,1]", () => {
    expect(clientToFraction(0, 0, rect)).toEqual({ x: 0, y: 0 });
    expect(clientToFraction(9999, 9999, rect)).toEqual({ x: 1, y: 1 });
  });
});

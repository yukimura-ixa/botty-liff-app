import { describe, it, expect } from "vitest";
import { rankForPoints } from "./rank";

describe("rankForPoints", () => {
  it("returns ต้นกล้า for < 50 points", () => {
    expect(rankForPoints(0)).toBe("ต้นกล้า");
    expect(rankForPoints(49)).toBe("ต้นกล้า");
  });
  it("returns ต้นไม้ for 50-79", () => {
    expect(rankForPoints(50)).toBe("ต้นไม้");
    expect(rankForPoints(79)).toBe("ต้นไม้");
  });
  it("returns ป่าไม้ for 80-124", () => {
    expect(rankForPoints(80)).toBe("ป่าไม้");
    expect(rankForPoints(124)).toBe("ป่าไม้");
  });
  it("returns ผืนป่า for 125+", () => {
    expect(rankForPoints(125)).toBe("ผืนป่า");
    expect(rankForPoints(9999)).toBe("ผืนป่า");
  });
  it("treats negatives as ต้นกล้า", () => {
    expect(rankForPoints(-1)).toBe("ต้นกล้า");
  });
});

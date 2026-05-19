import { describe, it, expect } from "vitest";
import { renderQrPng } from "./qr";

describe("renderQrPng", () => {
  it("returns PNG buffer with magic header", async () => {
    const png = await renderQrPng("hello");
    expect(png.length).toBeGreaterThan(64);
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  });
  it("returns deterministic bytes for same input", async () => {
    const a = await renderQrPng("x");
    const b = await renderQrPng("x");
    expect(a.equals(b)).toBe(true);
  });
});

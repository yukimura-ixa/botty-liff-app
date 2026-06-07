import { describe, it, expect } from "vitest";
import { studentSlides, studentActionLabel } from "./studentSlides";
import { councilSlides, councilActionLabel } from "./councilSlides";

describe("student deck", () => {
  it("has 5 slides", () => {
    expect(studentSlides).toHaveLength(5);
  });
  it("every slide has emoji, title, caption", () => {
    for (const s of studentSlides) {
      expect(s.emoji).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(s.caption).toBeTruthy();
    }
  });
  it("has an action label", () => {
    expect(studentActionLabel).toBe("เริ่มเก็บแต้ม");
  });
});

describe("council deck", () => {
  it("has 4 slides", () => {
    expect(councilSlides).toHaveLength(4);
  });
  it("every slide has emoji, title, caption", () => {
    for (const s of councilSlides) {
      expect(s.emoji).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(s.caption).toBeTruthy();
    }
  });
  it("has an action label", () => {
    expect(councilActionLabel).toBe("เข้าใจแล้ว");
  });
});

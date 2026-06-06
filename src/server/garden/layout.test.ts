import { describe, it, expect } from "vitest";
import { validLayout } from "./layout";

const owned = ["rock", "bush", "pond", "log_bench"];

describe("validLayout", () => {
  it("accepts a valid layout and passes positions through", () => {
    const layout = [{ id: "rock", x: 0.2, y: 0.5 }, { id: "pond", x: 0.8, y: 0.6 }];
    expect(validLayout(owned, layout, 8)).toEqual({ ok: true, layout });
  });
  it("clamps out-of-range x/y into [0,1]", () => {
    const r = validLayout(owned, [{ id: "rock", x: 1.5, y: -3 }], 8);
    expect(r).toEqual({ ok: true, layout: [{ id: "rock", x: 1, y: 0 }] });
  });
  it("rejects non-array input", () => {
    expect(validLayout(owned, "nope", 8)).toEqual({ ok: false, code: "bad_input" });
  });
  it("rejects entries missing id or non-finite coords", () => {
    expect(validLayout(owned, [{ id: "rock", x: 0.1 }], 8)).toEqual({ ok: false, code: "bad_input" });
    expect(validLayout(owned, [{ id: 5, x: 0.1, y: 0.1 }], 8)).toEqual({ ok: false, code: "bad_input" });
  });
  it("rejects more than the limit", () => {
    const many = Array.from({ length: 9 }, () => ({ id: "rock", x: 0.1, y: 0.1 }));
    expect(validLayout(owned, many, 8)).toEqual({ ok: false, code: "too_many" });
  });
  it("rejects duplicate ids", () => {
    const dup = [{ id: "rock", x: 0.1, y: 0.1 }, { id: "rock", x: 0.2, y: 0.2 }];
    expect(validLayout(owned, dup, 8)).toEqual({ ok: false, code: "duplicate" });
  });
  it("rejects an un-owned id", () => {
    expect(validLayout(owned, [{ id: "statue", x: 0.1, y: 0.1 }], 8))
      .toEqual({ ok: false, code: "not_owned" });
  });
});

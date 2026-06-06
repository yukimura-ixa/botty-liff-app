import { describe, it, expect } from "vitest";
import { validDisplaySelection } from "./display";

const owned = ["rock", "flower_patch", "bush", "pond", "log_bench"];

describe("validDisplaySelection", () => {
  it("accepts a subset within the slot limit", () => {
    expect(validDisplaySelection(owned, ["rock", "pond"], 4)).toEqual({
      ok: true,
      list: ["rock", "pond"],
    });
  });

  it("accepts exactly the limit", () => {
    const list = ["rock", "flower_patch", "bush", "pond"];
    expect(validDisplaySelection(owned, list, 4)).toEqual({ ok: true, list });
  });

  it("rejects more than the limit", () => {
    const list = ["rock", "flower_patch", "bush", "pond", "log_bench"];
    expect(validDisplaySelection(owned, list, 4)).toEqual({ ok: false, code: "too_many" });
  });

  it("rejects an id the student does not own", () => {
    expect(validDisplaySelection(owned, ["rock", "statue"], 4)).toEqual({
      ok: false,
      code: "not_owned",
    });
  });

  it("rejects duplicate ids", () => {
    expect(validDisplaySelection(owned, ["rock", "rock"], 4)).toEqual({
      ok: false,
      code: "duplicate",
    });
  });

  it("accepts an empty list (clears the plot)", () => {
    expect(validDisplaySelection(owned, [], 4)).toEqual({ ok: true, list: [] });
  });

  it("rejects a non-string entry", () => {
    expect(validDisplaySelection(owned, ["rock", 7 as unknown as string], 4)).toEqual({
      ok: false,
      code: "bad_input",
    });
  });
});

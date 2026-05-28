import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logScanEvent } from "./log";

describe("logScanEvent", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let prevVitest: string | undefined;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prevVitest = process.env.VITEST;
    delete process.env.VITEST;
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    if (prevVitest === undefined) delete process.env.VITEST;
    else process.env.VITEST = prevVitest;
  });

  it("emits a single-line JSON with tag and outcome", () => {
    logScanEvent("ip_rate", { scanId: "S1" });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0]![0] as string;
    expect(typeof line).toBe("string");
    expect(line).not.toContain("\n");
    const parsed = JSON.parse(line);
    expect(parsed.tag).toBe("scan");
    expect(parsed.outcome).toBe("ip_rate");
    expect(parsed.scanId).toBe("S1");
  });

  it("includes uid and reason when provided", () => {
    logScanEvent("not_eligible", { uid: "U1", reason: "role=student status=banned" });
    const parsed = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(parsed.uid).toBe("U1");
    expect(parsed.reason).toBe("role=student status=banned");
  });

  it("serializes err to message + stack", () => {
    const err = new Error("boom");
    logScanEvent("error_detector", { err });
    const parsed = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(parsed.errMessage).toBe("boom");
    expect(typeof parsed.errStack).toBe("string");
  });

  it("is a no-op when VITEST env is set", () => {
    process.env.VITEST = "1";
    logScanEvent("auth", { scanId: "S2" });
    expect(logSpy).not.toHaveBeenCalled();
  });
});

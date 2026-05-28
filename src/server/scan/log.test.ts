import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logScanEvent } from "./log";
import { logScanAttempt } from "./log";
import * as logRepo from "./log-repo";

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

describe("logScanAttempt", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let prevVitest: string | undefined;

  const base = {
    scanId: "S1",
    uid: "U1",
    classKey: "M5/1",
    at: new Date("2026-05-28T10:00:00Z"),
    localDate: "2026-05-28",
  };

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    writeSpy = vi.spyOn(logRepo, "writeScanAttempt").mockResolvedValue();
    prevVitest = process.env.VITEST;
    delete process.env.VITEST;
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    writeSpy.mockRestore();
    if (prevVitest === undefined) delete process.env.VITEST;
    else process.env.VITEST = prevVitest;
  });

  it("writes Firestore and emits stdout for awarded outcome", async () => {
    await logScanAttempt({
      ...base,
      outcome: "awarded",
      basePoints: 10,
      streakBonus: 2,
      totalPoints: 12,
      itemCount: 1,
      detectedClass: "PET",
      confidence: 0.93,
      clientConf: 0.4,
    });
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy.mock.calls[0]![0]).toMatchObject({
      outcome: "awarded",
      basePoints: 10, streakBonus: 2, totalPoints: 12,
    });
    const parsed = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(parsed.tag).toBe("scan");
    expect(parsed.outcome).toBe("awarded");
    expect(parsed.basePoints).toBe(10);
  });

  it("swallows Firestore errors and never throws (stderr emitted)", async () => {
    writeSpy.mockRejectedValueOnce(new Error("firestore down"));
    await expect(
      logScanAttempt({ ...base, outcome: "denied_cooldown" }),
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
  });

  it("is a full no-op when VITEST env is set", async () => {
    process.env.VITEST = "1";
    await logScanAttempt({ ...base, outcome: "replay" });
    expect(writeSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("includes dupReason for dup outcomes", async () => {
    await logScanAttempt({
      ...base,
      outcome: "denied_dup_phash",
      dupReason: "phash",
    });
    expect(writeSpy.mock.calls[0]![0].dupReason).toBe("phash");
  });
});

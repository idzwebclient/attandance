import { describe, expect, it } from "vitest";
import { formatTime, minutes, monthRange, parseQrPayload, qrPayload } from "@/lib/format";

describe("format helpers", () => {
  it("shows times in Malaysia time", () => {
    expect(formatTime("2026-10-05T01:05:00Z")).toBe("09:05");
    expect(formatTime(null)).toBe("—");
  });

  it("formats minute counts", () => {
    expect(minutes(0)).toBe("0");
    expect(minutes(45)).toBe("45m");
    expect(minutes(75)).toBe("1j 15m");
  });

  it("finds the last day of a month", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2028-02").to).toBe("2028-02-29");
  });

  it("round-trips QR payloads and rejects junk", () => {
    expect(parseQrPayload(qrPayload("https://hadir.example.com", "abc123def456"))).toBe("abc123def456");
    expect(parseQrPayload("abc123def456")).toBe("abc123def456");
    expect(parseQrPayload("https://evil.example.com/")).toBeNull();
    expect(parseQrPayload("hi there")).toBeNull();
  });
});

describe("timezone offsets", () => {
  it("finds the Malaysia offset", async () => {
    const { tzOffset } = await import("@/lib/format");
    expect(tzOffset("2026-10-05")).toBe("+08:00");
    expect(tzOffset("2026-07-01", "Europe/London")).toBe("+01:00");
  });
});

describe("date ranges", () => {
  it("builds quick ranges from a Monday-based week", async () => {
    const { quickRanges, pickRange } = await import("@/lib/format");
    const r = Object.fromEntries(quickRanges("2026-10-07").map((q) => [q.label, [q.from, q.to]]));
    expect(r["Minggu ini"]).toEqual(["2026-10-05", "2026-10-07"]);
    expect(r["Semalam"]).toEqual(["2026-10-06", "2026-10-06"]);
    expect(r["Bulan lepas"]).toEqual(["2026-09-01", "2026-09-30"]);
    expect(quickRanges("2026-10-04").find((q) => q.label === "Minggu ini")?.from).toBe("2026-09-28");
    expect(pickRange("2026-10-10", "2026-10-01", "2026-10-15")).toEqual({ from: "2026-10-01", to: "2026-10-10" });
    expect(pickRange(undefined, undefined, "2026-10-15")).toEqual({ from: "2026-10-01", to: "2026-10-15" });
  });
});

describe("reporting periods", () => {
  it("runs from the start day to the day before, named by the end month", async () => {
    const { periodRange, periodOf } = await import("@/lib/format");
    expect(periodRange("2026-10", 25)).toEqual({ from: "2026-09-25", to: "2026-10-24" });
    expect(periodRange("2026-01", 25)).toEqual({ from: "2025-12-25", to: "2026-01-24" });
    expect(periodRange("2026-02", 1)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodOf("2026-10-05", 25)).toBe("2026-10");
    expect(periodOf("2026-10-24", 25)).toBe("2026-10");
    expect(periodOf("2026-10-25", 25)).toBe("2026-11");
    expect(periodOf("2026-12-30", 25)).toBe("2027-01");
    expect(periodOf("2026-10-25", 1)).toBe("2026-10");
  });
});

describe("quick ranges with a 25th cycle", () => {
  it("uses 25th-24th for this and last month", async () => {
    const { quickRanges, pickRange } = await import("@/lib/format");
    const r = Object.fromEntries(quickRanges("2026-10-05", 25).map((q) => [q.label, [q.from, q.to]]));
    expect(r["Bulan ini"]).toEqual(["2026-09-25", "2026-10-05"]);
    expect(r["Bulan lepas"]).toEqual(["2026-08-25", "2026-09-24"]);
    expect(pickRange(undefined, undefined, "2026-10-26", 25)).toEqual({ from: "2026-10-25", to: "2026-10-26" });
  });
});

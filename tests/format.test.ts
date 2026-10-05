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

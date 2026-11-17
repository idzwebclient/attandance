import { describe, expect, it } from "vitest";
import { describeDevice, punchIssueInfo } from "@/lib/punch-issue-info";

describe("punch issue info", () => {
  it("names phones and browsers from the user agent", () => {
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"))
      .toBe("iPhone · Safari");
    expect(describeDevice("Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36"))
      .toBe("SM-A546E · Chrome");
    expect(describeDevice("Mozilla/5.0 (Linux; Android 13; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36"))
      .toBe("K · Samsung Internet");
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0"))
      .toBe("iPhone · Browser dalam app");
    expect(describeDevice(null)).toBeNull();
  });

  it("falls back to the raw code for unknown problems", () => {
    expect(punchIssueInfo("CAMERA_DENIED").label).toBe("Kebenaran kamera ditolak");
    expect(punchIssueInfo("SOMETHING_NEW")).toMatchObject({ label: "SOMETHING_NEW", tone: "neutral" });
  });
});

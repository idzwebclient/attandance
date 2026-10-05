import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("quotes cells, escapes quotes and blocks formulas", () => {
    const csv = toCsv(["a", "b"], [["x,\"y\"", "=SUM(A1)"], [-5, null]]);
    expect(csv).toBe('﻿"a","b"\r\n"x,""y""","\'=SUM(A1)"\r\n"-5",""');
  });
});

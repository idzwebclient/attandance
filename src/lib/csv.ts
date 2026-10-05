export function toCsv(header: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    // Quote, and neutralise spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  // BOM so Excel opens UTF-8 correctly.
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

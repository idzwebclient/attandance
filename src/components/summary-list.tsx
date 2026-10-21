"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { minutes } from "@/lib/format";
import type { MonthlySummaryRow } from "@/lib/types";
import { Empty, inputClass } from "./ui";

// "3 (45m)" style cell; quiet when zero.
function Count({ n, mins, bad = true }: { n: number; mins?: number; bad?: boolean }) {
  if (!n) return <span className="text-muted">—</span>;
  return (
    <span className={bad ? "font-semibold text-bad" : "font-semibold"}>
      {n}
      {mins != null && mins > 0 && <span className="ml-1 text-xs font-normal text-muted">({minutes(mins)})</span>}
    </span>
  );
}

type Col = { label: string; n: (r: MonthlySummaryRow) => number; mins?: (r: MonthlySummaryRow) => number; bad?: boolean };

const COLS: Col[] = [
  { label: "Hadir", n: (r) => r.recorded_days },
  { label: "Tidak hadir", n: (r) => r.absent_days, bad: true },
  { label: "Cuti", n: (r) => r.leave_days },
  { label: "Lewat", n: (r) => r.late_arrivals, mins: (r) => r.total_late_minutes, bad: true },
  { label: "Rehat lebih", n: (r) => r.excess_breaks, mins: (r) => r.total_excess_break_minutes, bad: true },
  { label: "Balik awal", n: (r) => r.early_departures, mins: (r) => r.total_early_departure_minutes, bad: true },
  { label: "Tak lengkap", n: (r) => r.incomplete_days, bad: true },
  { label: "Kerja luar", n: (r) => r.field_work_days },
  { label: "Kerja tambahan", n: (r) => r.extra_sessions, mins: (r) => r.total_extra_minutes },
];

const issues = (r: MonthlySummaryRow) =>
  r.absent_days + r.late_arrivals + r.excess_breaks + r.early_departures + r.incomplete_days;

const SORTS = {
  issues: { label: "Paling banyak masalah", cmp: (a: MonthlySummaryRow, b: MonthlySummaryRow) => issues(b) - issues(a) },
  absent: { label: "Paling banyak tidak hadir", cmp: (a: MonthlySummaryRow, b: MonthlySummaryRow) => b.absent_days - a.absent_days },
  late: { label: "Paling lama lewat", cmp: (a: MonthlySummaryRow, b: MonthlySummaryRow) => b.total_late_minutes - a.total_late_minutes },
  name: { label: "Nama (A–Z)", cmp: () => 0 },
} as const;

// Per-employee summary: a table on desktop, compact cards on phones.
export function SummaryList({
  rows: all,
  showBranch,
  hrefBase,
}: {
  rows: MonthlySummaryRow[];
  showBranch?: boolean;
  /** Employee link prefix, e.g. "/admin/employees/". */
  hrefBase?: string;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<keyof typeof SORTS>("issues");
  const [onlyIssues, setOnlyIssues] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((r) => !needle || `${r.full_name} ${r.employee_code} ${r.branch_name ?? ""}`.toLowerCase().includes(needle))
      .filter((r) => !onlyIssues || issues(r) > 0)
      // Rows arrive sorted by name, so a stable sort keeps names in order within ties.
      .sort(SORTS[sort].cmp);
  }, [all, q, sort, onlyIssues]);

  if (!all.length) return <Empty>Tiada pekerja untuk dipaparkan.</Empty>;
  const name = (r: MonthlySummaryRow) =>
    hrefBase ? <Link href={`${hrefBase}${r.employee_id}`} className="font-medium text-brand hover:underline">{r.full_name}</Link>
      : <span className="font-medium">{r.full_name}</span>;
  const sub = (r: MonthlySummaryRow) => [r.employee_code, showBranch && r.branch_name].filter(Boolean).join(" · ");

  return (
    <>
      <div className="no-print grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama, no. pekerja atau cawangan…" className={inputClass} />
        <select value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)} className={`${inputClass} sm:!w-auto`}>
          {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>Susun: {s.label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
          Ada masalah sahaja
        </label>
      </div>
      <p className="text-xs text-muted">{rows.length} daripada {all.length} pekerja</p>
      {!rows.length && <Empty>Tiada padanan.</Empty>}

      {/* Phones: one compact card per employee showing only what happened. */}
      <ul className="space-y-2 sm:hidden">
        {rows.map((r) => {
          const shown = COLS.filter((c) => c.n(r) > 0);
          return (
            <li key={r.employee_id} className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {name(r)}
                  <div className="text-xs text-muted">{sub(r)}</div>
                </div>
                {issues(r) === 0 && <span className="shrink-0 rounded-full bg-good-bg px-2 py-0.5 text-xs font-medium text-good">Baik</span>}
              </div>
              {shown.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {shown.map((c) => (
                    <span key={c.label}
                      className={`rounded-full px-2 py-0.5 text-xs ${c.bad ? "bg-bad-bg text-bad" : "bg-neutral-bg"}`}>
                      {c.label} <b>{c.n(r)}</b>{c.mins && c.mins(r) > 0 ? ` · ${minutes(c.mins(r))}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Desktop: scrollable table with the name column pinned. */}
      <div className="hidden max-h-[70vh] overflow-auto rounded-2xl border border-border bg-surface shadow-sm sm:block">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-neutral-bg text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="sticky left-0 bg-neutral-bg px-4 py-3 font-medium">Pekerja</th>
              {COLS.map((c) => <th key={c.label} className="whitespace-nowrap px-3 py-3 text-center font-medium">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee_id} className="border-t border-border">
                <td className="sticky left-0 min-w-48 bg-surface px-4 py-2.5">
                  {name(r)}
                  <div className="text-xs text-muted">{sub(r)}</div>
                </td>
                {COLS.map((c) => (
                  <td key={c.label} className="whitespace-nowrap px-3 py-2.5 text-center tabular-nums">
                    <Count n={c.n(r)} mins={c.mins?.(r)} bad={c.bad} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Nombor dalam kurungan ialah jumlah minit. Tidak hadir dikira untuk hari bekerja sehingga semalam.</p>
    </>
  );
}

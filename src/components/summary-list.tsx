"use client";

import Link from "next/link";
import { useState } from "react";
import { minutes } from "@/lib/format";
import type { MonthlySummaryRow } from "@/lib/types";
import { Empty, inputClass } from "./ui";

// "3 kali · 45m" style cell; quiet when zero.
function Count({ n, mins, bad = true }: { n: number; mins?: number; bad?: boolean }) {
  if (!n) return <span className="text-muted">—</span>;
  return (
    <span className={bad ? "font-semibold text-bad" : "font-semibold"}>
      {n}
      {mins != null && mins > 0 && <span className="ml-1 text-xs font-normal text-muted">({minutes(mins)})</span>}
    </span>
  );
}

const COLS = [
  { label: "Hadir", get: (r: MonthlySummaryRow) => <Count n={r.recorded_days} bad={false} /> },
  { label: "Tidak hadir", get: (r: MonthlySummaryRow) => <Count n={r.absent_days} /> },
  { label: "Lewat", get: (r: MonthlySummaryRow) => <Count n={r.late_arrivals} mins={r.total_late_minutes} /> },
  { label: "Rehat lebih", get: (r: MonthlySummaryRow) => <Count n={r.excess_breaks} mins={r.total_excess_break_minutes} /> },
  { label: "Balik awal", get: (r: MonthlySummaryRow) => <Count n={r.early_departures} mins={r.total_early_departure_minutes} /> },
  { label: "Tak lengkap", get: (r: MonthlySummaryRow) => <Count n={r.incomplete_days} /> },
  { label: "Kerja luar", get: (r: MonthlySummaryRow) => <Count n={r.field_work_days} bad={false} /> },
  { label: "Kerja tambahan", get: (r: MonthlySummaryRow) => <Count n={r.extra_sessions} mins={r.total_extra_minutes} bad={false} /> },
];

// Per-employee summary: a short table on desktop, cards on phones.
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
  if (!all.length) return <Empty>Tiada pekerja untuk dipaparkan.</Empty>;
  const needle = q.trim().toLowerCase();
  const rows = needle
    ? all.filter((r) => `${r.full_name} ${r.employee_code} ${r.branch_name ?? ""}`.toLowerCase().includes(needle))
    : all;
  const name = (r: MonthlySummaryRow) =>
    hrefBase ? <Link href={`${hrefBase}${r.employee_id}`} className="font-medium text-brand hover:underline">{r.full_name}</Link>
      : <span className="font-medium">{r.full_name}</span>;
  const sub = (r: MonthlySummaryRow) => [r.employee_code, showBranch && r.branch_name].filter(Boolean).join(" · ");

  return (
    <>
      {all.length > 5 && (
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama atau no. pekerja…" className={`${inputClass} no-print`} />
      )}
      {!rows.length && <Empty>Tiada padanan.</Empty>}
      <ul className="space-y-2 sm:hidden">
        {rows.map((r) => (
          <li key={r.employee_id} className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
            <div className="mb-2">
              {name(r)}
              <div className="text-xs text-muted">{sub(r)}</div>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              {COLS.map((c) => (
                <div key={c.label} className="rounded-lg bg-neutral-bg px-2 py-1.5">
                  <dt className="text-[11px] text-muted">{c.label}</dt>
                  <dd>{c.get(r)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm sm:block">
        <table className="w-full table-fixed text-sm">
          <colgroup><col className="w-64" />{COLS.map((c) => <col key={c.label} />)}</colgroup>
          <thead className="bg-neutral-bg text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Pekerja</th>
              {COLS.map((c) => <th key={c.label} className="px-4 py-3 text-center font-medium">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee_id} className="border-t border-border">
                <td className="px-4 py-3">
                  {name(r)}
                  <div className="text-xs text-muted">{sub(r)}</div>
                </td>
                {COLS.map((c) => <td key={c.label} className="px-4 py-3 text-center tabular-nums">{c.get(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Nombor dalam kurungan ialah jumlah minit. Tidak hadir dikira untuk hari bekerja sehingga semalam.</p>
    </>
  );
}

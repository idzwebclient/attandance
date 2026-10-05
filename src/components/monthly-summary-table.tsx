import Link from "next/link";
import { minutes } from "@/lib/format";
import type { MonthlySummaryRow } from "@/lib/types";
import { Empty, Table } from "./ui";

export const SUMMARY_COLUMNS: { key: keyof MonthlySummaryRow; label: string; minutes?: boolean; bad?: boolean }[] = [
  { key: "recorded_days", label: "Hari direkod" },
  { key: "completed_days", label: "Lengkap" },
  { key: "incomplete_days", label: "Tak lengkap", bad: true },
  { key: "absent_days", label: "Tidak hadir", bad: true },
  { key: "early_arrivals", label: "Awal" },
  { key: "on_time_arrivals", label: "Tepat masa" },
  { key: "late_arrivals", label: "Lewat", bad: true },
  { key: "total_late_minutes", label: "Jumlah lewat", minutes: true, bad: true },
  { key: "excess_breaks", label: "Rehat lebih", bad: true },
  { key: "total_excess_break_minutes", label: "Jumlah lebih rehat", minutes: true, bad: true },
  { key: "early_departures", label: "Balik awal", bad: true },
  { key: "total_early_departure_minutes", label: "Jumlah balik awal", minutes: true, bad: true },
];

export function MonthlySummaryTable({
  rows,
  showBranch,
  employeeHref,
}: {
  rows: MonthlySummaryRow[];
  showBranch?: boolean;
  employeeHref?: (row: MonthlySummaryRow) => string;
}) {
  if (!rows.length) return <Empty>Tiada pekerja untuk dipaparkan.</Empty>;
  return (
    <Table>
      <thead>
        <tr>
          <th>Pekerja</th>
          {showBranch && <th>Cawangan</th>}
          {SUMMARY_COLUMNS.map((c) => <th key={c.key} className="!text-right">{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.employee_id}>
            <td className="whitespace-nowrap">
              {employeeHref ? (
                <Link href={employeeHref(r)} className="font-medium hover:underline">{r.full_name}</Link>
              ) : (
                <span className="font-medium">{r.full_name}</span>
              )}
              <div className="text-xs text-muted">{r.employee_code}</div>
            </td>
            {showBranch && <td className="whitespace-nowrap">{r.branch_name ?? "—"}</td>}
            {SUMMARY_COLUMNS.map((c) => {
              const v = r[c.key] as number;
              return (
                <td key={c.key} className={`text-right tabular-nums ${c.bad && v > 0 ? "font-medium text-bad" : ""}`}>
                  {c.minutes ? minutes(v) : v}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

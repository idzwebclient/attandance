import Link from "next/link";
import {
  ARRIVAL_LABEL,
  ARRIVAL_TONE,
  BREAK_LABEL,
  BREAK_TONE,
  COMPLETION_LABEL,
  COMPLETION_TONE,
  DEPARTURE_LABEL,
  DEPARTURE_TONE,
  formatDate,
  formatTime,
  minutes,
} from "@/lib/format";
import type { BoardRow } from "@/lib/types";
import { Badge, Empty, Table } from "./ui";

// Daily attendance rows. `show` picks the identifying columns for the context.
export function AttendanceTable({
  rows,
  tz,
  today,
  show = {},
  employeeHref,
  dayHref,
}: {
  rows: BoardRow[];
  tz: string;
  today?: string;
  show?: { date?: boolean; employee?: boolean; branch?: boolean };
  employeeHref?: (row: BoardRow) => string;
  dayHref?: (row: BoardRow) => string;
}) {
  if (!rows.length) return <Empty>Tiada rekod kehadiran.</Empty>;
  return (
    <>
    <AttendanceCards rows={rows} tz={tz} today={today} show={show} employeeHref={employeeHref} dayHref={dayHref} />
    <div className="hidden sm:block">
    <Table>
      <thead>
        <tr>
          {show.date && <th>Tarikh</th>}
          {show.employee && <th>Pekerja</th>}
          {show.branch && <th>Cawangan</th>}
          <th>Status</th>
          <th>Masuk</th>
          <th>Ketibaan</th>
          <th>Mula rehat</th>
          <th>Tamat rehat</th>
          <th>Tempoh rehat</th>
          <th>Lebih rehat</th>
          <th>Keluar</th>
          <th>Kepulangan</th>
          {dayHref && <th />}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            {show.date && <td className="whitespace-nowrap">{formatDate(r.attendance_date, { weekday: "short", day: "numeric", month: "short" })}</td>}
            {show.employee && (
              <td className="whitespace-nowrap">
                {employeeHref ? (
                  <Link href={employeeHref(r)} className="font-medium hover:underline">{r.full_name}</Link>
                ) : (
                  <span className="font-medium">{r.full_name}</span>
                )}
                <div className="text-xs text-muted">{r.employee_code}</div>
              </td>
            )}
            {show.branch && <td className="whitespace-nowrap">{r.branch_name}</td>}
            <td>
              {r.missing ? (
                today && r.attendance_date < today ? <Badge tone="bad">Tidak hadir</Badge> : <Badge>Belum masuk</Badge>
              ) : (
                <Badge tone={COMPLETION_TONE[r.effective_status]}>{COMPLETION_LABEL[r.effective_status]}</Badge>
              )}
            </td>
            <td className="tabular-nums">{formatTime(r.work_in_at, tz)}</td>
            <td>
              {r.arrival_status && (
                <Badge tone={ARRIVAL_TONE[r.arrival_status]}>
                  {ARRIVAL_LABEL[r.arrival_status]}
                  {r.late_minutes > 0 && ` +${minutes(r.late_minutes)}`}
                  {r.early_arrival_minutes > 0 && ` −${minutes(r.early_arrival_minutes)}`}
                </Badge>
              )}
            </td>
            <td className="tabular-nums">{formatTime(r.break_out_at, tz)}</td>
            <td className="tabular-nums">{formatTime(r.break_in_at, tz)}</td>
            <td>
              {r.break_status ? (
                <Badge tone={BREAK_TONE[r.break_status]}>
                  {r.break_duration_minutes != null ? minutes(r.break_duration_minutes) : BREAK_LABEL[r.break_status]}
                </Badge>
              ) : "—"}
            </td>
            <td className={r.excess_break_minutes > 0 ? "font-medium text-bad" : "text-muted"}>
              {r.excess_break_minutes > 0 ? minutes(r.excess_break_minutes) : "—"}
            </td>
            <td className="tabular-nums">{formatTime(r.work_out_at, tz)}</td>
            <td>
              {r.departure_status && (
                <Badge tone={DEPARTURE_TONE[r.departure_status]}>
                  {DEPARTURE_LABEL[r.departure_status]}
                  {r.early_departure_minutes > 0 && ` −${minutes(r.early_departure_minutes)}`}
                </Badge>
              )}
            </td>
            {dayHref && (
              <td>
                <Link href={dayHref(r)} className="whitespace-nowrap text-brand hover:underline">
                  {r.missing ? "Tambah" : "Butiran"}
                </Link>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </Table>
    </div>
    </>
  );
}

function StatusBadge({ r, today }: { r: BoardRow; today?: string }) {
  if (r.missing) {
    return today && r.attendance_date < today ? <Badge tone="bad">Tidak hadir</Badge> : <Badge>Belum masuk</Badge>;
  }
  return <Badge tone={COMPLETION_TONE[r.effective_status]}>{COMPLETION_LABEL[r.effective_status]}</Badge>;
}

// Phone layout: one compact card per row instead of a wide table.
function AttendanceCards({
  rows,
  tz,
  today,
  show,
  employeeHref,
  dayHref,
}: {
  rows: BoardRow[];
  tz: string;
  today?: string;
  show: { date?: boolean; employee?: boolean; branch?: boolean };
  employeeHref?: (row: BoardRow) => string;
  dayHref?: (row: BoardRow) => string;
}) {
  return (
    <ul className="space-y-2 sm:hidden">
      {rows.map((r) => {
        const title = [
          show.date && formatDate(r.attendance_date, { weekday: "short", day: "numeric", month: "short" }),
          show.employee && r.full_name,
        ].filter(Boolean).join(" · ");
        return (
          <li key={r.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                {show.employee && employeeHref ? (
                  <Link href={employeeHref(r)} className="font-medium hover:underline">{title}</Link>
                ) : (
                  <span className="font-medium">{title || "Hari ini"}</span>
                )}
                {(show.employee || show.branch) && (
                  <div className="text-xs text-muted">
                    {[show.employee && r.employee_code, show.branch && r.branch_name].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <StatusBadge r={r} today={today} />
            </div>
            {!r.missing && (
              <>
                <div className="grid grid-cols-4 gap-1 text-center tabular-nums">
                  {([["Masuk", r.work_in_at], ["Rehat", r.break_out_at], ["Balik rehat", r.break_in_at], ["Keluar", r.work_out_at]] as const).map(([label, at]) => (
                    <div key={label}>
                      <div className="text-[11px] text-muted">{label}</div>
                      <div className="font-medium">{formatTime(at, tz)}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.arrival_status && (
                    <Badge tone={ARRIVAL_TONE[r.arrival_status]}>
                      {ARRIVAL_LABEL[r.arrival_status]}
                      {r.late_minutes > 0 && ` +${minutes(r.late_minutes)}`}
                    </Badge>
                  )}
                  {r.break_status && (
                    <Badge tone={BREAK_TONE[r.break_status]}>
                      Rehat {r.break_duration_minutes != null ? minutes(r.break_duration_minutes) : BREAK_LABEL[r.break_status]}
                      {r.excess_break_minutes > 0 && ` (lebih ${minutes(r.excess_break_minutes)})`}
                    </Badge>
                  )}
                  {r.departure_status && r.work_out_at && (
                    <Badge tone={DEPARTURE_TONE[r.departure_status]}>
                      {DEPARTURE_LABEL[r.departure_status]}
                      {r.early_departure_minutes > 0 && ` −${minutes(r.early_departure_minutes)}`}
                    </Badge>
                  )}
                </div>
              </>
            )}
            {dayHref && (
              <Link href={dayHref(r)} className="mt-2 inline-block text-brand hover:underline">
                {r.missing ? "Tambah rekod" : "Butiran"}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

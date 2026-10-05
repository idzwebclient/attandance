import {
  COMPLETION_LABEL,
  COMPLETION_TONE,
  formatDate,
  formatTime,
  minutes,
  type Tone,
} from "@/lib/format";
import type { BoardRow } from "@/lib/types";
import { AttendanceList, type ListRow } from "./attendance-list";
import { Empty } from "./ui";

// Attendance rows for any screen. Formats everything on the server and hands
// plain data to the client list, which adds search and status filters.
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

  const list: ListRow[] = rows.map((r) => {
    const absent = !!r.missing && !!today && r.attendance_date < today;
    const status: { label: string; tone: Tone; group: ListRow["group"] } = r.missing
      ? absent
        ? { label: "Tidak hadir", tone: "bad", group: "absent" }
        : { label: "Belum masuk", tone: "neutral", group: "notIn" }
      : {
          label: COMPLETION_LABEL[r.effective_status],
          tone: COMPLETION_TONE[r.effective_status],
          group:
            r.effective_status === "ON_BREAK" ? "break"
            : r.effective_status === "COMPLETED" ? "done"
            : r.effective_status === "INCOMPLETE" ? "issue"
            : "working",
        };
    const notes: { label: string; tone: Tone }[] = [];
    if (r.late_minutes > 0) notes.push({ label: `Lewat ${minutes(r.late_minutes)}`, tone: "bad" });
    if (r.excess_break_minutes > 0) notes.push({ label: `Rehat lebih ${minutes(r.excess_break_minutes)}`, tone: "bad" });
    if (r.work_out_at && r.early_departure_minutes > 0) notes.push({ label: `Balik awal ${minutes(r.early_departure_minutes)}`, tone: "bad" });
    if (r.early_arrival_minutes > 0) notes.push({ label: `Awal ${minutes(r.early_arrival_minutes)}`, tone: "good" });
    if (r.break_status === "NO_BREAK") notes.push({ label: "Tiada rehat", tone: "neutral" });

    return {
      key: r.id,
      date: show.date ? formatDate(r.attendance_date, { weekday: "short", day: "numeric", month: "short" }) : null,
      name: show.employee ? r.full_name : null,
      sub: [show.employee && r.employee_code, show.branch && r.branch_name].filter(Boolean).join(" · ") || null,
      employeeHref: show.employee && employeeHref ? employeeHref(r) : null,
      dayHref: dayHref ? dayHref(r) : null,
      dayLabel: r.missing ? "Tambah" : "Butiran",
      status,
      group: notes.some((n) => n.tone === "bad") && status.group !== "absent" ? "issue" : status.group,
      missing: !!r.missing,
      workIn: formatTime(r.work_in_at, tz),
      breakOut: formatTime(r.break_out_at, tz),
      breakIn: formatTime(r.break_in_at, tz),
      breakLength: r.break_duration_minutes != null ? minutes(r.break_duration_minutes) : null,
      breakOver: r.excess_break_minutes > 0,
      workOut: formatTime(r.work_out_at, tz),
      late: r.late_minutes > 0,
      earlyOut: !!r.work_out_at && r.early_departure_minutes > 0,
      notes,
    };
  });

  return <AttendanceList rows={list} searchable={!!show.employee && rows.length > 5} />;
}

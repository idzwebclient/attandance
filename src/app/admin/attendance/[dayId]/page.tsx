import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AttendanceTable } from "@/components/attendance-table";
import { Badge, Card, Empty, Notice, PageTitle, Table } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { EVENT_LABEL, formatDate, formatTime, timeInputValue } from "@/lib/format";
import type { AttendanceDayReport, EventType } from "@/lib/types";
import { CorrectionForm } from "../correction-form";

export const metadata: Metadata = { title: "Butiran kehadiran" };

type Event = {
  id: string;
  event_type: EventType;
  recorded_at: string;
  latitude: number;
  longitude: number;
  location_accuracy_meters: number | null;
  distance_from_branch_meters: number;
  qr_identifier_reference: string | null;
  verification_mode: string;
  is_remote_break: boolean;
};

type Correction = { id: string; reason: string; created_at: string; before_values: Record<string, string | null>; after_values: Record<string, string | null>; corrected_by: string };

export default async function DayDetail({ params, searchParams }: PageProps<"/admin/attendance/[dayId]">) {
  const { supabase } = await requireRole("admin");
  const { dayId } = await params;
  const { saved } = await searchParams;
  const settings = await getSettings(supabase);
  const tz = settings.timezone;
  const { data: day } = await supabase.from("attendance_day_report").select("*").eq("id", dayId).maybeSingle<AttendanceDayReport>();
  if (!day) notFound();
  const [{ data: events }, { data: corrections }] = await Promise.all([
    supabase.from("attendance_events").select("*").eq("attendance_day_id", dayId).order("recorded_at"),
    supabase.from("attendance_corrections").select("*").eq("attendance_day_id", dayId).order("created_at", { ascending: false }),
  ]);
  const { data: correctors } = await supabase.from("profiles").select("id, full_name")
    .in("id", (corrections ?? []).map((c) => c.corrected_by));
  const correctorName = new Map((correctors ?? []).map((p) => [p.id, p.full_name]));

  return (
    <div className="space-y-5">
      <PageTitle title={day.full_name} subtitle={`${day.employee_code} · ${day.branch_name} · ${formatDate(day.attendance_date, { dateStyle: "full" })}`} />
      {saved && <Notice tone="good">Pembetulan disimpan.</Notice>}
      <AttendanceTable rows={[day]} tz={tz} />

      <section>
        <h2 className="mb-2 font-medium">Rekod asal (audit)</h2>
        {events?.length ? (
          <Table>
            <thead>
              <tr><th>Event</th><th>Masa server</th><th>Kaedah</th><th>Jarak</th><th>Ketepatan GPS</th><th>Koordinat</th><th>Rujukan QR</th></tr>
            </thead>
            <tbody>
              {(events as Event[]).map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{EVENT_LABEL[e.event_type]}</td>
                  <td className="tabular-nums">{formatTime(e.recorded_at, tz)}</td>
                  <td>{e.is_remote_break ? <Badge tone="info">Rehat luar (lokasi)</Badge> : <Badge>QR + lokasi</Badge>}</td>
                  <td className="tabular-nums">{Math.round(e.distance_from_branch_meters)} m</td>
                  <td className="tabular-nums">{e.location_accuracy_meters != null ? `±${Math.round(e.location_accuracy_meters)} m` : "—"}</td>
                  <td className="font-mono text-xs">{e.latitude.toFixed(5)}, {e.longitude.toFixed(5)}</td>
                  <td className="font-mono text-xs">{e.qr_identifier_reference ? `${e.qr_identifier_reference.slice(0, 8)}…` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty>Tiada rekod punch. Hari ini dicipta melalui pembetulan admin.</Empty>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-medium">Betulkan masa</h2>
        <Card>
          <CorrectionForm
            employees={[]}
            employeeId={day.employee_id}
            date={day.attendance_date}
            lockEmployee
            values={{
              work_in: timeInputValue(day.work_in_at, tz),
              break_out: timeInputValue(day.break_out_at, tz),
              break_in: timeInputValue(day.break_in_at, tz),
              work_out: timeInputValue(day.work_out_at, tz),
            }}
          />
        </Card>
      </section>

      {!!corrections?.length && (
        <section>
          <h2 className="mb-2 font-medium">Sejarah pembetulan</h2>
          <Table>
            <thead><tr><th>Bila</th><th>Oleh</th><th>Sebab</th><th>Sebelum → Selepas</th></tr></thead>
            <tbody>
              {(corrections as Correction[]).map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap">{formatDate(c.created_at.slice(0, 10))} {formatTime(c.created_at, tz)}</td>
                  <td>{correctorName.get(c.corrected_by) ?? "—"}</td>
                  <td>{c.reason}</td>
                  <td className="text-xs">
                    {(["work_in_at", "break_out_at", "break_in_at", "work_out_at"] as const).map((k) => (
                      <div key={k} className="tabular-nums">
                        {formatTime(c.before_values[k], tz)} → {formatTime(c.after_values[k], tz)}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      )}
    </div>
  );
}

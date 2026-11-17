import type { Metadata } from "next";
import Link from "next/link";
import { DateInput, FilterBar, FilterField, SelectInput } from "@/components/filters";
import { Badge, Card, Empty, PageTitle, Table } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getBranchNames, getSettings } from "@/lib/data";
import { addDays, EVENT_LABEL, formatDate, formatRange, formatTime, isDate, todayIn, tzOffset } from "@/lib/format";
import { describeDevice, punchIssueInfo } from "@/lib/punch-issue-info";
import type { EventType } from "@/lib/types";

export const metadata: Metadata = { title: "Masalah punch" };

type Issue = {
  id: string;
  employee_id: string;
  branch_id: string | null;
  occurred_at: string;
  source: "server" | "device";
  code: string;
  message: string | null;
  event_type: string | null;
  distance_meters: number | null;
  allowed_radius_meters: number | null;
  accuracy_meters: number | null;
  detail: string | null;
  user_agent: string | null;
  profiles: { full_name: string; employee_code: string } | null;
};

const LIMIT = 300;

export default async function AdminPunchIssues({ searchParams }: PageProps<"/admin/punch-issues">) {
  const { supabase } = await requireRole("admin");
  const sp = await searchParams;
  const settings = await getSettings(supabase);
  const tz = settings.timezone;
  const today = todayIn(tz);
  let from = typeof sp.from === "string" && isDate(sp.from) ? sp.from : addDays(today, -6);
  let to = typeof sp.to === "string" && isDate(sp.to) ? sp.to : today;
  if (from > to) [from, to] = [to, from];
  const branchId = typeof sp.branch === "string" && sp.branch ? sp.branch : undefined;
  const employeeId = typeof sp.employee === "string" && sp.employee ? sp.employee : undefined;

  let q = supabase
    .from("punch_issues")
    .select("*, profiles(full_name, employee_code)")
    .gte("occurred_at", `${from}T00:00:00${tzOffset(from, tz)}`)
    .lt("occurred_at", `${addDays(to, 1)}T00:00:00${tzOffset(addDays(to, 1), tz)}`)
    .order("occurred_at", { ascending: false })
    .limit(LIMIT);
  if (branchId) q = q.eq("branch_id", branchId);
  if (employeeId) q = q.eq("employee_id", employeeId);

  const [{ data, error }, branchNames, { data: people }] = await Promise.all([
    q,
    getBranchNames(supabase),
    supabase.from("profiles").select("id, full_name, employee_code").in("role", ["staff", "manager"]).order("full_name"),
  ]);
  if (error) throw new Error(error.message);
  const issues = (data ?? []) as Issue[];

  // Who is stuck the most, and with what, so the admin can follow up first.
  const byPerson = new Map<string, { name: string; count: number; codes: Map<string, number>; last: string }>();
  for (const i of issues) {
    const p = byPerson.get(i.employee_id) ?? {
      name: i.profiles?.full_name ?? "—",
      count: 0,
      codes: new Map<string, number>(),
      last: i.occurred_at,
    };
    p.count++;
    p.codes.set(i.code, (p.codes.get(i.code) ?? 0) + 1);
    byPerson.set(i.employee_id, p);
  }
  const ranked = [...byPerson.entries()].sort((a, b) => b[1].count - a[1].count);

  return (
    <div>
      <PageTitle
        title="Masalah punch"
        subtitle={`${formatRange(from, to)} · punch yang gagal, termasuk masalah kamera, GPS dan QR di telefon staff`}
      />
      <FilterBar>
        <FilterField label="Dari"><DateInput name="from" value={from} /></FilterField>
        <FilterField label="Hingga"><DateInput name="to" value={to} /></FilterField>
        <FilterField label="Cawangan">
          <SelectInput name="branch" value={branchId ?? ""} allLabel="Semua cawangan"
            options={[...branchNames].map(([value, label]) => ({ value, label }))} />
        </FilterField>
        <FilterField label="Pekerja">
          <SelectInput name="employee" value={employeeId ?? ""} allLabel="Semua pekerja"
            options={(people ?? []).map((e) => ({ value: e.id, label: `${e.full_name} (${e.employee_code})` }))} />
        </FilterField>
      </FilterBar>

      {issues.length === 0 ? (
        <Card><Empty>Tiada masalah punch dalam tempoh ini.</Empty></Card>
      ) : (
        <div className="space-y-4">
          {!employeeId && ranked.length > 1 && (
            <Card className="space-y-2">
              <h2 className="font-semibold">Ikut pekerja</h2>
              <ul className="divide-y divide-border">
                {ranked.map(([id, p]) => (
                  <li key={id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <Link
                      href={`/admin/punch-issues?from=${from}&to=${to}&employee=${id}${branchId ? `&branch=${branchId}` : ""}`}
                      className="min-w-32 font-medium text-brand hover:underline"
                    >
                      {p.name}
                    </Link>
                    <span className="text-muted">{p.count}×</span>
                    {[...p.codes].sort((a, b) => b[1] - a[1]).map(([code, n]) => (
                      <Badge key={code} tone={punchIssueInfo(code).tone}>
                        {punchIssueInfo(code).label}{n > 1 && ` ×${n}`}
                      </Badge>
                    ))}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Table>
            <thead>
              <tr>
                <th>Masa</th><th>Pekerja</th><th>Masalah</th><th>Butiran</th><th>Telefon</th><th>Cara selesai</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((i) => {
                const info = punchIssueInfo(i.code);
                const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(i.occurred_at));
                return (
                  <tr key={i.id} className="align-top">
                    <td className="whitespace-nowrap">
                      <div className="font-medium tabular-nums">{formatTime(i.occurred_at, tz)}</div>
                      <div className="text-xs text-muted">{formatDate(date, { day: "numeric", month: "short" })}</div>
                    </td>
                    <td className="whitespace-nowrap">
                      <Link href={`/admin/employees/${i.employee_id}`} className="font-medium hover:underline">
                        {i.profiles?.full_name ?? "—"}
                      </Link>
                      <div className="text-xs text-muted">{i.branch_id ? branchNames.get(i.branch_id) : "Tiada cawangan"}</div>
                    </td>
                    <td>
                      <Badge tone={info.tone}>{info.label}</Badge>
                      <div className="mt-1 text-xs text-muted">
                        {i.event_type && (EVENT_LABEL[i.event_type as EventType] ?? i.event_type)}
                        {i.event_type && " · "}
                        {i.source === "device" ? "di telefon" : "ditolak server"}
                      </div>
                    </td>
                    <td className="text-xs">
                      {i.distance_meters != null && (
                        <div>
                          Jarak {Math.round(i.distance_meters)} m
                          {i.allowed_radius_meters != null && ` (had ${i.allowed_radius_meters} m)`}
                        </div>
                      )}
                      {i.accuracy_meters != null && (
                        <div>
                          Ketepatan GPS ±{Math.round(i.accuracy_meters)} m
                          {i.code === "LOCATION_INACCURATE" && ` (had ${settings.max_location_accuracy_meters} m)`}
                        </div>
                      )}
                      {i.detail && <div className="max-w-56 break-words text-muted">{i.detail}</div>}
                    </td>
                    <td className="whitespace-nowrap text-xs" title={i.user_agent ?? undefined}>
                      {describeDevice(i.user_agent) ?? "—"}
                    </td>
                    <td className="min-w-56 text-xs text-muted">{info.fix}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {issues.length === LIMIT && (
            <p className="text-xs text-muted">Menunjukkan {LIMIT} rekod terkini. Pendekkan tempoh untuk lihat yang lain.</p>
          )}
        </div>
      )}
    </div>
  );
}

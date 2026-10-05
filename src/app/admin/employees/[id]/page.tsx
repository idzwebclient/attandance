import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AttendanceTable } from "@/components/attendance-table";
import { MonthSwitcher } from "@/components/month-switcher";
import { ActionForm } from "@/components/form-state";
import { MonthlySummaryTable } from "@/components/monthly-summary-table";
import { Badge, Button, Card, Field, PageTitle, inputClass } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getBranchNames, getMonthlySummary, getMonthReports, getSettings, pickMonth, currentMonth } from "@/lib/data";
import { formatPeriod } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";
import { resetPassword, setEmployeeActive, updateEmployee } from "../../actions";
import { EmployeeFields } from "../employee-fields";

export const metadata: Metadata = { title: "Urus pekerja" };

export default async function EmployeeDetail({ params, searchParams }: PageProps<"/admin/employees/[id]">) {
  const { supabase, profile: me } = await requireRole("admin");
  const { id } = await params;
  const { data: p } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle<Profile>();
  if (!p) notFound();
  const settings = await getSettings(supabase);
  const month = pickMonth((await searchParams).month, settings);
  const [branchNames, { data: user }, rows, summary] = await Promise.all([
    getBranchNames(supabase),
    createAdminClient().auth.admin.getUserById(p.auth_user_id),
    getMonthReports(supabase, month, settings, { employeeId: p.id }),
    getMonthlySummary(supabase, month, settings, { employeeId: p.id }),
  ]);
  const branches = [...branchNames].map(([bid, name]) => ({ id: bid, name }));

  return (
    <div className="space-y-5">
      <PageTitle
        title={p.full_name}
        subtitle={<>{user?.user?.email ?? "—"} · {p.is_active ? <Badge tone="good">Aktif</Badge> : <Badge tone="bad">Tidak aktif</Badge>}</>}
        actions={
          p.id !== me.id && (
            <form action={setEmployeeActive}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="active" value={String(!p.is_active)} />
              <Button variant={p.is_active ? "danger" : "primary"} type="submit">
                {p.is_active ? "Nyahaktifkan" : "Aktifkan semula"}
              </Button>
            </form>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <h2 className="mb-3 font-medium">Maklumat</h2>
          <ActionForm action={updateEmployee} submitLabel="Simpan">
            <input type="hidden" name="id" value={p.id} />
            <EmployeeFields branches={branches} profile={p} />
            <Field label="Emel log masuk" hint="Tukar jika pekerja guna emel baharu. Berkuat kuasa serta-merta.">
              <input name="email" type="email" defaultValue={user?.user?.email ?? ""} required className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
        <Card>
          <h2 className="mb-3 font-medium">Tetapkan kata laluan sementara</h2>
          <ActionForm action={resetPassword} submitLabel="Tetapkan">
            <input type="hidden" name="id" value={p.id} />
            <Field label="Kata laluan baharu">
              <input name="password" type="text" minLength={8} required className={inputClass} autoComplete="off" />
            </Field>
          </ActionForm>
        </Card>
      </div>

      {p.role !== "admin" && (
        <section className="space-y-3">
          <h2 className="font-medium">Kehadiran · {formatPeriod(month, settings.cycle_start_day)}</h2>
          <MonthSwitcher month={month} startDay={settings.cycle_start_day} current={currentMonth(settings)} href={(m) => `/admin/employees/${p.id}?month=${m}`} />
          <MonthlySummaryTable rows={summary} />
          <AttendanceTable rows={rows} tz={settings.timezone} show={{ date: true }} dayHref={(r) => `/admin/attendance/${r.id}`} />
        </section>
      )}
    </div>
  );
}

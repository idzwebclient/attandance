import type { Metadata } from "next";
import { ActionForm } from "@/components/form-state";
import { LeaveApprovals, leaveDates } from "@/components/leave-approvals";
import { Badge, Button, Card, Empty, Field, PageTitle, inputClass } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { LEAVE_STATUS_LABEL, LEAVE_STATUS_TONE, LEAVE_TYPE_LABEL, todayIn } from "@/lib/format";
import { applyLeave, cancelLeave } from "@/lib/leave-actions";
import type { LeaveRequest, LeaveType } from "@/lib/types";

export const metadata: Metadata = { title: "Cuti" };

export default async function LeavePage() {
  const { supabase, profile } = await requireRole("staff", "manager");
  const settings = await getSettings(supabase);
  const today = todayIn(settings.timezone);
  const { data } = await supabase.from("leave_requests").select("*")
    .eq("employee_id", profile.id).order("start_date", { ascending: false }).limit(50);
  const mine = (data ?? []) as LeaveRequest[];

  return (
    <div className="max-w-3xl space-y-5">
      <PageTitle
        title="Cuti"
        subtitle={profile.role === "manager" ? "Permohonan anda diluluskan oleh admin." : "Permohonan diluluskan oleh manager cawangan atau admin."}
      />
      <Card>
        <h2 className="mb-3 font-medium">Mohon cuti</h2>
        <ActionForm action={applyLeave} submitLabel="Hantar permohonan">
          <Field label="Jenis cuti">
            <select name="leave_type" defaultValue="ANNUAL" className={inputClass}>
              {(Object.keys(LEAVE_TYPE_LABEL) as LeaveType[]).map((t) => (
                <option key={t} value={t}>{LEAVE_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dari"><input type="date" name="from" defaultValue={today} required className={inputClass} /></Field>
            <Field label="Hingga"><input type="date" name="to" defaultValue={today} className={inputClass} /></Field>
          </div>
          <Field label="Sebab (pilihan)">
            <input name="reason" placeholder="Contoh: urusan keluarga" className={inputClass} />
          </Field>
        </ActionForm>
      </Card>

      <section className="space-y-2">
        <h2 className="font-medium">Permohonan saya</h2>
        {mine.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            {mine.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium">{LEAVE_TYPE_LABEL[r.leave_type]}</div>
                  <div className="text-sm">{leaveDates(r)}</div>
                  {r.reason && <div className="text-xs text-muted">“{r.reason}”</div>}
                  {r.decision_note && <div className="text-xs text-muted">Catatan: {r.decision_note}</div>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={LEAVE_STATUS_TONE[r.status]}>{LEAVE_STATUS_LABEL[r.status]}</Badge>
                  {r.status === "PENDING" && (
                    <form action={cancelLeave}>
                      <input type="hidden" name="id" value={r.id} />
                      <Button variant="secondary" type="submit" className="!min-h-8 !px-2 !py-0.5 text-xs">Batal</Button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Belum ada permohonan cuti.</Empty>
        )}
      </section>

      {profile.role === "manager" && (
        <section className="space-y-2 border-t border-border pt-5">
          <h2 className="text-lg font-semibold">Permohonan pasukan</h2>
          <LeaveApprovals supabase={supabase} today={today} excludeEmployeeId={profile.id} staffOnly />
        </section>
      )}
    </div>
  );
}

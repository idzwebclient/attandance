import type { Metadata } from "next";
import { ActionForm } from "@/components/form-state";
import { LeaveApprovals } from "@/components/leave-approvals";
import { Card, PageTitle, inputClass } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getLeavePolicies, getSettings } from "@/lib/data";
import { LEAVE_TYPE_LABEL, todayIn } from "@/lib/format";
import { updateLeavePolicies } from "@/lib/leave-actions";
import type { LeaveType } from "@/lib/types";

export const metadata: Metadata = { title: "Cuti" };

export default async function AdminLeave() {
  const { supabase } = await requireRole("admin");
  const [settings, policies] = await Promise.all([getSettings(supabase), getLeavePolicies(supabase)]);
  return (
    <div className="max-w-3xl space-y-5">
      <PageTitle title="Cuti" subtitle="Luluskan atau tolak permohonan cuti staf dan manager." />
      <Card>
        <h2 className="mb-1 font-medium">Polisi cuti</h2>
        <p className="mb-3 text-sm text-muted">
          Had hari setahun untuk setiap pekerja. Kosongkan untuk tiada had. Hanya hari bekerja dikira (cuti umum tidak dikira).
        </p>
        <ActionForm action={updateLeavePolicies} submitLabel="Simpan polisi cuti">
          <div className="divide-y divide-border rounded-xl border border-border">
            {(Object.keys(LEAVE_TYPE_LABEL) as LeaveType[]).map((t) => {
              const p = policies.get(t);
              return (
                <div key={t} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" name={`active_${t}`} defaultChecked={p?.is_active ?? true} />
                    {LEAVE_TYPE_LABEL[t]}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <input type="number" name={`days_${t}`} min={0} max={366} defaultValue={p?.annual_days ?? ""}
                      placeholder="Tiada had" className={`${inputClass} !min-h-9 w-28 !py-1`} />
                    hari / tahun
                  </label>
                </div>
              );
            })}
          </div>
        </ActionForm>
      </Card>
      <LeaveApprovals supabase={supabase} today={todayIn(settings.timezone)} />
    </div>
  );
}

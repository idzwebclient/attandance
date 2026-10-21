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
  const [settings, policies, { data: tierData }] = await Promise.all([
    getSettings(supabase),
    getLeavePolicies(supabase),
    supabase.from("annual_leave_tiers").select("min_years, days").order("min_years"),
  ]);
  const tiers = (tierData ?? []) as { min_years: number; days: number }[];
  return (
    <div className="max-w-3xl space-y-5">
      <PageTitle title="Cuti" subtitle="Luluskan atau tolak permohonan cuti staf dan manager." />
      <Card>
        <h2 className="mb-1 font-medium">Polisi cuti</h2>
        <p className="mb-3 text-sm text-muted">
          Tandakan jenis cuti yang dibuka kepada pekerja. Had dikira setahun, hari bekerja sahaja (hujung minggu dan cuti umum tidak dikira).
        </p>
        <ActionForm action={updateLeavePolicies} submitLabel="Simpan polisi cuti">
          <div className="divide-y divide-border rounded-xl border border-border">
            {(Object.keys(LEAVE_TYPE_LABEL) as LeaveType[]).map((t) => {
              const p = policies.get(t);
              return (
                <div key={t} className="space-y-2 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" name={`active_${t}`} defaultChecked={p?.is_active ?? true} />
                      {LEAVE_TYPE_LABEL[t]}
                    </label>
                    {t === "ANNUAL" ? (
                      <>
                        <input type="hidden" name={`days_${t}`} value={p?.annual_days ?? ""} />
                        <span className="text-xs text-muted">Ikut tempoh perkhidmatan</span>
                      </>
                    ) : (
                      <label className="flex items-center gap-2 text-sm text-muted">
                        <input type="number" name={`days_${t}`} min={0} max={366} defaultValue={p?.annual_days ?? ""}
                          placeholder="Tiada had" className={`${inputClass} !min-h-9 !w-24 !py-1`} />
                        hari
                      </label>
                    )}
                  </div>
                  {t === "ANNUAL" && (
                    <div className="overflow-hidden rounded-lg border border-border text-sm">
                      <div className="grid grid-cols-2 bg-neutral-bg px-3 py-1.5 text-xs font-medium text-muted">
                        <span>Tempoh perkhidmatan</span><span>Jumlah cuti</span>
                      </div>
                      {[...tiers, undefined].map((tier, i) => {
                        const next = tiers[i + 1]?.min_years;
                        return (
                          <div key={i} className="grid grid-cols-2 items-center gap-2 border-t border-border px-3 py-1.5">
                            <label className="flex flex-wrap items-center gap-1.5">
                              <input type="number" name={`years_${i}`} min={0} defaultValue={tier?.min_years ?? ""}
                                placeholder={tier ? "" : "Tambah"} className={`${inputClass} !min-h-8 !w-20 !py-0.5`} />
                              <span className="text-xs text-muted">
                                {tier ? (next != null ? `hingga ${next} tahun` : "tahun ke atas") : "tahun ke atas"}
                              </span>
                            </label>
                            <label className="flex items-center gap-1.5">
                              <input type="number" name={`tierdays_${i}`} min={0} max={366} defaultValue={tier?.days ?? ""}
                                className={`${inputClass} !min-h-8 !w-20 !py-0.5`} />
                              <span className="text-xs text-muted">hari</span>
                            </label>
                          </div>
                        );
                      })}
                      <p className="border-t border-border px-3 py-1.5 text-xs text-muted">
                        Dikira dari tarikh tamat percubaan (atau tarikh mula kerja) di halaman pekerja. Tahun pertama diprorata ikut bulan perkhidmatan. Kosongkan baris untuk buang. Tiada cuti tahunan semasa percubaan.
                      </p>
                    </div>
                  )}
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

import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/form-state";
import { LeaveApprovals } from "@/components/leave-approvals";
import { LeaveBalanceTable } from "@/components/leave-balance-table";
import { Card, PageTitle, inputClass } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getBranchNames, getLeavePolicies, getSettings } from "@/lib/data";
import { LEAVE_TYPE_LABEL, MONTH_NAMES, todayIn } from "@/lib/format";
import { updateLeavePolicies } from "@/lib/leave-actions";
import type { LeaveType } from "@/lib/types";

export const metadata: Metadata = { title: "Cuti" };

export default async function AdminLeave({ searchParams }: PageProps<"/admin/leave">) {
  const { supabase } = await requireRole("admin");
  const { branch: rawBranch } = await searchParams;
  const [settings, policies, { data: tierData }, branchNames, { data: pending }] = await Promise.all([
    getSettings(supabase),
    getLeavePolicies(supabase),
    supabase.from("annual_leave_tiers").select("min_years, days").order("min_years"),
    getBranchNames(supabase),
    supabase.from("leave_requests").select("branch_id").eq("status", "PENDING"),
  ]);
  const branch = typeof rawBranch === "string" && branchNames.has(rawBranch) ? rawBranch : undefined;
  const pendingIn = (id: string) => (pending ?? []).filter((p) => p.branch_id === id).length;
  const tiers = (tierData ?? []) as { min_years: number; days: number }[];
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageTitle title="Cuti" subtitle="Luluskan atau tolak permohonan cuti staf dan manager." />
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {[{ id: "", name: "Semua cawangan", n: (pending ?? []).length }, ...[...branchNames].map(([id, name]) => ({ id, name, n: pendingIn(id) }))]
          .map((b) => {
            const active = (branch ?? "") === b.id;
            return (
              <Link key={b.id || "all"} href={b.id ? `/admin/leave?branch=${b.id}` : "/admin/leave"}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                  active ? "border-brand bg-brand text-brand-fg" : "border-border bg-surface hover:bg-neutral-bg"}`}>
                {b.name}
                {b.n > 0 && <span className="ml-1.5 rounded-full bg-warn-bg px-1.5 text-xs text-warn">{b.n}</span>}
              </Link>
            );
          })}
      </div>
      <div className="flex flex-wrap gap-2">
        {([["requests", "Permohonan cuti"], ["balances", "Baki cuti"]] as const).map(([type, label]) => (
          <a key={type} href={`/api/leave?${new URLSearchParams({ type, ...(branch ? { branch } : {}) })}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-neutral-bg">
            ⬇ {label} (CSV)
          </a>
        ))}
      </div>
      <LeaveApprovals supabase={supabase} today={todayIn(settings.timezone)} branchId={branch} />
      <section className="space-y-2">
        <h2 className="font-medium">Baki cuti pekerja {todayIn(settings.timezone).slice(0, 4)}</h2>
        <p className="text-xs text-muted">Hari tinggal / jumlah setahun. Termasuk permohonan yang masih menunggu.</p>
        <LeaveBalanceTable supabase={supabase} today={todayIn(settings.timezone)} branchId={branch} hrefBase="/admin/employees/" />
      </section>
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
                      <div className="flex flex-wrap items-center gap-1.5 border-t border-border bg-neutral-bg px-3 py-2">
                        <span>Bawa ke tahun depan maksimum</span>
                        <input type="number" name="carry_forward_max_days" min={0} max={366} defaultValue={settings.carry_forward_max_days}
                          className={`${inputClass} !min-h-8 !w-16 !py-0.5`} />
                        <span>hari, mesti guna sebelum</span>
                        <select name="carry_forward_day" defaultValue={settings.carry_forward_day} className={`${inputClass} !min-h-8 !w-20 !py-0.5`}>
                          {Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                        </select>
                        <select name="carry_forward_month" defaultValue={settings.carry_forward_month} className={`${inputClass} !min-h-8 !w-24 !py-0.5`}>
                          {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                        </select>
                        <span className="w-full text-xs text-muted">0 hari = tiada bawaan. Baki bawaan yang tak diguna sebelum tarikh ini hangus.</span>
                      </div>
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
    </div>
  );
}

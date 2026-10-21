import type { SupabaseClient } from "@supabase/supabase-js";
import { getLeaveBalances } from "@/lib/data";
import { addDays, formatDate, LEAVE_STATUS_LABEL, LEAVE_STATUS_TONE, LEAVE_TYPE_LABEL } from "@/lib/format";
import { decideLeave } from "@/lib/leave-actions";
import type { LeaveRequest } from "@/lib/types";
import { Badge, Button, Empty, inputClass } from "./ui";

export function leaveDates(r: Pick<LeaveRequest, "start_date" | "end_date">) {
  const f = (d: string) => formatDate(d, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const days = Math.round((Date.parse(r.end_date) - Date.parse(r.start_date)) / 86_400_000) + 1;
  return r.start_date === r.end_date ? f(r.start_date) : `${f(r.start_date)} – ${f(r.end_date)} (${days} hari)`;
}

// Pending leave to approve, plus recent decisions. Managers see their branch's
// staff only (RLS + excludeEmployeeId for their own requests); admins see everyone.
export async function LeaveApprovals({
  supabase,
  today,
  excludeEmployeeId,
  staffOnly,
}: {
  supabase: SupabaseClient;
  today: string;
  excludeEmployeeId?: string;
  staffOnly?: boolean;
}) {
  const [{ data }, balances] = await Promise.all([supabase.from("leave_requests")
    .select("*, employee:profiles!leave_requests_employee_id_fkey(full_name, employee_code, role), branch:branches(name)")
    .or(`status.eq.PENDING,end_date.gte.${addDays(today, -30)}`)
    .order("start_date")
    .limit(300), getLeaveBalances(supabase, Number(today.slice(0, 4)))]);
  type Row = LeaveRequest & {
    employee: { full_name: string; employee_code: string; role: string } | null;
    branch: { name: string } | null;
  };
  const rows = ((data ?? []) as Row[]).filter(
    (r) => r.employee_id !== excludeEmployeeId && (!staffOnly || r.employee?.role === "staff") && r.status !== "CANCELLED",
  );
  const pending = rows.filter((r) => r.status === "PENDING");
  const decided = rows.filter((r) => r.status !== "PENDING").sort((a, b) => b.start_date.localeCompare(a.start_date));

  const info = (r: Row) => (
    <div className="min-w-0">
      <div className="font-medium">
        {r.employee?.full_name} <span className="text-xs font-normal text-muted">{r.employee?.employee_code}{r.branch && ` · ${r.branch.name}`}</span>
      </div>
      <div className="text-sm">{LEAVE_TYPE_LABEL[r.leave_type]} · {leaveDates(r)}</div>
      {r.reason && <div className="text-xs text-muted">“{r.reason}”</div>}
      {r.status === "PENDING" && (() => {
        const b = balances.get(`${r.employee_id}:${r.leave_type}`);
        if (!b || b.limit_days == null) return null;
        return (
          <div className="text-xs text-muted">
            Sudah guna {b.used_days + b.carried_used} / {b.limit_days + b.carried_days} hari tahun ini
            {b.carried_days > 0 && ` (termasuk ${b.carried_days} hari bawaan)`}, termasuk permohonan ini
          </div>
        );
      })()}
    </div>
  );

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="font-medium">Menunggu kelulusan ({pending.length})</h2>
        {pending.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            {pending.map((r) => (
              <li key={r.id} className="space-y-2 px-4 py-3">
                {info(r)}
                <form action={decideLeave} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input name="note" placeholder="Catatan (pilihan)" className={`${inputClass} !min-h-9 flex-1 !py-1`} />
                  <Button type="submit" name="approve" value="true" className="!min-h-9 !px-3 !py-1 text-xs">Lulus</Button>
                  <Button type="submit" name="approve" value="false" variant="danger" className="!min-h-9 !px-3 !py-1 text-xs">Tolak</Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Tiada permohonan cuti menunggu.</Empty>
        )}
      </section>

      {decided.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium text-muted">Keputusan terkini</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {decided.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
                {info(r)}
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={LEAVE_STATUS_TONE[r.status]}>{LEAVE_STATUS_LABEL[r.status]}</Badge>
                  {r.status === "APPROVED" && r.end_date >= today && (
                    <form action={decideLeave}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="approve" value="false" />
                      <button type="submit" className="text-xs text-muted underline">Batalkan kelulusan</button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

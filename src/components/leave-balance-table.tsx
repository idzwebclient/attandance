import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLeaveBalances, getLeavePolicies } from "@/lib/data";
import { formatDate, LEAVE_TYPE_LABEL } from "@/lib/format";
import type { LeaveBalance, LeaveType } from "@/lib/types";
import { Empty, Table } from "./ui";

// What a balance cell shows: days left for limited types, days used otherwise.
function cell(b: LeaveBalance | undefined, today: string, probationEnd: string | null) {
  if (!b) return <span className="text-muted">—</span>;
  if (b.leave_type === "ANNUAL" && probationEnd && probationEnd >= today) {
    return <span className="text-xs text-muted">Percubaan hingga {formatDate(probationEnd, { day: "numeric", month: "short" })}</span>;
  }
  if (b.limit_days == null) {
    if (b.leave_type === "ANNUAL") return <span className="text-xs text-muted">Belum ditetapkan</span>;
    return b.used_days ? <span>Guna {b.used_days}</span> : <span className="text-muted">—</span>;
  }
  const carryLeft = today < b.carry_expires ? b.carried_days - b.carried_used : 0;
  const total = b.limit_days + carryLeft;
  const left = Math.max(total - b.used_days, 0);
  return (
    <span className="whitespace-nowrap">
      <b className={left === 0 ? "text-bad" : ""}>{left}</b>
      <span className="text-muted"> / {total}</span>
      {carryLeft > 0 && <span className="block text-xs text-muted">+{carryLeft} bawaan</span>}
    </span>
  );
}

// Leave left per employee for the current year. RLS limits managers to their branch.
export async function LeaveBalanceTable({
  supabase,
  today,
  employeeId,
  hrefBase,
}: {
  supabase: SupabaseClient;
  today: string;
  employeeId?: string;
  /** Employee link prefix, e.g. "/admin/employees/". */
  hrefBase?: string;
}) {
  const year = Number(today.slice(0, 4));
  let q = supabase.from("profiles").select("id, full_name, employee_code, probation_end_date")
    .in("role", ["staff", "manager"]).eq("is_active", true).order("full_name");
  if (employeeId) q = q.eq("id", employeeId);
  const [{ data: people }, balances, policies] = await Promise.all([
    q,
    getLeaveBalances(supabase, year, employeeId),
    getLeavePolicies(supabase),
  ]);
  const types = (Object.keys(LEAVE_TYPE_LABEL) as LeaveType[]).filter((t) => policies.get(t)?.is_active ?? true);
  const rows = (people ?? []) as { id: string; full_name: string; employee_code: string; probation_end_date: string | null }[];
  if (!rows.length) return <Empty>Tiada pekerja.</Empty>;

  return (
    <Table>
      <thead>
        <tr>
          {!employeeId && <th>Pekerja</th>}
          {types.map((t) => <th key={t}>{LEAVE_TYPE_LABEL[t]}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id}>
            {!employeeId && (
              <td>
                {hrefBase ? <Link href={`${hrefBase}${p.id}`} className="font-medium hover:underline">{p.full_name}</Link>
                  : <span className="font-medium">{p.full_name}</span>}
                <div className="text-xs text-muted">{p.employee_code}</div>
              </td>
            )}
            {types.map((t) => <td key={t}>{cell(balances.get(`${p.id}:${t}`), today, p.probation_end_date)}</td>)}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

import { AttendanceTable } from "@/components/attendance-table";
import { BoardStats } from "@/components/board-stats";
import { buildDayBoard, countBoard, getActiveEmployees, getBranchNames, getDayReports, getSettings } from "@/lib/data";
import { todayIn } from "@/lib/format";
import type { SupabaseClient } from "@supabase/supabase-js";

// Branch attendance for one date, including employees who have not punched.
export async function BranchBoard({ supabase, branchId, date }: { supabase: SupabaseClient; branchId: string; date?: string }) {
  const settings = await getSettings(supabase);
  const today = todayIn(settings.timezone);
  const day = date ?? today;
  const [employees, reports, branchNames] = await Promise.all([
    getActiveEmployees(supabase, branchId),
    getDayReports(supabase, { from: day, to: day, branchId }),
    getBranchNames(supabase),
  ]);
  const rows = buildDayBoard(employees, reports, day, branchNames);
  return (
    <>
      <BoardStats counts={countBoard(rows)} past={day < today} />
      <AttendanceTable rows={rows} tz={settings.timezone} today={today} show={{ employee: true }}
        employeeHref={(r) => `/manager/employees/${r.employee_id}`} />
    </>
  );
}

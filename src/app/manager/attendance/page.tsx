import type { Metadata } from "next";
import { DateInput, FilterBar, FilterField } from "@/components/filters";
import { PageTitle } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { formatDate, isDate, todayIn } from "@/lib/format";
import { BranchBoard } from "../board";

export const metadata: Metadata = { title: "Kehadiran" };

export default async function ManagerAttendance({ searchParams }: PageProps<"/manager/attendance">) {
  const { supabase, profile, branch } = await requireRole("manager");
  const { date: d } = await searchParams;
  const today = todayIn((await getSettings(supabase)).timezone);
  const date = typeof d === "string" && isDate(d) ? d : today;
  return (
    <div>
      <PageTitle title="Kehadiran" subtitle={`${branch?.name} · ${formatDate(date, { dateStyle: "full" })}`} />
      <FilterBar><FilterField label="Tarikh"><DateInput value={date} /></FilterField></FilterBar>
      <BranchBoard supabase={supabase} branchId={profile.branch_id!} date={date} />
    </div>
  );
}

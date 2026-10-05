import type { Metadata } from "next";
import { PageTitle } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { formatDate, todayIn } from "@/lib/format";
import { BranchBoard } from "./board";

export const metadata: Metadata = { title: "Dashboard" };

export default async function ManagerDashboard() {
  const { supabase, profile, branch } = await requireRole("manager");
  const today = todayIn((await getSettings(supabase)).timezone);
  return (
    <div>
      <PageTitle title={branch?.name ?? "Cawangan"} subtitle={`Hari ini · ${formatDate(today, { dateStyle: "full" })}`} />
      <BranchBoard supabase={supabase} branchId={profile.branch_id!} />
    </div>
  );
}

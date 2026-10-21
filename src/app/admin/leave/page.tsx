import type { Metadata } from "next";
import { LeaveApprovals } from "@/components/leave-approvals";
import { PageTitle } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { todayIn } from "@/lib/format";

export const metadata: Metadata = { title: "Cuti" };

export default async function AdminLeave() {
  const { supabase } = await requireRole("admin");
  const settings = await getSettings(supabase);
  return (
    <div className="max-w-3xl space-y-5">
      <PageTitle title="Cuti" subtitle="Luluskan atau tolak permohonan cuti staf dan manager." />
      <LeaveApprovals supabase={supabase} today={todayIn(settings.timezone)} />
    </div>
  );
}

import type { Metadata } from "next";
import { ReportsView } from "@/components/reports-view";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/data";

export const metadata: Metadata = { title: "Laporan" };

export default async function ManagerReports({ searchParams }: PageProps<"/manager/reports">) {
  const { supabase, profile } = await requireRole("manager");
  return (
    <ReportsView
      supabase={supabase}
      settings={await getSettings(supabase)}
      search={await searchParams}
      basePath="/manager/reports"
      fixedBranchId={profile.branch_id}
      employeeHref={(id) => `/manager/employees/${id}`}
    />
  );
}

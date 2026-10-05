import type { Metadata } from "next";
import { ReportsView } from "@/components/reports-view";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/data";

export const metadata: Metadata = { title: "Laporan" };

export default async function AdminReports({ searchParams }: PageProps<"/admin/reports">) {
  const { supabase } = await requireRole("admin");
  return (
    <ReportsView
      supabase={supabase}
      settings={await getSettings(supabase)}
      search={await searchParams}
      basePath="/admin/reports"
      employeeHref={(id) => `/admin/employees/${id}`}
    />
  );
}

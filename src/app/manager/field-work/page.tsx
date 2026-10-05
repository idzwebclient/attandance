import type { Metadata } from "next";
import { FieldWorkView } from "@/components/field-work-view";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/data";

export const metadata: Metadata = { title: "Kerja luar" };

export default async function ManagerFieldWork() {
  const { supabase, profile } = await requireRole("manager");
  return <FieldWorkView supabase={supabase} settings={await getSettings(supabase)} branchId={profile.branch_id} />;
}

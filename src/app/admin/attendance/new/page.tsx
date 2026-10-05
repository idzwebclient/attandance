import type { Metadata } from "next";
import { Card, PageTitle } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getActiveEmployees, getSettings } from "@/lib/data";
import { isDate, todayIn } from "@/lib/format";
import { CorrectionForm } from "../correction-form";

export const metadata: Metadata = { title: "Tambah rekod kehadiran" };

export default async function NewAttendance({ searchParams }: PageProps<"/admin/attendance/new">) {
  const { supabase } = await requireRole("admin");
  const sp = await searchParams;
  const settings = await getSettings(supabase);
  const employees = await getActiveEmployees(supabase);
  const date = typeof sp.date === "string" && isDate(sp.date) ? sp.date : todayIn(settings.timezone);
  return (
    <div className="max-w-2xl">
      <PageTitle
        title="Tambah / betulkan rekod"
        subtitle="Untuk pekerja yang terlupa punch. Jika rekod hari itu sudah wujud, masa akan digantikan."
      />
      <Card>
        <CorrectionForm
          employees={employees}
          employeeId={typeof sp.employee === "string" ? sp.employee : undefined}
          date={date}
          values={{ work_in: "", break_out: "", break_in: "", work_out: "" }}
        />
      </Card>
    </div>
  );
}

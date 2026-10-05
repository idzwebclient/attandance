import type { Metadata } from "next";
import Link from "next/link";
import { DateInput, FilterBar, FilterField } from "@/components/filters";
import { PageTitle, buttonClass } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { formatDate, isDate, todayIn } from "@/lib/format";
import { BranchBoard } from "./board";

export const metadata: Metadata = { title: "Pasukan" };

export default async function ManagerTeam({ searchParams }: PageProps<"/manager">) {
  const { supabase, profile, branch } = await requireRole("manager");
  const { date: d } = await searchParams;
  const today = todayIn((await getSettings(supabase)).timezone);
  const date = typeof d === "string" && isDate(d) ? d : today;
  return (
    <div>
      <PageTitle
        title={branch?.name ?? "Cawangan"}
        subtitle={`${date === today ? "Hari ini · " : ""}${formatDate(date, { dateStyle: "full" })}`}
        actions={
          <>
            <Link href="/manager/field-work" className={buttonClass("secondary")}>Kerja luar</Link>
            <Link href="/manager/employees" className={buttonClass("secondary")}>Senarai pekerja</Link>
          </>
        }
      />
      <FilterBar><FilterField label="Tarikh"><DateInput value={date} /></FilterField></FilterBar>
      <BranchBoard supabase={supabase} branchId={profile.branch_id!} date={date} />
    </div>
  );
}

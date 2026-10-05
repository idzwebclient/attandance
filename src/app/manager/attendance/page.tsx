import { redirect } from "next/navigation";

// Merged into the Team screen (/manager), which has a date picker.
export default async function ManagerAttendance({ searchParams }: PageProps<"/manager/attendance">) {
  const { date } = await searchParams;
  redirect(typeof date === "string" ? `/manager?date=${encodeURIComponent(date)}` : "/manager");
}

import type { Metadata } from "next";
import { EmployeeList } from "./employee-list";

export const metadata: Metadata = { title: "Pekerja" };

export default async function EmployeesPage({ searchParams }: PageProps<"/admin/employees">) {
  const { branch } = await searchParams;
  return (
    <EmployeeList roles={["manager", "staff", "admin"]} title="Semua pekerja" defaultRole="staff"
      basePath="/admin/employees" branch={typeof branch === "string" ? branch : undefined} />
  );
}

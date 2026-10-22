import type { Metadata } from "next";
import { EmployeeList } from "./employee-list";

export const metadata: Metadata = { title: "Pekerja" };

export default async function EmployeesPage({ searchParams }: PageProps<"/admin/employees">) {
  const { branch } = await searchParams;
  return (
    <EmployeeList roles={["staff", "admin"]} title="Pekerja & admin" defaultRole="staff"
      basePath="/admin/employees" branch={typeof branch === "string" ? branch : undefined} />
  );
}

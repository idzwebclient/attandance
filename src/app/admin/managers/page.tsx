import type { Metadata } from "next";
import { EmployeeList } from "../employees/employee-list";

export const metadata: Metadata = { title: "Manager" };

export default async function ManagersPage({ searchParams }: PageProps<"/admin/managers">) {
  const { branch } = await searchParams;
  return (
    <EmployeeList roles={["manager"]} title="Manager" defaultRole="manager"
      basePath="/admin/managers" branch={typeof branch === "string" ? branch : undefined} />
  );
}

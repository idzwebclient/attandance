import type { Metadata } from "next";
import { EmployeeList } from "./employee-list";

export const metadata: Metadata = { title: "Pekerja" };

export default function EmployeesPage() {
  return <EmployeeList roles={["staff", "admin"]} title="Pekerja & admin" defaultRole="staff" />;
}

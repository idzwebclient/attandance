import type { Metadata } from "next";
import { EmployeeList } from "../employees/employee-list";

export const metadata: Metadata = { title: "Manager" };

export default function ManagersPage() {
  return <EmployeeList roles={["manager"]} title="Manager" defaultRole="manager" />;
}

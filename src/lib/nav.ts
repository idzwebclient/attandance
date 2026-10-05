import type { NavItem } from "@/components/nav-links";
import type { Role } from "./types";

export const STAFF_NAV: NavItem[] = [
  { href: "/attendance", label: "Kehadiran" },
  { href: "/history", label: "Sejarah" },
  { href: "/account", label: "Akaun" },
];

export const MANAGER_NAV: NavItem[] = [
  { href: "/manager", label: "Dashboard", exact: true },
  { href: "/manager/attendance", label: "Kehadiran" },
  { href: "/manager/employees", label: "Pekerja" },
  { href: "/manager/reports", label: "Laporan" },
  { href: "/attendance", label: "Punch Saya" },
  { href: "/account", label: "Akaun" },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/attendance", label: "Kehadiran" },
  { href: "/admin/employees", label: "Pekerja" },
  { href: "/admin/managers", label: "Manager" },
  { href: "/admin/branches", label: "Cawangan" },
  { href: "/admin/reports", label: "Laporan" },
  { href: "/admin/settings", label: "Tetapan" },
  { href: "/account", label: "Akaun" },
];

export function navFor(role: Role) {
  return role === "admin" ? ADMIN_NAV : role === "manager" ? MANAGER_NAV : STAFF_NAV;
}

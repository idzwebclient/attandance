import type { NavItem } from "@/components/nav-links";
import type { Role } from "./types";

export const STAFF_NAV: NavItem[] = [
  { href: "/attendance", label: "Punch", icon: "home" },
  { href: "/history", label: "Sejarah", icon: "history" },
  { href: "/account", label: "Akaun", icon: "user" },
];

export const MANAGER_NAV: NavItem[] = [
  { href: "/manager", label: "Hari ini", exact: true, icon: "grid" },
  { href: "/manager/attendance", label: "Kehadiran", icon: "list" },
  { href: "/manager/employees", label: "Pekerja", icon: "users" },
  { href: "/manager/reports", label: "Laporan", icon: "chart" },
  { href: "/attendance", label: "Punch saya", icon: "home" },
  { href: "/account", label: "Akaun", icon: "user" },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Hari ini", exact: true, icon: "grid" },
  { href: "/admin/attendance", label: "Kehadiran", icon: "list" },
  { href: "/admin/employees", label: "Pekerja", icon: "users" },
  { href: "/admin/managers", label: "Manager", icon: "badge" },
  { href: "/admin/branches", label: "Cawangan", icon: "building" },
  { href: "/admin/reports", label: "Laporan", icon: "chart" },
  { href: "/admin/settings", label: "Tetapan", icon: "settings" },
  { href: "/account", label: "Akaun", icon: "user" },
];

export function navFor(role: Role) {
  return role === "admin" ? ADMIN_NAV : role === "manager" ? MANAGER_NAV : STAFF_NAV;
}

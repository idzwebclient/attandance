import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { ADMIN_NAV } from "@/lib/nav";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { profile } = await requireRole("admin");
  return <AppShell profile={profile} nav={ADMIN_NAV}>{children}</AppShell>;
}

import { AppShell } from "@/components/app-shell";
import { Notice } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { MANAGER_NAV } from "@/lib/nav";

export default async function ManagerLayout({ children }: LayoutProps<"/manager">) {
  const { profile } = await requireRole("manager");
  return (
    <AppShell profile={profile} nav={MANAGER_NAV} bottomNav>
      {profile.branch_id ? children : <Notice tone="warn">Anda belum ditetapkan ke cawangan. Hubungi admin.</Notice>}
    </AppShell>
  );
}

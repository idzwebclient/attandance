import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { navFor } from "@/lib/nav";

export default async function MemberLayout({ children }: LayoutProps<"/">) {
  const { profile } = await requireRole();
  return (
    <AppShell profile={profile} nav={navFor(profile.role)} bottomNav={profile.role === "staff"}>
      {children}
    </AppShell>
  );
}

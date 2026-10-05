import Link from "next/link";
import type { ReactNode } from "react";
import type { Profile } from "@/lib/types";
import { NavLinks, type NavItem } from "./nav-links";

const ROLE_LABEL = { staff: "Staf", manager: "Manager", admin: "Admin" } as const;

export function AppShell({
  profile,
  nav,
  children,
  bottomNav = false,
}: {
  profile: Profile;
  nav: NavItem[];
  children: ReactNode;
  bottomNav?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="no-print sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="text-lg font-semibold text-brand">Hadir</Link>
          <div className="text-right text-xs leading-tight">
            <div className="font-medium">{profile.full_name}</div>
            <div className="text-muted">{ROLE_LABEL[profile.role]} · {profile.employee_code}</div>
          </div>
        </div>
        {!bottomNav && (
          <nav className="mx-auto max-w-6xl overflow-x-auto px-2">
            <NavLinks items={nav} variant="tabs" />
          </nav>
        )}
      </header>
      <main className={`mx-auto w-full max-w-6xl flex-1 px-4 py-5 ${bottomNav ? "pb-24" : ""}`}>{children}</main>
      {bottomNav && (
        <nav className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
          <NavLinks items={nav} variant="bottom" />
        </nav>
      )}
    </div>
  );
}

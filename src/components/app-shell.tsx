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
  const initials = profile.full_name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="no-print sticky top-0 z-10 border-b border-border bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold text-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" className="h-8 w-8 rounded-lg" />
            Hadir
          </Link>
          <Link href="/account" className="flex items-center gap-2">
            <div className="text-right text-xs leading-tight">
              <div className="font-medium">{profile.full_name}</div>
              <div className="text-muted">{ROLE_LABEL[profile.role]}</div>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
              {initials}
            </span>
          </Link>
        </div>
        {!bottomNav && (
          <nav className="mx-auto max-w-6xl overflow-x-auto px-2 [scrollbar-width:none]">
            <NavLinks items={nav} variant="tabs" />
          </nav>
        )}
      </header>
      <main className={`mx-auto w-full max-w-6xl flex-1 px-4 py-5 ${bottomNav ? "pb-28" : ""}`}>{children}</main>
      {bottomNav && (
        <nav className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-border bg-white pb-[env(safe-area-inset-bottom)]">
          <NavLinks items={nav} variant="bottom" />
        </nav>
      )}
    </div>
  );
}

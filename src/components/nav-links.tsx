"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName; exact?: boolean };

export function NavLinks({ items, variant }: { items: NavItem[]; variant: "tabs" | "bottom" }) {
  const pathname = usePathname();
  const active = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  if (variant === "bottom") {
    return (
      <ul className="mx-auto flex max-w-md">
        {items.map((item) => (
          <li key={item.href} className="flex-1">
            <Link
              href={item.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-xs font-medium ${active(item) ? "text-brand" : "text-muted"}`}
            >
              <span className={`rounded-full px-4 py-1 ${active(item) ? "bg-brand-soft" : ""}`}>
                <Icon name={item.icon} className="h-6 w-6" />
              </span>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="flex gap-1 whitespace-nowrap">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium ${
              active(item) ? "border-brand text-brand" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <Icon name={item.icon} className="h-4 w-4" />
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

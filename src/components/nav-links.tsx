"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; exact?: boolean };

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
              className={`block py-3 text-center text-sm font-medium ${active(item) ? "text-brand" : "text-muted"}`}
            >
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
            className={`inline-block border-b-2 px-3 py-2 text-sm font-medium ${
              active(item) ? "border-brand text-brand" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

export function AutoSubmitForm({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <form
      method="get"
      className={className}
      onChange={(e) => {
        const form = e.currentTarget;
        const params = new URLSearchParams();
        for (const [k, v] of new FormData(form)) if (typeof v === "string" && v) params.set(k, v);
        router.push(`?${params}`);
      }}
      onSubmit={(e) => e.preventDefault()}
    >
      {children}
    </form>
  );
}

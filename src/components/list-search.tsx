"use client";

import { useState } from "react";
import { inputClass } from "./ui";

// Filters server-rendered rows marked data-search="…" inside the element with
// id={scope}, so long lists stay searchable without moving them client-side.
export function ListSearch({ scope, placeholder = "Cari nama atau no. pekerja…" }: { scope: string; placeholder?: string }) {
  const [q, setQ] = useState("");
  return (
    <input
      type="search"
      value={q}
      placeholder={placeholder}
      className={`${inputClass} no-print`}
      onChange={(e) => {
        setQ(e.target.value);
        const needle = e.target.value.trim().toLowerCase();
        document.querySelectorAll<HTMLElement>(`#${scope} [data-search]`).forEach((el) => {
          el.hidden = !!needle && !(el.dataset.search ?? "").toLowerCase().includes(needle);
        });
      }}
    />
  );
}

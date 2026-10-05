"use client";

import { useActionState, type ReactNode } from "react";
import { Button, Notice } from "./ui";

type State = { error?: string; ok?: string };

// Generic form wrapper for server actions that return { error } / { ok }.
export function ActionForm({
  action,
  submitLabel,
  children,
  className = "space-y-3",
}: {
  action: (prev: State, fd: FormData) => Promise<State>;
  submitLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      {state.error && <Notice tone="bad">{state.error}</Notice>}
      {state.ok && <Notice tone="good">{state.ok}</Notice>}
      {children}
      <Button type="submit" disabled={pending}>{pending ? "Sedang simpan…" : submitLabel}</Button>
    </form>
  );
}

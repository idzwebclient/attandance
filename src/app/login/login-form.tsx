"use client";

import { useActionState } from "react";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { signIn, type LoginState } from "./actions";

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {notice && <Notice tone="warn">{notice}</Notice>}
      {state.error && <Notice tone="bad">{state.error}</Notice>}
      <Field label="Emel">
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field label="Kata laluan">
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </Field>
      <Button type="submit" disabled={pending} className="w-full py-3">
        {pending ? "Sedang log masuk…" : "Log masuk"}
      </Button>
    </form>
  );
}

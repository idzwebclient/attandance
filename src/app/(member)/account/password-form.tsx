"use client";

import { useActionState } from "react";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { changePassword, type PasswordState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, {});
  return (
    <form action={action} className="space-y-3">
      {state.error && <Notice tone="bad">{state.error}</Notice>}
      {state.ok && <Notice tone="good">Kata laluan telah ditukar.</Notice>}
      <Field label="Kata laluan baharu">
        <input name="password" type="password" autoComplete="new-password" minLength={8} required className={inputClass} />
      </Field>
      <Field label="Sahkan kata laluan">
        <input name="confirm" type="password" autoComplete="new-password" minLength={8} required className={inputClass} />
      </Field>
      <Button type="submit" disabled={pending}>Tukar kata laluan</Button>
    </form>
  );
}

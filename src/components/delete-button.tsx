"use client";

import { useActionState, useRef, type ReactNode } from "react";
import { Button, Notice } from "./ui";

type State = { error?: string; ok?: string };

// Red "Padam" button that asks for confirmation in a dialog before calling the action.
export function DeleteButton({
  action,
  id,
  title,
  children,
}: {
  action: (prev: State, fd: FormData) => Promise<State>;
  id: string;
  title: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <>
      <Button variant="danger" type="button" onClick={() => dialog.current?.showModal()}>Padam</Button>
      <dialog ref={dialog} className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-2xl border border-border bg-surface p-5 text-foreground shadow-xl backdrop:bg-black/40">
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={id} />
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="space-y-2 text-sm text-muted">{children}</div>
          <p className="text-sm font-medium text-bad">Tindakan ini tidak boleh dibatalkan.</p>
          {state.error && <Notice tone="bad">{state.error}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => dialog.current?.close()}>Batal</Button>
            <Button variant="danger" type="submit" disabled={pending}>{pending ? "Sedang padam…" : "Ya, padam"}</Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

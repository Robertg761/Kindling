"use client";

import { useActionState } from "react";
import { closeMonthAction, type FormState } from "../../app/actions";

export function CloseMonthForm({ month, label, confirmText }: { month: string; label: string; confirmText?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(closeMonthAction, null);
  return (
    <form
      action={action}
      className="stack"
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="month" value={month} />
      <div>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Closing…" : label}
        </button>
      </div>
      {state?.error && <p className="notice notice-error">{state.error}</p>}
      {state?.message && <p className="notice">{state.message}</p>}
    </form>
  );
}

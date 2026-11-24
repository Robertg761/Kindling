"use client";

import { useActionState } from "react";
import { checkOpenCollectiveAction, type FormState } from "../../app/actions";

export function OcCheckForm({ defaultSlug }: { defaultSlug: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(checkOpenCollectiveAction, null);
  return (
    <form action={action} className="stack">
      <div className="row">
        <input name="slug" className="input" defaultValue={defaultSlug} placeholder="collective slug, e.g. eslint" aria-label="Collective to check" />
        <button className="btn btn-outline" disabled={pending}>
          {pending ? "Checking…" : "Check connection"}
        </button>
      </div>
      {state?.error && <p className="notice notice-error" style={{ whiteSpace: "pre-line" }}>{state.error}</p>}
      {state?.message && <p className="notice" style={{ whiteSpace: "pre-line" }}>{state.message}</p>}
    </form>
  );
}

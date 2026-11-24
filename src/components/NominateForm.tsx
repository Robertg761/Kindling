"use client";

import { useActionState } from "react";
import { nominateAction, type FormState } from "../../app/actions";

export function NominateForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(nominateAction, null);
  return (
    <form action={action} className="stack">
      <label htmlFor="url" className="label">
        GitHub repository
      </label>
      <div className="row">
        <input
          id="url"
          name="url"
          className="input"
          placeholder="https://github.com/owner/repo"
          required
          autoComplete="off"
          spellCheck={false}
          maxLength={300}
        />
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Checking…" : "Nominate"}
        </button>
      </div>
      {state?.error && (
        <p className="notice notice-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

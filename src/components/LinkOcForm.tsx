"use client";

import { useActionState } from "react";
import { linkOpenCollectiveAction, type FormState } from "../../app/actions";

export function LinkOcForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(linkOpenCollectiveAction, null);
  return (
    <form action={action} className="stack">
      <label htmlFor="profile" className="label">
        Your Open Collective profile
      </label>
      <div className="row">
        <input
          id="profile"
          name="profile"
          className="input"
          placeholder="https://opencollective.com/your-name"
          required
          autoComplete="off"
          spellCheck={false}
          maxLength={200}
        />
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Checking…" : "Link profile"}
        </button>
      </div>
      {state?.error && (
        <p className="notice notice-error" role="alert">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p className="notice" role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { voteAction, withdrawVoteAction, type FormState } from "../../app/actions";

export function VoteForm({ projectId, isMyVote, myReason }: { projectId: number; isMyVote: boolean; myReason?: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(voteAction, null);

  if (isMyVote) {
    return (
      <div className="vote-box">
        <span className="pill pill-ember">Your vote</span>
        {myReason && <span className="muted small">“{myReason}”</span>}
        <form action={withdrawVoteAction}>
          <button className="btn btn-ghost btn-sm">Withdraw</button>
        </form>
      </div>
    );
  }

  return (
    <form action={action} className="vote-box">
      <input type="hidden" name="projectId" value={projectId} />
      <input name="reason" className="input input-sm" placeholder="Why? (optional)" maxLength={140} aria-label="Why you're voting (optional)" />
      <button className="btn btn-primary btn-sm" disabled={pending}>
        {pending ? "Saving…" : "Vote"}
      </button>
      {state?.error && (
        <p className="notice notice-error small" role="alert">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p className="notice small" role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}

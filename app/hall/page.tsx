import type { Metadata } from "next";
import { getDb, isDatabaseConfigured } from "@/db";
import { getHallOfFame } from "@/lib/core";
import { formatUsd } from "@/lib/money";
import { formatMonth } from "@/lib/month";
import { EntryName, Matches } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Past picks" };

export default async function HallPage() {
  const picks = isDatabaseConfigured() ? await getHallOfFame(getDb()) : [];
  return (
    <>
      <div className="measure">
        <h1>Past picks</h1>
        <p className="muted" style={{ fontSize: "var(--step-1)" }}>
          Every project subscribers have picked, newest first.
        </p>
      </div>
      {picks.length === 0 ? (
        <div className="empty">
          <p>No picks yet. The first one is announced on the 1st.</p>
        </div>
      ) : (
        <ol className="hall">
          {picks.map((pick) => (
            <li key={pick.id}>
              <span className="month">{formatMonth(pick.month)}</span>
              <div>
                <EntryName project={pick.project} />
                {pick.project.description && <p>{pick.project.description}</p>}
              </div>
              <div className="tally">
                <Matches count={pick.voteCount} max={8} size={28} />
                <span className="count">
                  {pick.voteCount} vote{pick.voteCount === 1 ? "" : "s"}
                  {pick.amountCents > 0 && <>, <span className="prize">{formatUsd(pick.amountCents)}</span></>}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb, isDatabaseConfigured } from "@/db";
import type { Project } from "@/db/schema";
import { getCurrentUser, isAuthConfigured, isOperator } from "@/lib/auth";
import { getBallot, getPickByVoteMonth, getUsersByIds, listProjectsByStatus, type PickWithProject } from "@/lib/core";
import { formatMonth, monthOf, nextMonth, previousMonth } from "@/lib/month";
import { approveAction, removeAction, restoreAction } from "../actions";
import { SignInButton } from "@/components/AuthButtons";
import { CloseMonthForm } from "@/components/CloseMonthForm";
import { Avatar, EntryName, FundingButtons, SetupNotice, projectMeta } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function AdminPage() {
  if (!isDatabaseConfigured()) return <SetupNotice />;
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="signin-bar">
        <p>Operators sign in with GitHub.</p>
        {isAuthConfigured() && <SignInButton />}
      </div>
    );
  }
  if (!isOperator(user)) notFound();

  const db = getDb();
  const month = monthOf(new Date());
  const lastMonth = previousMonth(month);
  const [pending, approved, removed, ballot, currentPick, lastPick] = await Promise.all([
    listProjectsByStatus(db, "pending"),
    listProjectsByStatus(db, "approved"),
    listProjectsByStatus(db, "removed"),
    getBallot(db, month),
    getPickByVoteMonth(db, month),
    getPickByVoteMonth(db, lastMonth),
  ]);
  const nominators = new Map(
    (await getUsersByIds(db, [...new Set(pending.map((p) => p.nominatedBy).filter((id): id is number => id !== null))])).map((u) => [u.id, u.login]),
  );
  const leader = ballot[0];

  return (
    <>
      <h1>Admin</h1>

      <section className="section">
        <h2>Monthly vote</h2>
        <div className="panel stack">
          {lastPick ? (
            <PickResult voteMonth={lastMonth} pick={lastPick} />
          ) : (
            <div className="stack">
              <p style={{ margin: 0 }}>
                <strong>{formatMonth(lastMonth)}</strong> hasn&apos;t been closed. The cron job normally does this on the
                1st.
              </p>
              <CloseMonthForm month={lastMonth} label={`Close ${formatMonth(lastMonth)} now`} />
            </div>
          )}
          {currentPick ? (
            <PickResult voteMonth={month} pick={currentPick} />
          ) : (
            <div className="stack">
              <p style={{ margin: 0 }}>
                <strong>{formatMonth(month)}</strong> is open.{" "}
                {leader && leader.votes > 0
                  ? `${leader.owner}/${leader.name} leads with ${leader.votes} vote${leader.votes === 1 ? "" : "s"}.`
                  : "No votes yet."}{" "}
                It closes automatically on the 1st.
              </p>
              <CloseMonthForm
                month={month}
                label={`Close ${formatMonth(month)} early`}
                confirmText={`Close ${formatMonth(month)} now? The leader becomes the ${formatMonth(nextMonth(month))} pick and nobody can vote until the 1st.`}
              />
            </div>
          )}
        </div>
      </section>

      <AdminList title={`Waiting for approval (${pending.length})`} projects={pending} empty="Nothing waiting." nominators={nominators}>
        {(p) => (
          <>
            <form action={approveAction}>
              <input type="hidden" name="projectId" value={p.id} />
              <button className="btn btn-primary btn-sm">Approve</button>
            </form>
            <form action={removeAction}>
              <input type="hidden" name="projectId" value={p.id} />
              <button className="btn btn-danger btn-sm">Remove</button>
            </form>
          </>
        )}
      </AdminList>

      <AdminList title={`Approved (${approved.length})`} projects={approved} empty="No approved projects yet.">
        {(p) => (
          <form action={removeAction}>
            <input type="hidden" name="projectId" value={p.id} />
            <button className="btn btn-danger btn-sm">Remove</button>
          </form>
        )}
      </AdminList>

      {removed.length > 0 && (
        <AdminList title={`Removed (${removed.length})`} projects={removed} empty="">
          {(p) => (
            <form action={restoreAction}>
              <input type="hidden" name="projectId" value={p.id} />
              <button className="btn btn-outline btn-sm">Back to pending</button>
            </form>
          )}
        </AdminList>
      )}
    </>
  );
}

function PickResult({ voteMonth, pick }: { voteMonth: string; pick: PickWithProject }) {
  return (
    <p style={{ margin: 0 }}>
      <strong>{formatMonth(voteMonth)}</strong> is closed. {pick.project.owner}/{pick.project.name} won with {pick.voteCount} vote
      {pick.voteCount === 1 ? "" : "s"} and is the Kindling Pick for {formatMonth(pick.month)}.
    </p>
  );
}

function AdminList({
  title,
  projects,
  empty,
  nominators,
  children,
}: {
  title: string;
  projects: Project[];
  empty: string;
  nominators?: Map<number, string>;
  children: (p: Project) => React.ReactNode;
}) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {projects.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="admin-list">
          {projects.map((p) => (
            <li key={p.id} className="admin-item">
              <div className="row" style={{ flex: 1, minWidth: 0, alignItems: "flex-start" }}>
                <Avatar owner={p.owner} size={40} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <EntryName project={p} />
                  {p.description && <p className="small muted" style={{ margin: "2px 0" }}>{p.description}</p>}
                  <p className="small muted" style={{ margin: "2px 0" }}>{projectMeta(p)}</p>
                  {nominators && p.nominatedBy && (
                    <p className="small muted" style={{ margin: "4px 0 0" }}>Nominated by {nominators.get(p.nominatedBy) ?? "unknown"}</p>
                  )}
                  <FundingButtons links={p.fundingLinks} size="sm" quiet />
                </div>
              </div>
              <div className="actions">{children(p)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

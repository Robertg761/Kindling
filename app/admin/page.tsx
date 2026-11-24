import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb, isDatabaseConfigured } from "@/db";
import type { Project } from "@/db/schema";
import { getCurrentUser, isAuthConfigured, isOperator } from "@/lib/auth";
import {
  getBallot,
  getRound,
  getRounds,
  getUsersByIds,
  listProjectsByStatus,
  listUnpaidOperatorShares,
  listUnpaidPicks,
  outstandingCents,
  type PickWithProject,
} from "@/lib/core";
import { breakdown, formatUsd, OPERATOR_SHARE_PERCENT } from "@/lib/money";
import { currentVoterSlugs } from "@/lib/eligibility";
import { formatMonth, monthOf, nextMonth, previousMonth } from "@/lib/month";
import { collectiveSlug, collectiveUrl, getFunding, OpenCollectiveError } from "@/lib/opencollective";
import { approveAction, markOperatorSharePaidAction, markPickPaidAction, removeAction, restoreAction } from "../actions";
import { SignInButton } from "@/components/AuthButtons";
import { CloseMonthForm } from "@/components/CloseMonthForm";
import { OcCheckForm } from "@/components/OcCheckForm";
import { Avatar, EntryName, FundingButtons, SetupNotice, projectHref, projectMeta } from "@/components/ui";

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
  const slug = collectiveSlug();
  const voterSlugs = await currentVoterSlugs().catch(() => null);
  const [pending, approved, removed, ballot, current, last, unpaidPicks, unpaidShares, rounds, owed] = await Promise.all([
    listProjectsByStatus(db, "pending"),
    listProjectsByStatus(db, "approved"),
    listProjectsByStatus(db, "removed"),
    getBallot(db, month, voterSlugs),
    getRound(db, month),
    getRound(db, lastMonth),
    listUnpaidPicks(db),
    listUnpaidOperatorShares(db),
    getRounds(db),
    outstandingCents(db),
  ]);
  const nominatorIds = [...new Set(pending.map((p) => p.nominatedBy).filter((id): id is number => id !== null))];
  const nominators = new Map((await getUsersByIds(db, nominatorIds)).map((u) => [u.id, u.login]));
  const leader = ballot[0];

  let live = null;
  let liveError: string | null = null;
  if (slug) {
    try {
      live = breakdown(await getFunding(slug, month), owed);
    } catch (error) {
      liveError = error instanceof OpenCollectiveError ? error.message : String(error);
    }
  }

  return (
    <>
      <h1>Admin</h1>

      <section className="section">
        <h2>Money</h2>
        <div className="panel stack">
          {!slug ? (
            <p style={{ margin: 0 }}>
              <strong>Practice mode.</strong> Set <code>KINDLING_OC_SLUG</code> in Vercel to your collective&apos;s slug to turn on
              subscriber-only voting and prizes. Use the check below to make sure Kindling can read it first.
            </p>
          ) : live ? (
            <table className="money-table">
              <tbody>
                <tr><td>Collective balance (after card and host fees)</td><td className="num">{formatUsd(live.balanceCents)}</td></tr>
                <tr><td>Already owed (unpaid prizes and your unpaid shares)</td><td className="num">−{formatUsd(live.outstandingCents)}</td></tr>
                <tr><td>Your {OPERATOR_SHARE_PERCENT}% of {formatMonth(month)} so far</td><td className="num">−{formatUsd(live.operatorShareCents)}</td></tr>
                <tr><td><strong>Pot if {formatMonth(month)} closed now</strong></td><td className="num"><strong>{formatUsd(live.potCents)}</strong></td></tr>
                <tr><td>Winners it would fund</td><td className="num">{live.slots}</td></tr>
              </tbody>
            </table>
          ) : (
            <p className="notice notice-error">Couldn&apos;t read {slug} from Open Collective: {liveError}</p>
          )}
          {slug && (
            <p className="small muted" style={{ margin: 0 }}>
              Collective: <a href={collectiveUrl() ?? "#"} target="_blank" rel="noopener noreferrer">opencollective.com/{slug}</a>
            </p>
          )}
          <OcCheckForm defaultSlug={slug ?? "eslint"} />
        </div>
      </section>

      <section className="section">
        <h2>Monthly vote</h2>
        <div className="panel stack">
          {last ? (
            <RoundResult voteMonth={lastMonth} winners={last.winners} potCents={last.round.potCents} funded={last.round.funded} />
          ) : (
            <div className="stack">
              <p style={{ margin: 0 }}>
                <strong>{formatMonth(lastMonth)}</strong> hasn&apos;t been closed. The daily job normally does this on the 1st.
              </p>
              <CloseMonthForm month={lastMonth} label={`Close ${formatMonth(lastMonth)} now`} />
            </div>
          )}
          {current ? (
            <RoundResult voteMonth={month} winners={current.winners} potCents={current.round.potCents} funded={current.round.funded} />
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
                confirmText={`Close ${formatMonth(month)} now? Winners are decided from today's pot and nobody can vote until the 1st.`}
              />
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <h2>Payouts to make</h2>
        {unpaidPicks.length === 0 && unpaidShares.length === 0 ? (
          <p className="muted">Nothing owed right now.</p>
        ) : (
          <>
            <p className="muted measure">
              Pay these through Open Collective expenses, then mark them paid here so the pot stops setting the money aside.
            </p>
            <table className="money-table">
              <thead>
                <tr><th>For</th><th>Who</th><th className="num">Amount</th><th /></tr>
              </thead>
              <tbody>
                {unpaidPicks.map((p) => (
                  <tr key={`pick-${p.id}`}>
                    <td>{formatMonth(p.month)} prize</td>
                    <td><a href={projectHref(p.project)}>{p.project.owner}/{p.project.name}</a></td>
                    <td className="num">{formatUsd(p.amountCents)}</td>
                    <td className="num">
                      <form action={markPickPaidAction}>
                        <input type="hidden" name="pickId" value={p.id} />
                        <button className="btn btn-outline btn-sm">Mark paid</button>
                      </form>
                    </td>
                  </tr>
                ))}
                {unpaidShares.map((r) => (
                  <tr key={`share-${r.id}`}>
                    <td>{formatMonth(r.voteMonth)} operating share ({OPERATOR_SHARE_PERCENT}%)</td>
                    <td>You</td>
                    <td className="num">{formatUsd(r.operatorShareCents)}</td>
                    <td className="num">
                      <form action={markOperatorSharePaidAction}>
                        <input type="hidden" name="roundId" value={r.id} />
                        <button className="btn btn-outline btn-sm">Mark paid</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      {rounds.length > 0 && (
        <section className="section">
          <h2>Past rounds</h2>
          <table className="money-table">
            <thead>
              <tr>
                <th>Vote month</th><th className="num">Balance</th><th className="num">Owed</th><th className="num">Your share</th>
                <th className="num">Pot</th><th className="num">Winners</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((r) => (
                <tr key={r.id}>
                  <td>{formatMonth(r.voteMonth)}{!r.funded && " (practice)"}</td>
                  <td className="num">{formatUsd(r.balanceCents)}</td>
                  <td className="num">{formatUsd(r.outstandingCents)}</td>
                  <td className="num">{formatUsd(r.operatorShareCents)}</td>
                  <td className="num">{formatUsd(r.potCents)}</td>
                  <td className="num">{r.winners}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

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

function RoundResult({ voteMonth, winners, potCents, funded }: { voteMonth: string; winners: PickWithProject[]; potCents: number; funded: boolean }) {
  const names = winners.map((w) => `${w.project.owner}/${w.project.name}`).join(", ");
  return (
    <p style={{ margin: 0 }}>
      <strong>{formatMonth(voteMonth)}</strong> is closed.{" "}
      {winners.length === 0
        ? funded
          ? `No winners; ${formatUsd(potCents)} rolled over.`
          : "Nobody voted."
        : `${names} ${winners.length === 1 ? "is" : "are"} the Kindling Pick${winners.length === 1 ? "" : "s"} for ${formatMonth(nextMonth(voteMonth))}${funded ? `, ${formatUsd(winners[0].amountCents)} each` : ""}.`}
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

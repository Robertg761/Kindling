import { collectiveSlug } from "@/lib/opencollective";
import Link from "next/link";
import { getDb, isDatabaseConfigured } from "@/db";
import { getCurrentUser, isAuthConfigured } from "@/lib/auth";
import { getBallot, getFeaturedPicks, getUserVote, getVoteReasons, isVoteClosed } from "@/lib/core";
import { currentVoterSlugs, subscriptionStatus, votingEligibility } from "@/lib/eligibility";
import { formatMonth, monthOf, nextMonth, voteClosesAt } from "@/lib/month";
import { SignInButton } from "@/components/AuthButtons";
import { PickCover } from "@/components/PickCover";
import { Pot } from "@/components/Pot";
import { VoteForm } from "@/components/VoteForm";
import { EntryName, Matches, SetupNotice, projectMeta } from "@/components/ui";

export const dynamic = "force-dynamic";

const dayFormat = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

export default async function Home() {
  if (!isDatabaseConfigured()) {
    return (
      <>
        <Intro />
        <SetupNotice />
      </>
    );
  }

  const db = getDb();
  const now = new Date();
  const month = monthOf(now);
  const voterSlugs = await currentVoterSlugs().catch(() => null);
  const [picks, ballot, user, closed] = await Promise.all([
    getFeaturedPicks(db, month),
    getBallot(db, month, voterSlugs),
    getCurrentUser(),
    isVoteClosed(db, month),
  ]);
  const myVote = user ? await getUserVote(db, user.id, month) : null;
  const reasonsByPick = await Promise.all(picks.map((p) => getVoteReasons(db, p.projectId, p.voteMonth, picks.length > 1 ? 2 : 6)));
  const totalVotes = ballot.reduce((sum, p) => sum + p.votes, 0);
  const status = user ? await subscriptionStatus(user) : null;
  const eligible = user && status ? votingEligibility(user, status, now) : null;
  const next = formatMonth(nextMonth(month));
  const closesOn = dayFormat.format(voteClosesAt(month));

  return (
    <>
      {picks.length > 0 ? (
        <div className="picks-stack">
          {picks.map((pick, i) => (
            <PickCover
              key={pick.id}
              project={pick.project}
              month={pick.month}
              voteMonth={pick.voteMonth}
              voteCount={pick.voteCount}
              amountCents={pick.amountCents}
              reasons={reasonsByPick[i]}
              as={i === 0 ? "h1" : "h2"}
              compact={i > 0}
            />
          ))}
        </div>
      ) : (
        <Intro firstPick={dayFormat.format(voteClosesAt(month))} />
      )}

      <Pot month={month} subscribed={status?.kind === "active"} />

      <section className="section" id="vote" aria-labelledby="vote-title">
        <div className="ballot-head">
          <div>
            <h2 id="vote-title">{closed ? "Voting reopens on the 1st" : `Vote for ${next}`}</h2>
            <p>
              {closed
                ? `${formatMonth(month)} is closed early. Nominations are still open.`
                : `One vote per ${collectiveSlug() ? "subscriber" : "member"}, and you can change it until ${closesOn}. ${totalVotes === 0 ? "No votes yet." : `${totalVotes} vote${totalVotes === 1 ? "" : "s"} so far.`}`}
            </p>
          </div>
          <Link href="/nominate" className="btn btn-outline">
            Nominate a project
          </Link>
        </div>

        {!user && isAuthConfigured() && !closed && (
          <div className="signin-bar">
            <p>{collectiveSlug() ? "Subscribers vote. " : ""}Sign in with GitHub to vote or nominate. Kindling only reads your public profile.</p>
            <SignInButton />
          </div>
        )}
        {user && eligible !== true && !closed && (
          <div className="vote-gate">
            <p>{eligible}</p>
            <Link href="/subscribe" className="btn btn-outline">
              Subscribe and link
            </Link>
          </div>
        )}

        {ballot.length === 0 ? (
          <div className="empty">
            <p>Nothing on the ballot yet. Nominate a project you rely on and it could be {next}&apos;s pick.</p>
            <Link href="/nominate" className="btn btn-primary">
              Nominate a project
            </Link>
          </div>
        ) : (
          <ol className="ballot">
            {ballot.map((project) => {
              // A vote only shows as yours when it counts (you're a subscriber, or it's a practice round).
              const mine = eligible === true && myVote?.projectId === project.id;
              return (
                <li key={project.id} className={`entry${mine ? " mine" : ""}`}>
                  <div>
                    <EntryName project={project} />
                    {project.description && <p>{project.description}</p>}
                    <div className="meta">{projectMeta(project)}</div>
                  </div>
                  <div className="tally">
                    <Matches count={project.votes} lit={mine} />
                    <span className="count">
                      {project.votes === 0 ? "No votes" : `${project.votes} vote${project.votes === 1 ? "" : "s"}`}
                    </span>
                  </div>
                  {user && !closed && eligible === true ? (
                    <VoteForm projectId={project.id} isMyVote={mine} myReason={mine ? myVote?.reason : null} />
                  ) : (
                    <span />
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}

function Intro({ firstPick }: { firstPick?: string }) {
  return (
    <section className="intro">
      <h1>One open‑source project a month, picked by the people who use it.</h1>
      <p>
        Subscribers pay into a shared pot and vote once a month. Every $200 in the pot picks another winner, paid out in
        the open through Open Collective.
        {firstPick && ` The first pick is announced on ${firstPick}.`}
      </p>
    </section>
  );
}

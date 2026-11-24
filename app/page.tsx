import Link from "next/link";
import { getDb, isDatabaseConfigured } from "@/db";
import { getCurrentUser, isAuthConfigured } from "@/lib/auth";
import { accountOldEnough, getBallot, getFeaturedPick, getUserVote, getVoteReasons, isVoteClosed } from "@/lib/core";
import { formatMonth, monthOf, nextMonth, voteClosesAt } from "@/lib/month";
import { SignInButton } from "@/components/AuthButtons";
import { PickCover } from "@/components/PickCover";
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
  const [pick, ballot, user, closed] = await Promise.all([
    getFeaturedPick(db, month),
    getBallot(db, month),
    getCurrentUser(),
    isVoteClosed(db, month),
  ]);
  const myVote = user ? await getUserVote(db, user.id, month) : null;
  const reasons = pick ? await getVoteReasons(db, pick.projectId, pick.voteMonth, 6) : [];
  const totalVotes = ballot.reduce((sum, p) => sum + p.votes, 0);
  const tooYoung = user ? !accountOldEnough(user, now) : false;
  const next = formatMonth(nextMonth(month));
  const closesOn = dayFormat.format(voteClosesAt(month));

  return (
    <>
      {pick ? (
        <PickCover project={pick.project} month={pick.month} voteMonth={pick.voteMonth} voteCount={pick.voteCount} reasons={reasons} />
      ) : (
        <Intro firstPick={dayFormat.format(voteClosesAt(month))} />
      )}

      <section className="section" id="vote" aria-labelledby="vote-title">
        <div className="ballot-head">
          <div>
            <h2 id="vote-title">{closed ? "Voting reopens on the 1st" : `Vote for ${next}`}</h2>
            <p>
              {closed
                ? `${formatMonth(month)} is closed early. Nominations are still open.`
                : `One vote each, and you can change it until ${closesOn}. ${totalVotes === 0 ? "No votes yet." : `${totalVotes} vote${totalVotes === 1 ? "" : "s"} so far.`}`}
            </p>
          </div>
          <Link href="/nominate" className="btn btn-outline">
            Nominate a project
          </Link>
        </div>

        {!user && isAuthConfigured() && !closed && (
          <div className="signin-bar">
            <p>Sign in with GitHub to vote. Kindling only reads your public profile.</p>
            <SignInButton />
          </div>
        )}
        {tooYoung && (
          <p className="notice" style={{ marginTop: 16 }}>
            Your GitHub account needs to be at least 30 days old to vote. You can still nominate projects.
          </p>
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
              const mine = myVote?.projectId === project.id;
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
                  {user && !closed && !tooYoung ? (
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
        Nominate something you rely on and vote once a month. The winner gets the spotlight, with buttons straight to its
        own funding page. Kindling never touches the money.
        {firstPick && ` The first pick is announced on ${firstPick}.`}
      </p>
    </section>
  );
}

import Link from "next/link";
import { getDb, isDatabaseConfigured } from "@/db";
import { getCurrentUser, isAuthConfigured } from "@/lib/auth";
import { accountOldEnough, getBallot, getFeaturedPick, getUserVote, getVoteReasons, isVoteClosed } from "@/lib/core";
import { formatMonth, monthOf, nextMonth, voteClosesAt } from "@/lib/month";
import { SignInButton } from "@/components/AuthButtons";
import { VoteForm } from "@/components/VoteForm";
import { Avatar, FundingButtons, ProjectMeta, ProjectTitle, SetupNotice } from "@/components/ui";

export const dynamic = "force-dynamic";

const closeFormat = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

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

  return (
    <>
      {pick ? (
        <section className="card pick" aria-labelledby="pick-title">
          <div className="eyebrow">
            Kindling Pick · {formatMonth(pick.month)}
            {pick.month !== month && " (no pick this month yet)"}
          </div>
          <div className="pick-head">
            <Avatar owner={pick.project.owner} size={64} />
            <div>
              <ProjectTitle project={pick.project} as="h1" />
              <ProjectMeta project={pick.project} />
            </div>
          </div>
          {pick.project.description && <p className="description">{pick.project.description}</p>}
          <p className="muted small">
            Chosen by {pick.voteCount} vote{pick.voteCount === 1 ? "" : "s"} in {formatMonth(pick.voteMonth)}. Donations go
            straight to the project.
          </p>
          <FundingButtons links={pick.project.fundingLinks} size="lg" />
          {reasons.length > 0 && (
            <div className="reasons">
              {reasons.map((r, i) => (
                <div className="card reason" key={i}>
                  {r.avatarUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="avatar avatar-sm" src={r.avatarUrl} alt="" width={24} height={24} />
                  )}
                  <p className="small">
                    “{r.reason}” <span className="muted">· {r.login}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <Intro firstPick={formatMonth(nextMonth(month))} />
      )}

      <section className="section" id="vote" aria-labelledby="vote-title">
        <div className="section-head">
          <div>
            <h2 id="vote-title">{closed ? "Voting is closed for now" : `Vote for ${formatMonth(nextMonth(month))}`}</h2>
            <p className="muted">
              {closed
                ? `Voting for ${formatMonth(month)} is closed. A new vote opens on the 1st.`
                : `One vote per person. You can change it until voting closes on ${closeFormat.format(voteClosesAt(month))}. ${totalVotes} vote${totalVotes === 1 ? "" : "s"} so far.`}
            </p>
          </div>
          <Link href="/nominate" className="btn btn-outline">
            Nominate a project
          </Link>
        </div>

        {!user && isAuthConfigured() && !closed && (
          <div className="card row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <span>Sign in with GitHub to vote. It only reads your public profile.</span>
            <SignInButton />
          </div>
        )}
        {tooYoung && (
          <p className="notice" style={{ marginBottom: 12 }}>
            Your GitHub account needs to be at least 30 days old to vote. You can still nominate projects.
          </p>
        )}

        {ballot.length === 0 ? (
          <div className="card empty">
            <p>No projects on the ballot yet.</p>
            <Link href="/nominate" className="btn btn-primary">
              Nominate the first one
            </Link>
          </div>
        ) : (
          <div className="ballot">
            {ballot.map((project) => {
              const mine = myVote?.projectId === project.id;
              return (
                <article key={project.id} className={`card ballot-item${mine ? " mine" : ""}`}>
                  <div className="count">
                    <strong>{project.votes}</strong>
                    <span className="muted small">vote{project.votes === 1 ? "" : "s"}</span>
                  </div>
                  <div className="info">
                    <ProjectTitle project={project} />
                    {project.description && <p>{project.description}</p>}
                    <ProjectMeta project={project} />
                  </div>
                  {user && !closed && !tooYoung && (
                    <VoteForm projectId={project.id} isMyVote={mine} myReason={mine ? myVote?.reason : null} />
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function Intro({ firstPick }: { firstPick?: string }) {
  return (
    <section className="hero">
      <div>
        <div className="eyebrow">A little fuel for good projects</div>
        <h1>Each month, we pick one open-source project and send it some love.</h1>
        <p className="lede">
          Nominate a project you rely on, vote once a month, and the winner gets the spotlight with buttons straight to
          its own funding page. Kindling never touches the money.
          {firstPick && ` The first Kindling Pick lands in ${firstPick}.`}
        </p>
      </div>
    </section>
  );
}

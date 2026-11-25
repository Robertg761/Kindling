import { collectiveSlug } from "@/lib/opencollective";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb, isDatabaseConfigured } from "@/db";
import { getCurrentUser, isAuthConfigured, isOperator } from "@/lib/auth";
import { getPicksForProject, getProjectBySlug, getUserVote, getVoteCount, getVoteReasons, isVoteClosed } from "@/lib/core";
import { currentVoterSlugs, subscriptionStatus, votingEligibility } from "@/lib/eligibility";
import { formatUsd } from "@/lib/money";
import Link from "next/link";
import { formatMonth, monthOf, nextMonth } from "@/lib/month";
import { SignInButton } from "@/components/AuthButtons";
import { PickCover } from "@/components/PickCover";
import { VoteForm } from "@/components/VoteForm";
import { FundingButtons, Matches, projectMeta } from "@/components/ui";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ owner: string; repo: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `${decodeURIComponent(owner)}/${decodeURIComponent(repo)}` };
}

export default async function ProjectPage({ params, searchParams }: Props) {
  if (!isDatabaseConfigured()) notFound();
  const { owner, repo } = await params;
  const query = await searchParams;
  const db = getDb();
  const project = await getProjectBySlug(db, decodeURIComponent(owner), decodeURIComponent(repo));
  const user = await getCurrentUser();
  if (!project) notFound();
  // Only approved projects are public. Pending ones are visible to their nominator and operators until reviewed.
  const canSee =
    project.status === "approved" || isOperator(user) || (project.status === "pending" && user?.id === project.nominatedBy);
  if (!canSee) notFound();

  const now = new Date();
  const month = monthOf(now);
  const voterSlugs = await currentVoterSlugs().catch(() => null);
  const [pickRows, votes, myVote, closed] = await Promise.all([
    getPicksForProject(db, project.id),
    getVoteCount(db, project.id, month, voterSlugs),
    user ? getUserVote(db, user.id, month) : null,
    isVoteClosed(db, month),
  ]);
  const latestPick = pickRows[0];
  const reasons = latestPick ? await getVoteReasons(db, project.id, latestPick.voteMonth) : [];
  const onBallot = project.status === "approved" && !latestPick;
  const eligible = user && onBallot && !closed ? votingEligibility(user, await subscriptionStatus(user), now) : null;
  const canVote = eligible === true;
  const mine = canVote && myVote?.projectId === project.id;
  const githubUrl = `https://github.com/${encodeURIComponent(project.owner)}/${encodeURIComponent(project.name)}`;

  return (
    <>
      {query.nominated && (
        <p className="notice" style={{ marginBottom: 28 }}>
          {project.status === "approved"
            ? "Added to the ballot. It passed every check."
            : "Nominated. It passed the checks and will join the ballot once it's approved."}
        </p>
      )}
      {query.exists && (
        <p className="notice" style={{ marginBottom: 28 }}>
          Someone already nominated this one. Here&apos;s where it stands.
        </p>
      )}

      {latestPick ? (
        <PickCover
          project={project}
          month={latestPick.month}
          voteMonth={latestPick.voteMonth}
          voteCount={latestPick.voteCount}
          amountCents={latestPick.amountCents}
          reasons={reasons}
          linkTitle={false}
        />
      ) : (
        <section className="project-head">
          {project.status === "pending" && <span className="status">Waiting for approval</span>}
          {project.status === "removed" && <span className="status">Removed, only operators can see this</span>}
          <span className="owner">{project.owner}/</span>
          <h1>{project.name}</h1>
          {project.description && <p className="description">{project.description}</p>}
          <p className="meta small">{projectMeta(project)}</p>
          <FundingButtons links={project.fundingLinks} size="lg" />
        </section>
      )}

      <p className="small" style={{ marginTop: 20 }}>
        <a href={githubUrl} target="_blank" rel="noopener noreferrer">
          See it on GitHub
        </a>
        {pickRows.length > 1 && <span className="muted"> Also picked in {pickRows.slice(1).map((p) => formatMonth(p.month)).join(", ")}.</span>}
        {latestPick && latestPick.amountCents > 0 && (
          <span className="muted"> {latestPick.paidAt ? `The ${formatUsd(latestPick.amountCents)} prize has been paid.` : `The ${formatUsd(latestPick.amountCents)} prize is being paid out through Open Collective.`}</span>
        )}
      </p>

      {onBallot && (
        <section className="section vote-panel" aria-labelledby="vote-title">
          <Matches count={votes} lit={mine} />
          <div>
            <h2 id="vote-title">Vote for {formatMonth(nextMonth(month))}</h2>
            <p>
              {votes === 0 ? "No votes yet." : `${votes} vote${votes === 1 ? "" : "s"} so far.`}{" "}
              {closed ? "This month's vote is closed." : `One vote per ${collectiveSlug() ? "subscriber" : "member"} per month.`}
            </p>
          </div>
          {canVote ? (
            <VoteForm projectId={project.id} isMyVote={mine} myReason={mine ? myVote?.reason : null} />
          ) : typeof eligible === "string" ? (
            <div className="stack" style={{ alignItems: "flex-end", maxWidth: 360 }}>
              <span className="small muted" style={{ textAlign: "right" }}>{eligible}</span>
              <Link href="/subscribe" className="btn btn-outline btn-sm">
                Subscribe and link
              </Link>
            </div>
          ) : !user && isAuthConfigured() && !closed ? (
            <SignInButton label="Sign in to vote" />
          ) : (
            <span />
          )}
        </section>
      )}
    </>
  );
}

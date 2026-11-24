import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb, isDatabaseConfigured } from "@/db";
import { getCurrentUser, isAuthConfigured, isOperator } from "@/lib/auth";
import { accountOldEnough, getPicksForProject, getProjectBySlug, getUserVote, getVoteCount, getVoteReasons, isVoteClosed } from "@/lib/core";
import { formatMonth, monthOf, nextMonth } from "@/lib/month";
import { SignInButton } from "@/components/AuthButtons";
import { VoteForm } from "@/components/VoteForm";
import { Avatar, FundingButtons, ProjectMeta } from "@/components/ui";

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
  const [pickRows, votes, myVote, closed] = await Promise.all([
    getPicksForProject(db, project.id),
    getVoteCount(db, project.id, month),
    user ? getUserVote(db, user.id, month) : null,
    isVoteClosed(db, month),
  ]);
  const latestPick = pickRows[0];
  const reasons = latestPick ? await getVoteReasons(db, project.id, latestPick.voteMonth) : [];
  const onBallot = project.status === "approved" && !latestPick;
  const canVote = Boolean(user && onBallot && !closed && accountOldEnough(user, now));
  const mine = myVote?.projectId === project.id;

  return (
    <>
      {query.nominated && (
        <p className="notice" style={{ marginBottom: 20 }}>
          Thanks for the nomination. It passed the checks and will show up on the ballot once it's approved.
        </p>
      )}
      {query.exists && (
        <p className="notice" style={{ marginBottom: 20 }}>
          Someone already nominated this one. Here's where it stands.
        </p>
      )}

      <section className={`card pick`}>
        <div className="row" style={{ marginBottom: 14 }}>
          {pickRows.map((p) => (
            <span key={p.id} className="pill pill-ember">
              Kindling Pick · {formatMonth(p.month)}
            </span>
          ))}
          {project.status === "pending" && <span className="pill">Waiting for approval</span>}
          {project.status === "removed" && <span className="pill">Removed (only operators see this)</span>}
          {onBallot && <span className="pill">On the ballot for {formatMonth(nextMonth(month))}</span>}
        </div>
        <div className="pick-head">
          <Avatar owner={project.owner} size={64} />
          <div style={{ minWidth: 0 }}>
            <h1 className="project-title">
              <span className="muted">{project.owner}/</span>
              <wbr />
              {project.name}
            </h1>
            <ProjectMeta project={project} />
          </div>
        </div>
        {project.description && <p className="description">{project.description}</p>}
        <FundingButtons links={project.fundingLinks} size="lg" />
        <p className="small muted" style={{ marginTop: 16 }}>
          <a href={`https://github.com/${encodeURIComponent(project.owner)}/${encodeURIComponent(project.name)}`} target="_blank" rel="noopener noreferrer">
            View on GitHub ↗
          </a>
        </p>
      </section>

      {onBallot && (
        <section className="section">
          <div className="card ballot-item" style={{ gridTemplateColumns: "auto 1fr auto" }}>
            <div className="count">
              <strong>{votes}</strong>
              <span className="muted small">vote{votes === 1 ? "" : "s"}</span>
            </div>
            <div>
              <h2 style={{ margin: 0 }}>Vote for {formatMonth(nextMonth(month))}</h2>
              <p className="muted small" style={{ margin: 0 }}>
                {closed ? "This month's vote is closed." : "One vote per person per month."}
              </p>
            </div>
            {canVote ? (
              <VoteForm projectId={project.id} isMyVote={mine} myReason={mine ? myVote?.reason : null} />
            ) : !user && isAuthConfigured() && !closed ? (
              <SignInButton label="Sign in to vote" />
            ) : null}
          </div>
        </section>
      )}

      {reasons.length > 0 && latestPick && (
        <section className="section">
          <h2>Why people voted</h2>
          <p className="muted">From the {formatMonth(latestPick.voteMonth)} vote.</p>
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
        </section>
      )}
    </>
  );
}

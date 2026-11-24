import Link from "next/link";
import type { Project } from "@/db/schema";
import { formatMonth } from "@/lib/month";
import { Avatar, FundingButtons, Match, projectHref, projectMeta } from "./ui";

type Reason = { reason: string | null; login: string; avatarUrl: string | null };

/** The monthly pick, printed like a matchbook cover with a striker strip down one edge. */
export function PickCover({
  project,
  month,
  voteMonth,
  voteCount,
  reasons,
  linkTitle = true,
  as: Tag = "h1",
}: {
  project: Project;
  month: string;
  voteMonth: string;
  voteCount: number;
  reasons: Reason[];
  linkTitle?: boolean;
  as?: "h1" | "h2";
}) {
  return (
    <section className="matchbook" aria-labelledby="pick-name">
      <div className="strip" aria-hidden="true" />
      <div className="matchbook-body">
        <p className="matchbook-month">
          <Match lit size={28} /> {formatMonth(month)}&apos;s Kindling Pick
        </p>
        <Tag id="pick-name">
          <span className="owner">{project.owner}/</span>
          {linkTitle ? (
            <Link href={projectHref(project)} style={{ textDecoration: "none" }}>
              {project.name}
            </Link>
          ) : (
            project.name
          )}
        </Tag>
        {project.description && <p className="description">{project.description}</p>}
        <p className="meta small">{projectMeta(project)}</p>
        <FundingButtons links={project.fundingLinks} size="lg" />
        <p className="picked-by small">
          Picked with {voteCount} vote{voteCount === 1 ? "" : "s"} in {formatMonth(voteMonth)}. Donations go straight to the project.
        </p>
        {reasons.length > 0 && (
          <ul className="reasons">
            {reasons.map((r, i) => (
              <li key={i}>
                {r.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="avatar avatar-round" src={r.avatarUrl} alt="" width={24} height={24} />
                ) : (
                  <Avatar owner={r.login} size={24} round />
                )}
                <p className="small">
                  &ldquo;{r.reason}&rdquo; <span className="who">{r.login}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

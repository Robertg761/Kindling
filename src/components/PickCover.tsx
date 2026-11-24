import Link from "next/link";
import type { Project } from "@/db/schema";
import { formatUsd } from "@/lib/money";
import { formatMonth } from "@/lib/month";
import { Avatar, FundingButtons, Match, projectHref, projectMeta } from "./ui";

type Reason = { reason: string | null; login: string; avatarUrl: string | null };

/** The monthly pick, printed like a matchbook cover with a striker strip down one edge. */
export function PickCover({
  project,
  month,
  voteMonth,
  voteCount,
  amountCents,
  reasons,
  linkTitle = true,
  as: Tag = "h1",
  compact = false,
}: {
  project: Project;
  month: string;
  voteMonth: string;
  voteCount: number;
  amountCents: number;
  reasons: Reason[];
  linkTitle?: boolean;
  as?: "h1" | "h2";
  compact?: boolean;
}) {
  return (
    <section className={`matchbook${compact ? " compact" : ""}`} aria-labelledby={`pick-${project.id}`}>
      <div className="strip" aria-hidden="true" />
      <div className="matchbook-body">
        <p className="matchbook-month">
          <Match lit size={28} /> {formatMonth(month)}&apos;s Kindling Pick{amountCents > 0 && `, ${formatUsd(amountCents)}`}
        </p>
        <Tag id={`pick-${project.id}`}>
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
          Picked {amountCents > 0 ? "by subscribers " : ""}with {voteCount} vote{voteCount === 1 ? "" : "s"} in {formatMonth(voteMonth)}.{" "}
          {amountCents > 0
            ? `It gets ${formatUsd(amountCents)} from the Kindling pot, paid through Open Collective. Your own donations go straight to the project.`
            : "Donations go straight to the project."}
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

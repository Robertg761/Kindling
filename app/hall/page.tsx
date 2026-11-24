import type { Metadata } from "next";
import { getDb, isDatabaseConfigured } from "@/db";
import { getHallOfFame } from "@/lib/core";
import { formatMonth } from "@/lib/month";
import { Avatar, ProjectTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hall of Fame" };

export default async function HallPage() {
  const picks = isDatabaseConfigured() ? await getHallOfFame(getDb()) : [];
  return (
    <>
      <div className="eyebrow">Hall of Fame</div>
      <h1>Every Kindling Pick so far</h1>
      <p className="lede">One project a month, chosen by the community.</p>
      {picks.length === 0 ? (
        <div className="card empty section">
          <p>No picks yet. The first one is chosen on the 1st.</p>
        </div>
      ) : (
        <div className="hall section">
          {picks.map((pick) => (
            <article key={pick.id} className="card hall-item">
              <div className="hall-month">
                <strong>{formatMonth(pick.month)}</strong>
              </div>
              <Avatar owner={pick.project.owner} size={40} />
              <div style={{ minWidth: 0 }}>
                <ProjectTitle project={pick.project} />
                {pick.project.description && <p className="small muted" style={{ margin: 0 }}>{pick.project.description}</p>}
              </div>
              <span className="pill">
                {pick.voteCount} vote{pick.voteCount === 1 ? "" : "s"}
              </span>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

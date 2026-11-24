import Link from "next/link";
import type { FundingLink, Project } from "@/db/schema";

export function projectHref(p: { owner: string; name: string }) {
  return `/p/${encodeURIComponent(p.owner)}/${encodeURIComponent(p.name)}`;
}

/** A single safety match. Lit matches carry a small flame. */
export function Match({ lit = false, size = 48, faded = false }: { lit?: boolean; size?: number; faded?: boolean }) {
  const w = Math.round(size * 0.3);
  return (
    <svg width={w} height={size} viewBox="0 0 10 36" aria-hidden="true" style={{ opacity: faded ? 0.35 : 1 }}>
      <rect x="3.5" y="12" width="3" height="24" rx="0.6" fill="var(--birch)" />
      <ellipse cx="5" cy="11" rx="3.1" ry="4" fill={lit ? "#3a2a22" : "var(--red)"} />
      {lit && (
        <g className="match-flame">
          <path d="M5 0.5C6.8 3.2 8.4 5 8.4 7.3 8.4 9.4 6.9 10.8 5 10.8S1.6 9.4 1.6 7.3C1.6 5 3.2 3.2 5 0.5Z" fill="var(--flame)" />
          <path d="M5 4.6C5.9 6 6.6 6.9 6.6 8 6.6 9 5.9 9.7 5 9.7S3.4 9 3.4 8C3.4 6.9 4.1 6 5 4.6Z" fill="#ffe2a8" />
        </g>
      )}
    </svg>
  );
}

/** Votes drawn as matches: one match per vote, up to `max`, then a count. */
export function Matches({ count, lit = false, max = 10, size = 48 }: { count: number; lit?: boolean; max?: number; size?: number }) {
  const shown = Math.min(count, max);
  return (
    <span className="matches" role="img" aria-label={`${count} vote${count === 1 ? "" : "s"}${lit ? ", including yours" : ""}`}>
      {shown === 0 ? (
        <Match size={size} faded />
      ) : (
        Array.from({ length: shown }, (_, i) => <Match key={i} size={size} lit={lit && i === shown - 1} />)
      )}
      {count > max && <span className="more">+{count - max}</span>}
    </span>
  );
}

export function Wordmark() {
  return (
    <>
      <Match lit size={30} /> Kindling
    </>
  );
}

export function Avatar({ owner, size = 48, round = false }: { owner: string; size?: number; round?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`avatar${round ? " avatar-round" : ""}`}
      src={`https://github.com/${encodeURIComponent(owner)}.png?size=${size * 2}`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
    />
  );
}

/** Button text says what happens on the other side. */
function fundingText(link: FundingLink) {
  switch (link.platform) {
    case "github":
      return "Sponsor on GitHub";
    case "open_collective":
      return "Back on Open Collective";
    case "ko_fi":
      return "Support on Ko-fi";
    case "liberapay":
      return "Donate on Liberapay";
    case "buy_me_a_coffee":
      return "Buy them a coffee";
    case "polar":
      return "Fund on Polar";
    case "patreon":
      return "Join on Patreon";
    case "custom":
      return `Donate at ${link.label}`;
    default:
      return `Support on ${link.label}`;
  }
}

export function FundingButtons({ links, size = "md", quiet = false }: { links: FundingLink[]; size?: "sm" | "md" | "lg"; quiet?: boolean }) {
  if (!links.length) return null;
  const sizeClass = size === "lg" ? " btn-lg" : size === "sm" ? " btn-sm" : "";
  return (
    <div className="funding">
      {links.map((link, i) => (
        <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className={`btn ${i === 0 && !quiet ? "btn-primary" : "btn-outline"}${sizeClass}`}>
          {fundingText(link)}
        </a>
      ))}
    </div>
  );
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(date: Date | null, now = new Date()) {
  if (!date) return "a while ago";
  const days = Math.round((date.getTime() - now.getTime()) / 86_400_000);
  if (Math.abs(days) < 1) return "today";
  if (Math.abs(days) < 31) return relative.format(days, "day");
  return relative.format(Math.round(days / 30), "month");
}

export function projectMeta(project: Project) {
  const parts = [`${project.stars.toLocaleString("en-US")} stars`];
  if (project.language) parts.push(project.language);
  parts.push(`pushed ${timeAgo(project.lastPushAt)}`);
  return parts.join(", ");
}

export function EntryName({ project, as: Tag = "h3" }: { project: Project; as?: "h2" | "h3" }) {
  return (
    <Tag className="entry-name">
      <Link href={projectHref(project)}>
        <span className="owner">{project.owner}/</span>
        <wbr />
        {project.name}
      </Link>
    </Tag>
  );
}

export function SetupNotice() {
  return (
    <div className="panel">
      <h2>Almost there</h2>
      <p>
        Kindling needs its environment variables before it can show projects. Copy <code>.env.example</code> to{" "}
        <code>.env.local</code>, fill it in, then run <code>npm run db:migrate</code>.
      </p>
    </div>
  );
}

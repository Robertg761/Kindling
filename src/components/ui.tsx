import Link from "next/link";
import type { FundingLink, Project } from "@/db/schema";

export function projectHref(p: { owner: string; name: string }) {
  return `/p/${encodeURIComponent(p.owner)}/${encodeURIComponent(p.name)}`;
}

export function Flame({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="kindling-flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#e8590c" />
          <stop offset="1" stopColor="#ffc078" />
        </linearGradient>
      </defs>
      <path
        fill="url(#kindling-flame)"
        d="M12 2c.6 3.2-1.2 4.9-2.8 6.6C7.5 10.4 6 12.1 6 14.8 6 18.2 8.7 21 12 21s6-2.8 6-6.2c0-2.4-1.1-4-2.3-5.2-.2 1.5-.9 2.6-2 3.2.3-3.6-.6-7.6-1.7-10.8Z"
      />
      <path fill="#fff4e6" opacity=".85" d="M12 13.5c1.3 1 2.2 2.1 2.2 3.4A2.2 2.2 0 0 1 12 19a2.2 2.2 0 0 1-2.2-2.1c0-1.2.9-2.3 2.2-3.4Z" />
    </svg>
  );
}

export function Avatar({ owner, size = 48 }: { owner: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="avatar"
      src={`https://github.com/${encodeURIComponent(owner)}.png?size=${size * 2}`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
    />
  );
}

export function FundingButtons({ links, size = "md" }: { links: FundingLink[]; size?: "sm" | "md" | "lg" }) {
  if (!links.length) return null;
  return (
    <div className="funding">
      {links.map((link, i) => (
        <a
          key={link.url}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`btn ${i === 0 ? "btn-primary" : "btn-outline"} ${size === "lg" ? "btn-lg" : size === "sm" ? "btn-sm" : ""}`}
        >
          {link.label} <span aria-hidden="true">↗</span>
        </a>
      ))}
    </div>
  );
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(date: Date | null, now = new Date()) {
  if (!date) return "unknown";
  const days = Math.round((date.getTime() - now.getTime()) / 86_400_000);
  if (Math.abs(days) < 1) return "today";
  if (Math.abs(days) < 31) return relative.format(days, "day");
  return relative.format(Math.round(days / 30), "month");
}

export function ProjectMeta({ project }: { project: Project }) {
  return (
    <div className="meta">
      <span>★ {project.stars.toLocaleString("en-US")}</span>
      {project.language && <span>{project.language}</span>}
      <span>Last push {timeAgo(project.lastPushAt)}</span>
    </div>
  );
}

export function ProjectTitle({ project, as: Tag = "h3" }: { project: Project; as?: "h1" | "h2" | "h3" }) {
  return (
    <Tag className="project-title">
      <Link href={projectHref(project)}>
        <span className="muted">{project.owner}/</span>
        <wbr />
        {project.name}
      </Link>
    </Tag>
  );
}

export function SetupNotice() {
  return (
    <div className="card notice-card">
      <h2>Almost there</h2>
      <p>
        Kindling needs its environment variables before it can show projects. Copy <code>.env.example</code> to{" "}
        <code>.env.local</code>, fill it in, then run <code>npm run db:migrate</code>.
      </p>
    </div>
  );
}

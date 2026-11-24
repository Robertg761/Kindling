import { parse } from "yaml";
import type { FundingLink } from "@/db/schema";

/** GitHub's FUNDING.yml keys and where each one points. */
const PLATFORMS: Record<string, { label: string; url: (slug: string) => string }> = {
  github: { label: "GitHub Sponsors", url: (s) => `https://github.com/sponsors/${s}` },
  open_collective: { label: "Open Collective", url: (s) => `https://opencollective.com/${s}` },
  ko_fi: { label: "Ko-fi", url: (s) => `https://ko-fi.com/${s}` },
  liberapay: { label: "Liberapay", url: (s) => `https://liberapay.com/${s}` },
  buy_me_a_coffee: { label: "Buy Me a Coffee", url: (s) => `https://buymeacoffee.com/${s}` },
  polar: { label: "Polar", url: (s) => `https://polar.sh/${s}` },
  patreon: { label: "Patreon", url: (s) => `https://www.patreon.com/${s}` },
  thanks_dev: { label: "thanks.dev", url: (s) => `https://thanks.dev/${s}` },
  tidelift: { label: "Tidelift", url: (s) => `https://tidelift.com/funding/github/${s}` },
  issuehunt: { label: "IssueHunt", url: (s) => `https://issuehunt.io/r/${s}` },
  lfx_crowdfunding: {
    label: "LFX Crowdfunding",
    url: (s) => `https://crowdfunding.lfx.linuxfoundation.org/projects/${s}`,
  },
  community_bridge: {
    label: "Community Bridge",
    url: (s) => `https://funding.communitybridge.org/projects/${s}`,
  },
};

const MAX_FILE_BYTES = 16 * 1024;
const MAX_LINKS = 8;
const SLUG_RE = /^@?[A-Za-z0-9][A-Za-z0-9_.-]*(\/[A-Za-z0-9@][A-Za-z0-9_.-]*){0,3}$/;

function asList(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

function customLink(raw: string): FundingLink | null {
  const value = raw.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null;
  if (!url.hostname.includes(".")) return null;
  return { platform: "custom", label: url.hostname.replace(/^www\./, ""), url: url.toString() };
}

/** Turn a FUNDING.yml file into safe, absolute funding links. Unknown or malformed entries are skipped. */
export function parseFundingYaml(text: string): FundingLink[] {
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) return [];
  let data: unknown;
  try {
    data = parse(text, { maxAliasCount: 0 });
  } catch {
    return [];
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];

  const links: FundingLink[] = [];
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (key === "custom") {
      for (const raw of asList(value)) {
        const link = customLink(raw);
        if (link) links.push(link);
      }
      continue;
    }
    const platform = PLATFORMS[key];
    if (!platform) continue;
    for (const raw of asList(value)) {
      const slug = raw.trim();
      if (!slug || slug.length > 100 || !SLUG_RE.test(slug)) continue;
      links.push({ platform: key, label: platform.label, url: platform.url(encodeSlug(slug)) });
    }
  }

  const seen = new Set<string>();
  return links.filter((l) => !seen.has(l.url) && seen.add(l.url)).slice(0, MAX_LINKS);
}

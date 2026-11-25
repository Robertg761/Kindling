import type { FundingLink } from "@/db/schema";
import { parseFundingYaml } from "./funding";

export const ACTIVITY_WINDOW_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const TIMEOUT_MS = 8000;
const API = "https://api.github.com";

export type RepoPath = { owner: string; name: string };

export type VerifiedRepo = {
  githubRepoId: string;
  owner: string;
  name: string;
  description: string | null;
  stars: number;
  language: string | null;
  lastPushAt: Date;
  fundingLinks: FundingLink[];
};

export type VerifyResult = { ok: true; repo: VerifiedRepo } | { ok: false; reason: string };

type FetchLike = typeof fetch;

/** Accepts "https://github.com/owner/repo", with or without a trailing slash or ".git", or "owner/repo". */
export function parseRepoInput(input: string): RepoPath | null {
  let value = input.trim();
  if (!value || value.length > 300) return null;
  if (/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(value)) value = `https://github.com/${value}`;
  if (/^(www\.)?github\.com\//i.test(value)) value = `https://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    !/^(www\.)?github\.com$/i.test(url.hostname) ||
    url.port ||
    url.username ||
    url.password
  ) {
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) return null;
  const owner = segments[0];
  const name = segments[1].replace(/\.git$/i, "");
  if (
    owner.length > 39 ||
    name.length > 100 ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(owner) ||
    !/^[A-Za-z0-9_.-]+$/.test(name) ||
    name === "." ||
    name === ".."
  ) {
    return null;
  }
  return { owner, name };
}

function authHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) return { Authorization: `Bearer ${token}` };
  const id = process.env.GITHUB_ID?.trim();
  const secret = process.env.GITHUB_SECRET?.trim();
  if (id && secret) return { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` };
  return {};
}

class GitHubError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function readBounded(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_RESPONSE_BYTES) throw new GitHubError(502, "GitHub response too large");
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new GitHubError(502, "GitHub response too large");
  return text;
}

async function request(url: string, fetchImpl: FetchLike, accept: string, auth: Record<string, string>) {
  try {
    return await fetchImpl(url, {
      headers: { Accept: accept, "User-Agent": "kindling-repo-check", "X-GitHub-Api-Version": "2022-11-28", ...auth },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new GitHubError(503, "network");
  }
}

async function github(path: string, fetchImpl: FetchLike, accept = "application/vnd.github+json") {
  const url = `${API}${path}`;
  const auth = authHeaders();
  let response = await request(url, fetchImpl, accept, auth);
  // GitHub can answer 401/404 when it doesn't accept the credentials for an endpoint.
  // Public data doesn't need them, so retry once without.
  if (Object.keys(auth).length && (response.status === 401 || response.status === 404)) {
    const status = response.status;
    response = await request(url, fetchImpl, accept, {});
    if (response.ok && status === 401) console.warn("Kindling: GitHub rejected API credentials; using unauthenticated requests.");
  }
  if (response.status === 404) return null;
  if (!response.ok) console.warn(`Kindling: GitHub API ${response.status} for ${path}`);
  if (response.status === 429 || (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")) {
    throw new GitHubError(429, "rate limited");
  }
  if (!response.ok) throw new GitHubError(response.status, "upstream");
  return readBounded(response);
}

const FUNDING_PATHS = [".github/FUNDING.yml", "FUNDING.yml", "docs/FUNDING.yml"];

async function findFundingLinks(owner: string, name: string, fetchImpl: FetchLike): Promise<FundingLink[]> {
  const enc = (s: string) => encodeURIComponent(s);
  for (const file of FUNDING_PATHS) {
    const text = await github(`/repos/${enc(owner)}/${enc(name)}/contents/${file}`, fetchImpl, "application/vnd.github.raw");
    if (text !== null) return parseFundingYaml(text);
  }
  // GitHub falls back to the owner's ".github" repository for community health files.
  if (name.toLowerCase() !== ".github") {
    for (const file of ["FUNDING.yml", ".github/FUNDING.yml"]) {
      const text = await github(`/repos/${enc(owner)}/.github/contents/${file}`, fetchImpl, "application/vnd.github.raw");
      if (text !== null) return parseFundingYaml(text);
    }
  }
  return [];
}

/** Checks a repository against Kindling's nomination rules and collects its funding links. */
export async function verifyRepository(
  input: string,
  options: { fetchImpl?: FetchLike; now?: Date } = {},
): Promise<VerifyResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();
  const path = parseRepoInput(input);
  if (!path) return { ok: false, reason: "That doesn't look like a GitHub repository link. Use https://github.com/owner/repo." };

  try {
    const text = await github(`/repos/${encodeURIComponent(path.owner)}/${encodeURIComponent(path.name)}`, fetchImpl);
    if (text === null) return { ok: false, reason: "That repository doesn't exist or isn't public." };
    const data = JSON.parse(text) as Record<string, unknown>;
    const ownerLogin = (data.owner as { login?: unknown } | undefined)?.login;
    if (typeof data.id !== "number" || typeof data.name !== "string" || typeof ownerLogin !== "string") {
      return { ok: false, reason: "GitHub returned unexpected data. Try again in a minute." };
    }
    if (data.private === true || data.visibility === "private") return { ok: false, reason: "Only public repositories can be nominated." };
    if (data.archived === true) return { ok: false, reason: "That repository is archived." };
    if (data.disabled === true) return { ok: false, reason: "That repository is disabled on GitHub." };
    if (data.fork === true) return { ok: false, reason: "Forks can't be nominated. Nominate the original project instead." };

    const pushedAt = typeof data.pushed_at === "string" ? new Date(data.pushed_at) : null;
    if (!pushedAt || Number.isNaN(pushedAt.getTime()) || now.getTime() - pushedAt.getTime() > ACTIVITY_WINDOW_DAYS * DAY_MS) {
      return { ok: false, reason: `That repository hasn't had a push in the last ${ACTIVITY_WINDOW_DAYS} days.` };
    }

    const fundingLinks = await findFundingLinks(ownerLogin, data.name, fetchImpl);
    if (fundingLinks.length === 0) {
      return {
        ok: false,
        reason: "That project has no funding links yet. Kindling links to each project's own funding page, so it needs a .github/FUNDING.yml.",
      };
    }

    return {
      ok: true,
      repo: {
        githubRepoId: String(data.id),
        owner: ownerLogin,
        name: data.name,
        description: typeof data.description === "string" ? data.description.slice(0, 300) : null,
        stars: typeof data.stargazers_count === "number" ? data.stargazers_count : 0,
        language: typeof data.language === "string" ? data.language : null,
        lastPushAt: pushedAt,
        fundingLinks,
      },
    };
  } catch (error) {
    if (error instanceof GitHubError && error.status === 429) {
      return { ok: false, reason: "GitHub is rate-limiting checks right now. Try again in a few minutes." };
    }
    return { ok: false, reason: "Couldn't reach GitHub to check that repository. Try again in a minute." };
  }
}

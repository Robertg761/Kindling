import { DomainError } from "../../domain/errors";

export const PUBLIC_REPOSITORY_ACTIVITY_DAYS = 60;
export const PUBLIC_REPOSITORY_DORMANT_GRACE_DAYS = 7;
const MAX_GITHUB_RESPONSE_BYTES = 256 * 1024;
const GITHUB_USER_AGENT = "projectfuel-public-repository-verifier/1.0";
const GITHUB_ACCEPT = "application/vnd.github+json";

export type RepositoryProofBasis = "owner" | "public_contributor";
export type RepositoryActivityStatus = "active" | "warning" | "dormant";

export type PreviousRepositoryState = {
  githubRepositoryId: string;
  owner: string;
  name: string;
  repositoryUrl: string;
  activityStatus: RepositoryActivityStatus;
  selectionEligible: boolean;
  lastActivityAt: Date | null;
  warningStartedAt: Date | null;
  dormantDeadlineAt: Date | null;
  recoveryMonthOne: string | null;
  recoveryMonthTwo: string | null;
};

export type PublicRepositoryVerification = {
  githubRepositoryId: string;
  owner: string;
  name: string;
  repositoryUrl: string;
  visibility: "public";
  proofBasis: RepositoryProofBasis | null;
  connectionStatus:
    | "verified_owner"
    | "verified_public_contributor"
    | "unverified";
  lastActivityAt: Date | null;
  lastCheckedAt: Date;
  warningStartedAt: Date | null;
  dormantDeadlineAt: Date | null;
  activityStatus: RepositoryActivityStatus;
  selectionEligible: boolean;
  recoveryMonthOne: string | null;
  recoveryMonthTwo: string | null;
  recoveryStatus: "not_required" | "not_started" | "in_progress" | "complete";
  recoveryCompletedMonths: number;
  recoveryRequiredMonths: 2;
};

export type GitHubVerificationErrorCode =
  | "invalid_url"
  | "not_found"
  | "private_repository"
  | "archived_repository"
  | "disabled_repository"
  | "rate_limited"
  | "network_error"
  | "upstream_error"
  | "schema_error";

const errorMessages: Record<GitHubVerificationErrorCode, string> = {
  invalid_url: "Use a canonical public GitHub repository URL.",
  not_found: "The public GitHub repository could not be found.",
  private_repository: "Only public GitHub repositories can be checked right now.",
  archived_repository: "Archived GitHub repositories are not eligible for activity checks.",
  disabled_repository: "Disabled GitHub repositories are not eligible for activity checks.",
  rate_limited: "GitHub is rate-limiting repository checks. Try again later.",
  network_error: "GitHub repository verification is temporarily unavailable.",
  upstream_error: "GitHub repository verification is temporarily unavailable.",
  schema_error: "GitHub returned unexpected repository data.",
};

export class GitHubRepositoryVerificationError extends DomainError {
  readonly code: GitHubVerificationErrorCode;

  constructor(code: GitHubVerificationErrorCode) {
    super(errorMessages[code]);
    this.name = "GitHubRepositoryVerificationError";
    this.code = code;
  }
}

type RepositoryPath = { owner: string; name: string; repositoryUrl: string };
type FetchImplementation = typeof fetch;

function invalid(code: GitHubVerificationErrorCode): never {
  throw new GitHubRepositoryVerificationError(code);
}

export function normalizePublicRepositoryUrl(input: string): RepositoryPath {
  if (typeof input !== "string") invalid("invalid_url");
  const value = input.trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    invalid("invalid_url");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname.toLowerCase() !== "github.com" ||
    parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    invalid("invalid_url");
  }
  const segments = parsed.pathname.split("/");
  const owner = segments[1] ?? "";
  const name = segments[2] ?? "";
  if (
    segments.length !== 3 ||
    owner.length > 39 ||
    name.length > 100 ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(owner) ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name) ||
    name.toLowerCase().endsWith(".git")
  ) {
    invalid("invalid_url");
  }
  return {
    owner,
    name,
    repositoryUrl: `https://github.com/${owner}/${name}`,
  };
}

function responseError(response: Response): never {
  if (response.status === 404) invalid("not_found");
  if (
    response.status === 429 ||
    (response.status === 403 &&
      response.headers.get("x-ratelimit-remaining") === "0")
  ) {
    invalid("rate_limited");
  }
  invalid("upstream_error");
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  const contentLengthNumber = contentLength ? Number(contentLength) : null;
  if (
    contentLength &&
    (!Number.isFinite(contentLengthNumber) ||
      (contentLengthNumber ?? 0) > MAX_GITHUB_RESPONSE_BYTES)
  ) {
    invalid("schema_error");
  }
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_GITHUB_RESPONSE_BYTES) {
      invalid("schema_error");
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      invalid("schema_error");
    }
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_GITHUB_RESPONSE_BYTES) {
        await reader.cancel();
        invalid("schema_error");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof GitHubRepositoryVerificationError) throw error;
    invalid("network_error");
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    invalid("schema_error");
  }
}

async function githubJson(
  url: string,
  fetchImplementation: FetchImplementation,
): Promise<unknown> {
  const clientId = process.env.GITHUB_ID?.trim();
  const clientSecret = process.env.GITHUB_SECRET?.trim();
  if ((clientId && !clientSecret) || (!clientId && clientSecret))
    invalid("upstream_error");
  const headers: Record<string, string> = {
    Accept: GITHUB_ACCEPT,
    "User-Agent": GITHUB_USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (clientId && clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }
  let response: Response;
  try {
    response = await fetchImplementation(url, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    invalid("network_error");
  }
  if (!response.ok) responseError(response);
  return readBoundedJson(response);
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numericId(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
    return String(value);
  if (typeof value === "string" && /^[1-9][0-9]*$/.test(value)) return value;
  return null;
}

function parseRepositoryMetadata(value: unknown, path: RepositoryPath) {
  const record = objectValue(value);
  const owner = objectValue(record?.owner);
  const id = numericId(record?.id);
  const name = stringValue(record?.name);
  const ownerLogin = stringValue(owner?.login);
  const pushedAt = record?.pushed_at;
  if (
    !record ||
    !id ||
    !name ||
    !ownerLogin ||
    typeof record.private !== "boolean" ||
    typeof record.archived !== "boolean" ||
    typeof record.disabled !== "boolean" ||
    !Object.prototype.hasOwnProperty.call(record, "pushed_at") ||
    (typeof record.visibility !== "string" && record.visibility !== null) ||
    (pushedAt !== null && pushedAt !== undefined && typeof pushedAt !== "string") ||
    ownerLogin.toLowerCase() !== path.owner.toLowerCase() ||
    name.toLowerCase() !== path.name.toLowerCase()
  ) {
    invalid("schema_error");
  }
  if (record.private !== false || record.visibility !== "public")
    invalid("private_repository");
  if (record.archived) invalid("archived_repository");
  if (record.disabled) invalid("disabled_repository");
  const lastActivityAt = pushedAt ? new Date(pushedAt) : null;
  if (lastActivityAt && Number.isNaN(lastActivityAt.getTime()))
    invalid("schema_error");
  return {
    id,
    owner: ownerLogin,
    name,
    lastActivityAt,
  };
}

function parseContributorResponse(value: unknown, githubUserId: string): boolean {
  if (!Array.isArray(value)) invalid("schema_error");
  return value.some((item) => {
    const commit = objectValue(item);
    if (!commit) invalid("schema_error");
    const author = objectValue(commit.author);
    if (commit.author !== null && commit.author !== undefined && !author)
      invalid("schema_error");
    const authorId = numericId(author?.id);
    return authorId === githubUserId;
  });
}

function monthStart(value: Date): string {
  return `${value.getUTCFullYear().toString().padStart(4, "0")}-${(value.getUTCMonth() + 1).toString().padStart(2, "0")}-01`;
}

function nextMonth(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return monthStart(date);
}

function assessActivity(
  pushedAt: Date | null,
  previous: PreviousRepositoryState | undefined,
  now: Date,
) {
  const freshAfter = now.getTime() - PUBLIC_REPOSITORY_ACTIVITY_DAYS * 86_400_000;
  const isFresh = pushedAt !== null && pushedAt.getTime() >= freshAfter;
  const checkedAt = now;

  if (!previous || previous.githubRepositoryId.length === 0) {
    return {
      activityStatus: isFresh ? ("active" as const) : ("warning" as const),
      selectionEligible: true,
      warningStartedAt: isFresh ? null : checkedAt,
      dormantDeadlineAt: isFresh
        ? null
        : new Date(checkedAt.getTime() + PUBLIC_REPOSITORY_DORMANT_GRACE_DAYS * 86_400_000),
      recoveryMonthOne: null,
      recoveryMonthTwo: null,
    };
  }

  if (previous.activityStatus === "dormant") {
    if (!isFresh || !pushedAt) {
      return {
        activityStatus: "dormant" as const,
        selectionEligible: false,
        warningStartedAt: previous.warningStartedAt,
        dormantDeadlineAt: previous.dormantDeadlineAt,
        recoveryMonthOne: previous.recoveryMonthOne,
        recoveryMonthTwo: previous.recoveryMonthTwo,
      };
    }
    const activityMonth = monthStart(pushedAt);
    if (
      previous.recoveryMonthOne &&
      activityMonth === nextMonth(previous.recoveryMonthOne)
    ) {
      return {
        activityStatus: "active" as const,
        selectionEligible: true,
        warningStartedAt: null,
        dormantDeadlineAt: null,
        recoveryMonthOne: previous.recoveryMonthOne,
        recoveryMonthTwo: activityMonth,
      };
    }
    return {
      activityStatus: "dormant" as const,
      selectionEligible: false,
      warningStartedAt: previous.warningStartedAt,
      dormantDeadlineAt: previous.dormantDeadlineAt,
      recoveryMonthOne: activityMonth,
      recoveryMonthTwo: null,
    };
  }

  if (isFresh) {
    return {
      activityStatus: "active" as const,
      selectionEligible: true,
      warningStartedAt: null,
      dormantDeadlineAt: null,
      recoveryMonthOne: previous.recoveryMonthOne,
      recoveryMonthTwo: previous.recoveryMonthTwo,
    };
  }
  if (previous.activityStatus === "active") {
    return {
      activityStatus: "warning" as const,
      selectionEligible: true,
      warningStartedAt: checkedAt,
      dormantDeadlineAt: new Date(
        checkedAt.getTime() +
          PUBLIC_REPOSITORY_DORMANT_GRACE_DAYS * 86_400_000,
      ),
      recoveryMonthOne: null,
      recoveryMonthTwo: null,
    };
  }
  if (
    previous.activityStatus === "warning" &&
    previous.dormantDeadlineAt &&
    now.getTime() <= previous.dormantDeadlineAt.getTime()
  ) {
    return {
      activityStatus: "warning" as const,
      selectionEligible: true,
      warningStartedAt: previous.warningStartedAt,
      dormantDeadlineAt: previous.dormantDeadlineAt,
      recoveryMonthOne: null,
      recoveryMonthTwo: null,
    };
  }
  return {
    activityStatus: "dormant" as const,
    selectionEligible: false,
    warningStartedAt: previous.warningStartedAt ?? checkedAt,
    dormantDeadlineAt:
      previous.dormantDeadlineAt ??
      new Date(checkedAt.getTime() + PUBLIC_REPOSITORY_DORMANT_GRACE_DAYS * 86_400_000),
    recoveryMonthOne: null,
    recoveryMonthTwo: null,
  };
}

function recoveryStatus(
  activityStatus: RepositoryActivityStatus,
  monthOne: string | null,
  monthTwo: string | null,
) {
  const completedMonths = monthTwo ? 2 : monthOne ? 1 : 0;
  return {
    recoveryStatus:
      completedMonths === 2
        ? ("complete" as const)
        : activityStatus === "dormant" && completedMonths === 1
          ? ("in_progress" as const)
          : activityStatus === "dormant"
            ? ("not_started" as const)
            : ("not_required" as const),
    recoveryCompletedMonths: completedMonths,
    recoveryRequiredMonths: 2 as const,
  };
}

export async function verifyPublicRepository(options: {
  repositoryUrl: string;
  githubUserId: string;
  githubLogin: string;
  now?: Date;
  previous?: PreviousRepositoryState;
  fetchImplementation?: FetchImplementation;
}): Promise<PublicRepositoryVerification> {
  const path = normalizePublicRepositoryUrl(options.repositoryUrl);
  if (!/^[1-9][0-9]*$/.test(options.githubUserId) || !options.githubLogin.trim())
    invalid("schema_error");
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) invalid("schema_error");
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const metadata = parseRepositoryMetadata(
    await githubJson(
      `https://api.github.com/repos/${encodeURIComponent(path.owner)}/${encodeURIComponent(path.name)}`,
      fetchImplementation,
    ),
    path,
  );
  if (
    metadata.lastActivityAt &&
    metadata.lastActivityAt.getTime() > now.getTime() + 5 * 60_000
  ) {
    invalid("schema_error");
  }
  const previous =
    options.previous?.githubRepositoryId === metadata.id
      ? options.previous
      : undefined;
  let proofBasis: RepositoryProofBasis | null = null;
  if (metadata.owner.toLowerCase() === options.githubLogin.trim().toLowerCase()) {
    proofBasis = "owner";
  } else {
    const commits = await githubJson(
      `https://api.github.com/repos/${encodeURIComponent(metadata.owner)}/${encodeURIComponent(metadata.name)}/commits?author=${encodeURIComponent(options.githubLogin.trim())}&per_page=1`,
      fetchImplementation,
    );
    if (parseContributorResponse(commits, options.githubUserId))
      proofBasis = "public_contributor";
  }
  if (!proofBasis) {
    const activity = assessActivity(metadata.lastActivityAt, previous, now);
    const recovery = recoveryStatus(
      activity.activityStatus,
      activity.recoveryMonthOne,
      activity.recoveryMonthTwo,
    );
    return {
      githubRepositoryId: metadata.id,
      owner: metadata.owner,
      name: metadata.name,
      repositoryUrl: `https://github.com/${metadata.owner}/${metadata.name}`,
      visibility: "public",
      proofBasis: null,
      connectionStatus: "unverified",
      lastActivityAt: metadata.lastActivityAt,
      lastCheckedAt: now,
      ...activity,
      ...recovery,
    };
  }
  const activity = assessActivity(metadata.lastActivityAt, previous, now);
  const recovery = recoveryStatus(
    activity.activityStatus,
    activity.recoveryMonthOne,
    activity.recoveryMonthTwo,
  );
  return {
    githubRepositoryId: metadata.id,
    owner: metadata.owner,
    name: metadata.name,
    repositoryUrl: `https://github.com/${metadata.owner}/${metadata.name}`,
    visibility: "public",
    proofBasis,
    connectionStatus: proofBasis === "owner" ? "verified_owner" : "verified_public_contributor",
    lastActivityAt: metadata.lastActivityAt,
    lastCheckedAt: now,
    ...activity,
    ...recovery,
  };
}

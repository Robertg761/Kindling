/**
 * Read-only access to Kindling's collective on Open Collective. Kindling never moves money: the
 * fiscal host holds it and pays winners through public expenses. This module only reads the
 * collective's balance, its active subscriptions and members' public profiles.
 *
 * The public API allows 10 requests a minute without a token (100 with OC_PERSONAL_TOKEN), so
 * results are cached for a few minutes.
 */
import type { FundingSnapshot } from "./money";
import { CURRENCY } from "./money";
import { voteClosesAt, type Month } from "./month";

const ENDPOINT = "https://api.opencollective.com/graphql/v2";
const TIMEOUT_MS = 8000;
const CACHE_MS = 5 * 60 * 1000;

type FetchLike = typeof fetch;

export function collectiveSlug(): string | null {
  const slug = process.env.KINDLING_OC_SLUG?.trim().toLowerCase();
  return slug && SLUG_RE.test(slug) ? slug : null;
}

export function isFundingConfigured() {
  return collectiveSlug() !== null;
}

export function contributeUrl(slug = collectiveSlug()) {
  return slug ? `https://opencollective.com/${slug}/contribute` : null;
}

export function collectiveUrl(slug = collectiveSlug()) {
  return slug ? `https://opencollective.com/${slug}` : null;
}

export class OpenCollectiveError extends Error {}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;

/** Accepts "https://opencollective.com/some-slug", "opencollective.com/some-slug" or "some-slug". */
export function parseProfileInput(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value || value.length > 200) return null;
  value = value.replace(/^https?:\/\//, "").replace(/^(www\.)?opencollective\.com\//, "");
  value = value.split(/[/?#]/)[0].replace(/^@/, "");
  return SLUG_RE.test(value) ? value : null;
}

async function gql<T>(query: string, variables: Record<string, unknown>, fetchImpl: FetchLike): Promise<T> {
  const token = process.env.OC_PERSONAL_TOKEN?.trim();
  let response: Response;
  try {
    // OC_API_URL exists only so local smoke tests can point at a mock server.
    response = await fetchImpl(process.env.OC_API_URL || ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "kindling",
        ...(token ? { "Personal-Token": token } : {}),
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new OpenCollectiveError("Couldn't reach Open Collective.");
  }
  if (response.status === 429) throw new OpenCollectiveError("Open Collective is rate-limiting requests.");
  let body: { data?: T; errors?: { message: string }[] };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new OpenCollectiveError(`Open Collective returned an unreadable response (${response.status}).`);
  }
  if (body.errors?.length) throw new OpenCollectiveError(body.errors.map((e) => e.message).join("; "));
  if (!response.ok || !body.data) throw new OpenCollectiveError(`Open Collective returned ${response.status}.`);
  return body.data;
}

// ---------- Tiny TTL cache ----------

const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>, now = Date.now()): Promise<T> {
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: now, value });
  return value;
}

export function clearOpenCollectiveCache() {
  cache.clear();
}

// ---------- Queries ----------

const FUNDING_QUERY = /* GraphQL */ `
  query KindlingFunding($slug: String!, $from: DateTime!, $to: DateTime!) {
    account(slug: $slug) {
      slug
      stats {
        balance {
          valueInCents
          currency
        }
        totalNetAmountReceived(dateFrom: $from, dateTo: $to) {
          valueInCents
          currency
        }
      }
    }
  }
`;

type Amount = { valueInCents: number | null; currency: string | null } | null;

/** The collective's balance now, and its income after fees during `month`. */
export async function getFunding(
  slug: string,
  month: Month,
  options: { fetchImpl?: FetchLike; fresh?: boolean } = {},
): Promise<FundingSnapshot> {
  const load = async () => {
    const from = new Date(`${month}-01T00:00:00Z`).toISOString();
    const to = voteClosesAt(month).toISOString();
    const data = await gql<{ account: { stats: { balance: Amount; totalNetAmountReceived: Amount } } | null }>(
      FUNDING_QUERY,
      { slug, from, to },
      options.fetchImpl ?? fetch,
    );
    if (!data.account) throw new OpenCollectiveError(`No Open Collective account called "${slug}".`);
    const { balance, totalNetAmountReceived } = data.account.stats;
    for (const amount of [balance, totalNetAmountReceived]) {
      if (amount?.currency && amount.currency !== CURRENCY) {
        throw new OpenCollectiveError(`The collective uses ${amount.currency}; Kindling expects ${CURRENCY}.`);
      }
    }
    return {
      balanceCents: Math.max(0, Math.round(balance?.valueInCents ?? 0)),
      netReceivedCents: Math.max(0, Math.round(totalNetAmountReceived?.valueInCents ?? 0)),
    };
  };
  return options.fresh ? load() : cached(`funding:${slug}:${month}`, load);
}

const SUBSCRIBERS_QUERY = /* GraphQL */ `
  query KindlingSubscribers($slug: String!, $offset: Int!) {
    orders(account: { slug: $slug }, filter: INCOMING, status: [ACTIVE], limit: 1000, offset: $offset) {
      totalCount
      nodes {
        frequency
        amount {
          valueInCents
          currency
        }
        fromAccount {
          slug
        }
      }
    }
  }
`;

type OrderNode = { frequency: string | null; amount: Amount; fromAccount: { slug: string } | null };

/** Active recurring contributions to the collective, as monthly US cents per contributor profile slug. */
export async function getSubscribers(slug: string, options: { fetchImpl?: FetchLike } = {}): Promise<Map<string, number>> {
  return cached(`subscribers:${slug}`, async () => {
    const monthly = new Map<string, number>();
    for (let offset = 0; offset < 10_000; offset += 1000) {
      const data = await gql<{ orders: { totalCount: number; nodes: OrderNode[] } }>(
        SUBSCRIBERS_QUERY,
        { slug, offset },
        options.fetchImpl ?? fetch,
      );
      for (const order of data.orders.nodes) {
        const from = order.fromAccount?.slug?.toLowerCase();
        const cents = order.amount?.valueInCents ?? 0;
        if (!from || (order.amount?.currency && order.amount.currency !== CURRENCY)) continue;
        const perMonth = order.frequency === "MONTHLY" ? cents : order.frequency === "YEARLY" ? Math.floor(cents / 12) : 0;
        if (perMonth > 0) monthly.set(from, (monthly.get(from) ?? 0) + perMonth);
      }
      if (offset + 1000 >= data.orders.totalCount || data.orders.nodes.length === 0) break;
    }
    return monthly;
  });
}

const PROFILE_QUERY = /* GraphQL */ `
  query KindlingProfile($slug: String!) {
    account(slug: $slug) {
      slug
      name
      socialLinks {
        type
        url
      }
    }
  }
`;

export type OcProfile = { slug: string; name: string | null; githubLogins: string[] };

export function githubLoginFromUrl(url: string): string | null {
  const match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/?(?:[?#].*)?$/i.exec(url.trim());
  return match ? match[1].toLowerCase() : null;
}

export async function getProfile(slug: string, options: { fetchImpl?: FetchLike } = {}): Promise<OcProfile | null> {
  const data = await gql<{ account: { slug: string; name: string | null; socialLinks: { type: string; url: string }[] | null } | null }>(
    PROFILE_QUERY,
    { slug },
    options.fetchImpl ?? fetch,
  );
  if (!data.account) return null;
  const githubLogins = (data.account.socialLinks ?? [])
    .map((link) => githubLoginFromUrl(link.url))
    .filter((login): login is string => Boolean(login));
  return { slug: data.account.slug, name: data.account.name, githubLogins: [...new Set(githubLogins)] };
}

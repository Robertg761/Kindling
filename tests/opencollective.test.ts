import { beforeEach, describe, expect, it } from "vitest";
import {
  clearOpenCollectiveCache,
  getFunding,
  getProfile,
  getSubscribers,
  githubLoginFromUrl,
  OpenCollectiveError,
  parseProfileInput,
} from "@/lib/opencollective";
import { votingEligibility } from "@/lib/eligibility";
import type { User } from "@/db/schema";

beforeEach(() => clearOpenCollectiveCache());

function fakeOc(handler: (query: string, variables: Record<string, unknown>) => unknown) {
  const calls: { query: string; variables: Record<string, unknown> }[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const { query, variables } = JSON.parse(String(init?.body));
    calls.push({ query, variables });
    return new Response(JSON.stringify(handler(query, variables)), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("parsing", () => {
  it("reads Open Collective profile links and GitHub links", () => {
    expect(parseProfileInput("https://opencollective.com/Robert-G/contributions")).toBe("robert-g");
    expect(parseProfileInput("opencollective.com/kindling")).toBe("kindling");
    expect(parseProfileInput("@kindling")).toBe("kindling");
    expect(parseProfileInput("not a slug!")).toBeNull();
    expect(githubLoginFromUrl("https://github.com/Robertg761")).toBe("robertg761");
    expect(githubLoginFromUrl("github.com/robertg761/")).toBe("robertg761");
    expect(githubLoginFromUrl("https://github.com/robertg761/HA-Desktop-Widget")).toBeNull();
    expect(githubLoginFromUrl("https://gitlab.com/robertg761")).toBeNull();
  });
});

describe("getFunding", () => {
  it("returns balance and the month's net income, and asks for that month's dates", async () => {
    const { fetchImpl, calls } = fakeOc(() => ({
      data: { account: { slug: "kindling", stats: { balance: { valueInCents: 61234, currency: "USD" }, totalNetAmountReceived: { valueInCents: 30000, currency: "USD" } } } },
    }));
    expect(await getFunding("kindling", "2026-11", { fetchImpl })).toEqual({ balanceCents: 61234, netReceivedCents: 30000 });
    expect(calls[0].variables).toEqual({ slug: "kindling", from: "2026-11-01T00:00:00.000Z", to: "2026-12-01T00:00:00.000Z" });
  });

  it("surfaces GraphQL errors and missing collectives", async () => {
    const broken = fakeOc(() => ({ errors: [{ message: 'Cannot query field "x"' }] }));
    await expect(getFunding("kindling", "2026-11", { fetchImpl: broken.fetchImpl, fresh: true })).rejects.toThrow(OpenCollectiveError);
    const missing = fakeOc(() => ({ data: { account: null } }));
    await expect(getFunding("nope", "2026-11", { fetchImpl: missing.fetchImpl, fresh: true })).rejects.toThrow(/No Open Collective account/);
  });

  it("refuses a non-USD collective", async () => {
    const eur = fakeOc(() => ({ data: { account: { stats: { balance: { valueInCents: 1, currency: "EUR" }, totalNetAmountReceived: null } } } }));
    await expect(getFunding("k", "2026-11", { fetchImpl: eur.fetchImpl, fresh: true })).rejects.toThrow(/EUR/);
  });
});

describe("getSubscribers", () => {
  it("adds up monthly and yearly subscriptions per contributor and ignores one-time gifts", async () => {
    const { fetchImpl } = fakeOc(() => ({
      data: {
        orders: {
          totalCount: 4,
          nodes: [
            { frequency: "MONTHLY", amount: { valueInCents: 500, currency: "USD" }, fromAccount: { slug: "Alice" } },
            { frequency: "YEARLY", amount: { valueInCents: 12000, currency: "USD" }, fromAccount: { slug: "bob" } },
            { frequency: "ONETIME", amount: { valueInCents: 10000, currency: "USD" }, fromAccount: { slug: "carol" } },
            { frequency: "MONTHLY", amount: { valueInCents: 300, currency: "USD" }, fromAccount: { slug: "dave" } },
          ],
        },
      },
    }));
    const subs = await getSubscribers("kindling", { fetchImpl });
    expect(Object.fromEntries(subs)).toEqual({ alice: 500, bob: 1000, dave: 300 });
  });
});

describe("getProfile", () => {
  it("collects GitHub logins from social links", async () => {
    const { fetchImpl } = fakeOc(() => ({
      data: {
        account: {
          slug: "robert",
          name: "Robert",
          socialLinks: [
            { type: "GITHUB", url: "https://github.com/Robertg761" },
            { type: "WEBSITE", url: "https://example.com" },
          ],
        },
      },
    }));
    expect(await getProfile("robert", { fetchImpl })).toEqual({ slug: "robert", name: "Robert", githubLogins: ["robertg761"] });
  });
});

describe("votingEligibility", () => {
  const user = { githubCreatedAt: new Date("2020-01-01T00:00:00Z") } as User;
  const now = new Date("2026-11-24T00:00:00Z");
  it("lets subscribers vote and tells everyone else what to do", () => {
    expect(votingEligibility(user, { kind: "active", monthlyCents: 500 }, now)).toBe(true);
    expect(votingEligibility(user, { kind: "practice" }, now)).toBe(true);
    expect(votingEligibility({ ...user, githubCreatedAt: now }, { kind: "practice" }, now)).toMatch(/30 days/);
    expect(votingEligibility(user, { kind: "unlinked" }, now)).toMatch(/Subscribe for \$5 a month/);
    expect(votingEligibility(user, { kind: "inactive" }, now)).toMatch(/at least \$5 a month/);
  });
});

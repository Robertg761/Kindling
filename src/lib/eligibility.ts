import type { User } from "@/db/schema";
import { accountOldEnough, MIN_ACCOUNT_AGE_DAYS } from "./core";
import { BASE_PRICE_CENTS, formatUsd } from "./money";
import { collectiveSlug, getSubscribers, OpenCollectiveError } from "./opencollective";

export type SubscriptionStatus =
  | { kind: "practice" }
  | { kind: "unlinked" }
  | { kind: "active"; monthlyCents: number }
  | { kind: "inactive" }
  | { kind: "unknown"; message: string };

/** Where a member stands. Practice mode applies until the Open Collective collective is configured. */
export async function subscriptionStatus(user: User): Promise<SubscriptionStatus> {
  const slug = collectiveSlug();
  if (!slug) return { kind: "practice" };
  if (!user.ocSlug) return { kind: "unlinked" };
  try {
    const subscribers = await getSubscribers(slug);
    const monthlyCents = subscribers.get(user.ocSlug.toLowerCase()) ?? 0;
    return monthlyCents >= BASE_PRICE_CENTS ? { kind: "active", monthlyCents } : { kind: "inactive" };
  } catch (error) {
    const message = error instanceof OpenCollectiveError ? error.message : "Couldn't check your subscription.";
    return { kind: "unknown", message };
  }
}

/** true, or a sentence telling the member what to do to be able to vote. */
export function votingEligibility(user: User, status: SubscriptionStatus, now: Date): true | string {
  switch (status.kind) {
    case "practice":
      return accountOldEnough(user, now)
        ? true
        : `GitHub accounts need to be at least ${MIN_ACCOUNT_AGE_DAYS} days old to vote.`;
    case "active":
      return true;
    case "unlinked":
      return `Voting is for subscribers. Subscribe for ${formatUsd(BASE_PRICE_CENTS)} a month, then link your Open Collective profile.`;
    case "inactive":
      return `Your linked Open Collective profile doesn't have an active subscription of at least ${formatUsd(BASE_PRICE_CENTS)} a month yet. New subscriptions can take a few minutes to show up.`;
    case "unknown":
      return `${status.message} Try again in a minute.`;
  }
}

/** Open Collective slugs whose votes count right now: subscribers paying at least the base price. */
export async function currentVoterSlugs(): Promise<string[] | null> {
  const slug = collectiveSlug();
  if (!slug) return null;
  const subscribers = await getSubscribers(slug);
  return [...subscribers].filter(([, cents]) => cents >= BASE_PRICE_CENTS).map(([from]) => from);
}

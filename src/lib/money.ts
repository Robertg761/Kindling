/**
 * Kindling's money model. All amounts are US cents.
 *
 * Subscribers pay into the Kindling collective on Open Collective, where the fiscal host holds the
 * money. When a month's vote closes, Kindling looks at the collective's balance, sets aside what is
 * already owed (unpaid prizes and unpaid operator shares), sets aside the operator's 5% of the
 * month's income after fees, and splits the rest into $200 prizes. Whatever is left rolls over.
 */

export const BASE_PRICE_CENTS = 500; // $5 a month, minimum to vote
export const PRIZE_CENTS = 20_000; // $200 per winner
export const OPERATOR_SHARE_PERCENT = 5; // of income after card and host fees
export const CURRENCY = "USD";

export type FundingSnapshot = {
  /** Collective balance after card and host fees. */
  balanceCents: number;
  /** Income received during the vote month, after card and host fees. */
  netReceivedCents: number;
};

export function operatorShareOf(netReceivedCents: number): number {
  return Math.max(0, Math.round((netReceivedCents * OPERATOR_SHARE_PERCENT) / 100));
}

export type PotBreakdown = {
  balanceCents: number;
  outstandingCents: number;
  operatorShareCents: number;
  potCents: number;
  /** How many $200 prizes the pot covers. */
  slots: number;
  /** Progress toward the next prize. */
  towardNextCents: number;
};

export function breakdown(snapshot: FundingSnapshot, outstandingCents: number): PotBreakdown {
  const operatorShareCents = operatorShareOf(snapshot.netReceivedCents);
  const potCents = Math.max(0, snapshot.balanceCents - outstandingCents - operatorShareCents);
  const slots = Math.floor(potCents / PRIZE_CENTS);
  return {
    balanceCents: Math.max(0, snapshot.balanceCents),
    outstandingCents,
    operatorShareCents,
    potCents,
    slots,
    towardNextCents: potCents - slots * PRIZE_CENTS,
  };
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "$200" for whole dollars, "$185.50" otherwise. */
export function formatUsd(cents: number): string {
  return usd.format(cents / 100).replace(/\.00$/, "");
}

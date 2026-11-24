import { expect, it } from "vitest";
import { breakdown, formatUsd, operatorShareOf } from "@/lib/money";

it("computes the operator share, pot, slots and progress", () => {
  expect(operatorShareOf(30_000)).toBe(1_500);
  expect(operatorShareOf(-5)).toBe(0);
  expect(breakdown({ balanceCents: 60_000, netReceivedCents: 30_000 }, 0)).toEqual({
    balanceCents: 60_000,
    outstandingCents: 0,
    operatorShareCents: 1_500,
    potCents: 58_500,
    slots: 2,
    towardNextCents: 18_500,
  });
  expect(breakdown({ balanceCents: 10_000, netReceivedCents: 10_000 }, 20_000).potCents).toBe(0);
});

it("formats dollars", () => {
  expect(formatUsd(20_000)).toBe("$200");
  expect(formatUsd(18_550)).toBe("$185.50");
});

/** Months are "YYYY-MM" strings in UTC. */
export type Month = string;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonth(value: string): value is Month {
  return MONTH_RE.test(value);
}

export function monthOf(date: Date): Month {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parts(month: Month): [number, number] {
  const match = MONTH_RE.exec(month);
  if (!match) throw new Error(`Invalid month: ${month}`);
  return [Number(match[1]), Number(match[2])];
}

export function addMonths(month: Month, delta: number): Month {
  const [year, m] = parts(month);
  return monthOf(new Date(Date.UTC(year, m - 1 + delta, 1)));
}

export const nextMonth = (month: Month) => addMonths(month, 1);
export const previousMonth = (month: Month) => addMonths(month, -1);

export function formatMonth(month: Month): string {
  const [year, m] = parts(month);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** First instant of the month after `month`, when its vote closes. */
export function voteClosesAt(month: Month): Date {
  const [year, m] = parts(month);
  return new Date(Date.UTC(year, m, 1));
}

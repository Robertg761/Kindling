import { expect, it } from "vitest";
import { addMonths, formatMonth, monthOf, nextMonth, previousMonth, voteClosesAt } from "@/lib/month";

it("does month math in UTC", () => {
  expect(monthOf(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
  expect(nextMonth("2026-12")).toBe("2027-01");
  expect(previousMonth("2027-01")).toBe("2026-12");
  expect(addMonths("2026-11", 14)).toBe("2028-01");
  expect(formatMonth("2026-11")).toBe("November 2026");
  expect(voteClosesAt("2026-12").toISOString()).toBe("2027-01-01T00:00:00.000Z");
});

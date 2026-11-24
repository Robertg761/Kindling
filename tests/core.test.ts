import { describe, expect, it } from "vitest";
import { votes } from "@/db/schema";
import {
  castVote,
  listUnpaidOperatorShares,
  listUnpaidPicks,
  markOperatorSharePaid,
  markPickPaid,
  outstandingCents,
  closeVoting,
  getBallot,
  getFeaturedPicks,
  getHallOfFame,
  getUserVote,
  getVoteReasons,
  nominate,
  setProjectStatus,
  upsertUser,
  withdrawVote,
} from "@/lib/core";
import { fakeRepo, testDb } from "./db";

const OLD = new Date("2020-01-01T00:00:00Z");
const at = (iso: string) => new Date(iso);

async function setup() {
  const db = await testDb();
  const mkUser = (n: number, created = OLD) =>
    upsertUser(db, { githubId: String(n), login: `user${n}`, avatarUrl: null, githubCreatedAt: created });
  const mkProject = async (name: string, by: number, approve = true) => {
    const res = await nominate(db, { userId: by, repo: fakeRepo(name), now: at("2026-11-02T00:00:00Z") });
    if (!res.ok) throw new Error(res.reason);
    if (approve) await setProjectStatus(db, res.value.project.id, "approved", at("2026-11-02T00:00:00Z"));
    return res.value.project;
  };
  return { db, mkUser, mkProject };
}

describe("nominations", () => {
  it("dedupes and limits each member to 3 per month", async () => {
    const { db, mkUser } = await setup();
    const u = await mkUser(1);
    const now = at("2026-11-10T00:00:00Z");
    const repo = fakeRepo("dup");
    const first = await nominate(db, { userId: u.id, repo, now });
    const again = await nominate(db, { userId: u.id, repo: { ...repo, owner: "OCTO", name: "DUP" }, now });
    expect(first.ok && first.value.created).toBe(true);
    expect(again.ok && !again.value.created).toBe(true);
    for (const n of ["b", "c"]) expect((await nominate(db, { userId: u.id, repo: fakeRepo(n), now })).ok).toBe(true);
    const fourth = await nominate(db, { userId: u.id, repo: fakeRepo("d"), now });
    expect(fourth.ok).toBe(false);
    const nextMonth = await nominate(db, { userId: u.id, repo: fakeRepo("e"), now: at("2026-12-01T00:00:00Z") });
    expect(nextMonth.ok).toBe(true);
  });
});

describe("voting", () => {
  it("allows one vote per member per month, changeable until close", async () => {
    const { db, mkUser, mkProject } = await setup();
    const u = await mkUser(1);
    const a = await mkProject("a", u.id);
    const b = await mkProject("b", u.id);
    const now = at("2026-11-15T00:00:00Z");
    expect((await castVote(db, { user: u, projectId: a.id, reason: "  great   docs ", now, eligible: true })).ok).toBe(true);
    expect((await castVote(db, { user: u, projectId: b.id, now, eligible: true })).ok).toBe(true);
    const vote = await getUserVote(db, u.id, "2026-11");
    expect(vote?.projectId).toBe(b.id);
    const ballot = await getBallot(db, "2026-11");
    expect(ballot.find((p) => p.id === b.id)?.votes).toBe(1);
    expect(ballot.find((p) => p.id === a.id)?.votes).toBe(0);
    expect((await withdrawVote(db, { userId: u.id, now })).ok).toBe(true);
    expect(await getUserVote(db, u.id, "2026-11")).toBeNull();
  });

  it("enforces one vote per member per month in the database", async () => {
    const { db, mkUser, mkProject } = await setup();
    const u = await mkUser(1);
    const a = await mkProject("a", u.id);
    await db.insert(votes).values({ userId: u.id, projectId: a.id, month: "2026-11" });
    await expect(db.insert(votes).values({ userId: u.id, projectId: a.id, month: "2026-11" })).rejects.toThrow();
  });

  it("rejects ineligible members, pending projects and closed months", async () => {
    const { db, mkUser, mkProject } = await setup();
    const now = at("2026-11-15T00:00:00Z");
    const young = await mkUser(2, at("2026-11-01T00:00:00Z"));
    const u = await mkUser(1);
    const pending = await mkProject("pending", u.id, false);
    const a = await mkProject("a", u.id);
    expect((await castVote(db, { user: young, projectId: a.id, now, eligible: "Subscribe to vote." })).ok).toBe(false);
    expect((await castVote(db, { user: u, projectId: pending.id, now, eligible: true })).ok).toBe(false);
    await castVote(db, { user: u, projectId: a.id, now, eligible: true });
    await closeVoting(db, "2026-11", null);
    const other = await mkUser(3);
    expect((await castVote(db, { user: other, projectId: a.id, now, eligible: true })).ok).toBe(false);
  });
});

describe("closing the month", () => {
  it("picks the most-voted project for next month and is idempotent", async () => {
    const { db, mkUser, mkProject } = await setup();
    const [u1, u2, u3] = await Promise.all([mkUser(1), mkUser(2), mkUser(3)]);
    const a = await mkProject("a", u1.id);
    const b = await mkProject("b", u1.id);
    await castVote(db, { user: u1, projectId: a.id, now: at("2026-11-03T00:00:00Z"), eligible: true });
    await castVote(db, { user: u2, projectId: b.id, reason: "saved my weekend", now: at("2026-11-04T00:00:00Z"), eligible: true });
    await castVote(db, { user: u3, projectId: b.id, now: at("2026-11-05T00:00:00Z"), eligible: true });

    const result = await closeVoting(db, "2026-11", null);
    expect(result.status).toBe("closed");
    if (result.status !== "closed") return;
    expect(result.winners).toHaveLength(1);
    expect(result.winners[0].projectId).toBe(b.id);
    expect(result.winners[0].month).toBe("2026-12");
    expect(result.winners[0].voteCount).toBe(2);
    expect(result.winners[0].amountCents).toBe(0);
    expect((await closeVoting(db, "2026-11", null)).status).toBe("already-closed");

    expect((await getFeaturedPicks(db, "2026-12"))[0]?.project.name).toBe("b");
    expect((await getFeaturedPicks(db, "2027-01"))[0]?.project.name).toBe("b");
    expect(await getFeaturedPicks(db, "2026-11")).toEqual([]);
    expect((await getVoteReasons(db, b.id, "2026-11")).map((r) => r.reason)).toEqual(["saved my weekend"]);
    expect(await getHallOfFame(db)).toHaveLength(1);

    // Winner leaves the ballot; the rest carry over with fresh votes.
    const ballot = await getBallot(db, "2026-12");
    expect(ballot.map((p) => p.name)).toEqual(["a"]);
    expect(ballot[0].votes).toBe(0);
  });

  it("breaks ties by whoever reached the count first", async () => {
    const { db, mkUser, mkProject } = await setup();
    const [u1, u2, u3, u4] = await Promise.all([mkUser(1), mkUser(2), mkUser(3), mkUser(4)]);
    const a = await mkProject("a", u1.id);
    const b = await mkProject("b", u1.id);
    await castVote(db, { user: u1, projectId: b.id, now: at("2026-11-03T00:00:00Z"), eligible: true });
    await castVote(db, { user: u2, projectId: b.id, now: at("2026-11-04T00:00:00Z"), eligible: true });
    await castVote(db, { user: u3, projectId: a.id, now: at("2026-11-05T00:00:00Z"), eligible: true });
    await castVote(db, { user: u4, projectId: a.id, now: at("2026-11-06T00:00:00Z"), eligible: true });
    const result = await closeVoting(db, "2026-11", null);
    expect(result.status === "closed" && result.winners[0].project.name).toBe("b");
  });

  it("ignores removed projects and handles months with no votes", async () => {
    const { db, mkUser, mkProject } = await setup();
    const u = await mkUser(1);
    const a = await mkProject("a", u.id);
    const empty = await closeVoting(db, "2026-10", null);
    expect(empty.status === "closed" && empty.winners.length).toBe(0);
    await castVote(db, { user: u, projectId: a.id, now: at("2026-11-03T00:00:00Z"), eligible: true });
    await setProjectStatus(db, a.id, "removed", at("2026-11-04T00:00:00Z"));
    const removed = await closeVoting(db, "2026-11", null);
    expect(removed.status === "closed" && removed.winners.length).toBe(0);
  });
});

describe("operator nominations", () => {
  it("can skip the monthly limit and go straight to approved", async () => {
    const { db, mkUser } = await setup();
    const op = await mkUser(9);
    const now = at("2026-11-10T00:00:00Z");
    for (const n of ["a", "b", "c", "d", "e"]) {
      const res = await nominate(db, { userId: op.id, repo: fakeRepo(`op-${n}`), now, status: "approved", skipLimit: true });
      expect(res.ok && res.value.project.status).toBe("approved");
    }
  });
});

describe("funded months", () => {
  async function ballot(n: number) {
    const ctx = await setup();
    const projects = [];
    for (let i = 0; i < n; i++) projects.push(await ctx.mkProject(`p${i}`, (await ctx.mkUser(100 + i)).id));
    return { ...ctx, projects };
  }
  // Give project i exactly `count` votes, cast at `day`.
  async function votesFor(ctx: Awaited<ReturnType<typeof ballot>>, projectIndex: number, count: number, day: number, base: number) {
    for (let v = 0; v < count; v++) {
      const u = await ctx.mkUser(base + v);
      await castVote(ctx.db, { user: u, projectId: ctx.projects[projectIndex].id, now: at(`2026-11-${String(day).padStart(2, "0")}T00:00:00Z`), eligible: true });
    }
  }

  it("makes one $200 winner per $200 in the pot, after the 5% share, and rolls over the rest", async () => {
    const ctx = await ballot(4);
    await votesFor(ctx, 0, 5, 3, 1000);
    await votesFor(ctx, 1, 3, 4, 2000);
    await votesFor(ctx, 2, 2, 5, 3000);
    await votesFor(ctx, 3, 1, 6, 4000);
    // $600 balance, $300 came in this month: 5% share is $15, pot $585, so 2 winners and $185 rolls over.
    const res = await closeVoting(ctx.db, "2026-11", { balanceCents: 60_000, netReceivedCents: 30_000 });
    expect(res.status).toBe("closed");
    if (res.status !== "closed") return;
    expect(res.round.operatorShareCents).toBe(1_500);
    expect(res.round.potCents).toBe(58_500);
    expect(res.winners.map((w) => [w.project.name, w.rank, w.amountCents])).toEqual([
      ["p0", 1, 20_000],
      ["p1", 2, 20_000],
    ]);
    expect(await outstandingCents(ctx.db)).toBe(41_500);
  });

  it("subtracts money still owed from earlier months, and stops once it's paid", async () => {
    const ctx = await ballot(2);
    await votesFor(ctx, 0, 2, 3, 1000);
    await closeVoting(ctx.db, "2026-10", { balanceCents: 21_000, netReceivedCents: 0 });
    // Nothing voted in October, so no winner and nothing owed.
    expect(await outstandingCents(ctx.db)).toBe(0);
    await closeVoting(ctx.db, "2026-11", { balanceCents: 21_000, netReceivedCents: 0 });
    expect(await outstandingCents(ctx.db)).toBe(20_000);
    expect((await listUnpaidPicks(ctx.db)).map((p) => p.project.name)).toEqual(["p0"]);

    // December: the $200 prize hasn't left the collective yet, so the balance still includes it.
    const userDec = await ctx.mkUser(5000);
    await castVote(ctx.db, { user: userDec, projectId: ctx.projects[1].id, now: at("2026-12-02T00:00:00Z"), eligible: true });
    const dec = await closeVoting(ctx.db, "2026-12", { balanceCents: 41_000, netReceivedCents: 20_000 });
    // 41,000 - 20,000 owed - 1,000 share = 20,000: exactly one winner.
    expect(dec.status === "closed" && dec.winners.map((w) => w.project.name)).toEqual(["p1"]);

    const [prize] = await listUnpaidPicks(ctx.db);
    await markPickPaid(ctx.db, prize.id, at("2026-12-05T00:00:00Z"));
    const [share] = await listUnpaidOperatorShares(ctx.db);
    await markOperatorSharePaid(ctx.db, share.id, at("2026-12-05T00:00:00Z"));
    expect(await outstandingCents(ctx.db)).toBe(20_000);
  });

  it("picks nobody and rolls everything over when the pot is under $200", async () => {
    const ctx = await ballot(1);
    await votesFor(ctx, 0, 3, 3, 1000);
    const res = await closeVoting(ctx.db, "2026-11", { balanceCents: 19_999, netReceivedCents: 0 });
    expect(res.status === "closed" && res.winners.length).toBe(0);
    expect(res.status === "closed" && res.round.potCents).toBe(19_999);
    // The project stays on the ballot for next month.
    expect((await getBallot(ctx.db, "2026-12")).map((p) => p.name)).toEqual(["p0"]);
  });

  it("breaks a tie at the cutoff by who reached the count first", async () => {
    const ctx = await ballot(3);
    await votesFor(ctx, 0, 3, 3, 1000);
    await votesFor(ctx, 2, 2, 4, 2000); // reaches 2 on the 4th
    await votesFor(ctx, 1, 2, 6, 3000); // reaches 2 on the 6th
    const res = await closeVoting(ctx.db, "2026-11", { balanceCents: 40_000, netReceivedCents: 0 });
    expect(res.status === "closed" && res.winners.map((w) => w.project.name)).toEqual(["p0", "p2"]);
  });

  it("never makes more winners than projects with votes", async () => {
    const ctx = await ballot(3);
    await votesFor(ctx, 1, 1, 3, 1000);
    const res = await closeVoting(ctx.db, "2026-11", { balanceCents: 100_000, netReceivedCents: 0 });
    expect(res.status === "closed" && res.winners.map((w) => w.project.name)).toEqual(["p1"]);
  });
});

describe("subscriber-only counting", () => {
  it("counts only votes from current subscribers when funded", async () => {
    const { db, mkUser, mkProject } = await setup();
    const sub = await mkUser(1);
    const lapsed = await mkUser(2);
    const never = await mkUser(3);
    const { linkOpenCollective } = await import("@/lib/core");
    await linkOpenCollective(db, sub.id, "sub", at("2026-11-01T00:00:00Z"));
    await linkOpenCollective(db, lapsed.id, "lapsed", at("2026-11-01T00:00:00Z"));
    const a = await mkProject("a", sub.id);
    const b = await mkProject("b", sub.id);
    const now = at("2026-11-10T00:00:00Z");
    await castVote(db, { user: sub, projectId: a.id, now, eligible: true });
    await castVote(db, { user: lapsed, projectId: b.id, now, eligible: true });
    await castVote(db, { user: never, projectId: b.id, now, eligible: true });

    const ballot = await getBallot(db, "2026-11", ["SUB"]);
    expect(ballot.map((p) => [p.name, p.votes])).toEqual([["a", 1], ["b", 0]]);
    expect((await getBallot(db, "2026-11", [])).every((p) => p.votes === 0)).toBe(true);

    const res = await closeVoting(db, "2026-11", { balanceCents: 20_000, netReceivedCents: 0 }, ["sub"]);
    expect(res.status === "closed" && res.winners.map((w) => [w.project.name, w.voteCount])).toEqual([["a", 1]]);
  });
});

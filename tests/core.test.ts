import { describe, expect, it } from "vitest";
import { votes } from "@/db/schema";
import {
  castVote,
  closeVoting,
  getBallot,
  getFeaturedPick,
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
    expect((await castVote(db, { user: u, projectId: a.id, reason: "  great   docs ", now })).ok).toBe(true);
    expect((await castVote(db, { user: u, projectId: b.id, now })).ok).toBe(true);
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

  it("rejects young accounts, pending projects and closed months", async () => {
    const { db, mkUser, mkProject } = await setup();
    const now = at("2026-11-15T00:00:00Z");
    const young = await mkUser(2, at("2026-11-01T00:00:00Z"));
    const u = await mkUser(1);
    const pending = await mkProject("pending", u.id, false);
    const a = await mkProject("a", u.id);
    expect((await castVote(db, { user: young, projectId: a.id, now })).ok).toBe(false);
    expect((await castVote(db, { user: u, projectId: pending.id, now })).ok).toBe(false);
    await castVote(db, { user: u, projectId: a.id, now });
    await closeVoting(db, "2026-11");
    const other = await mkUser(3);
    expect((await castVote(db, { user: other, projectId: a.id, now })).ok).toBe(false);
  });
});

describe("closing the month", () => {
  it("picks the most-voted project for next month and is idempotent", async () => {
    const { db, mkUser, mkProject } = await setup();
    const [u1, u2, u3] = await Promise.all([mkUser(1), mkUser(2), mkUser(3)]);
    const a = await mkProject("a", u1.id);
    const b = await mkProject("b", u1.id);
    await castVote(db, { user: u1, projectId: a.id, now: at("2026-11-03T00:00:00Z") });
    await castVote(db, { user: u2, projectId: b.id, reason: "saved my weekend", now: at("2026-11-04T00:00:00Z") });
    await castVote(db, { user: u3, projectId: b.id, now: at("2026-11-05T00:00:00Z") });

    const result = await closeVoting(db, "2026-11");
    expect(result.status).toBe("picked");
    if (result.status !== "picked") return;
    expect(result.pick.projectId).toBe(b.id);
    expect(result.pick.month).toBe("2026-12");
    expect(result.pick.voteCount).toBe(2);
    expect((await closeVoting(db, "2026-11")).status).toBe("already-closed");

    expect((await getFeaturedPick(db, "2026-12"))?.project.name).toBe("b");
    expect((await getFeaturedPick(db, "2027-01"))?.project.name).toBe("b");
    expect(await getFeaturedPick(db, "2026-11")).toBeNull();
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
    await castVote(db, { user: u1, projectId: b.id, now: at("2026-11-03T00:00:00Z") });
    await castVote(db, { user: u2, projectId: b.id, now: at("2026-11-04T00:00:00Z") });
    await castVote(db, { user: u3, projectId: a.id, now: at("2026-11-05T00:00:00Z") });
    await castVote(db, { user: u4, projectId: a.id, now: at("2026-11-06T00:00:00Z") });
    const result = await closeVoting(db, "2026-11");
    expect(result.status === "picked" && result.project.name).toBe("b");
  });

  it("ignores removed projects and handles months with no votes", async () => {
    const { db, mkUser, mkProject } = await setup();
    const u = await mkUser(1);
    const a = await mkProject("a", u.id);
    expect((await closeVoting(db, "2026-10")).status).toBe("no-votes");
    await castVote(db, { user: u, projectId: a.id, now: at("2026-11-03T00:00:00Z") });
    await setProjectStatus(db, a.id, "removed", at("2026-11-04T00:00:00Z"));
    expect((await closeVoting(db, "2026-11")).status).toBe("no-votes");
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

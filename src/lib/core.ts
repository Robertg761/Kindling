import { and, asc, desc, eq, gte, inArray, isNotNull, lt, notInArray, sql } from "drizzle-orm";
import { picks, projects, users, votes, type PickRow, type Project, type User } from "@/db/schema";
import type { Db } from "@/db/types";
import type { VerifiedRepo } from "./github";
import { monthOf, nextMonth, type Month } from "./month";

export const MIN_ACCOUNT_AGE_DAYS = 30;
export const NOMINATIONS_PER_MONTH = 3;
export const REASON_MAX = 140;
const DAY_MS = 24 * 60 * 60 * 1000;

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; reason: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

// ---------- Users ----------

export async function upsertUser(
  db: Db,
  input: { githubId: string; login: string; avatarUrl: string | null; githubCreatedAt: Date },
): Promise<User> {
  const [row] = await db
    .insert(users)
    .values(input)
    .onConflictDoUpdate({
      target: users.githubId,
      set: { login: input.login, avatarUrl: input.avatarUrl, githubCreatedAt: input.githubCreatedAt },
    })
    .returning();
  return row;
}

export async function getUserByGithubId(db: Db, githubId: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.githubId, githubId)).limit(1);
  return row ?? null;
}

export function accountOldEnough(user: Pick<User, "githubCreatedAt">, now: Date): boolean {
  return now.getTime() - user.githubCreatedAt.getTime() >= MIN_ACCOUNT_AGE_DAYS * DAY_MS;
}

// ---------- Projects ----------

export async function getProjectBySlug(db: Db, owner: string, name: string): Promise<Project | null> {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(sql`lower(${projects.owner}) = lower(${owner})`, sql`lower(${projects.name}) = lower(${name})`))
    .limit(1);
  return row ?? null;
}

export async function nominationsThisMonth(db: Db, userId: number, now: Date): Promise<number> {
  const month = monthOf(now);
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(`${nextMonth(month)}-01T00:00:00Z`);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(projects)
    .where(and(eq(projects.nominatedBy, userId), gte(projects.createdAt, start), lt(projects.createdAt, end)));
  return row?.n ?? 0;
}

export async function findExistingProject(db: Db, repo: Pick<VerifiedRepo, "githubRepoId" | "owner" | "name">) {
  const [byId] = await db.select().from(projects).where(eq(projects.githubRepoId, repo.githubRepoId)).limit(1);
  return byId ?? (await getProjectBySlug(db, repo.owner, repo.name));
}

export type NominateOutcome = { project: Project; created: boolean };

/** Stores a verified repository as a pending nomination. Returns the existing row if it was already nominated. */
export async function nominate(
  db: Db,
  input: { userId: number | null; repo: VerifiedRepo; now: Date; status?: "pending" | "approved" },
): Promise<Result<NominateOutcome>> {
  const existing = await findExistingProject(db, input.repo);
  if (existing) return ok({ project: existing, created: false });

  // A null user is the operator seeding projects by hand, which skips the monthly limit.
  if (input.userId !== null && (await nominationsThisMonth(db, input.userId, input.now)) >= NOMINATIONS_PER_MONTH) {
    return fail(`You've used all ${NOMINATIONS_PER_MONTH} nominations for this month. More open up on the 1st.`);
  }

  const { repo } = input;
  const inserted = await db
    .insert(projects)
    .values({
      githubRepoId: repo.githubRepoId,
      owner: repo.owner,
      name: repo.name,
      description: repo.description,
      stars: repo.stars,
      language: repo.language,
      lastPushAt: repo.lastPushAt,
      fundingLinks: repo.fundingLinks,
      status: input.status ?? "pending",
      nominatedBy: input.userId,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return ok({ project: inserted[0], created: true });

  // Lost a race with another nomination of the same repo.
  const raced = await findExistingProject(db, repo);
  return raced ? ok({ project: raced, created: false }) : fail("Couldn't save that nomination. Try again.");
}

export async function refreshProject(db: Db, projectId: number, repo: VerifiedRepo, now: Date) {
  await db
    .update(projects)
    .set({
      owner: repo.owner,
      name: repo.name,
      description: repo.description,
      stars: repo.stars,
      language: repo.language,
      lastPushAt: repo.lastPushAt,
      fundingLinks: repo.fundingLinks,
      updatedAt: now,
    })
    .where(eq(projects.id, projectId));
}

export async function setProjectStatus(db: Db, projectId: number, status: Project["status"], now: Date) {
  await db.update(projects).set({ status, updatedAt: now }).where(eq(projects.id, projectId));
}

export async function listProjectsByStatus(db: Db, status: Project["status"]) {
  return db.select().from(projects).where(eq(projects.status, status)).orderBy(asc(projects.createdAt));
}

/** Project IDs that have already been a Kindling Pick. Past winners leave the ballot. */
async function pastWinnerIds(db: Db): Promise<number[]> {
  const rows = await db.selectDistinct({ id: picks.projectId }).from(picks);
  return rows.map((r) => r.id);
}

export async function isPastWinner(db: Db, projectId: number): Promise<boolean> {
  const [row] = await db.select({ id: picks.id }).from(picks).where(eq(picks.projectId, projectId)).limit(1);
  return Boolean(row);
}

// ---------- Voting ----------

export type BallotEntry = Project & { votes: number };

/** Approved projects that can be voted on, with this month's vote counts, most votes first. */
export async function getBallot(db: Db, month: Month): Promise<BallotEntry[]> {
  const winners = await pastWinnerIds(db);
  const counts = db
    .select({ projectId: votes.projectId, n: sql<number>`count(*)::int`.as("n") })
    .from(votes)
    .where(eq(votes.month, month))
    .groupBy(votes.projectId)
    .as("counts");
  const rows = await db
    .select({ project: projects, votes: sql<number>`coalesce(${counts.n}, 0)::int` })
    .from(projects)
    .leftJoin(counts, eq(counts.projectId, projects.id))
    .where(and(eq(projects.status, "approved"), winners.length ? notInArray(projects.id, winners) : undefined))
    .orderBy(desc(sql`coalesce(${counts.n}, 0)`), desc(projects.stars), asc(projects.id));
  return rows.map((r) => ({ ...r.project, votes: r.votes }));
}

export async function getVoteCount(db: Db, projectId: number, month: Month): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(votes)
    .where(and(eq(votes.projectId, projectId), eq(votes.month, month)));
  return row?.n ?? 0;
}

export async function getUserVote(db: Db, userId: number, month: Month) {
  const [row] = await db
    .select()
    .from(votes)
    .where(and(eq(votes.userId, userId), eq(votes.month, month)))
    .limit(1);
  return row ?? null;
}

export async function isVoteClosed(db: Db, month: Month): Promise<boolean> {
  const [row] = await db.select({ id: picks.id }).from(picks).where(eq(picks.voteMonth, month)).limit(1);
  return Boolean(row);
}

export async function castVote(
  db: Db,
  input: { user: User; projectId: number; reason?: string | null; now: Date },
): Promise<Result<undefined>> {
  const { user, projectId, now } = input;
  const month = monthOf(now);
  if (!accountOldEnough(user, now)) {
    return fail(`GitHub accounts need to be at least ${MIN_ACCOUNT_AGE_DAYS} days old to vote. This keeps the vote fair.`);
  }
  if (await isVoteClosed(db, month)) return fail("This month's vote is already closed. Voting reopens on the 1st.");

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project || project.status !== "approved") return fail("That project isn't on the ballot.");
  if (await isPastWinner(db, projectId)) return fail("That project has already been a Kindling Pick.");

  const reason = input.reason?.trim().replace(/\s+/g, " ").slice(0, REASON_MAX) || null;
  await db
    .insert(votes)
    .values({ userId: user.id, projectId, month, reason, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [votes.userId, votes.month],
      set: { projectId, reason, updatedAt: now },
    });
  return ok(undefined);
}

export async function withdrawVote(db: Db, input: { userId: number; now: Date }): Promise<Result<undefined>> {
  const month = monthOf(input.now);
  if (await isVoteClosed(db, month)) return fail("This month's vote is already closed.");
  await db.delete(votes).where(and(eq(votes.userId, input.userId), eq(votes.month, month)));
  return ok(undefined);
}

// ---------- Closing the month ----------

export type CloseOutcome =
  | { status: "picked"; pick: PickRow; project: Project }
  | { status: "already-closed"; pick: PickRow }
  | { status: "no-votes" };

/**
 * Closes the vote for `voteMonth`. The approved project with the most votes becomes
 * the Kindling Pick for the following month. Ties go to the project that reached its
 * final count first (its latest counted vote is the oldest). Safe to run twice.
 */
export async function closeVoting(db: Db, voteMonth: Month): Promise<CloseOutcome> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(picks).where(eq(picks.voteMonth, voteMonth)).limit(1);
    if (existing) return { status: "already-closed", pick: existing } as const;

    const winners = await tx.selectDistinct({ id: picks.projectId }).from(picks);
    const excluded = winners.map((w) => w.id);
    const [top] = await tx
      .select({
        projectId: votes.projectId,
        n: sql<number>`count(*)::int`,
        reachedAt: sql<Date>`max(${votes.updatedAt})`,
      })
      .from(votes)
      .innerJoin(projects, eq(projects.id, votes.projectId))
      .where(
        and(
          eq(votes.month, voteMonth),
          eq(projects.status, "approved"),
          excluded.length ? notInArray(votes.projectId, excluded) : undefined,
        ),
      )
      .groupBy(votes.projectId)
      .orderBy(desc(sql`count(*)`), asc(sql`max(${votes.updatedAt})`), asc(votes.projectId))
      .limit(1);
    if (!top) return { status: "no-votes" } as const;

    const inserted = await tx
      .insert(picks)
      .values({ month: nextMonth(voteMonth), voteMonth, projectId: top.projectId, voteCount: top.n })
      .onConflictDoNothing()
      .returning();
    if (!inserted[0]) {
      const [raced] = await tx.select().from(picks).where(eq(picks.voteMonth, voteMonth)).limit(1);
      return { status: "already-closed", pick: raced } as const;
    }
    const [project] = await tx.select().from(projects).where(eq(projects.id, top.projectId)).limit(1);
    return { status: "picked", pick: inserted[0], project } as const;
  });
}

// ---------- Picks ----------

export type PickWithProject = PickRow & { project: Project };

/** The pick featured during `month`, or the most recent earlier one if a month had no votes. */
export async function getFeaturedPick(db: Db, month: Month): Promise<PickWithProject | null> {
  const [row] = await db
    .select({ pick: picks, project: projects })
    .from(picks)
    .innerJoin(projects, eq(projects.id, picks.projectId))
    .where(sql`${picks.month} <= ${month}`)
    .orderBy(desc(picks.month))
    .limit(1);
  return row ? { ...row.pick, project: row.project } : null;
}

export async function getHallOfFame(db: Db): Promise<PickWithProject[]> {
  const rows = await db
    .select({ pick: picks, project: projects })
    .from(picks)
    .innerJoin(projects, eq(projects.id, picks.projectId))
    .orderBy(desc(picks.month));
  return rows.map((r) => ({ ...r.pick, project: r.project }));
}

export async function getPicksForProject(db: Db, projectId: number) {
  return db.select().from(picks).where(eq(picks.projectId, projectId)).orderBy(desc(picks.month));
}

/** Reasons voters left for a project in a given vote month. */
export async function getVoteReasons(db: Db, projectId: number, month: Month, limit = 12) {
  return db
    .select({ reason: votes.reason, login: users.login, avatarUrl: users.avatarUrl })
    .from(votes)
    .innerJoin(users, eq(users.id, votes.userId))
    .where(and(eq(votes.projectId, projectId), eq(votes.month, month), isNotNull(votes.reason)))
    .orderBy(desc(votes.updatedAt))
    .limit(limit);
}

export async function getUsersByIds(db: Db, ids: number[]) {
  if (!ids.length) return [];
  return db.select().from(users).where(inArray(users.id, ids));
}

export async function getPickByVoteMonth(db: Db, voteMonth: Month): Promise<PickWithProject | null> {
  const [row] = await db
    .select({ pick: picks, project: projects })
    .from(picks)
    .innerJoin(projects, eq(projects.id, picks.projectId))
    .where(eq(picks.voteMonth, voteMonth))
    .limit(1);
  return row ? { ...row.pick, project: row.project } : null;
}

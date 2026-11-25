import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, notInArray, sql } from "drizzle-orm";
import { picks, projects, rounds, users, votes, type PickRow, type Project, type Round, type User } from "@/db/schema";
import type { Db } from "@/db/types";
import type { VerifiedRepo } from "./github";
import { breakdown, PRIZE_CENTS, type FundingSnapshot } from "./money";
import { addMonths, monthOf, nextMonth, type Month } from "./month";

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
  input: { userId: number | null; repo: VerifiedRepo; now: Date; status?: "pending" | "approved"; skipLimit?: boolean },
): Promise<Result<NominateOutcome>> {
  const existing = await findExistingProject(db, input.repo);
  if (existing) return ok({ project: existing, created: false });

  // Operators (and the seed script, which has no user) skip the monthly limit.
  if (!input.skipLimit && input.userId !== null && (await nominationsThisMonth(db, input.userId, input.now)) >= NOMINATIONS_PER_MONTH) {
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

/** How long a project that won a prize stays off the ballot, counted in vote months. */
export const WINNER_COOLDOWN_MONTHS = 12;

/**
 * Projects that won a paid prize in the last 12 vote months sit out `voteMonth`'s ballot. A
 * practice-mode pick (no money) never keeps a project out. A project that won the November 2026
 * vote is back on the ballot for the November 2027 vote.
 */
function recentPaidWin(voteMonth: Month) {
  return and(gt(picks.amountCents, 0), gt(picks.voteMonth, addMonths(voteMonth, -WINNER_COOLDOWN_MONTHS)), lt(picks.voteMonth, voteMonth));
}

async function pastWinnerIds(db: Db, voteMonth: Month): Promise<number[]> {
  const rows = await db.selectDistinct({ id: picks.projectId }).from(picks).where(recentPaidWin(voteMonth));
  return rows.map((r) => r.id);
}

export async function isPastWinner(db: Db, projectId: number, voteMonth: Month): Promise<boolean> {
  const [row] = await db.select({ id: picks.id }).from(picks).where(and(eq(picks.projectId, projectId), recentPaidWin(voteMonth))).limit(1);
  return Boolean(row);
}

// ---------- Voting ----------

export type BallotEntry = Project & { votes: number };

/**
 * Approved projects that can be voted on, with this month's vote counts, most votes first.
 * With `voterSlugs`, only votes from members whose linked Open Collective profile is in the list
 * count (current subscribers). Without it, every vote counts (practice mode).
 */
export async function getBallot(db: Db, month: Month, voterSlugs?: string[] | null): Promise<BallotEntry[]> {
  const winners = await pastWinnerIds(db, month);
  const counts = db
    .select({ projectId: votes.projectId, n: sql<number>`count(*)::int`.as("n") })
    .from(votes)
    .innerJoin(users, eq(users.id, votes.userId))
    .where(and(eq(votes.month, month), voterFilter(voterSlugs)))
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

function voterFilter(voterSlugs?: string[] | null) {
  if (!voterSlugs) return undefined;
  if (voterSlugs.length === 0) return sql`false`;
  return inArray(sql`lower(${users.ocSlug})`, voterSlugs.map((s) => s.toLowerCase()));
}

export async function getVoteCount(db: Db, projectId: number, month: Month, voterSlugs?: string[] | null): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(votes)
    .innerJoin(users, eq(users.id, votes.userId))
    .where(and(eq(votes.projectId, projectId), eq(votes.month, month), voterFilter(voterSlugs)));
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
  const [row] = await db.select({ id: rounds.id }).from(rounds).where(eq(rounds.voteMonth, month)).limit(1);
  return Boolean(row);
}

/**
 * Records a vote. `eligible` is decided by the caller (subscriber check, or account age in
 * practice mode): pass true, or a sentence explaining why this member can't vote.
 */
export async function castVote(
  db: Db,
  input: { user: User; projectId: number; reason?: string | null; now: Date; eligible: true | string },
): Promise<Result<undefined>> {
  const { user, projectId, now } = input;
  const month = monthOf(now);
  if (input.eligible !== true) return fail(input.eligible);
  if (await isVoteClosed(db, month)) return fail("This month's vote is already closed. Voting reopens on the 1st.");

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project || project.status !== "approved") return fail("That project isn't on the ballot.");
  if (await isPastWinner(db, projectId, month)) return fail("That project won a prize in the last 12 months, so it's sitting this one out.");

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

// ---------- Money owed ----------

/** Prizes and operator shares that were awarded but not yet paid out of the collective. */
export async function outstandingCents(db: Db): Promise<number> {
  const [prizes] = await db
    .select({ n: sql<number>`coalesce(sum(${picks.amountCents}), 0)::int` })
    .from(picks)
    .where(isNull(picks.paidAt));
  const [shares] = await db
    .select({ n: sql<number>`coalesce(sum(${rounds.operatorShareCents}), 0)::int` })
    .from(rounds)
    .where(isNull(rounds.operatorPaidAt));
  return (prizes?.n ?? 0) + (shares?.n ?? 0);
}

export async function listUnpaidPicks(db: Db): Promise<PickWithProject[]> {
  const rows = await db
    .select({ pick: picks, project: projects })
    .from(picks)
    .innerJoin(projects, eq(projects.id, picks.projectId))
    .where(and(isNull(picks.paidAt), sql`${picks.amountCents} > 0`))
    .orderBy(asc(picks.month), asc(picks.rank));
  return rows.map((r) => ({ ...r.pick, project: r.project }));
}

export async function listUnpaidOperatorShares(db: Db): Promise<Round[]> {
  return db
    .select()
    .from(rounds)
    .where(and(isNull(rounds.operatorPaidAt), sql`${rounds.operatorShareCents} > 0`))
    .orderBy(asc(rounds.voteMonth));
}

export async function markPickPaid(db: Db, pickId: number, now: Date) {
  await db.update(picks).set({ paidAt: now }).where(and(eq(picks.id, pickId), isNull(picks.paidAt)));
}

export async function markOperatorSharePaid(db: Db, roundId: number, now: Date) {
  await db.update(rounds).set({ operatorPaidAt: now }).where(and(eq(rounds.id, roundId), isNull(rounds.operatorPaidAt)));
}

// ---------- Closing the month ----------

export type CloseOutcome =
  | { status: "closed"; round: Round; winners: PickWithProject[] }
  | { status: "already-closed"; round: Round };

/**
 * Closes the vote for `voteMonth`.
 *
 * Only votes from current subscribers count when funded (pass their Open Collective slugs), so
 * a lapsed subscription, or a vote cast in practice mode by someone who never subscribed, doesn't.
 *
 * With funding (the Open Collective snapshot at closing time), every $200 left in the pot after
 * money already owed and the operator's 5% becomes one winner, taken from the top of the vote.
 * Ties go to the project that reached its final count first. Leftover money stays in the
 * collective and rolls into next month. Without funding (practice mode, before the collective
 * exists) the single most-voted project is picked with no prize.
 *
 * A round row is always written, so a month with no winners still records its rollover. Safe to
 * run twice.
 */
export async function closeVoting(
  db: Db,
  voteMonth: Month,
  funding: FundingSnapshot | null,
  /** With funding: Open Collective slugs of current subscribers. Only their votes count. */
  voterSlugs: string[] | null = null,
): Promise<CloseOutcome> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(rounds).where(eq(rounds.voteMonth, voteMonth)).limit(1);
    if (existing) return { status: "already-closed", round: existing } as const;

    const owed = funding ? await outstandingCents(tx as unknown as Db) : 0;
    const money = funding ? breakdown(funding, owed) : null;
    const slots = money ? money.slots : 1;

    const excluded = await pastWinnerIds(tx as unknown as Db, voteMonth);
    const ranked =
      slots > 0
        ? await tx
            .select({ projectId: votes.projectId, n: sql<number>`count(*)::int` })
            .from(votes)
            .innerJoin(projects, eq(projects.id, votes.projectId))
            .innerJoin(users, eq(users.id, votes.userId))
            .where(
              and(
                eq(votes.month, voteMonth),
                voterFilter(money ? voterSlugs : null),
                eq(projects.status, "approved"),
                excluded.length ? notInArray(votes.projectId, excluded) : undefined,
              ),
            )
            .groupBy(votes.projectId)
            .orderBy(desc(sql`count(*)`), asc(sql`max(${votes.updatedAt})`), asc(votes.projectId))
            .limit(slots)
        : [];

    const inserted = await tx
      .insert(rounds)
      .values({
        voteMonth,
        month: nextMonth(voteMonth),
        funded: Boolean(money),
        balanceCents: money?.balanceCents ?? 0,
        outstandingCents: money?.outstandingCents ?? 0,
        operatorShareCents: money?.operatorShareCents ?? 0,
        potCents: money?.potCents ?? 0,
        winners: ranked.length,
      })
      .onConflictDoNothing()
      .returning();
    if (!inserted[0]) {
      const [raced] = await tx.select().from(rounds).where(eq(rounds.voteMonth, voteMonth)).limit(1);
      return { status: "already-closed", round: raced } as const;
    }

    if (ranked.length) {
      await tx.insert(picks).values(
        ranked.map((r, i) => ({
          month: nextMonth(voteMonth),
          voteMonth,
          projectId: r.projectId,
          rank: i + 1,
          voteCount: r.n,
          amountCents: money ? PRIZE_CENTS : 0,
        })),
      );
    }
    const picked = await tx
      .select({ pick: picks, project: projects })
      .from(picks)
      .innerJoin(projects, eq(projects.id, picks.projectId))
      .where(eq(picks.voteMonth, voteMonth))
      .orderBy(asc(picks.rank));
    return {
      status: "closed",
      round: inserted[0],
      winners: picked.map((r) => ({ ...r.pick, project: r.project })),
    } as const;
  });
}

// ---------- Picks ----------

export type PickWithProject = PickRow & { project: Project };

/** The picks featured during `month`, or the most recent earlier ones if a month had no winners. */
export async function getFeaturedPicks(db: Db, month: Month): Promise<PickWithProject[]> {
  const [latest] = await db
    .select({ month: picks.month })
    .from(picks)
    .where(sql`${picks.month} <= ${month}`)
    .orderBy(desc(picks.month))
    .limit(1);
  if (!latest) return [];
  const rows = await db
    .select({ pick: picks, project: projects })
    .from(picks)
    .innerJoin(projects, eq(projects.id, picks.projectId))
    .where(eq(picks.month, latest.month))
    .orderBy(asc(picks.rank));
  return rows.map((r) => ({ ...r.pick, project: r.project }));
}

export async function getHallOfFame(db: Db): Promise<PickWithProject[]> {
  const rows = await db
    .select({ pick: picks, project: projects })
    .from(picks)
    .innerJoin(projects, eq(projects.id, picks.projectId))
    .orderBy(desc(picks.month), asc(picks.rank));
  return rows.map((r) => ({ ...r.pick, project: r.project }));
}

export async function getRounds(db: Db, limit = 12): Promise<Round[]> {
  return db.select().from(rounds).orderBy(desc(rounds.voteMonth)).limit(limit);
}

export async function getRound(db: Db, voteMonth: Month): Promise<{ round: Round; winners: PickWithProject[] } | null> {
  const [round] = await db.select().from(rounds).where(eq(rounds.voteMonth, voteMonth)).limit(1);
  if (!round) return null;
  const rows = await db
    .select({ pick: picks, project: projects })
    .from(picks)
    .innerJoin(projects, eq(projects.id, picks.projectId))
    .where(eq(picks.voteMonth, voteMonth))
    .orderBy(asc(picks.rank));
  return { round, winners: rows.map((r) => ({ ...r.pick, project: r.project })) };
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

// ---------- Open Collective link ----------

export async function linkOpenCollective(db: Db, userId: number, ocSlug: string | null, now: Date): Promise<Result<undefined>> {
  if (ocSlug) {
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.ocSlug, ocSlug)).limit(1);
    if (taken && taken.id !== userId) return fail("That Open Collective profile is already linked to another Kindling account.");
  }
  await db
    .update(users)
    .set({ ocSlug, ocLinkedAt: ocSlug ? now : null })
    .where(eq(users.id, userId));
  return ok(undefined);
}

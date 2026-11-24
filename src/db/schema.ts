import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export type FundingLink = {
  platform: string;
  label: string;
  url: string;
};

export const PROJECT_STATUSES = ["pending", "approved", "removed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

const MONTH_PATTERN = "^[0-9]{4}-(0[1-9]|1[0-2])$";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  githubId: text("github_id").notNull().unique(),
  login: text("login").notNull(),
  avatarUrl: text("avatar_url"),
  githubCreatedAt: timestamp("github_created_at", { withTimezone: true }).notNull(),
  /** The member's Open Collective profile, proven by a GitHub link on that profile. */
  ocSlug: text("oc_slug").unique(),
  ocLinkedAt: timestamp("oc_linked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    githubRepoId: text("github_repo_id").notNull().unique(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    stars: integer("stars").notNull().default(0),
    language: text("language"),
    lastPushAt: timestamp("last_push_at", { withTimezone: true }),
    fundingLinks: jsonb("funding_links").$type<FundingLink[]>().notNull().default([]),
    status: text("status").$type<ProjectStatus>().notNull().default("pending"),
    nominatedBy: integer("nominated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("projects_status_check", sql`${t.status} in ('pending', 'approved', 'removed')`),
    uniqueIndex("projects_slug_idx").on(sql`lower(${t.owner})`, sql`lower(${t.name})`),
    index("projects_nominated_by_idx").on(t.nominatedBy, t.createdAt),
  ],
);

export const votes = pgTable(
  "votes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    month: varchar("month", { length: 7 }).notNull(),
    reason: varchar("reason", { length: 140 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("votes_one_per_user_per_month").on(t.userId, t.month),
    index("votes_month_project_idx").on(t.month, t.projectId),
    check("votes_month_format", sql`${t.month} ~ ${sql.raw(`'${MONTH_PATTERN}'`)}`),
  ],
);

/**
 * One row per closed vote. Votes cast during `voteMonth` decide the picks featured during
 * `month` (the following calendar month). Money figures are a snapshot of the Open Collective
 * pot at closing time, in US cents.
 */
export const rounds = pgTable(
  "rounds",
  {
    id: serial("id").primaryKey(),
    voteMonth: varchar("vote_month", { length: 7 }).notNull().unique(),
    month: varchar("month", { length: 7 }).notNull().unique(),
    funded: boolean("funded").notNull(),
    balanceCents: integer("balance_cents").notNull().default(0),
    outstandingCents: integer("outstanding_cents").notNull().default(0),
    operatorShareCents: integer("operator_share_cents").notNull().default(0),
    potCents: integer("pot_cents").notNull().default(0),
    winners: integer("winners").notNull().default(0),
    operatorPaidAt: timestamp("operator_paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("rounds_month_format", sql`${t.month} ~ ${sql.raw(`'${MONTH_PATTERN}'`)}`),
    check("rounds_vote_month_format", sql`${t.voteMonth} ~ ${sql.raw(`'${MONTH_PATTERN}'`)}`),
    check("rounds_money_nonnegative", sql`${t.balanceCents} >= 0 and ${t.outstandingCents} >= 0 and ${t.operatorShareCents} >= 0 and ${t.potCents} >= 0 and ${t.winners} >= 0`),
  ],
);

/** A winning project. A round can have several, one per $200 in the pot. */
export const picks = pgTable(
  "picks",
  {
    id: serial("id").primaryKey(),
    month: varchar("month", { length: 7 }).notNull(),
    voteMonth: varchar("vote_month", { length: 7 }).notNull(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    rank: integer("rank").notNull().default(1),
    voteCount: integer("vote_count").notNull(),
    amountCents: integer("amount_cents").notNull().default(0),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("picks_one_project_per_round").on(t.voteMonth, t.projectId),
    uniqueIndex("picks_one_rank_per_round").on(t.voteMonth, t.rank),
    check("picks_month_format", sql`${t.month} ~ ${sql.raw(`'${MONTH_PATTERN}'`)}`),
    check("picks_vote_month_format", sql`${t.voteMonth} ~ ${sql.raw(`'${MONTH_PATTERN}'`)}`),
    check("picks_vote_count_positive", sql`${t.voteCount} > 0`),
    check("picks_amount_nonnegative", sql`${t.amountCents} >= 0`),
  ],
);

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Vote = typeof votes.$inferSelect;
export type PickRow = typeof picks.$inferSelect;
export type Round = typeof rounds.$inferSelect;

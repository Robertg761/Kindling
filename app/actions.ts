"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { getCurrentUser, isOperator } from "@/lib/auth";
import {
  castVote,
  closeVoting,
  linkOpenCollective,
  markOperatorSharePaid,
  markPickPaid,
  nominate,
  refreshProject,
  setProjectStatus,
  withdrawVote,
} from "@/lib/core";
import { currentVoterSlugs, subscriptionStatus, votingEligibility } from "@/lib/eligibility";
import { formatUsd } from "@/lib/money";
import { clearOpenCollectiveCache, collectiveSlug, getFunding, getProfile, getSubscribers, OpenCollectiveError, parseProfileInput } from "@/lib/opencollective";

async function getSubscribersFresh(slug: string) {
  clearOpenCollectiveCache();
  return getSubscribers(slug);
}
import { verifyRepository } from "@/lib/github";
import { formatMonth, isMonth, monthOf, nextMonth } from "@/lib/month";
import { eq } from "drizzle-orm";

export type FormState = { error?: string; message?: string } | null;

function projectPath(p: { owner: string; name: string }) {
  return `/p/${encodeURIComponent(p.owner)}/${encodeURIComponent(p.name)}`;
}

function refreshPages(extra?: string) {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/hall");
  if (extra) revalidatePath(extra);
}

// ---------- Members ----------

export async function nominateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in with GitHub to nominate a project." };
  const url = String(formData.get("url") ?? "");

  const verified = await verifyRepository(url);
  if (!verified.ok) return { error: verified.reason };

  // Operator nominations go straight onto the ballot and skip the monthly limit.
  const operator = isOperator(user);
  const result = await nominate(getDb(), {
    userId: user.id,
    repo: verified.repo,
    now: new Date(),
    status: operator ? "approved" : "pending",
    skipLimit: operator,
  });
  if (!result.ok) return { error: result.reason };

  const { project, created } = result.value;
  refreshPages(projectPath(project));
  redirect(`${projectPath(project)}?${created ? "nominated" : "exists"}=1`);
}

export async function voteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in with GitHub to vote." };
  const projectId = Number(formData.get("projectId"));
  if (!Number.isInteger(projectId) || projectId <= 0) return { error: "That project isn't on the ballot." };

  const now = new Date();
  const eligible = votingEligibility(user, await subscriptionStatus(user), now);
  const result = await castVote(getDb(), { user, projectId, reason: String(formData.get("reason") ?? ""), now, eligible });
  if (!result.ok) return { error: result.reason };

  const [project] = await getDb().select().from(projects).where(eq(projects.id, projectId)).limit(1);
  refreshPages(project ? projectPath(project) : undefined);
  return { message: `Vote saved. You can change it until ${formatMonth(monthOf(now))} ends.` };
}

export async function withdrawVoteAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await withdrawVote(getDb(), { userId: user.id, now: new Date() });
  refreshPages();
}

export async function linkOpenCollectiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in with GitHub first." };
  const slug = parseProfileInput(String(formData.get("profile") ?? ""));
  if (!slug) return { error: "Paste your Open Collective profile link, like https://opencollective.com/your-name." };

  let profile;
  try {
    profile = await getProfile(slug);
  } catch (error) {
    return { error: error instanceof OpenCollectiveError ? `${error.message} Try again in a minute.` : "Couldn't reach Open Collective." };
  }
  if (!profile) return { error: `There's no Open Collective profile at opencollective.com/${slug}.` };
  if (!profile.githubLogins.includes(user.login.toLowerCase())) {
    return {
      error: `To prove it's yours, add https://github.com/${user.login} to the links on your Open Collective profile, then try again.`,
    };
  }
  const linked = await linkOpenCollective(getDb(), user.id, profile.slug.toLowerCase(), new Date());
  if (!linked.ok) return { error: linked.reason };
  refreshPages("/subscribe");
  return { message: `Linked to opencollective.com/${profile.slug}.` };
}

export async function unlinkOpenCollectiveAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await linkOpenCollective(getDb(), user.id, null, new Date());
  refreshPages("/subscribe");
}

// ---------- Operator ----------

async function requireOperator() {
  const user = await getCurrentUser();
  if (!isOperator(user)) throw new Error("Not allowed.");
  return user!;
}

async function loadProject(formData: FormData) {
  const id = Number(formData.get("projectId"));
  if (!Number.isInteger(id) || id <= 0) return null;
  const [project] = await getDb().select().from(projects).where(eq(projects.id, id)).limit(1);
  return project ?? null;
}

export async function approveAction(formData: FormData): Promise<void> {
  await requireOperator();
  const project = await loadProject(formData);
  if (!project) return;
  const now = new Date();
  // Refresh stars, description and funding links if GitHub is reachable. The operator's call stands either way.
  const verified = await verifyRepository(`${project.owner}/${project.name}`, { now });
  if (verified.ok && verified.repo.githubRepoId === project.githubRepoId) {
    await refreshProject(getDb(), project.id, verified.repo, now);
  }
  await setProjectStatus(getDb(), project.id, "approved", now);
  refreshPages(projectPath(project));
}

export async function removeAction(formData: FormData): Promise<void> {
  await requireOperator();
  const project = await loadProject(formData);
  if (!project) return;
  await setProjectStatus(getDb(), project.id, "removed", new Date());
  refreshPages(projectPath(project));
}

export async function restoreAction(formData: FormData): Promise<void> {
  await requireOperator();
  const project = await loadProject(formData);
  if (!project) return;
  await setProjectStatus(getDb(), project.id, "pending", new Date());
  refreshPages(projectPath(project));
}

export async function closeMonthAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireOperator();
  const month = String(formData.get("month") ?? "");
  if (!isMonth(month) || month > monthOf(new Date())) return { error: "You can only close the current month or an earlier one." };

  const slug = collectiveSlug();
  let funding = null;
  let voterSlugs: string[] | null = null;
  if (slug) {
    try {
      funding = await getFunding(slug, month, { fresh: true });
      clearOpenCollectiveCache();
      voterSlugs = await currentVoterSlugs();
    } catch (error) {
      return { error: `Couldn't read the pot from Open Collective, so nothing was closed. ${error instanceof Error ? error.message : ""}` };
    }
  }
  const outcome = await closeVoting(getDb(), month, funding, voterSlugs);
  refreshPages();
  if (outcome.status === "already-closed") return { message: `${formatMonth(month)} was already closed.` };
  const { round, winners } = outcome;
  if (winners.length === 0) {
    return {
      message: round.funded
        ? `${formatMonth(month)} closed with no winners. ${formatUsd(round.potCents)} rolls over to next month.`
        : `${formatMonth(month)} closed. Nobody voted, so there's no pick.`,
    };
  }
  const names = winners.map((w) => `${w.project.owner}/${w.project.name}`).join(", ");
  return {
    message: round.funded
      ? `${formatMonth(month)} closed. ${names} won ${formatUsd(winners[0].amountCents)} each for ${formatMonth(nextMonth(month))}.`
      : `${names} is the Kindling Pick for ${formatMonth(nextMonth(month))}.`,
  };
}

export async function markPickPaidAction(formData: FormData): Promise<void> {
  await requireOperator();
  const id = Number(formData.get("pickId"));
  if (Number.isInteger(id) && id > 0) await markPickPaid(getDb(), id, new Date());
  refreshPages();
}

export async function markOperatorSharePaidAction(formData: FormData): Promise<void> {
  await requireOperator();
  const id = Number(formData.get("roundId"));
  if (Number.isInteger(id) && id > 0) await markOperatorSharePaid(getDb(), id, new Date());
  refreshPages();
}

/** Runs each Open Collective query against a collective and reports what came back. */
export async function checkOpenCollectiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireOperator();
  const slug = parseProfileInput(String(formData.get("slug") ?? "")) ?? collectiveSlug();
  if (!slug) return { error: "Enter a collective slug to check, like eslint." };
  const month = monthOf(new Date());
  const lines: string[] = [];
  let failed = false;
  try {
    const f = await getFunding(slug, month, { fresh: true });
    lines.push(`Funding: balance ${formatUsd(f.balanceCents)}, ${formatUsd(f.netReceivedCents)} received this month after fees.`);
  } catch (error) {
    failed = true;
    lines.push(`Funding query failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const subs = await getSubscribersFresh(slug);
    lines.push(`Subscribers: ${subs.size} active recurring contributors.`);
  } catch (error) {
    failed = true;
    lines.push(`Subscribers query failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const profile = await getProfile(slug);
    lines.push(profile ? `Profile: found, GitHub links: ${profile.githubLogins.join(", ") || "none"}.` : "Profile: not found.");
  } catch (error) {
    failed = true;
    lines.push(`Profile query failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return failed ? { error: lines.join("\n") } : { message: lines.join("\n") };
}

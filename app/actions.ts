"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { getCurrentUser, isOperator } from "@/lib/auth";
import { castVote, closeVoting, nominate, refreshProject, setProjectStatus, withdrawVote } from "@/lib/core";
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

  const result = await nominate(getDb(), { userId: user.id, repo: verified.repo, now: new Date() });
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
  const result = await castVote(getDb(), { user, projectId, reason: String(formData.get("reason") ?? ""), now });
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

  const outcome = await closeVoting(getDb(), month);
  refreshPages();
  if (outcome.status === "no-votes") return { error: `No votes were cast for ${formatMonth(month)}, so there's no pick.` };
  if (outcome.status === "already-closed") return { message: `${formatMonth(month)} was already closed.` };
  return {
    message: `${outcome.project.owner}/${outcome.project.name} is the Kindling Pick for ${formatMonth(nextMonth(month))} with ${outcome.pick.voteCount} vote${outcome.pick.voteCount === 1 ? "" : "s"}.`,
  };
}

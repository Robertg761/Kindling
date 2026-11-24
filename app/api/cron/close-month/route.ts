import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { closeVoting } from "@/lib/core";
import { monthOf, previousMonth } from "@/lib/month";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Vercel Cron calls this on the 1st of each month to close the previous month's vote. */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const voteMonth = previousMonth(monthOf(new Date()));
  const outcome = await closeVoting(getDb(), voteMonth);
  revalidatePath("/");
  revalidatePath("/hall");
  return NextResponse.json({
    voteMonth,
    status: outcome.status,
    ...(outcome.status === "picked" && {
      project: `${outcome.project.owner}/${outcome.project.name}`,
      votes: outcome.pick.voteCount,
    }),
  });
}

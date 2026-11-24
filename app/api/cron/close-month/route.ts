import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { closeVoting, isVoteClosed } from "@/lib/core";
import { clearOpenCollectiveCache, collectiveSlug, getFunding } from "@/lib/opencollective";
import { currentVoterSlugs } from "@/lib/eligibility";
import { monthOf, previousMonth } from "@/lib/month";

export const dynamic = "force-dynamic";

// CRON_SECRET is optional. This route only ever closes a month that has already ended,
// which is idempotent, so an extra call is harmless. Set it to keep the route private anyway.
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Vercel Cron calls this daily. It closes last month's vote if that hasn't happened yet, so a
 * failed run (say, Open Collective being down) is retried the next day.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const voteMonth = previousMonth(monthOf(new Date()));
  const db = getDb();
  if (await isVoteClosed(db, voteMonth)) return NextResponse.json({ voteMonth, status: "already-closed" });

  const slug = collectiveSlug();
  let funding = null;
  let voterSlugs: string[] | null = null;
  if (slug) {
    try {
      funding = await getFunding(slug, voteMonth, { fresh: true });
      clearOpenCollectiveCache();
      voterSlugs = await currentVoterSlugs();
    } catch (error) {
      console.error("Kindling cron: couldn't read Open Collective", error);
      return NextResponse.json({ voteMonth, status: "retry-later" }, { status: 503 });
    }
  }
  const outcome = await closeVoting(db, voteMonth, funding, voterSlugs);
  revalidatePath("/");
  revalidatePath("/hall");
  return NextResponse.json({
    voteMonth,
    status: outcome.status,
    ...(outcome.status === "closed" && {
      funded: outcome.round.funded,
      potCents: outcome.round.potCents,
      winners: outcome.winners.map((w) => `${w.project.owner}/${w.project.name}`),
    }),
  });
}

import type { Metadata } from "next";
import { getDb, isDatabaseConfigured } from "@/db";
import { getCurrentUser, isAuthConfigured } from "@/lib/auth";
import { NOMINATIONS_PER_MONTH, nominationsThisMonth } from "@/lib/core";
import { ACTIVITY_WINDOW_DAYS } from "@/lib/github";
import { SignInButton } from "@/components/AuthButtons";
import { NominateForm } from "@/components/NominateForm";
import { SetupNotice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nominate a project" };

export default async function NominatePage() {
  if (!isDatabaseConfigured()) return <SetupNotice />;
  const user = await getCurrentUser();
  const used = user ? await nominationsThisMonth(getDb(), user.id, new Date()) : 0;
  const left = Math.max(0, NOMINATIONS_PER_MONTH - used);

  return (
    <div className="prose">
      <div className="eyebrow">Nominate</div>
      <h1>Know a project that deserves some fuel?</h1>
      <p className="lede">Paste its GitHub link. We&apos;ll check it right away, then a person approves it for the ballot.</p>

      <div className="card section" style={{ marginTop: 24 }}>
        {!user ? (
          isAuthConfigured() ? (
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>Sign in with GitHub to nominate.</span>
              <SignInButton />
            </div>
          ) : (
            <p className="muted">Sign-in isn&apos;t set up yet.</p>
          )
        ) : left === 0 ? (
          <p>You&apos;ve used all {NOMINATIONS_PER_MONTH} nominations for this month. More open up on the 1st.</p>
        ) : (
          <>
            <NominateForm />
            <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
              {left} of {NOMINATIONS_PER_MONTH} nominations left this month.
            </p>
          </>
        )}
      </div>

      <h2>What qualifies</h2>
      <ul>
        <li>A public GitHub repository that isn&apos;t a fork, archived or disabled</li>
        <li>At least one push in the last {ACTIVITY_WINDOW_DAYS} days</li>
        <li>
          Funding links in <code>.github/FUNDING.yml</code> (or the owner&apos;s <code>.github</code> repo). This is how
          Kindling knows where donations should go.
        </li>
      </ul>
    </div>
  );
}

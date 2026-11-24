import type { Metadata } from "next";
import { getDb, isDatabaseConfigured } from "@/db";
import { getCurrentUser, isAuthConfigured, isOperator } from "@/lib/auth";
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
  const operator = isOperator(user);
  const left = operator ? Infinity : Math.max(0, NOMINATIONS_PER_MONTH - used);

  return (
    <div className="prose">
      <h1>Nominate a project</h1>
      <p className="lede">Paste the GitHub link of a project you rely on. Kindling checks it right away, then a person approves it for the ballot.</p>

      <div className="panel" style={{ marginTop: 28 }}>
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
              {operator
                ? "You're an operator, so your nominations skip the limit and go straight onto the ballot."
                : `${left} of ${NOMINATIONS_PER_MONTH} nominations left this month.`}
            </p>
          </>
        )}
      </div>

      <h2>What a project needs</h2>
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

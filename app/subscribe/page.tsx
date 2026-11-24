import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser, isAuthConfigured } from "@/lib/auth";
import { subscriptionStatus } from "@/lib/eligibility";
import { BASE_PRICE_CENTS, formatUsd, OPERATOR_SHARE_PERCENT, PRIZE_CENTS } from "@/lib/money";
import { collectiveSlug, collectiveUrl, contributeUrl } from "@/lib/opencollective";
import { unlinkOpenCollectiveAction } from "../actions";
import { SignInButton } from "@/components/AuthButtons";
import { LinkOcForm } from "@/components/LinkOcForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Subscribe" };

export default async function SubscribePage() {
  const slug = collectiveSlug();
  const user = await getCurrentUser();
  const status = user ? await subscriptionStatus(user) : null;

  return (
    <div className="prose">
      <h1>Subscribe and vote</h1>
      <p className="lede">
        Subscribers fund the pot and pick the winners. It&apos;s {formatUsd(BASE_PRICE_CENTS)} a month, or more if you like,
        and every {formatUsd(PRIZE_CENTS)} in the pot picks another winner.
      </p>

      {!slug ? (
        <div className="panel" style={{ marginTop: 28 }}>
          <p style={{ margin: 0 }}>
            Subscriptions open soon. Until then, any signed-in member can vote in the practice round, with no prize money.
          </p>
        </div>
      ) : (
        <>
          <h2>How to get a vote</h2>
          <ol className="steps">
            <li>
              <strong>Subscribe on Open Collective</strong> for at least {formatUsd(BASE_PRICE_CENTS)} a month. Open
              Collective holds the money, not Kindling.
              <div style={{ marginTop: 10 }}>
                <a href={contributeUrl() ?? "#"} className="btn btn-primary" target="_blank" rel="noopener noreferrer">
                  Subscribe on Open Collective
                </a>
              </div>
            </li>
            <li>
              <strong>Add your GitHub link to your Open Collective profile.</strong> That&apos;s how Kindling knows the profile
              is yours.
              {user && (
                <>
                  {" "}
                  Add <code>https://github.com/{user.login}</code> under your profile&apos;s links.
                </>
              )}
            </li>
            <li>
              <strong>Link your profile here.</strong>
              <div className="panel" style={{ marginTop: 12 }}>
                {!user ? (
                  isAuthConfigured() ? (
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span>Sign in with GitHub first.</span>
                      <SignInButton />
                    </div>
                  ) : (
                    <p style={{ margin: 0 }}>Sign-in isn&apos;t set up yet.</p>
                  )
                ) : user.ocSlug ? (
                  <div className="stack">
                    <p style={{ margin: 0 }}>
                      Linked to{" "}
                      <a href={`https://opencollective.com/${user.ocSlug}`} target="_blank" rel="noopener noreferrer">
                        opencollective.com/{user.ocSlug}
                      </a>
                      .{" "}
                      {status?.kind === "active" && <strong>Your subscription is active, so you can vote.</strong>}
                      {status?.kind === "inactive" &&
                        `There's no active subscription of at least ${formatUsd(BASE_PRICE_CENTS)} a month on this profile yet. New ones can take a few minutes to appear.`}
                      {status?.kind === "unknown" && `${status.message} Try again in a minute.`}
                    </p>
                    <form action={unlinkOpenCollectiveAction}>
                      <button className="btn-quiet small">Unlink this profile</button>
                    </form>
                  </div>
                ) : (
                  <LinkOcForm />
                )}
              </div>
            </li>
          </ol>
        </>
      )}

      <h2>Where the money goes</h2>
      <p>
        Card processing and the fiscal host&apos;s fee come off first. Kindling keeps {OPERATOR_SHARE_PERCENT}% of what&apos;s
        left to cover hosting and running the site, paid as a public expense. Everything else is the pot. Each month,
        every {formatUsd(PRIZE_CENTS)} in it becomes a prize for one of the top-voted projects, and anything under{" "}
        {formatUsd(PRIZE_CENTS)} rolls over.{" "}
        {slug && (
          <>
            You can check every transaction on{" "}
            <a href={collectiveUrl() ?? "#"} target="_blank" rel="noopener noreferrer">
              Kindling&apos;s Open Collective page
            </a>
            .
          </>
        )}{" "}
        <Link href="/about">More on how it works</Link>.
      </p>
    </div>
  );
}

import Link from "next/link";
import { getDb } from "@/db";
import { outstandingCents } from "@/lib/core";
import { BASE_PRICE_CENTS, breakdown, formatUsd, OPERATOR_SHARE_PERCENT, PRIZE_CENTS } from "@/lib/money";
import { formatMonth, nextMonth, type Month } from "@/lib/month";
import { collectiveSlug, collectiveUrl, getFunding, OpenCollectiveError } from "@/lib/opencollective";

/** The live pot for the month being voted on, read from Open Collective. */
export async function Pot({ month, subscribed = false }: { month: Month; subscribed?: boolean }) {
  const slug = collectiveSlug();
  const next = formatMonth(nextMonth(month));

  if (!slug) {
    return (
      <section className="pot" aria-label="Prize pot">
        <div>
          <h2>Practice round</h2>
          <p>
            Subscriptions open soon. Until then the vote picks {next}&apos;s Pick, with no prize money. Once they open,
            subscribers fund the pot and every {formatUsd(PRIZE_CENTS)} picks another winner.
          </p>
        </div>
      </section>
    );
  }

  let money;
  let problem: string | null = null;
  try {
    money = breakdown(await getFunding(slug, month), await outstandingCents(getDb()));
  } catch (error) {
    problem = error instanceof OpenCollectiveError ? error.message : "Couldn't read the pot.";
  }

  if (!money) {
    return (
      <section className="pot" aria-label="Prize pot">
        <div>
          <h2>Pot unavailable</h2>
          <p>{problem} The vote is still open.</p>
        </div>
      </section>
    );
  }

  const progress = Math.round((money.towardNextCents / PRIZE_CENTS) * 100);
  return (
    <section className="pot" aria-label="Prize pot">
      <div>
        <h2 className="pot-figure">{formatUsd(money.potCents)}</h2>
        <p>
          {money.slots === 0
            ? `In the pot for ${next}. At ${formatUsd(PRIZE_CENTS)} the top project wins it. Under that, it rolls over.`
            : `In the pot for ${next}. If voting closed now, the top ${money.slots === 1 ? "project wins" : `${money.slots} projects win`} ${formatUsd(PRIZE_CENTS)}${money.slots === 1 ? "" : " each"}.`}
        </p>
        <div className="pot-bar" role="img" aria-label={`${formatUsd(money.towardNextCents)} of ${formatUsd(PRIZE_CENTS)} toward the next winner`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <p className="small muted">
          {formatUsd(PRIZE_CENTS - money.towardNextCents)} more picks {money.slots === 0 ? "a winner" : "another winner"}. Held by
          Open Collective,{" "}
          <a href={collectiveUrl() ?? "#"} target="_blank" rel="noopener noreferrer">
            every transaction is public
          </a>
          . Kindling keeps {OPERATOR_SHARE_PERCENT}% of what comes in after fees.
        </p>
      </div>
      <div className="pot-cta">
        {subscribed ? (
          <span className="small muted">You&apos;re subscribed. Thanks for keeping it lit.</span>
        ) : (
          <>
            <Link href="/subscribe" className="btn btn-primary btn-lg">
              Subscribe for {formatUsd(BASE_PRICE_CENTS)} a month
            </Link>
            <span className="small muted">Subscribers vote. Pay more if you like.</span>
          </>
        )}
      </div>
    </section>
  );
}

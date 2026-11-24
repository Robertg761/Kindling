import type { Metadata } from "next";
import Link from "next/link";
import { BASE_PRICE_CENTS, formatUsd, OPERATOR_SHARE_PERCENT, PRIZE_CENTS } from "@/lib/money";
import { collectiveUrl } from "@/lib/opencollective";

export const metadata: Metadata = { title: "How it works" };

export default function AboutPage() {
  const collective = collectiveUrl();
  return (
    <article className="prose">
      <h1>How Kindling works</h1>
      <p className="lede">
        Subscribers pay into a shared pot and vote once a month on which open-source projects should get it. Open
        Collective holds the money and pays the winners, so every dollar in and out is public.
      </p>

      <h2>Every month</h2>
      <ol>
        <li>
          <strong>Nominate.</strong> Anyone signed in with GitHub can <Link href="/nominate">nominate</Link> up to three
          public projects a month. A project qualifies if it isn&apos;t a fork or archived, has had a push in the last 60
          days, and has funding links in its <code>.github/FUNDING.yml</code>. A person approves each one before it
          reaches the ballot.
        </li>
        <li>
          <strong>Vote.</strong> Subscribers get one vote a month and can change it until the month ends. Every vote
          counts the same no matter how much you pay. Paying is also what keeps bots and vote farms out.
        </li>
        <li>
          <strong>Pick.</strong> On the 1st the vote closes. Every {formatUsd(PRIZE_CENTS)} in the pot picks one winner,
          starting from the top of the vote. So {formatUsd(PRIZE_CENTS * 3)} means three winners, and anything under{" "}
          {formatUsd(PRIZE_CENTS)} rolls over to next month. If two projects tie for the last spot, the one that reached
          its vote count first wins.
        </li>
        <li>
          <strong>Pay out.</strong> Each winner gets {formatUsd(PRIZE_CENTS)} through an Open Collective expense, and stays
          on Kindling&apos;s past picks. Winners leave the ballot so the prize keeps moving around.
        </li>
      </ol>

      <h2>Where your {formatUsd(BASE_PRICE_CENTS)} goes</h2>
      <p>
        A subscription is {formatUsd(BASE_PRICE_CENTS)} a month (US dollars), or more if you choose. Card processing and the
        fiscal host&apos;s fee come off first, as they do for any project on Open Collective. Of what&apos;s left, Kindling
        keeps {OPERATOR_SHARE_PERCENT}% to pay for hosting, maintenance and getting the word out. It&apos;s paid as a
        public expense each month, so you can see exactly what it was. The other {100 - OPERATOR_SHARE_PERCENT}% is the
        pot.
      </p>
      <p>
        The {OPERATOR_SHARE_PERCENT}% will be reviewed once Kindling reaches 200 subscribers. Any change gets at least a
        month&apos;s notice here before it takes effect.
      </p>
      {collective && (
        <p>
          <a href={collective} target="_blank" rel="noopener noreferrer">
            See every transaction on Kindling&apos;s Open Collective page
          </a>
          .
        </p>
      )}

      <h2>Giving to a project directly</h2>
      <p>
        Every project page also has buttons straight to the project&apos;s own GitHub Sponsors, Open Collective or similar
        page. Money you give there goes to the project, not through Kindling.
      </p>

      <h2>What Kindling stores</h2>
      <p>
        Your GitHub username, avatar, numeric ID and account creation date, the Open Collective profile you link, and your
        nominations and votes. Vote reasons you write are shown publicly on the project&apos;s page. Payment details stay
        with Open Collective.
      </p>
    </article>
  );
}

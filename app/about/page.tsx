import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <article className="prose">
      <div className="eyebrow">How it works</div>
      <h1>Kindling never touches the money.</h1>
      <p className="lede">
        Kindling is a monthly spotlight for open-source projects. We don&apos;t collect donations, hold balances or pay
        anyone out. Every donate button goes straight to the project&apos;s own GitHub Sponsors, Open Collective, Ko-fi or
        similar page.
      </p>

      <h2>Each month</h2>
      <ol>
        <li>
          <strong>Nominate.</strong> Anyone signed in with GitHub can <Link href="/nominate">nominate</Link> up to three
          public projects a month. A project qualifies if it isn&apos;t a fork or archived, has had a push in the last 60
          days, and has funding links in its <code>.github/FUNDING.yml</code>.
        </li>
        <li>
          <strong>Approve.</strong> Nominations are checked by a person before they reach the ballot, to keep out spam.
        </li>
        <li>
          <strong>Vote.</strong> Everyone gets one vote a month and can change it until the month ends. Votes are equal,
          and there&apos;s no way to buy them. GitHub accounts must be at least 30 days old to vote.
        </li>
        <li>
          <strong>Pick.</strong> On the 1st, the project with the most votes becomes that month&apos;s Kindling Pick. If
          two projects tie, the one that reached its count first wins. Everyone else carries over with a fresh count.
        </li>
      </ol>

      <h2>Why not handle the money?</h2>
      <p>
        Because projects already have good ways to get paid, and holding other people&apos;s money is where small
        community projects get complicated. Kindling&apos;s job is attention: helping the community agree on who deserves
        support this month, then getting out of the way.
      </p>

      <h2>What we store</h2>
      <p>
        Your GitHub username, avatar, numeric ID and account creation date (used for the 30-day voting rule), plus your
        nominations and votes. Vote reasons you write are shown publicly on the project&apos;s page.
      </p>
    </article>
  );
}

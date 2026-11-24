# Kindling: v1 Spec

> A little fuel for good projects.

## What it is

A site where the community nominates open-source projects and subscribers vote once a month on who gets the pot. Every $200 in the pot picks another winner.

## Money model (decided Nov 24, 2026)

- **Kindling never holds money itself.** Kindling is a collective on Open Collective with a fiscal host (Open Source Collective). Subscribers pay the collective; the host holds the money and pays winners through public expenses. Kindling only reads the balance and subscriptions.
- **Subscription:** $5 USD a month minimum, pay more if you like. Only subscribers can vote; every vote counts the same.
- **Winners:** at closing, pot = collective balance (after card and host fees) − money already owed (unpaid prizes and operator shares) − the operator's 5% of the month's income after fees. Every $200 in the pot is one winner, taken from the top of the vote. Anything under $200 rolls over. Ties at the cutoff go to whoever reached their count first.
- **Operator share:** Robert keeps 5% of income after fees for running Kindling, paid as a public expense and disclosed on the site. Reviewed at 200 subscribers, with a month's notice before any change.
- **Practice mode:** until `KINDLING_OC_SLUG` is set, any signed-in member (GitHub account 30+ days old) can vote and the single top project is picked with no prize.

## Users

- **Visitors**: browse nominees, see the current Kindling Pick, click through to donate. No account needed.
- **Members**: sign in with GitHub to nominate. Subscribers (who link their Open Collective profile) vote.
- **Operator** (Robert): approves or removes nominations and closes the monthly vote.

## Core flows

1. **Nominate.** A member pastes a public GitHub repo URL. The server checks that it:
   - exists, is public, isn't archived or disabled, and isn't a fork
   - had a commit pushed in the last 60 days
   - has at least one funding link, read from `.github/FUNDING.yml` (or the owner's GitHub Sponsors profile)

   If it passes, the nomination waits for operator approval. If it fails, show the specific reason.
2. **Vote.** Each subscriber gets **one vote per month** and can change it until the vote closes. Equal weight for everyone regardless of how much they pay.
3. **Close the month.** On the 1st (Vercel Cron, or a manual operator button), the project with the most votes becomes the Kindling Pick. Ties go to whoever reached that count first. Nominees that didn't win carry over to next month with their votes reset.
4. **Kindling Pick page.** A big feature of the winner with its description, stars, recent activity, a "why people voted" list (optional one-line reasons left with votes), and prominent buttons for each funding link.
5. **Hall of Fame.** A list of past Kindling Picks with month and vote count.

## Pages

- `/`: the current Kindling Pick, the live vote for next month, and a nominate button
- `/p/[owner]/[repo]`: a nominee's page
- `/hall`: past picks
- `/about`: one short page that says plainly that we don't handle money and links go straight to the project
- `/admin`: approval queue, remove a nominee, close the month (operator only, by GitHub numeric ID)

## Data model (Postgres)

- `users`: github_id, login, avatar, created_at
- `projects`: github_repo_id, owner, name, description, stars, last_push_at, funding_links (jsonb), status (`pending` | `approved` | `removed`), nominated_by, created_at
- `votes`: user_id, project_id, month (`YYYY-MM`), reason (nullable, max 140 chars), unique on (user_id, month)
- `picks`: month, project_id, vote_count

## Stack

Next.js (App Router) + TypeScript, Auth.js with GitHub OAuth, Neon Postgres + Drizzle, deployed on Vercel. Same as the old ProjectFuel, so nothing new to learn.

`reference/github-repository-verifier.ts` comes from the old repo. Reuse its URL normalization and bounded GitHub fetches, and drop the dormancy and recovery logic.

## Abuse basics (keep it small)

- A GitHub account must be at least 30 days old to vote.
- Rate-limit nominations to 3 per member per month.
- The operator can remove any nominee. That's the whole moderation system for v1.

## Out of scope for v1

Kindling processing payments itself, AI compute grants, random draws, contributor balances, email notifications, currencies other than USD, teams or orgs, comments.

## Done means

- [ ] Sign in with GitHub works in production
- [ ] Nominate → verify → approve → appears on `/`
- [ ] Vote, change vote, one vote per month enforced in the database
- [ ] Closing the month creates a Kindling Pick and resets votes
- [ ] Funding buttons open the project's real funding pages
- [ ] Deployed, with 3 to 5 real projects seeded by hand

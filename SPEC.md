# ProjectFuel Lite: v1 Spec

> Good projects shouldn't run out of fuel.

## What it is

A site where the community nominates open-source projects, votes once a month, and the winner becomes **the Fuel Pick** for the next month. The site sends attention and donations straight to the winner's existing funding page (GitHub Sponsors, Open Collective, Ko-fi, Liberapay, Buy Me a Coffee, Polar).

**ProjectFuel never touches money.** There's no checkout, no ledger, no payouts and no balances. If a feature needs us to hold or move funds, it's out of scope.

## The one rule

v1 ships before any new docs, charters, decision records or "phases" get written. Real users decide what v2 needs.

## Users

- **Visitors**: browse nominees, see the current Fuel Pick, click through to donate. No account needed.
- **Members**: sign in with GitHub to nominate and vote.
- **Operator** (Robert): approves or removes nominations and closes the monthly vote.

## Core flows

1. **Nominate.** A member pastes a public GitHub repo URL. The server checks that it:
   - exists, is public, isn't archived or disabled, and isn't a fork
   - had a commit pushed in the last 60 days
   - has at least one funding link, read from `.github/FUNDING.yml` (or the owner's GitHub Sponsors profile)

   If it passes, the nomination waits for operator approval. If it fails, show the specific reason.
2. **Vote.** Each member gets **one vote per month** and can change it until the vote closes. Equal weight for everyone, and no way to buy votes.
3. **Close the month.** On the 1st (Vercel Cron, or a manual operator button), the project with the most votes becomes the Fuel Pick. Ties go to whoever reached that count first. Nominees that didn't win carry over to next month with their votes reset.
4. **Fuel Pick page.** A big feature of the winner with its description, stars, recent activity, a "why people voted" list (optional one-line reasons left with votes), and prominent buttons for each funding link.
5. **Hall of Fame.** A list of past Fuel Picks with month and vote count.

## Pages

- `/`: the current Fuel Pick, the live vote for next month, and a nominate button
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

Payments of any kind, AI compute grants, cash awards, random draws, contributor balances, email notifications, multiple currencies, teams or orgs, comments.

## Done means

- [ ] Sign in with GitHub works in production
- [ ] Nominate → verify → approve → appears on `/`
- [ ] Vote, change vote, one vote per month enforced in the database
- [ ] Closing the month creates a Fuel Pick and resets votes
- [ ] Funding buttons open the project's real funding pages
- [ ] Deployed, with 3 to 5 real projects seeded by hand

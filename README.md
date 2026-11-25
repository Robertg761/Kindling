# Kindling

> A little fuel for good projects.

Kindling is a community-funded pot for open-source projects. Subscribers pay $5 a month or more into the Kindling collective on [Open Collective](https://opencollective.com), vote once a month, and every $200 in the pot becomes a prize for a project at the top of the vote. Open Collective's fiscal host holds the money and pays winners through public expenses. Kindling's code never holds, moves or processes money; it only reads the collective's balance and subscriptions.

Live at https://kindling-oss.vercel.app. See [`SPEC.md`](SPEC.md) for the v1 plan and [`AGENTS.md`](AGENTS.md) for rules when working on the code.

## How it works

- **Nominate.** Members sign in with GitHub and nominate up to 3 public repos a month. A repo qualifies if it isn't a fork, archived or disabled, had a push in the last 60 days, and has a `FUNDING.yml` (in the repo or the owner's `.github` repo). The operator approves each nomination at `/admin`.
- **Subscribe and vote.** Subscribers link their Open Collective profile (by adding their GitHub URL to it) and get one vote a month, which they can change until the month ends. Every vote counts the same no matter how much someone pays. Only current subscribers' votes count at close.
- **Close the month.** On the 1st, a Vercel Cron job closes last month's vote and reads the collective:

  ```
  pot = balance after card and host fees
        - money already owed (unpaid prizes and operator shares)
        - operator share (5% of the month's income after fees)
  ```

  Every $200 in the pot is one winner, taken from the top of the vote. Ties at the cutoff go to the project that reached its count first. Anything under $200 rolls over to next month.
- **Pay out.** The fiscal host pays each winner $200 through an Open Collective expense, and the operator marks it paid in `/admin`. Winners sit out the next 12 months, then return to the ballot.
- **Operator share.** The operator keeps 5% of income after fees for running Kindling, paid as a public expense and disclosed on `/about`, `/subscribe` and in the footer. It will be reviewed at 200 subscribers, with a month's notice before any change.

### Practice mode

Until `KINDLING_OC_SLUG` is set, the site runs in practice mode: any signed-in member whose GitHub account is at least 30 days old can vote, the single top project is picked each month, and there's no prize. Practice picks don't keep a project off later prize ballots.

## Stack

Next.js 16 (App Router, server actions), NextAuth with GitHub OAuth, Drizzle ORM on any Postgres (Neon works well), deployed on Vercel.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill it in
npm run db:migrate
npm run dev
```

For the GitHub OAuth app, use `http://localhost:3000/api/auth/callback/github` as the callback URL locally.

## Deploy on Vercel

1. Create a Postgres database (Neon free tier is fine) and copy its connection string.
2. Create a GitHub OAuth app at https://github.com/settings/developers with the callback URL `https://YOUR_DOMAIN/api/auth/callback/github`.
3. Import this repo into Vercel and set every variable from `.env.example`. `KINDLING_OPERATOR_GITHUB_IDS` is your numeric GitHub ID (the `id` field at `https://api.github.com/users/YOUR_LOGIN`).
4. Deploy. The `vercel-build` script runs migrations before building, and `vercel.json` schedules a daily job that closes last month's vote once (retrying if Open Collective is down). Set `CRON_SECRET` so only Vercel Cron can call it.
5. Seed a few projects: `DATABASE_URL=... npm run seed -- owner/repo owner/other`

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm test` | Unit and database tests (PGlite, no setup needed) |
| `npm run verify` | Typecheck, tests and production build |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:generate` | Create a migration after changing `src/db/schema.ts` |
| `npm run seed -- owner/repo ...` | Check repos and put them straight on the ballot |
| `npm run close-month [-- YYYY-MM]` | Close a month's vote by hand (defaults to last month) |

## License

[MIT](LICENSE)

## Layout

```
app/                 pages, server actions, auth and cron routes
src/db/              Drizzle schema and connection
src/lib/core.ts      nominations, voting, month closing and payouts owed
src/lib/money.ts     prize size, operator share and pot math
src/lib/opencollective.ts  read-only Open Collective client
src/lib/eligibility.ts     who can vote
src/lib/github.ts    repo checks against the GitHub API
src/lib/funding.ts   FUNDING.yml parsing
drizzle/             SQL migrations
tests/               Vitest suites
```

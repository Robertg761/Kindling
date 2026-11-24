# Kindling

> A little fuel for good projects.

Each month the community votes on an open-source project to support, and the site sends people straight to that project's own funding page. Kindling never touches the money.

See [`SPEC.md`](SPEC.md) for the v1 plan and [`AGENTS.md`](AGENTS.md) for rules when working on the code. This is a fresh start on the idea behind the original ProjectFuel, trimmed down to what can ship.

## How it works

- Members sign in with GitHub and nominate up to 3 public repos a month. A repo qualifies if it isn't a fork, archived or disabled, had a push in the last 60 days, and has a `FUNDING.yml` (in the repo or the owner's `.github` repo).
- The operator approves nominations at `/admin`.
- Each member gets one vote a month (GitHub account must be 30+ days old) and can change it until the month ends.
- On the 1st, Vercel Cron closes last month's vote. The winner is the Kindling Pick for the new month. Ties go to the project that reached its count first. Past winners leave the ballot.

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
4. Deploy. The `vercel-build` script runs migrations before building, and `vercel.json` schedules the monthly close.
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

## Layout

```
app/                 pages, server actions, auth and cron routes
src/db/              Drizzle schema and connection
src/lib/core.ts      nominations, voting and month-closing rules
src/lib/github.ts    repo checks against the GitHub API
src/lib/funding.ts   FUNDING.yml parsing
drizzle/             SQL migrations
tests/               Vitest suites
```

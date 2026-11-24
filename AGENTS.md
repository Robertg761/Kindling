# Agent instructions

Read `SPEC.md` first. It's the whole plan.

- Kindling never holds, moves or processes money. Don't add payments, ledgers, balances or payout code, even as a stub.
- Build only what `SPEC.md` lists. If something seems missing, add it to "Open questions" at the bottom of this file instead of building it.
- Don't create new planning docs, ADRs or phase plans. Update `SPEC.md` only when Robert asks.
- Keep it small: plain server components and server actions, Drizzle for the DB, no state libraries.
- `reference/` holds code from the old ProjectFuel repo. Copy what helps into `src/`; don't import from `reference/`.
- Every DB rule in the spec (one vote per user per month, unique picks per month) is enforced with a constraint, not just in app code.

## Open questions

Decisions made during the first build that the spec didn't cover. Robert should confirm or change these.

- **Past winners leave the ballot** permanently, so the same project can't win every month. Could become "after 12 months they can return."
- **Funding source:** the spec mentions the owner's GitHub Sponsors profile. Checking that needs the GraphQL API with auth, so v1 reads `FUNDING.yml` from the repo and falls back to the owner's `.github` repo, which is where GitHub itself looks.
- **Closing a month early** (admin button) locks voting until the 1st, since votes are grouped by calendar month.
- **Pending project pages** are visible only to the nominator and operators, so spam never gets a public page.
- **Months with no votes** produce no pick, and the previous pick stays featured.

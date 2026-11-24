# Agent instructions

Read `SPEC.md` first. It's the whole plan.

- Kindling never holds, moves or processes money. Don't add payments, ledgers, balances or payout code, even as a stub.
- Build only what `SPEC.md` lists. If something seems missing, add it to "Open questions" at the bottom of this file instead of building it.
- Don't create new planning docs, ADRs or phase plans. Update `SPEC.md` only when Robert asks.
- Keep it small: plain server components and server actions, Drizzle for the DB, no state libraries.
- `reference/` holds code from the old ProjectFuel repo. Copy what helps into `src/`; don't import from `reference/`.
- Every DB rule in the spec (one vote per user per month, unique picks per month) is enforced with a constraint, not just in app code.

## Open questions

(none yet)

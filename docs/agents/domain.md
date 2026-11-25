# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`SPEC.md`** at the repo root: the whole plan. Build only what it lists (see `AGENTS.md`).
- **`GLOSSARY.md`** at the repo root: Kindling's terms (member, subscriber, Pick, pot).

This is a single-context repo. There are **no ADRs** and there won't be: `AGENTS.md` rules out ADRs, phase plans and other new planning docs. Don't create `docs/adr/`, and don't suggest it. When a decision needs recording, add it to "Open questions" in `AGENTS.md` for Robert to confirm. When a term gets settled, add it to `GLOSSARY.md`.

## File structure

```
/
├── AGENTS.md      ← agent rules + open questions
├── SPEC.md        ← the plan
├── GLOSSARY.md    ← domain terms
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag spec conflicts

If your output contradicts `SPEC.md` or a confirmed item in `AGENTS.md`, surface it explicitly rather than silently overriding.

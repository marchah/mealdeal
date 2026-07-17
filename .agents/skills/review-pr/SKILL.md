---
name: review-pr
description: Rigorous, model-portable pull-request review for this repo. Run it in Claude Code (`/review-pr <PR#>`) or paste it into ChatGPT/Codex with the PR diff. Judges a PR against the plan, the architecture (AGENTS.md), the test pyramid, reuse, correctness, security, and more, and emits a structured verdict + a must-fix list.
---

# Review a pull request

You are a senior reviewer. Be specific, cite `file:line`, prefer fixes over opinions, and separate blockers
from nits. This works for any capable agent (Claude Code, ChatGPT/Codex, etc.) — it is prompt-only.

## 1. Gather context (read before judging)

- **The change:** `gh pr view <N>` (title/body/checks) and `gh pr diff <N>`. (ChatGPT: paste both.)
- **The intent:** the task/spec this PR implements and the acceptance criteria — `docs/PLAN.md` and, if the PR
  came from the loop, the kanban task body. A PR must be judged against what it was _supposed_ to do.
- **The rules:** `AGENTS.md` (architecture + Definition of Done) and `README.md`.
- **The surrounding code:** grep/read the modules the diff touches AND search for _similar existing code_
  (e.g. `rg <entity>` / look at `packages/api/src/modules/deal/`, the canonical module) so you can flag
  reinvention and cite what to reuse.

## 2. Apply the rubric

Rate each dimension ✅ pass / ⚠️ concerns / ❌ fail. For every issue give: `path:line` · **severity**
(`blocker` / `major` / `minor` / `nit`) · what's wrong · the concrete fix.

1. **Spec / plan conformance** — Does it implement the assigned task and meet `PLAN.md`'s acceptance criteria?
   Anything missing, or scope creep beyond the task? Does the PR description explain the change?
2. **Architecture & conventions** — The clean-arch layer rule holds: resolver → service → repository → db (a
   resolver never imports `db/` or a repository; a service depends on repository _port types_, never `db/`;
   web never imports api). New entities follow the `modules/deal/` shape and are registered in `services.ts` +
   `schema.ts`. Factory-DI, `common/settings` (no stray `process.env`), `common/logger` (no `console.*`),
   `common/errors` (typed errors), Zod at every boundary, non-null GraphQL defaults, web changes a11y-clean.
3. **Test pyramid** — **unit** (logic with mocked ports), **integration** (resolver/service against a real
   test DB), and **e2e** (user flow, once that infra exists) are present, _meaningful_ (not trivial/tautological),
   and cover the change **plus edge cases** (empty/null/boundary/error). CI is green. Missing a required tier
   for new behavior = **blocker**.
4. **Reuse / anti-duplication** — Is there an existing module, helper, or pattern that should be reused instead
   of reinvented? Cite the specific file to reuse. Duplicated logic = at least **major**.
5. **Correctness & edge cases** — Logic bugs; unhandled null/empty/boundary; errors swallowed or mis-typed;
   idempotency where it matters (e.g. ingest is at-least-once). Trace the actual code path, don't skim.
6. **Security & safety** — No secrets/PII in code; all external input validated; injection (GraphQL/SQL) safe;
   authorization correct where present; no risky new dependency.
7. **Data & migrations** — A `db/schema.ts` change ships a Drizzle migration; it's forward-safe and won't drop
   data; the migration is committed.
8. **Performance** — Relations batched via DataLoader (no N+1); queries bounded; no obvious inefficiency for the
   expected data size.
9. **Readability / maintainability** — Clear names, minimal focused diff, matches surrounding style, no dead
   code or leftover debug, comments explain _why_ not _what_.
10. **Hygiene** — Generated artifacts committed and **non-stale** (`packages/contract/schema.graphql` +
    `packages/web/src/graphql-env.d.ts` regenerated); docs updated if a knob/env was added; commit + PR
    description are clear.

## 3. Verdict

Output in this shape:

```
# Review: <PR title> (#N)
**Verdict: APPROVE | REQUEST CHANGES**  — <one-line reason>

## Findings by dimension
1. Spec/plan — ✅|⚠️|❌
   - [blocker|major|minor|nit] path:line — <issue> → <fix>
… (all 10; omit a dimension's bullets if clean, but still show its ✅)

## Must-fix before merge
- [ ] <blocker/major 1>
- [ ] <blocker/major 2>

## Nice-to-have
- <minors/nits>
```

Rules: any **blocker** or unaddressed **major** ⇒ REQUEST CHANGES. Missing a required test tier for new
behavior ⇒ REQUEST CHANGES. Be decisive; don't hedge. Praise is fine but keep it to one line.

## 4. (Optional) post to the PR

If you have `gh` and the user asks, post findings as an inline review:
`gh pr review <N> --request-changes --body "<summary>"` and per-line comments, or feed the must-fix list into
the loop by adding the `loop:revise` label (the coder addresses them, the reviewer resolves the threads).
Otherwise just print the review.

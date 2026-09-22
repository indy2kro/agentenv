---
name: project-improvement-audit
description: Use when you want a project-wide audit of the agentenv CLI (every module under cmd/agentenv/src, CI workflows, docs) to discover many different improvement opportunities — correctness bugs, CLI UX gaps, terminal accessibility, test/CI gaps, and new-feature ideas — compiled into a prioritized, checkbox backlog in docs/improvement-audit/. Discovery only; no source changes.
---

# Project Improvement Audit — agentenv

## Overview

Harvest mechanical signals from the real gates. Then go through the module
clusters one batch at a time (no subagents), dedupe and prioritize, and write a
dated backlog. **No code changes.** The deliverable is the report.

## Token budget

- **No subagents.** Run batches one after another in the main conversation.
- Up to **10 findings per batch**. Rationale is **1 sentence**.
- Skip pure code-style/refactor findings (the "code" lens) unless they have
  caused bugs. The invariant tests in `config/schema.test.ts` already guard the
  catalog tables.
- **Write each batch's findings to disk** (scratchpad `findings/batch-N.json`)
  as soon as the batch is done, then drop the raw grep/read output from context.
- `rg -g`/`rg --type` can get rewritten by the rtk hook into GNU grep and fail.
  Use the Grep tool or `rtk proxy rg ...` for glob-filtered searches.

## Target count

Default **X = 40** deduplicated items (the codebase is about 40 modules). Honor
an explicit override. Never pad with filler.

## Lenses

| Lens | Looks for |
|---|---|
| `bug` | Wrong behavior. Typical sources: path/scope resolution that disagrees, unsafe writes to user-global files, swallowed errors, `success: true` with errors |
| `ux` | Misleading or doubled messages, ignored flags, exit codes that break `docs/guides/exit-codes.md`, missing guards |
| `a11y` | Signals conveyed by color alone, glyphs without an ASCII fallback, spinner noise, no-TTY behavior |
| `feature` | Missing capabilities that add real value for users *or for agents running agentenv* |
| `test` / `ci` | Coverage holes and gates missing from CI |

Tie-break: `bug` > `feature` > `a11y` > `ux`.

## Pipeline

### 1. Mechanical harvest (do first; from `cmd/agentenv/`)

```sh
npm run build && npm run lint && npm run format:check
cd dist && node --test --experimental-test-coverage   # pass/fail + per-file coverage
npm audit --omit=dev ; npm outdated
gitleaks detect --no-banner -s ../..                   # secrets
actionlint ; shellcheck <scripts>                      # if installed
```

Aggregate these as `SWEEP-*` items (e.g. "raise coverage on X, Y, Z"), not one
row per file.

### 2. Batches (module clusters)

1. commands: `apply`, `setup`, `update`, `wizard`
2. commands: `status`, `doctor`, `uninstall`, `shell-fix`, `completion`, `index.ts`, `cli/`
3. `config/`, `generate/`, `wizard/build.ts` (read the *generated text* critically. Every agent session loads it)
4. `toolchain/`, `shell/`
5. `adapters/`, `integrations/`
6. `ui/`, `utils/`, `.github/workflows/`, `docs/`, `README.md`

For each batch, grep first and read only what a hit calls for. Useful probes:
`JSON.parse` fallbacks, `spawnSync` without a timeout, `process.stdin.isTTY`
gates, `resolveScopeDir(config.scope`, `HOME || USERPROFILE || ''`,
`process.exitCode = 1` on argument errors, writes that don't go through
`utils/fs-retry.ts`. Check each claim against the code before recording it.

Finding schema (one JSON array per batch):

```json
{"t":"Short imperative summary","cat":"commands|config|generate|shell|toolchain|adapters|ui|ci","l":"bug|ux|a11y|feature|test","f":["cmd/agentenv/src/x.ts:12-30"],"e":"S|M|L","i":"low|med|high","r":"One sentence why it matters.","mode":"single|sweep"}
```

`e`: S = one file, under 30 min. M = one module or several files. L = cross-cutting.
`i`: high = data loss / broken core flow / affects every user. med = common path. low = nice-to-have.

### 3. Dedupe & prioritize

Merge the batch files. Collapse duplicates. Promote anything that spans three or
more modules to `SWEEP-*`. Rank high-impact/low-effort first. Compare against the
previous backlog (`git log -- docs/improvement-audit/`) so already-fixed items are
not re-reported. If the total is below X, redo the thinnest batches.

### 4. Write the backlog

`docs/improvement-audit/YYYY-MM-DD-improvement-backlog.md`. Use stable IDs
(`SWEEP-NN`, `BUG-NN`, `UX-NN`, `A11Y-NN`, `FEAT-NN`), make every item a `- [ ]`,
and use the same header, summary table and execution-instructions layout as the
previous round. Commit it with no source changes and delete the scratch batch
files.

## Done criteria

- [ ] ≥ X deduplicated items, each with an ID, checkbox, `file:line`, effort, impact and rationale
- [ ] Mechanical gaps aggregated as sweep items
- [ ] No duplicates against each other or against previously completed backlogs
- [ ] Report written under `docs/improvement-audit/`; no source changes

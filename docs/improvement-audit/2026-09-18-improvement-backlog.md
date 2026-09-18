# Improvement Backlog — 2026-09-18

Target: 20 · Found: 22 deduplicated items · Completed: 0/22

> **How to use this document.** As you finish each item, change `- [ ]` to `- [x]`,
> append ` ✅ <commit-sha>`, and bump the "Completed" counter. This file is the source
> of truth for progress. One item = one commit, named like `feat(UX-01): ...`.
> Verify before ticking: `npm run lint && npm run format:check && npm test` (+ the
> affected test file) and for user-facing strings re-read the generated output.

Catalogue audited: every module under `cmd/agentenv/src/` (CLI plumbing, config,
generate, toolchain, shell, commands, adapters, integrations) + `docs/`. Method:
adapted the project-improvement-audit skill (CLI instead of Vue tool catalogue),
6 sequential batches over module clusters, findings check-pointed to
`docs/improvement-audit/findings/` then deduped. No source changes were made.

Lens notes: the `a11y` lens of the source skill targets web UIs (aria/`@click`);
this is a terminal CLI. Its analog (color-only signals) was checked: both
`status` (✓/✗/! glyphs) and `doctor` (`[ok]`/`[warn]`/`[fail]` text badges) pair
every color with a text glyph, so no color-only signals exist → 0 a11y findings,
recorded as a pass.

## Summary

| Lens | Count | | Category | Count |
|------|-------|-|----------|-------|
| ux | 9 | | CLI plumbing | 3 |
| feature | 12 | | config / generate | 4 |
| docs | 1 | | toolchain / shell | 5 |
| | | | commands | 9 |
| | | | docs | 1 |

## Cross-cutting sweeps (SWEEP-NN)

- [ ] **SWEEP-01** Unify mutating-command output: one shared renderer for config-path line + validation failures + messages/errors/summary, used by setup/apply/update/uninstall — effort M · impact med
  Rationale: each mutating command hand-rolls the same "which config / warnings / errors / result summary" sequence with small inconsistencies (apply omits the config path, setup has a "not applying" line that apply lacks).

## UX & output   (UX-NN)

- [ ] **UX-01** `AGENTS.md` claims integration adapters are "not yet wired into apply/status/setup" — they are — `docs/AGENTS.md` · effort S · impact high
  Rationale: the repo's own agent-facing instructions are stale and will misdirect the next contributing agent (superpowers is wired in all three flows).
- [ ] **UX-02** `apply` neither prints which `agentenv.toml` it used nor a "configuration invalid — not applying" line — `cmd/agentenv/src/commands/apply.ts` · effort S · impact med
  Rationale: with project + user configs coexisting, apply gives no hint which file produced the state, unlike setup and uninstall.
- [ ] **UX-03** `apply` unhandled errors print a bare message with no command context or stack; add `--debug` to append the failing command + trace — `cmd/agentenv/src/index.ts` · effort S · impact med
  Rationale: a user hitting an internal error can't produce a useful bug report.
- [ ] **UX-04** `apply`/`update` silently mutate the user-global mise config PATH (`ensureGlobalShimsDir`) on every run with no summary line — `cmd/agentenv/src/toolchain/mise.ts` · effort S · impact low
  Rationale: users can't tell that a global file outside the project was modified.
- [ ] **UX-05** Superpowers opt-in in the wizard fires five immediate follow-up prompts with no upfront summary of the consequences — `cmd/agentenv/src/commands/wizard.ts` · effort S · impact low
  Rationale: answering "yes" to one integration drops users into a mini-wizard with no idea what they're agreeing to.
- [ ] **UX-06** 14 of 32 catalog tools render under a generic "Other" heading in generated AGENTS.md — `cmd/agentenv/src/generate/agentsmd.ts` · effort M · impact low
  Rationale: half the catalog loses the search/code-navigation organization, making generated instructions harder to scan.
- [ ] **UX-07** `status` renders every drift/integration entry with no `--short`/collapsed compaction — `cmd/agentenv/src/commands/status.ts` · effort S · impact low
  Rationale: users with many custom tools and integrations get a long report for a one-glance check.
- [ ] **UX-08** `-q/--quiet` suppresses banners but the apply spinner still renders on a TTY — `cmd/agentenv/src/ui/spinner.ts` · effort S · impact low
  Rationale: quiet output is not actually quiet.
- [ ] **UX-09** Unknown-command/typo errors don't offer did-you-mean suggestions (commander `showSuggestionAfterError`) — `cmd/agentenv/src/index.ts` · effort S · impact low
  Rationale: `agentenv statsu` errors with no hint the name was close to an existing command.

## New functionality   (FEAT-NN)

- [ ] **FEAT-01** `update --dry-run`/`--check` to preview version/tool bumps before running — `cmd/agentenv/src/commands/update.ts` · effort S · impact med
  Rationale: update upgrades blindly; a preview lets users see what would change before a potentially breaking bump.
- [ ] **FEAT-02** `apply --dry-run` rendering the `diffConfigs` preview without writing — `cmd/agentenv/src/commands/apply.ts` · effort S · impact med
  Rationale: apply is the only mutating command with no dry preview, yet the diff machinery already exists for the wizard review screen.
- [ ] **FEAT-03** `status` should surface `tool_versions` pin vs installed-version drift — `cmd/agentenv/src/commands/status.ts` · effort M · impact med
  Rationale: a stale pin silently diverges from what mise has installed and no command reports the mismatch.
- [ ] **FEAT-04** Honor `XDG_CONFIG_HOME`/`XDG_DATA_HOME` for the user scope on Linux/macOS — `cmd/agentenv/src/config/scopes.ts` · effort S · impact med
  Rationale: users who set XDG dirs would otherwise get config written to an unexpected `~/.config` path their dotfiles don't cover.
- [ ] **FEAT-05** Catalog-record consistency guard (sweep): assert `TOOL_KEYS`/`TOOL_TIERS`/`BINARY_MAP`/`MISE_TOOL_NAMES`/`TOOL_CATEGORIES`/`TOOL_DESCRIPTIONS` cover each other — `cmd/agentenv/src/config/schema.ts` · effort M · impact high
  Rationale: a new catalog tool that misses one map silently breaks status/detect/generated files instead of failing the build.
- [ ] **FEAT-06** Revert path for the Tier-0 Windows shell switch (Windows Terminal `defaultShell`, Git Bash PATH additions) — `cmd/agentenv/src/shell/detector.ts` · effort M · impact med
  Rationale: detector writes several per-user files and there is no way to know what changed or put it back.
- [ ] **FEAT-07** Shell completions for commands/flags — `cmd/agentenv/src/index.ts` · effort M · impact med
  Rationale: typing `agentenv set<TAB>` is slow and error-prone; generated completions match how mise/gh already work.
- [ ] **FEAT-08** `setup --yes` can't opt into the superpowers integration without a pre-existing config (no `--superpowers` flag) — `cmd/agentenv/src/commands/setup.ts` · effort S · impact med
  Rationale: unattended setup users are stuck with the two default integrations unless they hand-edit agentenv.toml.
- [ ] **FEAT-09** Live existence-check of custom-tool OS paths during wizard input — `cmd/agentenv/src/commands/wizard.ts` · effort S · impact low
  Rationale: a stale path is only caught later by validate/status, forcing an extra apply cycle to discover it.
- [ ] **FEAT-10** `status --json`/`doctor` should include the resolved mise version + toolchain root — `cmd/agentenv/src/commands/doctor.ts` · effort S · impact low
  Rationale: issue reports rarely include mise/stack context even though both commands already probe it.
- [ ] **FEAT-11** `doctor --section <n>` filter for CI fast-fail — `cmd/agentenv/src/commands/doctor.ts` · effort S · impact low
  Rationale: a Windows shell-fix gate or pre-apply check wants only the shell/tools sections, not the whole sweep.
- [ ] **FEAT-12** Guard against registering a command after `installExitOverride` (future commands silently lose the 0/2 contract) — `cmd/agentenv/src/cli/exit.ts` · effort S · impact low
  Rationale: a command added later would fall back to commander's exit(1) and break the documented contract.

## Docs   (D-NN)

- [ ] **D-01** `docs/guides/adding-an-adapter.md` and `docs/plans/agentenv-dev-plan.md` Phase 5 still describe "four v1 agents"; update for the 9 live adapters and the `RtkDelegationAdapter` pattern — effort S · impact low
  Rationale: the catalog outgrew the docs, so a fifth-agent contributor would start from the wrong model.

---
## Execution Instructions

1. **No skills required beyond normal practice** — items are plain command-output
   work; SWEEP-01 and FEAT-05 are the cross-cutting ones to batch.
2. **One item = one commit.** Reference the item ID, e.g. `feat(FEAT-03): ...`.
3. **Mark progress here.** Flip `- [ ]` → `- [x]`, append ` ✅ <sha>`, update the count.
4. **Fan out subagents** for independent items (different files = no shared state).
5. **Verify before ticking.** Run `npm run lint && npm run format:check && npm test`
   (+ the affected test file), and for output changes re-read the command's generated
   text. Done = gate green.
6. **i18n + changelog.** New user-facing strings keep plain English (this CLI is
   English-only); add a `Changelog` entry for user-visible changes.
7. **Suggested order:** UX-01, FEAT-05, FEAT-01, FEAT-02, FEAT-03, FEAT-04 →
   SWEEP-01 → the rest.
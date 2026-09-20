# Improvement Backlog — 2026-09-19

Target: 20 · Found: 23 deduplicated items · Completed: 18/23 · Skipped: 0

> **How to use this document.** As you finish each item, change `- [ ]` to `- [x]`,
> append ` ✅ <commit-sha>`, and bump the "Completed" counter. This file is the source
> of truth for progress. One item = one commit, named like `fix(BUG-01): ...`.
> Verify before ticking: `npm run lint && npm run format:check && npm test` (+ the
> affected test file) and for user-facing strings re-read the generated output.

Catalogue audited: every module under `cmd/agentenv/src/` (CLI plumbing, config,
generate, wizard, toolchain, shell, commands, adapters, integrations, ui, utils)
+ `docs/`. Method: 4 parallel read-only cluster audits (commands; toolchain+shell;
config+generate+wizard; adapters+integrations+ui+utils), each finding
`file:line`-referenced and cross-checked against docs/tests, then deduped here.
No source changes were made during the audit.

Lens notes: the prior round's a11y pass still holds (every color signal is paired
with a text glyph). This round's dominant themes are (a) **paths resolved by two
different functions that disagree** (`apply`/`loadConfig` vs `findConfigPath`,
`-g` agents' expected files) and (b) **Windows-lock-safe writes that some paths
bypass**. Both are correctness, not cosmetics.

## Summary

| Lens | Count | | Category | Count |
|------|-------|-|----------|-------|
| bug | 14 | | config / generate | 6 |
| ux | 5 | | toolchain / shell | 5 |
| feature | 2 | | commands / cli | 7 |
| docs | 1 | | adapters / ui / utils | 4 |
| sweep | 1 | | docs | 1 |

## Cross-cutting sweeps (SWEEP-NN)

- [x] **SWEEP-01** Route every user-facing file write through the Windows-safe `writeFileWithRetry`/`writeFileWithVerify` helpers — `cmd/agentenv/src/shell/detector.ts` (three `patch*ShellFix` writers), `src/adapters/claude.ts` (`settings.json`, `CLAUDE.md`), `src/adapters/codex.ts` (`config.toml`) · effort M · impact high ✅ c8a0bb5
  Rationale: the retry helpers were added for exactly the Windows EBUSY/EPERM case, and every other write path (generate, schema, mise) already uses them; the Tier 0 writers and the two most editor-/agent-locked config files are the ones that still throw on first lock, and the Tier 0 block in `apply.ts` has no try/catch around it.
- [ ] **SWEEP-02** Remove the dead public surface that has no callers and hides latent bugs — `src/toolchain/mise.ts` (`getMiseVersionSilent`, `blockedWarn`, `parseMiseToml`, `mergeMiseConfigs`, `parseToml`), `src/config/schema.ts` (`getEnabledTools`), `src/ui/output.ts` (`banner`), `src/adapters/base.ts` (`HookConfig`), `src/toolchain/fallbacks.ts` (unused install/verify/advice exports) · effort M · impact low
  Rationale: these exports masquerade as a live API but nothing in `src/` calls them, and the abandoned `parseToml` corrupts quoted numeric values while `blockedWarn`'s regex misclassifies real errors — deleting them stops the next contributor from reviving a trap.

## Correctness bugs   (BUG-NN)

- [x] **BUG-01** `loadConfig()` resolves the user-scope path itself instead of via `userConfigDir()`, so it ignores `XDG_CONFIG_HOME` · `cmd/agentenv/src/config/schema.ts:400-411` · effort S · impact high ✅ d74530c
  Rationale: `findConfigPath()`/`userConfigDir()` honor an absolute `XDG_CONFIG_HOME`, but `loadConfig()` hardcodes `$HOME/.config/agentenv/agentenv.toml`, so on XDG machines `apply` applies `DEFAULT_CONFIG` while printing the real path and the wizard pre-fills nothing — silently, with no error.
- [x] **BUG-02** `apply` with no `agentenv.toml` silently applies hidden defaults and prints a nonexistent `Config:` path, exiting 0 · `cmd/agentenv/src/commands/apply.ts:262-269` · effort S · impact high ✅ 2bbf2e9
  Rationale: `status`/`update`/`uninstall` all fail loudly (exit 1) with no config, but `apply` installs the default tool set and wires agents against a file that does not exist, producing state no later command can reproduce.
- [x] **BUG-03** `normalizeConfig` keys custom-tool versions by `process.platform` (`win32`/`darwin`), so documented `version.windows`/`version.macos` pins are silently dropped · `cmd/agentenv/src/config/schema.ts:754-757` · effort S · impact med ✅ 66f7227
  Rationale: the dotted form is documented and handled for `path.windows`/`path.linux`; only `version.linux` ever resolves, dropping a user's pin on two of three platforms without warning.
- [x] **BUG-04** `validateConfig` never type-checks boolean fields, so `tools.ripgrep = "false"` passes validation and is truthy downstream · `cmd/agentenv/src/config/schema.ts:782-794` · effort M · impact med ✅ d24800b
  Rationale: a quoted string makes generated `AGENTS.md` list the tool as enabled while `status` counts it as drift — a confusing, silent misconfiguration the schema currently accepts.
- [x] **BUG-05** `validateConfig` accepts orphaned custom tools and duplicate custom-tool names · `cmd/agentenv/src/config/schema.ts:806-816,1013-1030` · effort S · impact low ✅ d24800b
  Rationale: an entry that is neither `already_installed`-located nor `mise_source`-backed is silently excluded from the enabled list, and duplicate names silently collapse in the review diff via a `Map` keyed by name.
- [x] **BUG-06** `checkGNUCoreutils` ignores probe exit codes, so macOS Tier 0 GNU enforcement is inert · `cmd/agentenv/src/shell/detector.ts:227-264,281-289` · effort S · impact med ✅ 750bd60
  Rationale: the `grep -P`/`sed --version` probes and the `brew list` check never inspect `status`, so any BSD grep/sed is declared "GNU present" and the `brew install coreutils` path is dead code.
- [x] **BUG-07** Missing-utility detection is a no-op and is rendered on the wrong platform · `cmd/agentenv/src/shell/detector.ts:308-329` + `src/commands/status.ts:601-607` · effort S · impact med ✅ 750bd60
  Rationale: `cmd.exe /c where <util>` returns its failure via exit code (no throw), so `missingUtilities` is always empty; and the value is only computed on Windows while only rendered off Windows, so the line can never print.
- [x] **BUG-08** `updateWithMarkers` treats a partially-marked file (one marker) as user content and appends a second managed block · `cmd/agentenv/src/generate/agentsmd.ts:369-391` · effort S · impact med ✅ 00e3ef6
  Rationale: a crashed prior write leaves one marker; the next pass then replaces from the first start-marker to the later end-marker, clobbering any user text between them.
- [x] **BUG-09** Claude adapter `cleanup()` reports success on an unparseable `settings.json` and claims modifications when it changed nothing · `cmd/agentenv/src/adapters/claude.ts:176-192` · effort S · impact low ✅ 3529b92
  Rationale: a corrupt settings file is silently ignored (result says "cleaned up"), and a no-op run still rewrites the file and reports `filesModified`, churning the mtime of a file prone to Windows locks.
- [x] **BUG-10** `rtk init` spawn failure drops the OS error, reporting `failed (exit null)` with empty stderr · `cmd/agentenv/src/toolchain/rtk.ts:59-73` · effort S · impact low ✅ 3529b92
  Rationale: when `spawnSync` cannot launch rtk at all, `result.error.message` (EACCES, corrupt shim) is discarded, unlike `runMiseCaptured` which surfaces it.
- [x] **BUG-11** `gh auth status` non-zero is always read as "unauthenticated", including transient/network failures · `cmd/agentenv/src/toolchain/gh.ts:33-35` · effort S · impact low ✅ 916fc5e
  Rationale: `status` then asserts a definitive "unauthenticated" when the truth may be "couldn't tell", misleading users into re-authenticating needlessly.
- [x] **BUG-12** OpenCode adapter keys its "already up to date" message off rtk's exact English stdout text · `cmd/agentenv/src/adapters/opencode.ts:87-91` · effort S · impact low ✅ 3529b92
  Rationale: every other adapter uses the structured `success`/`stderr` fields; a rtk reword/version bump silently changes this adapter's user-facing message.
- [x] **BUG-13** Default-config generated `AGENTS.md` lists rtk twice under two `### Token Optimization` headings · `cmd/agentenv/src/generate/agentsmd.ts:113-138` · effort S · impact low ✅ 9c85129
- [x] **BUG-14** `status`/`doctor` flag tools `apply` deliberately skips as drift/fail · `cmd/agentenv/src/commands/status.ts:336-368`, `src/commands/doctor.ts:226-245` · effort M · impact high ✅ 1b5b802
  Rationale: `apply`'s verify classifies `manual` tools (no mise fallback on the platform — e.g. `tokei`/`rga`/`jless` on Windows) and `needs-new-terminal` tools as non-failures, but `status` (drift, exit 1) and `doctor` (`fail`) re-checked the bare PATH and contradicted it; a config whose only "missing" is a tool apply never tries to install would never pass a CI gate. Both commands now share `toolAvailabilityClassification()` so only a genuinely missing tool (`missing`) drifts/fails, and `exit-codes.md` documents the parity.
  Rationale: `rtk` has both a `TOOL_CATEGORIES` entry and a dedicated RTK section, so the default output contains a duplicated heading and bullet.

## UX & output   (UX-NN)

- [x] **UX-01** `--scope` values are never validated — `--scope usre` silently operates on project scope · `src/commands/update.ts:50-52`, `src/commands/setup.ts:151`, `src/commands/uninstall.ts:164-166` · effort S · impact med ✅ f0c27b4
  Rationale: a typo silently retargets the project scope (e.g. `update --scope usre` upgrades the project `mise.toml`), while the equivalent bad `scope` in the config file is a hard error; the flag should be a usage error (exit 2).
- [x] **UX-02** `shell-fix --dry-run` without `--revert` is silently ignored in show mode · `src/commands/shell-fix.ts:97-108` · effort S · impact low ✅ 4aaf1bf
  Rationale: the help text scopes `--dry-run` to `--revert`, but passing it alone prints the manifest as if the flag were absent; a usage error (like the `--json`+`--revert` guard) is clearer.
- [x] **UX-03** Shell-argument completion for `agentenv completion <Tab>` is only implemented for bash · `src/commands/completion.ts:74-77` vs `:97-205` · effort S · impact low ✅ a5897b8
  Rationale: zsh/fish/powershell users get flags instead of `bash zsh fish powershell` when completing the completion command's own argument.
- [ ] **UX-04** `setup --yes` in a directory with only a user-scope config writes a new project config instead of re-applying the existing one · `src/commands/setup.ts:151-198` · effort S · impact med
  Rationale: it resolves `configFilePath(scope)` without falling back to `findConfigPath()` (the wizard does), contradicting the README's "re-applies your existing `agentenv.toml`" and producing two divergent configs.
- [ ] **UX-05** Superpowers `detect` labels a missing `claude` CLI as `unsupported` instead of `missing` · `src/integrations/superpowers.ts:130-136` · effort S · impact low
  Rationale: `unsupported` means "agentenv can't automate this agent", but claude_code is the one agent it does automate; `missing` would fail apply loudly instead of silently skipping with a warning.

## New functionality   (FEAT-NN)

- [ ] **FEAT-01** `[generate] files` is fully plumbed through the schema but never consulted · `src/generate/agentsmd.ts:285-308` · effort S · impact med
  Rationale: editing the list has zero effect yet it is serialized, diffed and documented; honor it (generate only the listed files) or remove it from the schema/README.
- [ ] **FEAT-02** `ensureGlobalShimsDir` overwrites an existing user `shims_dir` with no undo record · `src/toolchain/mise.ts:263-294` · effort M · impact med
  Rationale: users with a custom `shims_dir` (scoop/dotfiles/XDG) get it silently replaced on every `apply`/`update`, and unlike the Tier 0 files there is no recorded prior value for `shell-fix --revert` to restore.

## Docs   (DOCS-NN)

- [ ] **DOCS-01** Command tables and the `doctor` description have drifted from the code · `cmd/agentenv/README.md:130-137`, `README.md:79-88`, `AGENTS.md` · effort S · impact low
  Rationale: `doctor`/`update`/`completion` and `apply --dry-run` are missing from the command tables, and "independent of any `agentenv.toml`" is misleading since `doctor` loads and validates the config and its exit code depends on it.

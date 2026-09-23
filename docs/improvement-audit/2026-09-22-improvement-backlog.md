# Improvement Backlog — 2026-09-22

Target: 40 · Found: 46 deduplicated items · Completed: 37/46 (+1 partial)

> **How to use this document — read before implementing anything.**
> As you finish each item, change `- [ ]` to `- [x]`, append ` ✅ <commit-sha>`,
> and bump the "Completed" counter above. This file is the source of truth for progress.
> One item = one commit, named like `fix(BUG-01): ...` / `feat(FEAT-02): ...`.

Catalogue audited: every module under `cmd/agentenv/src/` (commands, config, generate,
wizard, toolchain, shell, adapters, integrations, ui, utils), `.github/workflows/`, and
`docs/`, run through `.claude/skills/project-improvement-audit`. Method: a mechanical
harvest (build, lint, format:check, 392 tests + `--experimental-test-coverage`, `npm audit`,
`npm outdated`, gitleaks), then 6 sequential module-cluster batches. Each finding is
`file:line`-referenced and was checked against the code before being listed. No source
changes were made during the audit.

Baseline at audit time: build ✓ · lint ✓ · format ✓ · tests 392/392 ✓ · `npm audit` 0 vulns ·
gitleaks clean · line coverage 78% overall.

Themes this round:
- **(a) Edits to user-global files that are not safe.** One adapter overwrites
  unparseable settings. Detection code installs Homebrew packages, even from
  read-only commands. None of the adapter writes have a backup or undo.
- **(b) The generated agent instructions are wrong in visible ways.** RTK is
  misnamed. Tools that may not be installed are recommended. User-scope files
  are told they are in a "repository".
- **(c) Path resolution is still inconsistent.** The base dir comes from
  `config.scope` rather than from where the config was found. Agents installed
  with `-g` are checked in the project dir.

## Summary

| Lens | Count |  | Area | Count |
|------|-------|--|------|-------|
| bug | 18 |  | commands | 13 |
| ux | 11 |  | adapters | 7 |
| feature | 11 |  | generate | 7 |
| test / ci | 4 |  | config | 5 |
| a11y | 2 |  | ci / tests | 5 |
| | |  | shell | 4 |
| | |  | toolchain | 3 |
| | |  | ui | 2 |

## Cross-cutting sweeps   (SWEEP-NN)

- [x] **SWEEP-01** ✅ a1933fb [bug] Derive the base dir from the path the config was *found* at, not from `config.scope` (which `mergeWithDefaults` fills with `'project'`) — `src/commands/apply.ts:314`, `update.ts:137,207`, `status.ts:322`, `uninstall.ts:218`, `setup.ts:81`, `config/scopes.ts:36` · effort M · impact high
  A user-scope `~/.config/agentenv/agentenv.toml` without an explicit `scope = "user"` (or `update --scope user`) is loaded from there but applied/upgraded/uninstalled against `process.cwd()`.
- [x] **SWEEP-02** ✅ 01832a3 [bug] Add timeouts to every external `spawnSync` (mise self-update/up/captured, `rtk init`, `claude plugin`, `gh auth status`, `brew`, `where`/`which`) — `src/toolchain/mise.ts:468,497,597`, `toolchain/rtk.ts:60`, `integrations/superpowers.ts:46`, `toolchain/gh.ts:48`, `shell/detector.ts` · effort M · impact med
  None has a timeout, so a hung network call freezes `status`/`doctor`/`apply` indefinitely.
- [x] **SWEEP-03** ✅ 03eef83 [bug] Honor agent config-dir overrides (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `XDG_CONFIG_HOME` for copilot/opencode) and drop the `HOME || USERPROFILE || ''` relative fallback — `src/adapters/claude.ts:17`, `codex.ts:20`, `copilot.ts:19`, the `RtkDelegationAdapter` subclasses, `commands/status.ts:35-56` · effort M · impact med
  Users who relocate agent config get hooks written where the agent never reads them, and an unset HOME makes adapters write `.claude/` into the cwd.
- [~] **SWEEP-04** [bug] Check the real `rtk init -g` install locations for global-only agents (gemini_cli, cursor, windsurf, vibe) in both `status` and the adapter's `filesCreated` — `src/commands/status.ts:43-55`, `src/adapters/rtk-delegation.ts:111` · effort M · impact med — **partially done** ✅ 3bedfd2 (gemini_cli, cursor fixed and verified live against a real rtk install; windsurf/vibe left as a TODO in the source — live probe against an older rtk build was inconclusive/contradictory, needs re-verification against the pinned 0.49.0 via `smoke:real` before changing). `adapters/rtk-delegation.ts:111`'s own `expectedPath` still has the same unresolved issue for windsurf/vibe.
  These agents are wired into home-dir config, but both places look for `RTK.md` in the project `baseDir`.
- [x] **SWEEP-05** ✅ 5b26c73 [feature] `--json` output for the mutating commands `apply` / `update` / `uninstall` — `src/commands/apply.ts`, `update.ts`, `uninstall.ts` · effort M · impact med
  Only the read-only commands emit JSON. `ApplyResult` is already structured, yet CI has to scrape colored text.
- [x] **SWEEP-06** ✅ 52939e4 [feature] Back up user-global files before agentenv first edits them (`~/.claude/settings.json`, `~/.codex/config.toml`, user-scope `CLAUDE.md`/`AGENTS.md`) — `src/adapters/claude.ts`, `codex.ts`, `utils/fs-retry.ts` · effort M · impact med
  Tier 0 edits are recorded for `shell-fix --revert`, but the adapters' writes to the *same* files have no backup or undo.
- [x] **SWEEP-07** ✅ d5ee770 Add the minimum supported Node (22) to the CI matrix next to 24 — `.github/workflows/ci.yml:32,91`, `cmd/agentenv/package.json` `engines` · effort S · impact med
  `engines` promises `>=22.13.0`, but CI only runs Node 24 with `@types/node` 26, so a Node 23+-only API would ship unnoticed.
- [x] **SWEEP-08** ✅ 2cb00a9 [ci] Lint this repo with the tools it ships: add `actionlint`, `shellcheck` (smoke/stub scripts) and `gitleaks` steps to CI, and dogfood an `agentenv.toml` here — `.github/workflows/ci.yml` · effort M · impact med
  None of them run on this repo's own workflows or source today, and locally `actionlint`/`gitleaks` shims aren't even pinned (`mise ERROR No version is set for shim`).
- [x] **SWEEP-09** ✅ 10b33ad [test] Unit-test `update` (13% line coverage) via injectable mise runners, the same way `apply.test.ts` stubs rtk/claude — `src/commands/update.ts` · effort M · impact med
  `update` rewrites the global shims config and runs `mise self-update`/`mise up`, yet almost none of it is exercised.
- [ ] **SWEEP-10** [test] Raise coverage on the environment-touching modules: `commands/wizard.ts` (7%), `toolchain/rtk.ts` (60%), `commands/doctor.ts` (58%), `shell/detector.ts` (69%) · effort L · impact med
  The lowest-covered modules are the ones that touch real user machines, where regressions cost the most.
- [ ] **SWEEP-11** [ci] Add a coverage report/gate (`node --test --experimental-test-coverage`) to `npm test` or CI — `cmd/agentenv/package.json`, `.github/workflows/ci.yml` · effort S · impact low
  Coverage (78% lines / 77% branches) is invisible today, so it can drop silently.

## Correctness bugs   (BUG-NN)

- [x] **BUG-01** ✅ ee486a7 The Claude adapter overwrites an unparseable `~/.claude/settings.json` with only the rtk hook — `src/adapters/claude.ts:116-123` · effort S · impact high
  A trailing comma or comment makes `apply` silently wipe the user's permissions/env/model settings. The Tier 0 writers (`detector.ts:529`) already do the right thing: leave the file untouched and report it.
- [x] **BUG-02** ✅ b118bad `detectShell()` silently runs `brew install coreutils gnu-sed grep findutils gawk` on macOS, including from the read-only `status`/`doctor` — `src/shell/detector.ts:100-107,265-300`, `commands/doctor.ts:119`, `commands/status.ts:323` · effort M · impact high
  A "read-only" diagnostic installs five formulae with `stdio: 'ignore'` and no consent, bypassing the "mise does all installs" principle. Detection must be pure; installing should be an explicit, reported `apply` step.
- [x] **BUG-03** ✅ 1b58b11 Generated instructions call RTK "Red Teaming Kit" (it is Rust Token Killer) — `src/generate/agentsmd.ts:162` · effort S · impact high
  The misnomer lands in every generated `AGENTS.md`/`CLAUDE.md` and can make agents treat the hook as a security tool.
- [x] **BUG-04** ✅ 1b58b11 "General Instructions" is a hardcoded rg/fd/jq/bat/eza/delta list regardless of which tools are enabled — `src/generate/agentsmd.ts:147-155` · effort S · impact high
  With `bat`/`eza`/`delta` disabled (or skipped on the platform), agents are still told to use binaries that aren't installed. Generate the list from the enabled tools.
- [x] **BUG-05** ✅ 34259b9 `rtk` is resolved by a bare PATH lookup instead of through mise — `src/toolchain/rtk.ts:40-56`, `src/adapters/detect.ts:64-90` · effort S · impact high
  On a first `setup`, the rtk mise just installed is often not on PATH yet (`needs-new-terminal`), so every adapter fails. Otherwise an unpinned or name-colliding `rtk` earlier on PATH is used instead of the pinned 0.49.0. Use `mise which rtk` / `mise exec` in `baseDir`.
- [x] **BUG-06** ✅ 3bedfd2 In `status`, rtk-delegated agents show drift when rtk is disabled, and one shared `RTK.md` masks per-agent failures — `src/commands/status.ts:35-56,328-339` · effort M · impact high
  For six agents, `configured` just means `baseDir/RTK.md` exists. With `rtk.enabled = false`, every installed one is flagged as drift. Meanwhile one successful `rtk init` (or a skipped vibe) marks them all configured.
- [x] **BUG-07** ✅ 531e3ff A Tier 0 failure aborts mise install/verify for the whole apply — `src/commands/apply.ts:172-184,201` · effort S · impact med
  Tier 0 pushes to `errors`, and step 3 is gated on `errors.length === 0`, so one unpatchable agent settings file means no tools are installed.
- [x] **BUG-08** ✅ fc288f9 The wizard swallows `agentenv.toml` parse errors and silently starts from defaults — `src/commands/wizard.ts:55-60` · effort S · impact med
  A single TOML typo makes the wizard pre-fill defaults, then overwrite the user's real config on save instead of reporting the parse error.
- [x] **BUG-09** ✅ 40b64fd Re-saving `agentenv.toml` in setup strips the user's comments and formatting — `src/commands/setup.ts` (`saveAndApply`), `src/config/schema.ts:451` (`saveConfig`) · effort M · impact med
  `setup --yes` re-applying an existing hand-commented config (which `agentenv.toml.example` encourages) re-serializes it from scratch. At minimum, skip the save when the config is unchanged.
- [x] **BUG-10** ✅ 094de76 Git Bash is only looked for in four hardcoded `C:\Program Files` paths — `src/shell/detector.ts:44-49,89-99,742` · effort S · impact med
  Per-user (`%LOCALAPPDATA%\Programs\Git`), scoop and non-C: installs are missed. The fallback message says "not found on PATH", but PATH is never searched (`where git`).
- [x] **BUG-11** ✅ 18d9c98 The Codex adapter reports success when creating `config.toml` fails — `src/adapters/codex.ts:64-74` · effort S · impact low
  The error is pushed but `success` stays true, and `apply` only shows adapter errors when `success` is false, so the failure is invisible.
- [x] **BUG-12** ✅ df725fe The managed block ignores the target file's line endings — `src/generate/agentsmd.ts:361-478` (`updateWithMarkers`) · effort S · impact low
  On Windows, a CRLF `AGENTS.md` gets an LF block appended, which mixes line endings and makes diffs noisy.
- [x] **BUG-13** ✅ 7be51c4 `update --watch` watches the generated `mise.toml` with a config captured at startup, and dies on an editor's atomic-rename save — `src/commands/update.ts:218-268` · effort M · impact low
  It ignores `rename` events and never re-reads `agentenv.toml`, so it stops after the first save in most editors and misses the edits users actually make.

## UX & affordances   (UX-NN)

- [x] **UX-01** ✅ 1b58b11 Make the advice for pager-prone tools safe for agents (`bat --plain --paging=never`; `git --no-pager`; `delta` for humans only) — `src/generate/agentsmd.ts:153-155` · effort S · impact med
  Agents run non-interactively, so "use bat instead of cat" and "use delta for diffs" give decorated or paged output that wastes tokens or blocks. Do this together with BUG-04.
- [x] **UX-02** ✅ 1b58b11 Scope-aware wording in user-scope instruction files (no "This repository" / "in the repo root") — `src/generate/agentsmd.ts:89,172-178`, `src/commands/apply.ts` (`userScopeInstructionFiles`) · effort S · impact med
  The same text is written to `~/.claude/CLAUDE.md` etc., where "run `mise install` in the repo root" is wrong advice.
- [x] **UX-03** ✅ 1b58b11 Trim the generated block: merge the duplicate "Token Optimization" and "RTK Configuration" sections and drop "Supported Agents" — `src/generate/agentsmd.ts:92-106,131-168` · effort S · impact med
  This block is loaded into every agent session, so each redundant section costs tokens every session and changes nothing about how the agent behaves.
- [x] **UX-04** ✅ 07f436a Warn on unknown top-level keys/tables in `agentenv.toml`, with did-you-mean suggestions — `src/config/schema.ts:734-760` · effort S · impact med
  Typos like `[tool]`, `scop = "user"` or `[rtk] enable = true` are silently ignored, while typos *inside* known tables are errors.
- [x] **UX-05** ✅ e2ebd9a Warn when setup flags are ignored — `src/commands/setup.ts:230-253` · effort S · impact med
  Interactive `setup --scope user` and `setup --yes --agents codex_cli` over an existing config both drop what the user typed without saying so.
- [x] **UX-06** ✅ 3c7aca8 Fix the doubled "Tier 0: Tier 0: checked; …" prefix in the non-TTY skip message — `src/shell/detector.ts:750`, `src/commands/apply.ts:176` · effort S · impact low
  `apply` adds `Tier 0: ` to a message that already starts with it.
- [x] **UX-07** ✅ e2ebd9a `setup --yes` calls `loadConfig` without a guard in the existing/nearest-config branches — `src/commands/setup.ts:160,176` · effort S · impact low
  The `--config` branch reports parse errors with a themed message; these two fall through to the generic top-level handler.
- [x] **UX-08** ✅ 64de45d Usage errors exit 1 instead of 2 (`doctor --section` with no match; unknown tool names given to `uninstall`) — `src/commands/doctor.ts:325-333`, `src/commands/uninstall.ts:204-208` · effort S · impact low
  `docs/guides/exit-codes.md` promises exit 2 for invalid arguments on every command. Use `command.error()` as `parseScopeFlag` callers do.
- [x] **UX-09** ✅ ea15612 `doctor --section` still runs every check before filtering — `src/commands/doctor.ts:320-323` · effort S · impact low
  The flag is described as "only run one report section", but `gatherDoctor()` still spawns every mise/agent probe, so it is no faster.
- [x] **UX-10** ✅ 416d30f Add `--scope` to `apply` to match `update`/`uninstall`/`setup` — `src/commands/apply.ts:291-295` · effort S · impact low
  `apply` is the only command that reads the config but can't target the user config when a project config exists.
- [x] **UX-11** ✅ ee486a7 The Claude adapter rewrites `settings.json` even when the hook already exists — `src/adapters/claude.ts:135-136` · effort S · impact low
  Every `apply` reformats the user's settings file (and bumps its mtime) for no change, which creates spurious diffs in version-controlled dotfiles.

## Accessibility   (A11Y-NN)

- [x] **A11Y-01** ✅ 776b5f1 ASCII fallback for status/result glyphs (✓ ✗ ✅ ⚠️ ❌) on non-UTF-8 consoles and `TERM=dumb` — `src/ui/theme.ts:22-23`, `src/ui/output.ts:45-50` · effort S · impact low
  Legacy Windows consoles (code page other than 65001) and some screen readers show these as mojibake or long spoken names. `[ok]/[FAIL]/[warn]` keeps the text signal.
- [x] **A11Y-02** ✅ 8ecc585 A way to turn off the animated spinner but keep the output (`--no-spinner`, or honor `TERM=dumb`/`CI`) — `src/ui/spinner.ts` · effort S · impact low
  During the tens of seconds `apply` takes, a redrawing spinner floods screen readers. `--no-color` and `-q` exist, but nothing drops only the animation.

## New functionality   (FEAT-NN)

- [x] **FEAT-01** ✅ 3c7aca8 Let Tier 0 run without a TTY (`--shell-fix` flag / `tier0.mode = "auto" | "always" | "never"`) — `src/commands/apply.ts:175`, `src/shell/detector.ts:747` · effort S · impact high
  An AI agent running `agentenv apply`, the product's core audience, never has a TTY, so the Windows shell fix never happens and nothing can override that.
- [x] **FEAT-02** ✅ ded7738 Add an rtk section to `doctor`: on PATH, version against the pin, and a check for the Rust Type Kit name collision (`rtk gain` works) — `src/commands/doctor.ts` · effort S · impact high
  Every agent hook depends on rtk, and the generated `RTK.md` itself warns about the `reachingforthejack/rtk` collision, yet `doctor` never checks rtk.
- [ ] **FEAT-03** Add an "unwire agents" path: call the unused `BaseAdapter.cleanup()`, remove the marker blocks, and optionally delete the generated `mise.toml` — `src/adapters/base.ts`, `src/commands/uninstall.ts`, `src/generate/agentsmd.ts` · effort L · impact high
  `uninstall` only removes mise tools. Nothing removes the Claude hook, the codex config or the instruction blocks, and every adapter's `cleanup()` is dead code.
- [x] **FEAT-04** ✅ 1b58b11 Tell agents about the `rtk proxy <cmd>` escape hatch in the generated RTK section — `src/generate/agentsmd.ts:158-168` · effort S · impact med
  Seen during this audit: the rtk hook rewrote `rg -g …` / `rg --type …` into GNU `grep` and failed ("grep: unknown option -- g"), and agents have no hint on how to bypass the rewrite. Also worth reporting upstream to rtk.
- [x] **FEAT-05** ✅ 180c799 Search parent directories for the project `agentenv.toml` — `src/config/scopes.ts:48-54` · effort S · impact med
  Running `agentenv status` from `repo/src` silently falls through to the user config (or "no config"). git and mise search upward.
- [ ] **FEAT-06** Show a diff, or changed/unchanged per file, in `apply --dry-run`, including the Tier 0 plan — `src/commands/apply.ts:315-335` · effort M · impact med
  Dry-run only lists target paths, so users can't see what would change in the marker block, `mise.toml` or the user-global Tier 0 edits.
- [ ] **FEAT-07** Non-interactive config edits: `agentenv add|remove <tool|agent>` (or `agentenv config set tools.x true`) followed by apply — new `src/commands/*.ts`, `src/config/schema.ts` · effort M · impact med
  Today the only ways to change the config are the TTY-only wizard and hand-editing TOML. Agents themselves are the likeliest callers of "enable jq here".
- [ ] **FEAT-08** Layered config: merge the user config beneath project overrides instead of letting the project file shadow it completely — `src/config/schema.ts:406-445`, `src/config/scopes.ts` · effort L · impact low
  A project `agentenv.toml` has to repeat every user-level preference (agents, rtk, custom tools) because only the first file found is used.
- [ ] **FEAT-09** Detect rtk capabilities by version instead of string-matching the vibe error, and review the 0.49.0 pin — `src/toolchain/mise.ts:81-90`, `src/commands/apply.ts:245-256` · effort M · impact low
  Skipping vibe depends on parsing rtk's error text, and the fixed pin means users never get newer rtk agent support without an agentenv release.

---
## Execution Instructions

1. **Pick the mode per item.** Single-area items (`BUG`/`UX`/`A11Y`/`FEAT`): write a failing
   test first (`superpowers:test-driven-development`), then fix. `SWEEP-*` items touch several
   modules: list every site first, fix them all in one commit, then grep again to confirm none
   were missed.
2. **One item = one commit.** Reference the item ID in the commit subject, e.g.
   `fix(BUG-01): ...`. Tick the item in a separate `docs: tick BUG-01 in improvement
   backlog` commit, matching the previous round. Keep the ID out of the actual source
   diff (code comments, test names) — this file is deleted once the round is done, so an
   ID left behind in a comment becomes a dangling reference; the commit message is where
   that traceability belongs, since git history outlives this file.
3. **Mark progress here.** Flip `- [ ]` → `- [x]`, append ` ✅ <sha>`, and update the Completed counter.
4. **Fan out** (`superpowers:subagent-driven-development`) only for items that touch different
   files. BUG-03/BUG-04/UX-01/UX-02/UX-03/FEAT-04 all edit `generate/agentsmd.ts`: do them
   one after another. BUG-06 and SWEEP-04 both edit `status.ts:35-56`, so do them together.
5. **Verify before ticking.** From `cmd/agentenv/`: `npm run build && npm run lint && npm run format:check && npm test`
   (plus `npm run smoke` for apply/setup/adapter changes). For generator changes, re-read a
   freshly generated `AGENTS.md`. Done = all four gates green.
6. **Docs.** When flags or behavior change, update `docs/usage.md` / `docs/configuration.md` and
   `docs/guides/exit-codes.md` (UX-08) in the same commit. Release notes are generated
   (`release.yml --generate-notes`), so there is no CHANGELOG to edit.
7. **Suggested order:** BUG-01 → BUG-03 → BUG-04+UX-01 → BUG-02 → BUG-05 → FEAT-01 → FEAT-02 →
   SWEEP-01 → BUG-06+SWEEP-04 → BUG-07/08 → the remaining S items → M/L items (FEAT-03, SWEEP-06, SWEEP-10, FEAT-08).

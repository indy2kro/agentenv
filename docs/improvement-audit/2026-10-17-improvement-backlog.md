# Improvement Backlog — 2026-10-17

Target: 40 · Found: 39 deduplicated items (37 audited + 2 from user feedback) · Completed: 38/39

> **How to use this document — read before implementing anything.**
> As you finish each item, change `- [ ]` to `- [x]`, append ` ✅ <commit-sha>`,
> and bump the "Completed" counter above. This file is the source of truth for progress.
> One item = one commit, named like `fix(BUG-01): ...` / `feat(FEAT-02): ...`.

Catalogue audited: every module under `cmd/agentenv/src/` (commands, config, generate,
wizard, toolchain, shell, adapters, integrations, ui, utils, cli), `.github/workflows/`, and
`docs/`, run through `.claude/skills/project-improvement-audit`. Method: a mechanical
harvest (build, lint, format:check, 677 tests + `--experimental-test-coverage`, `npm audit`,
`npm outdated`, gitleaks, actionlint), then 6 sequential module-cluster batches plus one
re-check batch for the thinnest areas (config-edit, gh, remaining adapters). Each finding is
`file:line`-referenced and was checked against the code before being listed. SWEEP-01,
BUG-02 and SWEEP-02 were also reproduced. A scratch project with 2 agents and 7 tools was
applied with `apply --skip-mise-install --shell-fix never`, and the files the real
user-scope install had left in `~/.config/agentenv`, `~/.codex`, `~/.gemini` and `~/.vibe`
were inspected. BUG-08 was checked with `git ls-remote --tags` against both upstream repos.
The 2026-10-15 backlog (40/40 done) was compared so that completed items are not
re-reported. Where an item follows up an earlier one, it says so. The target is 40, but the
thinnest batches were re-checked and the list is not padded. No source changes were made
during the audit.

Baseline at audit time: build ✓ · lint ✓ · format ✓ · tests 674/677 ✓ (3 skipped) ·
`npm audit` 0 vulns · gitleaks clean · actionlint clean · coverage 87.3% lines / 83.6% branches.

Themes this round:
- **(a) The user layer leaks into project outputs.** Layering (FEAT-08, two rounds ago) is
  applied before *generating* committed files and wiring agents, not only before reading
  preferences. A project's `mise.toml`/`AGENTS.md` therefore depend on whoever ran apply,
  a project apply runs `rtk init -g` for agents only that developer enabled, and `add`
  can't declare something the user layer already enables.
- **(b) User scope still targets the wrong places.** Project-only `rtk init`s run inside
  `~/.config/agentenv`. `status` checks the copies there instead of `~/.claude/CLAUDE.md`
  and similar files. `update --watch` watches the wrong directory.
- **(c) "Succeeded" still isn't always true.** rtk's own `[y/N]` prompt is auto-declined for
  Gemini and Vibe, but apply reports success. The default Superpowers ref doesn't exist on
  the repo it's appended to. The wizard reports a clean apply after silently dropping pins,
  custom tools and marker settings.

## Summary

| Lens | Count |  | Area | Count |
|------|-------|--|------|-------|
| bug | 17 |  | commands | 20 |
| ux | 9 |  | generate | 4 |
| feature | 8 |  | adapters / integrations | 4 |
| test / ci | 2 |  | shell / toolchain | 4 |
| a11y | 1 |  | config | 2 |
| | |  | ci / tests | 2 |
| | |  | ui | 1 |

## Cross-cutting sweeps   (SWEEP-NN)

- [x] **SWEEP-01** [bug] Generate committed project files and run agent wiring from the project layer (plus defaults), not the user-layered config. Keep layering for local-only behavior — `src/config/schema.ts:461-476`, `commands/apply.ts:558,587-595`, `commands/status.ts:329`, `generate/agentsmd.ts:90-160`, `toolchain/mise.ts:103-140` · effort M · impact high ✅ 4d14341
  Reproduced: a project `agentenv.toml` enabling 2 agents and 7 tools produced an `AGENTS.md`/`mise.toml` listing ~30 tools and wired all 9 agents, because `~/.config/agentenv/agentenv.toml` enables them. That included `rtk init -g` for gemini/cursor/opencode/windsurf/vibe. So committed files differ per teammate, and a project apply changes global agent config. Decide whether layered agents/tools should be generated at all in project scope, and document the rule in `docs/configuration.md`. Follows up SWEEP-02 (2026-10-15), which only fixed *saving*.
- [x] **SWEEP-02** [bug] In user scope, don't run project-only `rtk init`s (codex `--codex`, copilot `--copilot`, cline, windsurf rules) with cwd `~/.config/agentenv`. Use the `-g` variant where rtk has one, otherwise skip with a message — `src/toolchain/rtk.ts:25-39`, `adapters/codex.ts:108-112`, `adapters/copilot.ts`, `adapters/cline.ts`, `adapters/windsurf.ts` · effort M · impact med ✅ 25ca45d
  Observed on the audit machine: `~/.config/agentenv` holds `RTK.md`, `.github/copilot-instructions.md`, `.clinerules`, `.windsurfrules` and an `AGENTS.md` ending in `@RTK.md`, while `~/.codex` has no `RTK.md`. A user-scope Codex therefore never gets the rtk guidance, and the files that were written are read by no agent.
- [ ] **SWEEP-03** (partly done: per-file floors are keyed by path, the defaults raised and the weak files ratcheted; `uninstall.ts` branches lifted 71% → 75% with executeUnwire/describeCleanup tests and the `apply`/`status`/`uninstall` floors raised. Still open: `index.ts` (its catch handler is unreachable from a subprocess — every command handles its own errors), `setup.ts`, `wizard.ts`, `detector.ts` and `superpowers.ts`, whose gaps are mostly platform-specific or real-spawn paths) [test] Raise the per-file coverage floors and the weakest files. Branches: `apply.ts` 62%, `shell-fix.ts` 64%, `setup.ts` 67%, `status.ts` 67%, `config-edit.ts` 69%, `uninstall.ts` 70%, `wizard.ts` 70%, `index.ts` 50%. Lines: `uninstall.ts` 75%, `detector.ts` 79%, `superpowers.ts` 80%, `mise.ts` 80%. Also key floors and rows by dist-relative path instead of basename — `cmd/agentenv/scripts/check-coverage.mjs:17-21,35-45` · effort M · impact med
  `DEFAULT_FLOOR` is 60% branches, far below the 75% global gate, so the command layer can keep slipping. Because rows are keyed by basename, the `index.js: {branches: 50}` override also loosens `adapters/index.js` and `integrations/index.js`, and `ui/output.js`/`utils/output.js` collide. Follows up SWEEP-06 (2026-10-15).
- [x] **SWEEP-04** [ci] Add release-shaped gates to CI. (1) A packed-tarball smoke job: `npm pack`, install the `.tgz` into a clean dir, run `agentenv --version` and `apply --dry-run --json`. (2) An `npm audit --omit=dev` step — `.github/workflows/ci.yml:16-75`, `release.yml:113` · effort S · impact med ✅ 6c6b833
  CI only tests `dist/` in-tree, and release only runs `npm pack --dry-run`. A broken `files` list, a missing shebang or an ESM path issue would first show up for users after publish. The audit is only run by hand during these audits.

## Correctness bugs   (BUG-NN)

- [x] **BUG-01** Re-running the wizard drops `custom_tools`, `tool_versions`, `rtk.init`, `tier0` and `generate` settings from the existing config — `src/commands/wizard.ts:134,291-298`, `wizard/build.ts:164-191` · effort M · impact high ✅ ccad8aa
  `buildConfigFromSelections` starts from scratch: `customTools = []`, every `rtk.init` true, `tier0`/`generate` hardcoded, no `tool_versions`. So `agentenv setup` on an existing project deletes pins, custom binaries and marker/file settings. Start from `existing` and override only what the wizard asked about. Offer to keep the existing custom tools in step 3.
- [x] **BUG-02** Gemini and Vibe rtk wiring is reported as "succeeded" although rtk declined its own `[y/N]` prompt and installed no hook — `src/toolchain/rtk.ts:34,38,88-92`, `adapters/rtk-delegation.ts:186-197`, `adapters/gemini.ts:18` · effort S · impact high ✅ 04c69c6
  Reproduced: apply printed `rtk init -g --gemini succeeded: Patch …\.gemini\settings.json with RTK hook? [y/N] Skipped`, and the same for vibe. `~/.gemini/settings.json` has no hook and `~/.vibe/hooks.toml` doesn't exist, yet apply exits 0. Pass `--auto-patch` (rtk supports it), and fail when `expectedFile` is still missing afterwards. Gemini's `expectedFile` is the shared project `RTK.md`, which other agents create, so that check can never catch this. Follows up BUG-12 (2026-10-15), which assumed vibe writes `hooks.toml`.
- [x] **BUG-03** `setup --yes --superpowers` without a ref leaves Superpowers disabled — `src/commands/setup.ts:274-279` · effort S · impact med ✅ 2454fd0
  Commander passes `true` for a bare optional-value flag, and the ternary maps every non-string to `undefined` ("off"). The documented `[ref]` is optional, and the summary line even prints `Superpowers off`. Tests only cover a string ref (`setup.test.ts:111`).
- [x] **BUG-04** Built-in version pins override the user's `tool_versions` in `mise.toml`, while `status` gives `tool_versions` priority — `src/toolchain/mise.ts:136-137`, `commands/status.ts:413` · effort S · impact med ✅ 1223f18
  `PINNED_TOOL_VERSIONS[miseName] || config.tool_versions?.[toolKey]`, so `tool_versions.rtk = "0.50.0"` is silently ignored. `status` uses the opposite precedence and then reports version drift forever. The user's pin should win in both places, which matches `docs/configuration.md`.
- [x] **BUG-05** `status` checks Superpowers in `process.cwd()` instead of the config's base dir — `src/commands/status.ts:466-469`, `config/scopes.ts:36-38`, `commands/apply.ts:461-462` · effort S · impact med ✅ 1215967
  `resolveScopeDir('project')` returns cwd, while apply installs relative to `baseDir`. So `status` run from a subdirectory reports the integration as missing. A leftover from SWEEP-01 (2026-10-15).
- [x] **BUG-06** Generated `AGENTS.md` ignores custom tools' `description` and leaves out `already_installed` custom binaries entirely — `src/generate/agentsmd.ts:136-141,293-300` · effort S · impact med ✅ d498cc3
  A mise-sourced custom tool renders as "Available via agentenv" with its name as the binary. Path-based custom tools, the main reason to declare one, are never shown to the agent.
- [x] **BUG-07** `agentenv add <key>` plans against the user-layered view, so adding a tool the user config already enables reports "Nothing to change" — `src/commands/config-edit.ts:147,161-173,195` · effort S · impact med ✅ 4886395
  A developer whose personal config enables `jq` can't make the shared project require it with `add`, so teammates without that user config never get it. Plan against the unlayered project file. Do this together with SWEEP-01.
- [x] **BUG-08** (resolved: install from the official marketplace, and the `ref` setting was removed entirely) The Superpowers ref is appended to the marketplace repo (`obra/superpowers-marketplace#v6.3.0`), which has no such tag — `src/integrations/superpowers.ts:237-243`, `config/schema.ts:226` · effort M · impact med
  `git ls-remote --tags` shows the marketplace repo only has `v1.0.12`, while `v6.3.0` is an `obra/superpowers` tag. So the default ref either fails `claude plugin marketplace add`, or (with a valid catalog ref) pins the catalog, not the plugin. Re-check the pinning design in `docs/research/superpowers-install-mechanisms.md` against a real `claude` CLI before changing the code.
- [x] **BUG-09** In user scope, `status` checks `~/.config/agentenv/AGENTS.md`/`CLAUDE.md` instead of the per-agent files apply actually manages (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, …) — `src/commands/status.ts:441-455`, `commands/apply.ts:299-310` · effort M · impact med ✅ b3fb09b
  A removed or stale managed block in the file Claude/Codex actually load is never reported as drift for user-scope installs. Reuse `userScopeInstructionFiles()` for the check.
- [x] **BUG-10** `agentenv update` runs `mise up` synchronously with a 120 s timeout and no output. Upgrading a full tool list gets killed and is reported as `failed (exit null): ` — `src/toolchain/mise.ts:610-640`, `commands/update.ts:219-229` · effort M · impact med ✅ bfef4a3
  `spawnSync` freezes the spinner, and ~30 `latest` tools routinely take longer than 2 minutes. When it times out, the error message is empty. Stream the output with the async spawn that `runMiseInstall` uses, and report a timeout as a timeout.
- [x] **BUG-11** `tokei` is listed in `AGENTS.md` as available, although agentenv never installs it (fallback-required) and it isn't on PATH — `src/generate/agentsmd.ts:123-141`, `toolchain/fallbacks.ts:11-17` · effort S · impact low ✅ d118119
  BUG-03 (2026-10-15) added a caveat for platform-unsupported tools, but not for `FALLBACK_REQUIRED_TOOLS`. So agents are told to run a binary that `mise install` will never provide. Add "(install manually)" or omit it in user scope.
- [x] **BUG-12** `AGENTS.md` tells every agent that rtk "automatically rewrites commands", including agents with no rewrite hook — `src/generate/agentsmd.ts:146-160` · effort S · impact low ✅ d118119
  rtk gives windsurf/cline an `RTK.md` that says "Prefix every shell command with `rtk`", so the same project contains two contradictory instructions. Word the line conditionally, based on whether any enabled agent has no hook.
- [x] **BUG-13** `[advanced]` is documented as "parsed/round-tripped", but `configToToml` never writes it, so any save deletes it — `src/config/schema.ts:522-700,802-811`, `docs/configuration.md:168,389-391` · effort S · impact low ✅ 7edf2ca
  `add`/`remove`/`setup` rewrite the file and silently drop the `[advanced]` table that `agentenv.toml.example` tells users to set. Serialize it, or remove the table and its docs.
- [x] **BUG-14** `update --watch` in user scope watches the wrong directory. It fires on `agentenv.toml` edits without regenerating `conf.d` — `src/commands/update.ts:276-278,316-329`, `toolchain/mise.ts:181-185` · effort S · impact low ✅ 51fec4e
  The watcher combines `scopeDir` (`~/.config/agentenv`) with the basename of `~/.config/mise/conf.d/agentenv.toml`. So it reacts to the agentenv config itself and runs `mise up` against a mise file that was never regenerated. Do this together with FEAT-08.
- [x] **BUG-15** A corrupt `shell-fix-state.json` is treated as "no state" and then overwritten. That loses the only record `shell-fix --revert` restores from — `src/shell/shell-fix-state.ts:53-62`, `shell/detector.ts:912`, `toolchain/mise.ts:493` · effort S · impact low ✅ 88f97aa
  `readShellFixState` returns `null` on any parse error, and `mergeShellFixEntries(null, …)` then replaces the file. Keep the corrupt file as `.corrupt` and warn instead.

## UX & affordances   (UX-NN)

- [x] **UX-01** `setup --yes --json` scrapes console output instead of reusing apply's structured result — `src/commands/setup.ts:301-330` · effort M · impact med ✅ 23bcc1c
  There is no `configPath`/`baseDir`/`warnings`, errors carry the `✗`/`[FAIL]` glyph, warnings are mixed into `messages`, and the result-box text ends up in the document. Have `saveAndApply` return the `ApplyResult` and build the document with `buildApplyJsonResult`, as `add --json` does. Follows up FEAT-02 (2026-10-15).
- [x] **UX-02** Apply's success line says "everything is configured and verified" even with `--skip-mise-install`, when nothing was installed or verified — `src/commands/apply.ts:671-676` · effort S · impact low ✅ 46dcd58
  CI setups that skip installs get a false verification claim. Say "files written; tools not installed (--skip-mise-install)" instead.
- [x] **UX-03** Ctrl+C in the wizard (or any prompt) prints "User force closed the prompt with SIGINT" plus a `--debug` hint and exits 1 — `src/index.ts:70-86`, `commands/wizard.ts:107-316` · effort S · impact low ✅ 65885d8
  Aborting a prompt is a normal cancel. Catch `ExitPromptError`, print "Cancelled", exit 130, and document it in `docs/guides/exit-codes.md`.
- [x] **UX-04** Doctor's missing-tool hint always says "run `mise install` in this project", also in user scope — `src/commands/doctor.ts:422-425` · effort S · impact low ✅ d56805c
  In user scope the fix is `agentenv apply --scope user`, so the hint sends users to the wrong directory.
- [x] **UX-05** Agent wiring output dumps rtk's whole stdout on one line, cut off with `...` after 400 characters — `src/toolchain/rtk.ts:195-207`, `commands/apply.ts:441-457` · effort S · impact low (decided to keep as is: it is the only record of what rtk changed, and it exposed the Gemini/Vibe bug) ✅ (dropped)
  Lines like "Cursor: … RTK hook registered … Legacy [tee] config detected … sqlite recall store …" bury the one fact that matters (which file was wired), and they hid BUG-02's "Skipped" prompts. Keep a short summary on the console and put the full output under `--debug`/JSON.
- [x] **UX-06** Put a "managed by agentenv — edits inside this block are overwritten on apply" note inside the generated block — `src/generate/agentsmd.ts:102-104,502-536` · effort S · impact low ✅ d118119
  People and agents editing a committed `AGENTS.md` can't tell that the region between the HTML comments is regenerated, and apply silently discards their edits.
- [x] **UX-07** `add`/`remove --json` reports `warnings: []` instead of the config's validation warnings — `src/commands/config-edit.ts:152-159,221` · effort S · impact low ✅ ed3d9fd
  `apply --json` includes `report.warnings`, but the add/remove path hardcodes an empty list, so an agent editing the config never sees unknown-key or path warnings.
- [x] **UX-08** The gh auth probe hardcodes `--hostname github.com`, so GitHub Enterprise users always see an auth warning — `src/toolchain/gh.ts:43-52` · effort S · impact low ✅ 814b427
  `GH_HOST` and a gh login to an enterprise host are ignored, so status shows a false "not authenticated" on GHE-only machines.
- [x] **UX-09** Warn before `uninstall` removes tool versions from the shared mise store that other configs still declare — `src/commands/uninstall.ts:673-695` · effort M · impact low ✅ e87a212
  `mise uninstall --all` affects the whole store. Cleaning one project can break the user-scope config and every other project that uses the same tool. At least name the user-scope config when it also enables a target.

- [x] **UX-10** Stop counting "not managed by mise; install manually" tools as `doctor` warnings — `src/commands/doctor.ts:416-421` · effort S · impact low ✅ 41e05a4
  From a real run on Windows: `tokei`, `rga` and `jless` can never be installed through mise there, yet each is a `[warn]`, so the box says "8 warnings" and never turns green. Show them as informational (or list them once, collapsed), and keep `warn` for things the user can act on. Same for `status`, which prints them as `-`.

## Accessibility   (A11Y-NN)

- [x] **A11Y-01** The result box always draws `┌─│└┘` borders, even in ASCII mode (`AGENTENV_ASCII`, `TERM=dumb`, a legacy code page) — `src/ui/output.ts:109-119`, `ui/theme.ts:47-70` · effort S · impact low ✅ d7a0748
  The glyphs fall back to `[ok]`/`[FAIL]`, but the frame doesn't. Legacy consoles show mojibake, and screen readers announce dozens of "box drawings light horizontal" around every result. Use `+-|` in ASCII mode.

## New functionality   (FEAT-NN)

- [x] **FEAT-01** Add `--scope` to `status` and `doctor` — `src/commands/status.ts:794-795`, `commands/doctor.ts:539-543` · effort S · impact med ✅ 54aec59
  apply/update/uninstall/add/remove accept `--scope`, but the read-only checks only use the nearest config. From inside a project there is no way to inspect the user-scope setup.
- [x] **FEAT-02** Add a `fix` command field to status drift entries and doctor items in `--json` — `src/commands/status.ts:81-127`, `commands/doctor.ts:50-54` · effort M · impact med ✅ 2f4081e
  The generated instructions send agents to `doctor --json`/`status --json` (FEAT-01, 2026-10-15), but the remediation is only free text in `detail`. An agent has to guess which command to run.
- [x] **FEAT-03** Make `update --check` report which tools actually have newer versions (`mise outdated --json`), and say so in the JSON and the exit code — `src/commands/update.ts:151,194-244` · effort M · impact med
  Today `--check` only prints the `mise up <list>` it would run. Neither a person nor an agent can tell whether an update is pending.
- [x] **FEAT-04** Add `apply --only files|tools|agents` to run a single step — `src/commands/apply.ts:313-474` · effort M · impact med
  Regenerating `AGENTS.md` today also runs `mise install` and every `rtk init`, several of them global. `--skip-mise-install` still re-wires every agent.
- [x] **FEAT-05** Make `apply --dry-run` list the files each agent adapter will touch, and flag global (`-g`) writes made from a project-scope apply — `src/commands/apply.ts:588-631`, `toolchain/rtk.ts:29-38` · effort M · impact med
  A project apply runs `rtk init -g` for opencode/gemini/cursor/windsurf/vibe, and cursor's also registers the Claude Code hook. Users can't preview that the agent config in their home directory will change. Do this after SWEEP-01.
- [x] **FEAT-06** Make `doctor` check `custom_tools`, Superpowers and the managed instruction blocks, as `status` does — `src/commands/doctor.ts:398-508` · effort M · impact low ✅ 4bb9e82
  Agents are told to diagnose with `doctor --json`, but a missing custom binary or a stripped managed block doesn't show up there.
- [x] **FEAT-07** Support version pins and custom tools from the CLI (`agentenv add jq@1.7.1`, `agentenv add --custom …`) — `src/commands/config-edit.ts:161-195` · effort M · impact low ✅ 66a95ec
  `add`/`remove` only toggle boolean keys. `tool_versions` and `custom_tools` need a hand edit or the wizard, and the wizard drops them (BUG-01).
- [x] **FEAT-08** Make `update --watch` watch `agentenv.toml` and re-apply, instead of watching the generated `mise.toml` — `src/commands/update.ts:283-383` · effort M · impact low
  Users edit `agentenv.toml`. The only writer of `mise.toml` is `apply`, which already installs, so the current watch almost never does useful work.

- [x] **FEAT-09** Make `doctor` check that the mise shims are not shadowed by other executables earlier on PATH — `src/commands/doctor.ts:344-350`, `toolchain/mise.ts` (`shimsDirOnPath`) · effort M · impact med ✅ 2cfaf08
  From a real run: `agentenv doctor` said "shims on PATH — ok" and every tool `[ok]`, while `mise doctor` warned that ast-grep, bat, delta, fd, fzf, gh, jq, node and rg all resolve to other copies first (WinGet Links, `C:Program Filesphp85g.exe`, …) because `~/.local/bin` comes late. The agent then runs a different version than the one agentenv pinned. Compare each enabled tool's first PATH hit with its shim, and tell the user to move the shims dir earlier. Do this together with FEAT-02.

---
## Execution Instructions

1. **Pick the mode per item.** Single-area items (`BUG`/`UX`/`A11Y`/`FEAT`): write a failing
   test first (`superpowers:test-driven-development`), then fix. `SWEEP-*` items touch several
   modules: list every site first, fix them all in one commit, then grep again to confirm none
   were missed.
2. **One item = one commit.** Reference the item ID in the commit subject, e.g.
   `fix(BUG-01): ...`. Tick the item in a separate `docs: tick BUG-01 in improvement
   backlog` commit, matching the previous rounds. Keep the ID out of the source diff
   (code comments, test names). This file is deleted when the round is done, and IDs are
   reused next round.
3. **Mark progress here.** Flip `- [ ]` → `- [x]`, append ` ✅ <sha>`, and update the Completed counter.
4. **Fan out** (`superpowers:subagent-driven-development`) only for items that touch different
   files. SWEEP-01, BUG-07 and FEAT-05 all depend on the same layering decision: do them in
   that order. SWEEP-02 and BUG-02 both edit `toolchain/rtk.ts` (`RTK_INIT_FLAGS`), and UX-05
   touches `rtkMessage` in the same file. BUG-06, BUG-11, BUG-12 and UX-06 all edit
   `generate/agentsmd.ts`. BUG-05 and BUG-09 share `status.ts:441-470`, and FEAT-01/FEAT-02
   also edit `status.ts`/`doctor.ts`. BUG-14 and FEAT-08 are the same watcher, and BUG-10 and
   FEAT-03 both edit `update.ts`.
5. **Verify before ticking.** From `cmd/agentenv/`: `npm run build && npm run lint && npm run format:check && npm test`
   (plus `npm run smoke` for apply/setup/adapter changes). For generator changes, re-read a
   freshly generated `AGENTS.md`/`CLAUDE.md`. For SWEEP-01, apply a two-agent project config
   while a user config enabling more agents/tools exists, and check that the generated files
   only reflect the project. For BUG-02, check `~/.gemini/settings.json` for the hook after
   apply (use a temp `HOME`). For BUG-08, run the real `claude plugin marketplace add` once.
   Done = all four gates green.
6. **Docs.** When flags or behavior change, update `docs/usage.md` / `docs/configuration.md` and
   `docs/guides/exit-codes.md` in the same commit. Release notes are generated
   (`release.yml --generate-notes`), so there is no CHANGELOG to edit.
7. **Suggested order:** BUG-02 → BUG-01 → SWEEP-01 → BUG-07 → BUG-03 → BUG-04 → BUG-05 →
   BUG-06 → SWEEP-02 → BUG-09 → BUG-08 → the remaining S items → M items (UX-01, BUG-10,
   FEAT-01..05, SWEEP-03, SWEEP-04) → the low-impact FEATs.

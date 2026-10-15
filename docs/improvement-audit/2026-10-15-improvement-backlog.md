# Improvement Backlog — 2026-10-15

Target: 40 · Found: 40 deduplicated items · Completed: 0/40

> **How to use this document — read before implementing anything.**
> As you finish each item, change `- [ ]` to `- [x]`, append ` ✅ <commit-sha>`,
> and bump the "Completed" counter above. This file is the source of truth for progress.
> One item = one commit, named like `fix(BUG-01): ...` / `feat(FEAT-02): ...`.

Catalogue audited: every module under `cmd/agentenv/src/` (commands, config, generate,
wizard, toolchain, shell, adapters, integrations, ui, utils), `.github/workflows/`, and
`docs/`, run through `.claude/skills/project-improvement-audit`. Method: a mechanical
harvest (build, lint, format:check, 630 tests + `--experimental-test-coverage`, `npm audit`,
`npm outdated`, gitleaks, actionlint), then 6 sequential module-cluster batches. Each finding
is `file:line`-referenced and was checked against the code before being listed. SWEEP-01 was
also reproduced with `apply --dry-run --json` from a subdirectory. The previous three backlogs
(2026-09-18, -19, -22) were compared so that completed items are not re-reported. SWEEP-04's
unfinished windsurf/vibe part is carried over as BUG-12. No source changes were made during
the audit.

Baseline at audit time: build ✓ · lint ✓ · format ✓ · tests 628/630 ✓ (2 skipped) ·
`npm audit` 0 vulns · gitleaks clean · actionlint clean · coverage 86.5% lines / 82.6% branches.

Themes this round:
- **(a) Newer features don't agree with older ones.** The upward config search (FEAT-05)
  and layered config (FEAT-08) were only partly carried through. `apply`/`update`/`uninstall`
  still use `cwd` as the project dir. setup, the wizard and add/remove save the merged
  user layer into the project file.
- **(b) The generated instructions still mislead agents.** The project `CLAUDE.md` links
  to AGENTS.md, but Claude Code never loads a link, so Claude doesn't see the tool list.
  Tools that can't be installed on the platform are still listed. `ast_grep` is advertised
  as `sg`, which is a different program on Linux.
- **(c) "Done" reports that aren't true.** Unwire reports success for 7 agents but changes
  nothing. `status` counts an agent as configured when its config file exists, even if the
  hook isn't in it. Copilot is "detected" because `gh` is installed.

## Summary

| Lens | Count |  | Area | Count |
|------|-------|--|------|-------|
| bug | 18 |  | commands | 15 |
| ux | 11 |  | generate | 6 |
| feature | 7 |  | adapters | 5 |
| test / ci | 2 |  | shell / toolchain | 5 |
| a11y | 1 |  | ci / tests / docs | 4 |
| maintenance | 1 |  | ui / utils | 3 |
| | |  | config | 2 |

## Cross-cutting sweeps   (SWEEP-NN)

- [ ] **SWEEP-01** [bug] Derive the project base dir from the directory the config was *found* in, not `process.cwd()`. Do this in `apply`, `update`, `uninstall` and the wizard, and make `--scope project` search upward too — `src/commands/apply.ts:550`, `update.ts:199,275`, `uninstall.ts:406,569`, `wizard.ts:312`, `config/scopes.ts:36-42` · effort M · impact high
  `findConfigPath()` searches parent directories. So `agentenv apply` run from `repo/src` loads `repo/agentenv.toml` but writes `mise.toml`/`AGENTS.md`/`CLAUDE.md` into `repo/src`. Reproduced: `baseDir` = `…/gen/sub` while `configPath` = `…/gen/agentenv.toml`. `status` (`status.ts:224`) and `setup` (`setup.ts:83`) already use `dirname(configPath)`, so they check a different directory than the one `apply` writes to.
- [ ] **SWEEP-02** [bug] Don't save layered user-config values into the project `agentenv.toml`. Save only the project layer (or the user's edit applied on top of it) — `src/commands/setup.ts:199,220,274`, `wizard.ts:94,312`, `config-edit.ts:146,203,223`, `config/schema.ts:500` · effort M · impact med
  These callers load with `layerUserConfig: true`. `saveConfig` compares the result against an *un-layered* load. So when a user config exists, `setup --yes`, the wizard and `agentenv add jq` rewrite the project file with the user's agents/rtk/tools merged in, and strip its comments.
- [ ] **SWEEP-03** [bug] Make `uninstall --unwire` remove rtk-delegated wiring, using rtk's own uninstall or by deleting the files rtk wrote — `src/adapters/rtk-delegation.ts:149-157`, `copilot.ts:98-107`, `opencode.ts:98-107`, `codex.ts:124-133`, `commands/uninstall.ts:270-290,472-481` · effort M · impact med
  `cleanup()` returns success without changing anything for codex, copilot, opencode, gemini, cursor, windsurf, cline and vibe. `Unwired N agent(s)` leaves every rtk hook and plugin in place, and they break once rtk is uninstalled. This follows up the previous round's FEAT-03.
- [ ] **SWEEP-04** [feature] Give every command's `--json` output one envelope shape with a `schemaVersion`. Fold in apply's early-failure documents, which drop `configPath`/`baseDir`/`warnings` — `src/commands/apply.ts:77-101,496-498,535-541`, `update.ts:93-95`, `config-edit.ts:118-121,170-200`, `uninstall.ts:495-500`, `docs/usage.md:296` · effort M · impact med
  apply/update emit `{success,messages,errors}`, add/remove/uninstall emit `{success,message}`, and only status/doctor/shell-fix carry `exitCode`, although `usage.md` says `--json` always does. A script that consumes several commands needs per-command parsing.
- [ ] **SWEEP-05** [bug] Send the remaining direct writes through `writeFileWithRetry` — `src/shell/shell-fix-state.ts:68`, `toolchain/mise.ts:380`, `integrations/superpowers.ts:72-124` · effort S · impact low
  These skip the EBUSY/EPERM retry used everywhere else on Windows. If the write of the shell-fix state file fails, the only record `shell-fix --revert` can restore from is lost.
- [ ] **SWEEP-06** [test] Add per-file branch-coverage floors to `test:coverage` and raise the weakest files: `index.ts` 50%, `setup.ts` 59%, `apply.ts` 61%, `shell-fix.ts` 64%, `status.ts` 66%, `wizard.ts` 67%, `config-edit.ts` 68%, `uninstall.ts` 69%. Also cover the configureHooks failure paths in `adapters/copilot.ts` (73% lines) and `opencode.ts` (70% lines, 62.5% functions) — `cmd/agentenv/package.json` (`test:coverage`) · effort M · impact med
  The gate is global only (80/75/80), so the overall figure hides weak branch coverage in the command layer, which is where this round's bugs are.
- [ ] **SWEEP-07** Remove the 56 leftover backlog IDs (`FEAT-05`, `SWEEP-01`, …) from 22 source/test files, including comments in `status.ts:220`, `setup.ts:78`, `schema.ts:417`, `uninstall.ts:352` and test names in `cli/contract.test.ts` · effort S · impact low
  The 2026-09-22 execution instructions said to keep IDs out of the source. The backlog they point to has been deleted (`1253c1f`), and this round reuses the same IDs for different items, so the references now point at the wrong things.
- [ ] **SWEEP-08** [ci] Harden the release job. Pin npm instead of `npm install -g npm@latest`, and push the version commit/tag before `npm publish` (or make publishing the last step) — `.github/workflows/release.yml:61-62,146-160` · effort S · impact med
  Every action and dependency is pinned except the npm that runs with `id-token: write`. And if the push fails after publishing, the version is on npm with no tag or commit in git, and it can't be republished.

## Correctness bugs   (BUG-NN)

- [ ] **BUG-01** The project `CLAUDE.md` links to AGENTS.md (`[AGENTS.md](./AGENTS.md)`) instead of importing it with `@AGENTS.md` — `src/generate/agentsmd.ts:199-231` · effort S · impact high
  Claude Code loads `@path` imports but doesn't follow markdown links. In project scope, Claude never sees the tool list or the rtk guidance, even though the file says it exists because Claude "doesn't read AGENTS.md natively".
- [ ] **BUG-02** `setup` "detects" Copilot when `gh` is on PATH — `src/adapters/detect.ts` (`AGENT_COMMANDS.copilot: ['gh']`) · effort S · impact med
  `gh` is a Tier 1 tool that agentenv installs itself. So `setup --yes` enables Copilot for nearly everyone, and `rtk init --copilot` then writes `.github/copilot-instructions.md` and `.github/hooks/` into repos that don't use Copilot. Detect the `copilot` CLI instead.
- [ ] **BUG-03** Generated instructions list tools that aren't installed on the platform (`ripgrep_all`/`rga` and `jless` on Windows) — `src/generate/agentsmd.ts:253-275`, `toolchain/fallbacks.ts` (`PLATFORM_UNSUPPORTED_TOOLS`) · effort S · impact med
  `getEnabledToolsForOutput` never checks `isPlatformUnsupported`. The audited machine's own `~/.claude/CLAUDE.md` advertises `rga`/`jless` on Windows. Omit them in user scope. A project `AGENTS.md` is committed and read on several OSes, so mark them "(not on Windows)" there instead.
- [ ] **BUG-04** `status` counts an agent as configured when its config file exists, not when the hook or managed block is actually in it — `src/commands/status.ts:37-70,356-358` · effort M · impact med
  `claude_code` counts as configured whenever `~/.claude/settings.json` exists, and `copilot` whenever `.github/copilot-instructions.md` exists. A removed hook, or an unrelated file that was already there, is never reported as drift for the two most common agents.
- [ ] **BUG-05** `ast_grep` is advertised and resolved as `sg`, but on Linux `sg` is shadow-utils' set-group command — `src/config/schema.ts:340`, `generate/agentsmd.ts:18` · effort S · impact med
  On most Linux distros `/usr/bin/sg` exists, so status/verify report ast-grep as resolvable when it isn't installed, and agents told to run `sg` run the wrong program. Use `ast-grep`.
- [ ] **BUG-06** On macOS, Tier 0 ignores `--shell-fix never` / `tier0.mode` / a missing TTY and runs `brew install` anyway — `src/shell/detector.ts:923-1007,352-384` · effort S · impact med
  The `complex`/writeFiles flag only gates the Windows branch. An agent's non-TTY `apply` on macOS still installs five Homebrew formulae (up to 120 s each) without consent.
- [ ] **BUG-07** npm-installed CLIs can't be spawned on Windows, which breaks the Superpowers integration — `src/adapters/detect.ts:64-90` (`resolveBinary`), `integrations/superpowers.ts:40-55` · effort S · impact med
  `where.exe` lists the extensionless sh shim before `*.cmd` (checked with `npm` on the audit machine). Spawning the shim fails with ENOENT. Since Node's CVE-2024-27980 fix, spawning the `.cmd` without a shell fails with EINVAL.
- [ ] **BUG-08** The generated `CLAUDE.md` always says "RTK hooks are configured" and "All tools listed in AGENTS.md are available" — `src/generate/agentsmd.ts:224-226` · effort S · impact med
  Both lines appear even with `rtk.enabled = false` and when tools were skipped on the platform, so every Claude session is told about hooks and tools that aren't there. Do this together with BUG-01.
- [ ] **BUG-09** `writeFileWithRetry` overwrites files in place instead of writing a temp file and renaming it — `src/utils/fs-retry.ts:64-80` · effort S · impact med
  `~/.claude/settings.json`, `~/.codex/config.toml` and the agent shell configs are rewritten in place. An interrupted apply (Ctrl-C, crash, antivirus lock mid-write) can leave a truncated file that the agent then refuses to load.
- [ ] **BUG-10** Tool verification is still skipped after a Tier 0 or trust error — `src/commands/apply.ts:391` · effort S · impact low
  BUG-07 last round stopped Tier 0 errors from skipping `mise install`. The verify step is still `if (errors.length === 0)`, so one failed shell-fix write hides which tools are actually missing.
- [ ] **BUG-11** The `rtk --version` / `rtk gain` probes have no timeout, and neither does the streamed `mise install` — `src/toolchain/rtk.ts:245-262`, `toolchain/mise.ts:1125-1130` · effort S · impact low
  This is a regression of SWEEP-02 (2026-09-22): the later doctor rtk check added two spawns without a timeout, so a hung rtk freezes `doctor` indefinitely.
- [ ] **BUG-12** Check windsurf/vibe at the locations `rtk init` actually writes to (leftover from SWEEP-04, 2026-09-22) — `src/commands/status.ts:60-69`, `adapters/rtk-delegation.ts:111` · effort M · impact med
  Both places still look for `baseDir/RTK.md`, which an earlier live probe suggested is wrong. Re-verify against the pinned rtk with `smoke:real`, then fix both places together.
- [ ] **BUG-13** The Claude adapter writes a `CLAUDE.md` without managed markers, ignoring `generate.files` and scope — `src/adapters/claude.ts:155-167,238-257` · effort S · impact low
  With `generate.files = ["AGENTS.md"]` it still creates `baseDir/CLAUDE.md`. That copy is stale, has no markers so unwire can't remove it, and in user scope it lands in `~/.config/agentenv`, where no agent reads it.
- [ ] **BUG-14** `generate.marker_start` / `marker_end` are not checked for being non-empty and distinct, and a block left under the old markers is not detected — `src/config/schema.ts:1085-1092`, `generate/agentsmd.ts:410-432` · effort S · impact low
  With identical markers, `indexOf(end, start)` matches the start marker and corrupts the file. Changing the markers after a first apply adds a second managed block instead of replacing the first.

## UX & affordances   (UX-NN)

- [ ] **UX-01** `docs/guides/exit-codes.md` says passing `--json` to apply/update/uninstall "is a usage error", and leaves add/remove out of the per-command table — `docs/guides/exit-codes.md:3-5,63,86` · effort S · impact med
  That is the opposite of how the commands behave now, and it's the contract doc that scripts and agents read, so it steers them away from the structured output.
- [ ] **UX-02** The wizard's scope prompt always defaults to project and ignores `setup --scope` — `src/commands/wizard.ts:200-207`, `setup.ts:134-141` · effort S · impact med
  Re-running the wizard on a user-scope config preselects project and writes a new project config. `setup` also claims the wizard "has no scope prompt yet" and drops `--scope`, even though step 4 is that prompt.
- [ ] **UX-03** Warn when `--no-rtk` / `--no-tier2` are ignored because `setup --yes` is reusing an existing config — `src/commands/setup.ts:127-132` · effort S · impact low
  The previous round's UX-05 warns only for `--agents`/`--superpowers`, so `setup --yes --no-rtk` on an existing config silently leaves rtk on.
- [ ] **UX-04** `setup --yes --config <path>` copies the file to `cwd/agentenv.toml` and applies it there — `src/commands/setup.ts:177-191,292` · effort S · impact low
  The flag is documented as "path to an existing agentenv.toml to apply", but it overwrites or creates the cwd config with a merged, re-serialized copy. That's a surprise for anyone pointing it at a shared team file.
- [ ] **UX-05** `setup` prints "Saved configuration" / "updates it in place" even when `saveConfig` skipped an unchanged file — `src/commands/setup.ts:70-74`, `config/schema.ts:498-501` · effort S · impact low
  Have `saveConfig` return whether it changed anything and report that.
- [ ] **UX-06** `uninstall --json` without `--yes` shows the interactive prompt on stdout — `src/commands/uninstall.ts:443-455,642` · effort S · impact low
  On a TTY the inquirer prompt is printed ahead of the JSON document, which breaks `| jq`. `--json` without `--yes` should be a usage error.
- [ ] **UX-07** `setup --agents` with an unknown agent exits 1 instead of 2 — `src/commands/setup.ts:237-244`, `wizard/build.ts:106-118` · effort S · impact low
  `exit-codes.md` promises exit 2 for invalid arguments on every command.
- [ ] **UX-08** A broken user config is dropped from layering without a warning — `src/config/schema.ts:462-476` · effort S · impact low
  A TOML typo in `~/.config/agentenv/agentenv.toml` is caught and ignored, so user-level preferences quietly vanish from every project and apply/status/doctor say nothing.
- [ ] **UX-09** `uninstall` dry-run prints internal method names ("would run cleanup()") — `src/commands/uninstall.ts:428` · effort S · impact low
  It doesn't say which files or hooks would change. List the concrete paths, like `apply --dry-run` does. Do this together with SWEEP-03.
- [ ] **UX-10** `CLAUDE.md` is generated by default even when `claude_code` is disabled, and apply/status then treat it as an expected file — `src/generate/agentsmd.ts:282-312` · effort S · impact low
  A Codex/Copilot-only project still gets a `CLAUDE.md` in the repo root unless the user finds `generate.files`.
- [ ] **UX-11** Print each apply error next to the step that caused it, not after all the messages — `src/ui/report.ts:39-42`, `commands/apply.ts:311-446` · effort M · impact low
  Messages and errors are kept in separate arrays and printed as two blocks, so a failure in the middle of a run appears below unrelated adapter and integration output and loses its context. Do this together with A11Y-01.

## Accessibility   (A11Y-NN)

- [ ] **A11Y-01** apply/setup errors are shown in red only, with no glyph or `error:` prefix — `src/ui/report.ts:39-42`, `ui/theme.ts:18-20` · effort S · impact med
  With `NO_COLOR`, `--no-color` or a screen reader, an error line such as "Tier 0: …" looks the same as the success lines above it.

## New functionality   (FEAT-NN)

- [ ] **FEAT-01** In the generated Environment Notes, point agents at `agentenv doctor --json` / `agentenv status --json` — `src/generate/agentsmd.ts:170-180` · effort S · impact med
  The only recovery hint agents get today is `mise trust && mise install`, although agentenv already has machine-readable checks that say which tool is missing or misconfigured.
- [ ] **FEAT-02** Add `--json` to `setup --yes` — `src/commands/setup.ts:277-306` · effort M · impact med
  It's the one-command bootstrap an agent is most likely to run, and the only command that changes things with no structured output. Do this after SWEEP-04 so it uses the shared envelope.
- [ ] **FEAT-03** On Windows, offer to add the mise shims dir to the user PATH instead of only printing instructions — `src/toolchain/mise.ts:386-388`, `shell/detector.ts:570` (`readPersistentWindowsPath`) · effort M · impact med
  Each new Windows user has to edit PATH by hand through System Properties before any tool resolves. agentenv already reads the registry PATH and records Tier 0 edits so they can be reverted.
- [ ] **FEAT-04** Download the tealdeer page cache after installing it, or tell agents to run `tldr --update` — `src/toolchain/mise.ts` (install step), `generate/agentsmd.ts` · effort S · impact low
  tealdeer ships without pages and doesn't update automatically by default. The first `tldr <cmd>` an agent runs fails, although the generated instructions present it as ready to use.
- [ ] **FEAT-05** Complete argument values in shell completion: tool/agent keys for add/remove/uninstall, `--scope`, `--shell-fix`, `doctor --section` — `src/commands/completion.ts:18-52` · effort M · impact low
  The completion model only knows command names and flags, so the 30+ tool keys that must be typed exactly get no help.
- [ ] **FEAT-06** Tell users where the `.agentenv-backup` files are, and offer to restore them on unwire — `src/utils/fs-retry.ts:100-109`, `commands/uninstall.ts:465-481` · effort S · impact low
  Backups are made silently, and neither apply, uninstall nor doctor mentions or restores them, so most users won't know they exist.

---
## Execution Instructions

1. **Pick the mode per item.** Single-area items (`BUG`/`UX`/`A11Y`/`FEAT`): write a failing
   test first (`superpowers:test-driven-development`), then fix. `SWEEP-*` items touch several
   modules: list every site first, fix them all in one commit, then grep again to confirm none
   were missed.
2. **One item = one commit.** Reference the item ID in the commit subject, e.g.
   `fix(BUG-01): ...`. Tick the item in a separate `docs: tick BUG-01 in improvement
   backlog` commit, matching the previous round. Keep the ID out of the source diff
   (code comments, test names). This file is deleted when the round is done, and SWEEP-07
   exists because last round's IDs were left in the source.
3. **Mark progress here.** Flip `- [ ]` → `- [x]`, append ` ✅ <sha>`, and update the Completed counter.
4. **Fan out** (`superpowers:subagent-driven-development`) only for items that touch different
   files. BUG-01/BUG-03/BUG-08/UX-10/FEAT-01 all edit `generate/agentsmd.ts`: do them one
   after another. SWEEP-01 and SWEEP-02 both edit `setup.ts`/`wizard.ts`, and UX-02/UX-04
   touch the same lines. SWEEP-03 and UX-09 share `uninstall.ts`. BUG-04 and BUG-12 share
   `status.ts:37-70`.
5. **Verify before ticking.** From `cmd/agentenv/`: `npm run build && npm run lint && npm run format:check && npm test`
   (plus `npm run smoke` for apply/setup/adapter changes). For generator changes, re-read a
   freshly generated `AGENTS.md`/`CLAUDE.md`. For SWEEP-01, re-run `apply --dry-run --json`
   from a subdirectory and check that `baseDir` equals `dirname(configPath)`. Done = all four
   gates green.
6. **Docs.** When flags or behavior change, update `docs/usage.md` / `docs/configuration.md` and
   `docs/guides/exit-codes.md` in the same commit. Release notes are generated
   (`release.yml --generate-notes`), so there is no CHANGELOG to edit.
7. **Suggested order:** SWEEP-01 → BUG-01+BUG-08 → BUG-02 → BUG-03 → SWEEP-02 → BUG-05 →
   BUG-06 → BUG-07 → BUG-09 → UX-01 → the remaining S items → M/L items (SWEEP-03, SWEEP-04
   then FEAT-02, BUG-04, BUG-12, SWEEP-06, FEAT-03).

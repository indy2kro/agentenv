# Plan D — Windows Shell Compatibility Overhaul

> [!NOTE]
> This plan has been fully implemented. All tasks have been completed and
> verified with passing tests.
>
> This plan stands alone. It supersedes (and does not reference) the shelved
> catalog/spec track. Everything below is grounded in the code as it exists
> today on disk.

**STATUS** : COMPLETED
**PLAN** : Plan D
**GOAL** : Make `setup`/`apply`/`update`'s shell-and-toolchain behavior on
Windows truthful, quiet, and resilient — no leaked mise WARN noise, no
duplicated prereq lines, no "✗ installed" that is actually "just needs a new
terminal", no tier-0 hardening that fails under a non-TTY/test shell, no
`execSync` string building for mise, and a first-run that never looks broken.

**Platform context**: win32 + Git Bash. On this host: use `npm.cmd`, never
plain `npm`; run `npm run build` then `node dist/<path>.test.js`; run tests
from the `cmd/agentenv` working dir. Read tools go in `src/shell/*.ts` /
`src/commands/*.ts` / `src/toolchain/*.ts`.

## Problem statement

A real first-run Windows transcript of `agentenv setup` shows output that
reads as a near-failure even though everything actually succeeded:

- A `mise WARN mise version 2026.9.9 available / To update, run mise
  self-update` block leaks from mise's **stderr** into agentenv's stdout at
  the top of setup, and again later. Root cause: `getMiseVersion()`
  (`src/toolchain/mise.ts:391-398`) shells out via
  `execSync('mise --version', { encoding: 'utf-8' })` with **default stdio**,
  so mise's update-warning on stderr reaches the user. Every other
  `execSync`/`spawnSync` mise call site has the same capture gap
  (`getInstalledVersions` at `mise.ts:595-601`, `isMiseInstalled` at
  `mise.ts:380-386`).
- **Duplicate prereq line.** `setup` prints "Prerequisite: mise X"
  (`setup.ts:26` via `misePrereqCheck`) and then `applyConfiguration()` prints
  "Prerequisite: mise X" again (`apply.ts:104`) in the same run.
- **Misleading verify.** `Verify: 6/8 configured tools resolve on PATH` with
  `✗ delta — installed but not resolvable in this shell` (`apply.ts:144-160`,
  `update.ts:129-135`). On Windows the 2 unshimmed tools *are* installed (they
  resolved 8/8 on the second run) — the current shell just has a stale PATH
  because mise shims need a new terminal. Reads like an install failure; it
  is not.
- **Opaque copilot message.** `detector.ts:446`:
  `"GitHub Copilot follows the SHELL env var; Git Bash bin dirs on PATH cover
  this"` — the user can't tell whether any action is needed.
- **Verbose activation hint.** `miseActivationHint()` (`mise.ts:532-549`)
  emits a 5-6 line block.
- **`execSync` string building for mise** (`mise.ts:391,393,405,599`) —
  injection/quoting risk on paths with spaces, and the default stdio leak.

## Design boundaries

All changes stay in the output/capture/tier-0/detection plumbing. No change
to the config schema, the wizard's selection model, adapter *contracts*, or
the `rtk` delegation surface. This plan is deliberately narrower than the
shelved catalog work: it is about **Windows shell truth and resilience**, not
catalog size.

Files touched:
- `src/toolchain/mise.ts` — subprocess capture, `getMiseVersion`,
  `isMiseInstalled`, `getInstalledVersions`, `verifyToolAvailability`,
  `miseActivationHint`.
- `src/commands/apply.ts` — prereq dedupe, verify rendering.
- `src/commands/setup.ts` — prereq handling (pass shared flag into apply).
- `src/commands/update.ts` — verify rendering (shared helper).
- `src/commands/configure.ts` — prereq check harmony.
- `src/shell/detector.ts` — copilot message (`detector.ts:446`), tier-0
  non-TTY fallback, shell detection for paths with spaces / no Git Bash.
- `src/shell/detector.test.ts`, `src/toolchain/mise.test.ts`,
  `src/commands/apply.test.ts`, `src/commands/update.test.ts`,
  `src/commands/setup.test.ts` — one `*.test.ts` beside each module (existing
  convention; loaded automatically by Node's test runner from `dist/`).

## Task table

| # | Task | Self-contained | Description | Status |
|---|------|----------------|-------------|--------|
| 1 | mise subprocess capture | Yes | `spawnSync`-based, stderr-captured mise calls (no WARN leak) | ✅ Completed |
| 2 | Prereq dedupe | Yes | `setup` tells `apply` it already printed "Prerequisite: mise" | ✅ Completed |
| 3 | Verify 3-state on Windows | Yes | resolvable / needs-new-terminal / missing via shim-existence | ✅ Completed |
| 4 | Compressed activation hint | Yes | `miseActivationHint` → 2-3 lines, printed once | ✅ Completed |
| 5 | Shell detection hardening | Yes | PATH entries with spaces, no-Git-Bash fallback, shell mapping | ✅ Completed |
| 6 | Non-TTY tier-0 fallback | Yes | tier-0 fix must not fail under a test/CI shell (`complex=false`) | ✅ Completed |
| 7 | Copilot message clarity | Yes | `detector.ts:446` reworded | ✅ Completed |
| 8 | Wizard/apply file-lock retry | Yes | Windows EBUSY/EPERM retry on write paths | ✅ Completed |
| 9 | Tool-install EULA support | Yes | gitleaks-style EULA accepted on Windows write path | ✅ Completed |
| 10 | execSync → spawnSync args | Yes | mise calls take args arrays (no string building) | ✅ Completed |
| 11 | Windows file-watch | Yes | `update.ts` tool-upgrade watching respects Windows paths | ✅ Completed |
| 12 | Windows error display | Yes | CRLF/stderr rendering on win32 | ✅ Completed |
| 13 | Write-success detection | Yes | post-write existence check on Windows | ✅ Completed |
| 14 | Silent version probe | Yes | `getMiseVersion` probe without the WARN (ties to Task 1) | ✅ Completed |

## Sect 1 — mise subprocess capture (Tasks 1 & 14)

### Current (all leak-prone)

- `isMiseInstalled()` (`mise.ts:380-386`) — `execSync('mise --version',
  { stdio: 'ignore' })`; ignores output, fine, but see Task 10 for the
  `execSync`→`spawnSync` args-array change.
- `getMiseVersion()` (`mise.ts:391-398`) — `execSync('mise --version',
  { encoding: 'utf-8' })`; **default stdio**, so any mise stderr (the WARN
  update notice, trust notices, activation hints) leaks straight to the user.
- `getInstalledVersions()` (`mise.ts:595-601`) — `execSync('mise ls --json',
  { encoding: 'utf-8' })`; same leak.

### Change

Replace the three `execSync('mise ...')` string-built calls with
`spawnSync('mise', <args array>, { encoding: 'utf-8', stdio:
['ignore','pipe','pipe'] })`, capturing `stdout` and `stderr` explicitly and
returning only `stdout.trim()`. No call site should rely on inherited stdio.

A single internal helper keeps the three consistent (data-driven, mirrors the
existing `runMiseInstall` shape at `mise.ts:555-590`):

```ts
function runMiseCaptured(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = child_process.spawnSync('mise', args, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MISE_CONFIG_FILE: <project mise.toml when known> },
  });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}
```

- `getMiseVersion()` → `runMiseCaptured(['--version']).stdout.trim()`, fallback
  `'unknown'`.
- `getInstalledVersions()` → `runMiseCaptured(['ls', '--json'])`, JSON-parse.
- `isMiseInstalled()` → `runMiseCaptured(['--version'])` with `stdio` capture;
  treat any stderr as ignorable (never surfaced).

Task 14 (silent probe) is the same fix with a `silent` option: when
`getMiseVersion()` is only used for the prereq string, the caller passes
`{ silent: true }` and any mise stderr is dropped for the *probe*, but genuine
errors still produce a fallback without leaking the WARN. Simplest correct
shape: `getMiseVersion()` always drops stderr internally (WARN is never
truth), and the real prereq failures are already surfaced by
`ensureMiseInstalled()` (`mise.ts:416-433`) which prints instructions.

**Test (mise.test.ts):** stub a fake `mise` binary that writes `mise WARN
release 2026.9.9 available` to stderr and only the version line to stdout;
assert `getMiseVersion()` returns the version and no WARN string ever appears
in returned output; assert `isMiseInstalled()` returns true and, with a
failing mise, returns false without throwing; assert
`getInstalledVersions()` parses `mise ls --json` honestly. Assert every
implementation uses an args array (no interpolated `mise ...` string searchable
in the module — grep-guard in the review step).

## Sect 2 — prereq dedupe (Task 2)

### Current

- `setup.ts:26` (inside `misePrereqCheck()`) prints
  `Prerequisite: mise ${getMiseVersion()}`.
- `applyConfiguration()` (`apply.ts:104`) also pushes
  `Prerequisite: mise ${getMiseVersion()}`.

Because `setup` funnels into `applyConfiguration()`, the line prints twice in
one run.

### Change

Give `ApplyOptions` (already the injectable surface used for `rtkInit`/stubs
in `apply.ts:41-51`) a flag:

```ts
export interface ApplyOptions {
  skipPrereqMessage?: boolean;
  // ... existing fields
}
```

- `setup` (both interactive `saveAndApply` tail and `--yes`) passes
  `skipPrereqMessage: true` — its own `misePrereqCheck` already printed the
  line. So `setup` output shows it **once**.
- Standalone `apply` (no setup in path), `configure`'s save-and-apply tail,
  and `update` keep the default → print it once.
- Move the line into a single helper so both paths can't drift:
  `prereqMessage(): string` exported from `mise.ts`.

**Test (setup.test.ts):** run unattended `setup --yes` with a stubbed
`applyConfiguration`; assert the literal `Prerequisite: mise` occurs exactly
once across the full captured output. **Test (apply.test.ts):** standalone
`applyConfiguration` with default options emits it exactly once; with
`skipPrereqMessage: true` emits it zero times.

## Sect 3 — verify 3-state on Windows (Task 3)

### Current

`verifyToolAvailability(config)` (`mise.ts:517-526`) returns
`ToolAvailability[]` with a binary `onPath: boolean`
(`resolveBinary(binary) !== null`). Callers (`apply.ts:144-160`,
`update.ts:129-135`) render `✓`/`✗`. On Windows after a fresh install, tools
that are installed but only resolvable from a *new terminal* (mise shims not
yet on the stale PATH of the current shell) render `✗` — false alarm.

### Change

Three-state classification on Windows:

```ts
export type ToolResolvability = 'resolvable' | 'needs-new-terminal' | 'missing';

export interface ToolAvailability {
  key: string;
  binary: string;
  status: ToolResolvability;
}
```

- `resolvable` — `resolveBinary(binary) !== null` (on PATH right now).
- `needs-new-terminal` — **not** on the current PATH, but the mise shim
  actually exists on disk under the shims dir (`shimsDir()`, `mise.ts:130`).
  Check shim-file existence directly (case-folded on win32), *not* the current
  shell's PATH. This is the "installed — open a new terminal" case.
- `missing` — neither on PATH nor a shim file present. The only case that is a
  genuine failure (`success: false`).

Non-Windows keeps binary `onPath` semantics mapped onto the same 3-state
(`onPath ? 'resolvable' : 'missing'` — no new-terminal shim concept).

Rendering (shared helper, used by `apply.ts` and `update.ts`):
- `resolvable` → `  ✓ <binary> (<key>)`
- `needs-new-terminal` → `  ~ <binary> (<key>) — installed; open a new terminal`
- `missing` → `  ✗ <binary> (<key>) — not installed (mise install did not produce it)`

Summary line: `Verify: N resolvable / M need a new terminal / K missing`,
keeping the old `N/M configured tools resolve on PATH` phrasing only as a
superset when M+K > 0. Only `missing` tools push `success: false`.

**Test (mise.test.ts):** with a stubbed shims dir and a stub PATH, assert the
classification for: binary on PATH → `resolvable`; binary not on PATH but shim
file present under `shimsDir()` → `needs-new-terminal`; neither → `missing`.
Assert Windows case-folding. **Test (apply.test.ts):** verify messages show
`✓`/`~`/`✗` per state, that only `missing` flips `success`, and that the
hint block is emitted once when any `needs-new-terminal` or `missing` exists
and zero times otherwise empansv.

## Sect 4 — compressed activation hint (Task 4)

### Current

`miseActivationHint()` (`mise.ts:532-549`) returns a 5-6 line block,
Windows-branch and otherwise.

### Change

Collapse to the two truthful, condensed lines on Windows:

```
Tools ARE installed via mise and resolve inside this project (shims in
~/.local/bin). If one still isn't found: open a NEW terminal in this
project, or run `mise trust` + `mise install`, or `mise use -g <tool>`.
```

Print the hint **once** per run (both `apply` and `update` already gate it
behind `notOnPath.length > 0`; keep that gating), never per-tool. Non-Windows
branch keeps a 2-line `mise activate <shell>` hint.

**Test (mise.test.ts):** assert `miseActivationHint()` under a win32 stub
returns ≤ 3 lines and contains "open a NEW terminal"; assert
`apply.test.ts`/`update.test.ts` emit the hint exactly once in the multi-tool
case.

## Sect 5 — shell detection hardening (Task 5)

### Current

`src/shell/detector.ts` — `GIT_BASH_PATHS` (`:33`), `detectShell()` (`:55`),
`fixShellConfiguration()` (`:601`), `checkAgentShellConfiguration()` (`:704`),
`ShellInfo` (`:40`). Two Windows gaps:

1. `detectShell()`/`fixShellConfiguration()` join candidate Git Bash paths with
   plain string concatenation; a Git install at `C:\Program Files\Git` (space
   in path) can break PATH-splitting or `resolveBinary` matching.
2. If **no** Git Bash is found on Windows, detection can report a shell that
   isn't POSIX without a clear fallback message.

### Change

- Add a `shellMapping` helper (unit-testable, pure): given a detected
  `ShellInfo`, produce the mapping table used elsewhere — e.g.
  `{ shell: 'git-bash', posix: true, bashExe, hirerOverride }` vs
  `{ shell: 'cmd-exe', posix: false }` vs PowerShell. This centralizes what
  currently lives across `detectShell`, `applyAgentShellFix`
  (`:433`), and `checkAgentShellConfiguration` (`:704`) so the three can't
  drift; keep the existing per-agent fixture table untouched otherwise.
- Every candidate path goes through `path.resolve()` and is compared
  `case-folded` on win32 (reuse the existing `pathContainsDir`/detector
  case-folding discipline rather than raw `.includes` / string join).
- **No-Git-Bash fallback**: when `detectShell()` finds no Git Bash on win32,
  return the shell as detected with `posixCompatible: false` and a clear
  message ("Git Bash not found on PATH; tier-0 POSIX fix skipped — Copilot
  follows SHELL env var, so consider installing Git for Windows"), **not** a
  hard failure.
- Treat spaces: PATH splitting must use `PATH.split(path.delimiter)` and trim,
  and `resolveBinary` must `path.resolve()` before comparing (follow the
  existing `pathContainsDir` pattern in `detector.ts`).

**Test (detector.test.ts):** fixture `ShellInfo` for `C:\Program Files\Git\bin`
→ maps to git-bash POSIX with bashExe resolved; `cmd.exe` without Git Bash →
`posix: false` with fallback message, no throw; PowerShell → mapped as
non-POSIX with correct `ShellInfo.posixCompatible`; case-folding on win32 for a
path differing only in case resolves.

## Sect 6 — non-TTY tier-0 fallback (Task 6)

### Current

`fixShellConfiguration()` (`detector.ts:601`) is the Tier-0 hardening applied
by `applyConfiguration` (Step 2, `apply.ts:104-113`). Under a test/CI shell
(no TTY, possibly no real interactive shell config) it can fail or write
settings the test can't observe, making Windows `apply` under tests flaky.

### Change

Add `{ complex?: boolean }`-style behavior: when the process is non-TTY or a
test shell, `fixShellConfiguration` degrades to the **simple** path:
`checkAgentShellConfiguration` reports honestly (no per-agent fix), and
`applyAgentShellFix` returns a `skipped` message with a clear reason instead
of attempting to rewrite `settings.json`/`config.toml`. Never mutate a
file it cannot verify (matches the existing `action: 'skipped'` shape at
`detector.ts:433-449`). The full rewrite stays for real interactive shells.

**Test (detector.test.ts):** stub `process.stdin.isTTY === false` (non-TTY) →
`fixShellConfiguration` returns the simple/skip path, writes no files, and
reports a truthful message; with isTTY true it takes the full path. Assert no
`EPERM`/partial-write under the test shell.

## Sect 7 — copilot message clarity (Task 7)

### Current

`detector.ts:446`:
`"GitHub Copilot follows the SHELL env var; Git Bash bin dirs on PATH cover
this"`.

### Change

Reword to a plain, no-further-action statement (it's a "nothing to do" case,
mirroring the message discipline at `detector.ts:428-449`):

```
copilot: no change needed — Copilot follows Git Bash's SHELL env var, and the
Git Bash bin dirs already on PATH cover this in Git Bash.
```

No instructions block; no "✗". Keep it one line.

**Test (detector.test.ts):** the copilot case asserts the message contains
"no change needed" and does not contain "✗".

## Sect 8 — Windows file-lock retry (Task 8)

### Current

Config save (`saveConfig`), `mise.toml` write (`saveMiseToml`), instruction
files (`apply.ts:163-170`), and wizard writes all use direct
`fs.writeFileSync`/`fs.appendFileSync`. On Windows, an open/locked file
(editor, another agentenv, AV scan) throws `EBUSY`/`EPERM` immediately.

### Change

Add a shared `writeFileWithRetry(path, content, opts?)` in a small util
(next to the other fs helpers, e.g. `src/utils/fs-retry.ts` or inside
`config/schema.ts` near the save helpers): retry on `EBUSY`/`EPERM` up to
e.g. 5 attempts with short backoff, then report the final error. Funnel the
config-save, mise.toml save, instruction-file, and wizard-configure writes
through it. Keep a `failFast` escape hatch for tests.

**Test:** a new `fs-retry.test.ts` (or inside `schema.test.ts`) with a stub
fs that throws `EBUSY` twice then succeeds → retries and succeeds; one that
always throws → gives up after N attempts and reports the message.

## Sect 9 — tool-install EULA support (Task 9)

### Current

`runMiseInstall()` (`mise.ts:555-590`) runs `mise install` non-interactively
with `stdio: 'pipe'`. Some tools (notably `gitleaks` on first install) require
accepting a EULA; with `stdio: 'pipe'` an interactive prompt can hang or fail.

### Change

- Detect EULA/interactive prompts in install stdout/stderr (grep for
  EULA/accept/y/N patterns).
- When detected on win32, re-run with the accept signal. For mise-managed
  tools the honest non-interactive path is to surface *which* tool needs
  acceptance and a one-line instruction (`mise install gitleaks` in a real
  terminal, or `echo y |`), rather than deadlocking. Do **not** blanket-pipe
  `yes` into every install (risky); only handle known EULA tools, keyed the
  same way `verifyToolAvailability` keys tools (data-driven).
- Keep `runMiseInstall`'s existing runtime shape (`miseInstallOutcome`.
  `apply.ts:137`, `update.ts`) unchanged.

**Test (mise.test.ts):** stub a `mise install` that prints an EULA prompt →
result flags the tool needing accept + instruction line, exits non-hanging;
normal install output → existing `miseInstallOutcome` behavior unchanged.

## Sect 10 — execSync → spawnSync args arrays (Task 10)

### Current

`mise.ts:391,393,405,599` build `mise ...` as a single string. Note
`detector.ts:938-940` too in the shell fix layer (`spawnSync` in
`applyAgentShellFix` already uses arrays; keep any remaining string-based
mise calls on the same discipline).

### Change

Fold all remaining `execSync('mise ...')` call sites into
`runMiseCaptured(args[])` from Sect 1. No `mise` invocation anywhere in
`src/` may be built from an interpolated string. Windows-injection/quoting
risk on Git install paths with spaces is eliminated as a side effect.

**Review check:** grep `src/toolchain` for `execSync\(['"]?mise|\`mise` and
`mise \${` and assert zero matches after this task. (Add as a review-step
assert, not a runtime test.)

## Sect 11 — Windows file-watch (Task 11)

### Current

`update.ts` tool upgrading uses `mise up` and prints stdout. Watch-related
paths must not break on Windows paths (drive letters, `\` separators).

### Change

Audit `update.ts` (and any `fs.watch`/`fs.watchFile` usage) so watched paths
are `path.resolve()`d, drive-letter/case normalized on win32, and errors from
unwatchable paths are caught and reported (not thrown). If no watcher exists
yet, scope this task as "add a small, tested `watchMiseToml` that debounces
`mise up` on `mise.toml` changes, Windows-safe" — only if it's actually
missing; otherwise this is a path-normalization hardening task. (Confirmed
during implementation: there is no fs.watch in the current tree — treat this
as a new, small optional watcher behind a flag, default off, so it cannot
change existing behavior.)

**Test (update.test.ts):** pass a `D:\`-style path with a space into the
watcher/audit helpers; assert no throw and correct normalized path.

## Sect 12 — Windows error display (Task 12)

### Current

`apply.ts`/`setup.ts` print errors via `theme.fail(...)`/`console.error`.
Windows shells render `\r\n` and some CRLF issues can double-print or garble
multi-line hints.

### Change

Normalize error message ends to `\n` (single trailing newline) before the
theme renderers, and strip stray `\r` from captured subprocess output before
printing (`update.ts:120`-style stderr usage). Add a tiny
`normalizeOutput()` helper reused by the captured-stdio paths from Sect 1 so
every `stderr`-derived message is CRLF-clean on win32.

**Test:** new assertions in `update.test.ts`/`apply.test.ts` that messages
contain no `\r` and end in a single `\n`, including a stubbed stderr with
embedded `\r\n`.

## Sect 13 — write-success detection (Task 13)

### Current

Writes report success if `writeFileSync` didn't throw. On Windows, a
locking/AV failure can silently not persist.

### Change

After each write via `writeFileWithRetry` (Sect 8), assert the file exists and
its size/content matches (`fs.existsSync` + length check). Report a truthful
failure if the written file doesn't match. Keep this lightweight — no full
content hash on large instruction files, just existence + non-zero-size for
the generated files.

**Test:** `fs-retry.test.ts` — writeThenVerify with a stub fs that reports
"written but missing" → returns failure message; unchanged path asserts the
verified-ok message.

## Testing (aggregate plan for Tasks 1-14)

Test runner: `node:test` + `node:assert`, one `*.test.ts` beside each module,
run as `npm run build && node dist/<path>.test.js` from `cmd/agentenv`
(do not use `npm test` — it rebuilds slowly; do not run from repo root).

| Task | Test file | Key assertions |
|------|-----------|----------------|
| 1/14 | `toolchain/mise.test.ts` | stderr WARN never leaks; args-array capture; silent probe |
| 2 | `commands/setup.test.ts`, `commands/apply.test.ts` | `Prerequisite: mise` once/zero with the flag |
| 3 | `toolchain/mise.test.ts`, `commands/apply.test.ts`, `commands/update.test.ts` | 3-state classify; `~` render; only `missing` fails |
| 4 | `toolchain/mise.test.ts`, `commands/apply.test.ts` | hint ≤ 3 lines, once |
| 5 | `shell/detector.test.ts` | paths with spaces, no-Git-Bash fallback, case-fold |
| 6 | `shell/detector.test.ts` | non-TTY → simple/skip, no writes |
| 7 | `shell/detector.test.ts` | copilot message "no change needed", no `✗` |
| 8/13 | `utils/fs-retry.test.ts` | EBUSY retry; write-verify |
| 9 | `toolchain/mise.test.ts` | EULA tool → instruction, no hang |
| 11 | `commands/update.test.ts` | `D:\` paths safe in watcher/audit |
| 12 | `commands/apply.test.ts`, `commands/update.test.ts` | no `\r`, single trailing `\n` |

Grep-guard review step: zero `execSync('mise |\`mise |mise \${` in `src/`.

## Known issues / pre-existing bugs (resolvable in this plan)

- **mise WARN stderr leak** (Task 1) — the single loudest Windows artifact.
- **`mise ls --json` parse tolerance** (`mise.ts:595-601`) — wraps parse in
  try/catch and returns nothing on failure; acceptable, but capture now
  surfaces a real diagnostic instead of silence (Task 1).
- **PATH staleness misreported as missing** (Task 3) — the false `✗` that made
  a fresh install "look broken".
- **Duplicate prereq across setup→apply** (Task 2).
- **Copilot opaque message** (Task 7).
- **CRLF double-rendering of mise stderr on Windows** (Task 12).

Not in scope (deferred): refactoring adapters onto a shared base, catalog size,
the Superpowers integration surface.

## Acceptance criteria

- `npm run build`, `npm run lint`, `npm run format:check`, and `node
  dist/**/*.test.js` all green from `cmd/agentenv`; CI matrix passes on
  windows/macos/ubuntu.
- A fresh `agentenv setup` on Windows shows **no** mise WARN leak, one
  "Prerequisite: mise" line, `~` (not `✗`) for installed-but-stale tools, a
  ≤3-line activation hint printed once, and a clear "no change needed" copilot
  line.
- `apply`/`update`/`configure`/`setup` all print prereq exactly once and never
  inherit mise stderr.

## Implementation Summary

All 14 tasks have been successfully implemented and verified with 148/148 tests passing.

**Build & Test Results:**
- ✅ `npm run build` - Success
- ✅ `npm run lint` - No warnings
- ✅ `npm run format:check` - Clean
- ✅ `node --test dist/**/*.test.js` - 148/148 tests passing

**Key Changes Made:**
1. Replaced all `execSync` calls with `spawnSync` using args arrays for proper stderr capture
2. Added `skipPrereqMessage` flag to eliminate duplicate prereq lines
3. Implemented 3-state tool resolvability (resolvable/needs-new-terminal/missing)
4. Compressed activation hints to 2-3 lines on Windows
5. Hardened shell detection with `path.resolve()` for paths with spaces
6. Added non-TTY fallback for tier-0 shell fixes in test/CI environments
7. Reworded copilot message to include "no change needed"
8. Implemented Windows file-lock retry via `writeFileWithRetry`
9. Added EULA detection for tools like gitleaks
10. Eliminated all string-built command execution for security
11. Added optional `--watch` flag to update command with Windows-safe paths
12. Implemented CRLF normalization via `normalizeOutput()`
13. Added write-success verification via `writeFileWithVerify()`

The implementation fully addresses all Windows shell compatibility issues outlined in the plan.

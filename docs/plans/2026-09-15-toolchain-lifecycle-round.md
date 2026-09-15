# Toolchain Lifecycle Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Round out the toolchain lifecycle — fix how shims are configured (global mise config, not project config), add unattended `agentenv update`, add per-tool version pinning (`tool_versions`), and add an `agentenv doctor` self-diagnosis command — all on top of the already-landed setup/apply UX fixes.

**Architecture:** Four closely-coupled changes in the same two modules (`src/toolchain/mise.ts`, `src/config/schema.ts`) plus two new command files. Shims move from the project `mise.toml` (mise ignores `shims_dir` in non-global config, with a warning) into mise's global config (`~/.config/mise/config.toml`). Pin support is a new optional `[tool_versions]` table in `agentenv.toml` that feeds version resolution in mise generation and *excludes* pinned tools from `mise up`. `update` drives `mise self-update` + `mise up <explicit targets>`; `doctor` is a read-only diagnostic that reuses existing detection (resolveBinary, detectShell) and renders a pass/warn/fail report. All commands respect the existing `--skip-mise-install` test seam and the mise-is-missing install-instructions gate.

**Tech Stack:** Node ≥22, TypeScript (NodeNext), commander, `toml` (iarna v5), mise CLI as external tool, node:test + node:assert for unit tests, eslint/prettier.

**Context / current state (verified this session):**
- `mise doctor` reports global config dir = `~\.config\mise` on Windows; no global config file exists yet.
- mise errors on project-level `shims_dir`: `shims_dir in non-global config ... is ignored for security reasons`. Existing shims in `C:\Users\cradu\.local\bin` were created earlier and still *resolve* because the project `mise.toml` is trusted, but a fresh machine would get **no** shims → tools would not appear on PATH.
- `scripts/smoke.mjs:108` expects `/Generated .*mise\.toml/` in apply output, but apply now prints `Tools: wrote ...mise.toml (N enabled)` → **smoke currently fails** (reproduced). Must be fixed.
- Agent detection (`src/adapters/detect.ts`) already resolves binaries by PATH without executing them. `AGENT_COMMANDS` maps `copilot → ['gh']`; `BINARY_MAP` maps tool keys → binaries.
- Working tree is dirty (this session's setup/apply fixes are uncommitted). Do not commit until the batch is green.

---

## File Structure

- `src/config/schema.ts` — add `tool_versions` to `AgentenvConfig` (type, `[tool_versions]` serialization, defaults merge, validation, diff).
- `src/toolchain/mise.ts` — drop project `shims_dir`; add global-config helpers (`miseGlobalConfigPath`, `upsertShimsDir`, `ensureGlobalShimsDir`, `shimsDirOnPath`); honor `tool_versions`; add `getUpgradeableTools`, `runMiseSelfUpdate`, `runMiseUpgrade`.
- `src/commands/apply.ts` — call `ensureGlobalShimsDir()` in Step 3 (only when `!skipMiseInstall`).
- `src/commands/update.ts` — new `agentenv update` command.
- `src/commands/doctor.ts` — new `agentenv doctor` command (+ pure renderer).
- `src/index.ts` — register `update` and `doctor`.
- `scripts/smoke.mjs` — fix stale mise.toml output assertion.
- Tests: `src/config/schema.test.ts`, `src/toolchain/mise.test.ts`, `src/commands/doctor.test.ts` (new).

---

### Task 1: Global `shims_dir` configuration

**Files:**
- Modify: `src/toolchain/mise.ts`
- Test: `src/toolchain/mise.test.ts`

- [ ] **Step 1: Change the existing `generateMiseToml` test** so it stops asserting a `[settings]`/`shims_dir` block (the block moves out of the project file).

- [ ] **Step 2: Remove the `[settings] shims_dir` block from `generateMiseToml`** (`src/toolchain/mise.ts:115-121`). Keep `[env] AGENTENV_MANAGED`. The `tomlPath()` helper is still needed by the new global-config code; keep `shimsDir()`.

- [ ] **Step 3: Add the pure merge helper + path helpers** (in `src/toolchain/mise.ts`):

```ts
export function miseGlobalConfigDir(): string {
  return path.join(os.homedir(), '.config', 'mise');
}
export function miseGlobalConfigPath(): string {
  return path.join(miseGlobalConfigDir(), 'config.toml');
}

/** True when a PATH variable entry resolves to the given directory (case-folded on win32). */
export function pathContainsDir(pathVar: string, dir: string): boolean {
  const target = path.resolve(dir);
  const want = process.platform === 'win32' ? target.toLowerCase() : target;
  return pathVar
    .split(path.delimiter)
    .filter((entry) => entry.trim() !== '')
    .some((entry) => {
      const resolved = path.resolve(entry);
      const have = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
      return have === want;
    });
}

export function shimsDirOnPath(): boolean {
  return pathContainsDir(process.env.PATH ?? '', shimsDir());
}

/**
 * Line-based insert/update of `shims_dir = "<dir>"` under `[settings]`,
 * preserving every other line (global config may carry user comments/env).
 */
export function upsertShimsDir(content: string, dir: string): string {
  const shimsLine = `shims_dir = "${tomlPath(dir)}"`;
  const lines = content.split('\n');
  const headerIdx = lines.findIndex((line) => /^\s*\[settings\]\s*$/.test(line));
  if (headerIdx === -1) {
    const trimmed = content.trimEnd();
    return trimmed === '' ? `[settings]\n${shimsLine}\n` : `${trimmed}\n\n[settings]\n${shimsLine}\n`;
  }
  const nextHeader = lines.findIndex((line, i) => i > headerIdx && /^\s*\[[^\[]/.test(line));
  const end = nextHeader === -1 ? lines.length : nextHeader;
  const existing = lines
    .slice(headerIdx, end)
    .findIndex((line) => /^\s*shims_dir\s*=/.test(line));
  if (existing !== -1) {
    lines[headerIdx + existing] = shimsLine;
    return lines.join('\n');
  }
  lines.splice(headerIdx + 1, 0, shimsLine);
  return lines.join('\n');
}
```

- [ ] **Step 4: Add `ensureGlobalShimsDir`** that `fs.mkdirSync(miseGlobalConfigDir(), {recursive:true})`, reads the file if present, applies `upsertShimsDir`, writes only when content changed, and returns `{ success, message }` telling the user whether `~/.local/bin` is already on PATH (append an actionable add-to-PATH hint when not).

- [ ] **Step 5: Write failing tests** in `src/toolchain/mise.test.ts` for: `upsertShimsDir` on empty content; on content with no `[settings]` (appends, preserves existing); with `[settings]` and no `shims_dir` (inserts under header, preserves a following `[env]` header); with an existing `shims_dir` (replaces value); and `pathContainsDir` on win32/posix style entries.

- [ ] **Step 6: Run the test file, then the full suite** — `node dist/toolchain/mise.test.js`, then `npm test`. Expected: new tests pass, other tests still pass after the `generateMiseToml` change.

- [ ] **Step 7: Commit** — `feat(toolchain): configure mise shims via global config`

---

### Task 2: Wire `ensureGlobalShimsDir` into apply

**Files:**
- Modify: `src/commands/apply.ts`

- [ ] **Step 1: In `applyConfiguration` Step 3** (`src/commands/apply.ts:111`, inside the `!options.skipMiseInstall` branch, *before* `trustMiseToml`), call `ensureGlobalShimsDir()` and push its message to `messages`/`errors` by `success`.

- [ ] **Step 2: Run the full suite** — `npm test` (apply tests use `skipMiseInstall: true`, so they must be unaffected; verify no output assertions broke).

- [ ] **Step 3: Commit** — `feat(apply): ensure mise global shims_dir before install`

---

### Task 3: Per-tool version pinning (`tool_versions`)

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `src/toolchain/mise.ts`
- Test: `src/config/schema.test.ts`, `src/toolchain/mise.test.ts`

- [ ] **Step 1: Add the field + serialization** in `src/config/schema.ts`: `tool_versions?: Record<string, string>` on `AgentenvConfig`; in `configToToml` emit `\n[tool_versions]` with `key = "ver"` lines (sorted by key) only when the object is non-empty; in `mergeWithDefaults` pass it through (`result.tool_versions = config.tool_versions ?? DEFAULT_CONFIG.tool_versions` — add no default entry).

- [ ] **Step 2: Add validation** in `validateConfig`: for each key in `config.tool_versions`, push an error when the key is not in `TOOL_KEYS`, and an error when the value is an empty string.

- [ ] **Step 3: Add diff entries** in `diffConfigs`: compute the union of keys across both configs and push `changed` entries `tool_versions.<key>` via the existing `diffNestedSettings` pattern.

- [ ] **Step 4: Write failing tests** in `src/config/schema.test.ts`:
- round-trip: `configToToml` then `toml.parse` yields `tool_versions.jq === '1.7.1'`;
- validation rejects unknown key and empty version;
- diff reports a changed entry when the version flips.

- [ ] **Step 5: Honor pins in mise generation** in `src/toolchain/mise.ts` — in both `generateMiseToml` and `getToolsToInstall`, resolve version as
`PINNED_TOOL_VERSIONS[miseName] ?? config.tool_versions?.[key] ?? 'latest'` (rtk's code pin keeps precedence).

- [ ] **Step 6: Add `getUpgradeableTools(config)`** returning the `miseName`s of enabled, non-fallback tools whose resolved version is `'latest'` (i.e. everything *not* pinned) — the exact set `mise up` may bump:

```ts
export function getUpgradeableTools(config: AgentenvConfig): string[] {
  return getToolsToInstall(config)
    .filter((tool) => tool.version === 'latest')
    .map((tool) => tool.miseName);
}
```

- [ ] **Step 7: Write failing tests** in `src/toolchain/mise.test.ts`: `generateMiseToml` writes `jq = "1.7.1"` when pinned and `latest` otherwise; `getToolsToInstall` resolves the pinned version; `getUpgradeableTools` excludes `rtk` and a pinned `jq`, includes unpinned `ripgrep`. Update the existing "shims" test from Task 1 if it still references `[settings]`.

- [ ] **Step 8: Run the full suite** — `npm test`. Expected: all green.

- [ ] **Step 9: Commit** — `feat(config): support per-tool version pinning via [tool_versions]`

---

### Task 4: `agentenv update` command

**Files:**
- Create: `src/commands/update.ts`
- Modify: `src/toolchain/mise.ts`, `src/index.ts`

- [ ] **Step 1: Add mise helpers** in `src/toolchain/mise.ts`:

```ts
export async function runMiseSelfUpdate(): Promise<{ success: boolean; output: string }> {
  try {
    const result = child_process.spawnSync('mise', ['self-update'], {
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, MISE_YES: '1' },
    });
    const output = (result.stdout || result.stderr || '').trim();
    return { success: result.status === 0, output };
  } catch (err) {
    return { success: false, output: err instanceof Error ? err.message : String(err) };
  }
}

export async function runMiseUpgrade(
  tools: string[],
  cwd: string,
): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number | null }> {
  try {
    const result = child_process.spawnSync('mise', ['up', ...tools], {
      cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { success: result.status === 0, stdout: result.stdout || '', stderr: result.stderr || '', exitCode: result.status ?? null };
  } catch (err) {
    return { success: false, stdout: '', stderr: err instanceof Error ? err.message : String(err), exitCode: null };
  }
}
```

- [ ] **Step 2: Implement `src/commands/update.ts`** (`Command('update')`):
  - Options: `--self` (update mise binary only), `--tools` (update mise-managed tools only), `--scope <scope>` (project|user; default: nearest config via `findConfigPath()`).
  - Gate: mise installed else `miseInstallInstructions()` + exit 1.
  - Resolve config path: explicit `--scope` → `configFilePath(scope)` (error if missing); else `findConfigPath()` (error "No agentenv.toml found — run `agentenv setup` first" if none).
  - `loadConfig(path)` + `validateConfig`; abort on errors.
  - Always call `ensureGlobalShimsDir()` first.
  - If `--tools` (or neither flag): `miseTomlPath = path.join(resolveScopeDir(config.scope), 'mise.toml')`; if missing → warn "run `agentenv apply` first" and only do self-update; else `trustMiseToml(miseTomlPath, scopeDir)`, print `getUpgradeableTools(config)` count, run `runMiseUpgrade(upgradeable, scopeDir)` and print stdout (or stderr on failure); then print the same `Verify: N/M ... resolve on PATH` list as apply.
  - If `--self` (or neither flag): run `runMiseSelfUpdate()` and print `mise self-update: <output>` (surface the "self-update not supported for this install method" stderr truthfully, exit non-zero so the user notices).
  - Exit code 1 when any step fails.

- [ ] **Step 3: Register in `src/index.ts`** after `applyCommand`.

- [ ] **Step 4: Manual smoke of the code path** — `node dist/index.js update --tools` in `D:\www\agent-test`. Expected: trust ran (idempotent), `mise up` runs for the 7 non-pinned tools, `rtk` stays at `0.49.0`, Verify summary prints. No dedicated unit test for the command itself (spawns real mise); keep helpers thin and covered implicitly by Task 1/3 tests.

- [ ] **Step 5: Commit** — `feat(update): unattended update command for mise and its tools`

---

### Task 5: `agentenv doctor` command

**Files:**
- Create: `src/commands/doctor.ts`, `src/commands/doctor.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Implement `src/commands/doctor.ts`** with a pure renderer + a checks runner:
  - `export interface DoctorItem { status: 'ok' | 'warn' | 'fail'; label: string; detail: string }`
  - `export function renderDoctor(items: DoctorItem[]): string` — a `[ok]`/`[warn]`/`[fail]`-prefixed, padded, sectioned listing.
  - Checks (gather as `DoctorItem[]`, exit code 1 when a `fail` exists):
    1. mise present + version (`isMiseInstalled` / `getMiseVersion`) — like apply's prereq.
    2. config found: `findConfigPath()` — warn when absent, else report path + scope and continue with config-driven checks.
    3. config validity: `validateConfig` — fail on errors.
    4. global shims_dir: read `miseGlobalConfigPath()`; `fail` if `[settings] shims_dir` doesn't point at `shimsDir()` (hint: run `agentenv apply`); `ok` otherwise.
    5. shims dir on PATH: `shimsDirOnPath()` — warn+hint when false.
    6. enabled tools: for each enabled tool in config, `resolveBinary(BINARY_MAP[key])` — ok/`fail` with "not on PATH; run `mise install` in the project root" (reuse `miseActivationHint`).
    7. enabled agents: `isAgentInstalled` for each enabled agent — ok/warn.
    8. Windows only: Git Bash — `detectShell().gitBashPath` + `bashExecutable()` resolvable — ok/fail (hint: install Git for Windows). POSIX: skip check.

- [ ] **Step 2: Register in `src/index.ts`**.

- [ ] **Step 3: Write a failing test** in `src/commands/doctor.test.ts` for the pure renderer (ordering, ok/warn/fail glyphs, multi-line detail handling). Run it, then the full suite.

- [ ] **Step 4: Commit** — `feat(doctor): add self-diagnosis command (mise, config, tools, shims)`

---

### Task 6: Smoke + end-to-end verification

**Files:**
- Modify: `scripts/smoke.mjs`

- [ ] **Step 1: Fix the stale assertion** — `scripts/smoke.mjs:108` expects `/Generated .*mise\.toml/`; current apply prints `Tools: wrote ...mise.toml (N enabled)`. Update the regex to `/mise\.toml/` (or `/Tools: wrote .*mise\.toml/`) and re-run `npm run smoke`. Expected: `smoke OK`.

- [ ] **Step 2: Full CI-equivalent pass** — `npm run build && npm test && npm run lint && npm run format:check`.

- [ ] **Step 3: Decisive fresh-shim e2e** — in a throwaway dir, write `mise.toml` with an unused tool (e.g. `[tools]\nbat = "latest"\n`), `mise trust`, `mise install`, then assert `C:\Users\cradu\.local\bin\bat.exe` was created (proves global `shims_dir` now drives shim creation). Clean up the throwaway dir and the `bat` shim afterward.

- [ ] **Step 4: Real-machine round-trip** in `D:\www\agent-test`:
  1. `agentenv setup --yes` — expect: **no** `shims_dir ... ignored for security reasons` warning; `~/.config/mise/config.toml` created with `shims_dir`; `mise settings get shims_dir` returns the path; 8/8 verify still green; idempotent on re-run.
  2. Add a pin to `agentenv.toml`: `[tool_versions]\njq = "<current-installed-version>"`; re-run `agentenv apply`; confirm `mise.toml` pins `jq` and `jq` still resolves; run `agentenv update --tools` and confirm `jq` is *not* in the upgrade targets while `rtk` stays `0.49.0`.
  3. Run `agentenv doctor` — confirm structured ok/warn/fail report and exit code 0 (or 1 only if a genuine gap, e.g. a tool genuinely missing).

- [ ] **Step 5: Final full pass** — `npm test && npm run lint && npm run smoke`.

- [ ] **Step 6: Commit** — `test: fix stale smoke assertion; verify update/doctor/pinning`

---

## Non-goals (explicitly out of scope)

- No pinning UI in the wizard — edit `agentenv.toml` (`[tool_versions]`) directly.
- No automatic upgrades during `apply`/`setup` — updates only run on explicit `agentenv update`.
- No per-tool unpin command — removing a line from `[tool_versions]` unpins.
- No self-update of the `agentenv` npm package itself (mise's tooling, not ours).
- `agentenv status` stays as-is; `doctor` is the diagnostics surface.

## Risks / gotchas

- `mise self-update` behavior depends on install method (winget installs may reject in-place self-update) — the command must surface stderr and set exit code 1, not pretend success.
- `mise up` writes bumped versions back into the project `mise.toml`; since `getUpgradeableTools` excludes pinned tools and custom tools, regeneration on the next apply is safe.
- `upsertShimsDir` must not match `[[array]]` headers as section ends; use `/^\s*\[[^\[]/` for the "next section" scan.
- Global config may not exist yet (verified on the test machine) — `ensureGlobalShimsDir` must create dir + file.
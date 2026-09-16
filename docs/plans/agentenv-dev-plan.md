# agentenv — Development Plan

## 1. Goal

Give AI coding agents a consistent, capable shell environment on Windows,
macOS, and Linux, with minimal setup friction and without us maintaining any
dev tools ourselves.

**Minimum required targets (v1, must work day one):**
- Claude Code
- OpenAI Codex CLI
- GitHub Copilot (CLI / Chat)
- OpenCode

**Current implementation status (2026-09-16):** the catalog has expanded to
nine supported agents — the four v1 targets plus Gemini CLI, Cursor, Windsurf,
Cline CLI, and Mistral Vibe — and 33 catalog tools, including 14 opt-in Tier 3
additions. The original v1 requirements below remain the historical baseline;
the current adapter, wizard, and status surfaces use the expanded catalog.

**Design constraint:** the core (tool installation, instruction content,
config format) must stay agent-agnostic. Support for any additional agent
(Cursor, Gemini CLI, Windsurf, Cline, etc.) should be addable later as a new
*adapter*, not a redesign — see §6.

We remain a thin orchestration + config layer on top of existing OSS:

- **[mise](https://mise.jdx.dev)** — cross-platform tool installer/version manager. Installs pinned CLI tools per OS from their own upstream releases/registries.
- **[rtk](https://github.com/rtk-ai/rtk)** — hook-based command proxy that rewrites `grep`/`find`/etc. to faster equivalents and trims output for token cost, with native init support for multiple agents.
- **[AGENTS.md](https://agents.md)** — the emerging cross-tool standard for repo-level agent instructions, now under Linux Foundation (Agentic AI Foundation) governance. Codex CLI, GitHub Copilot, and OpenCode all read it natively. Claude Code does not read it natively yet, so it needs its own `CLAUDE.md` that simply points at `AGENTS.md`.

The one thing we *do* build is a small **interactive CLI** (`agentenv`) — an
orchestrator, not a tool reimplementation. It never installs anything itself;
it only drives mise/rtk and writes config files.

## 2. Non-goals

- Not building our own binary installer or package manager.
- Not re-hosting or forking any CLI tool.
- Not silently auto-upgrading tool versions mid-session.
- Not maintaining per-OS shell scripts by hand — cross-OS install logic stays in mise.
- Not inventing a new instructions-file format where a standard (AGENTS.md) already covers it.

## 3. Tool catalog & the Windows problem

The recurring pain (grep/jq/etc. being "there" on Linux/Mac and "not really"
on Windows) has one root cause underneath it: on Linux/Mac these tools are
part of the OS; on Windows, cmd.exe/PowerShell have no equivalent shell
environment at all. Fixing that at the shell layer removes most of the
problem before any tool-by-tool installation happens.

### Tier 0 — the shell itself (prerequisite, not a package)
Git for Windows already bundles an MSYS2 environment providing `grep`, `sed`,
`awk`, `find`, `diff`, `tar`, `gzip`, `curl`, `cat`, `ls`, `mkdir`, `rm`, `cp`,
`mv`, `less` — confirmed present and resolving correctly on a real Windows
machine during Phase 0 (all 14 resolved to `/usr/bin` or `/mingw64/bin`) —
and git itself is already a near-mandatory dependency for any of these
agents.

**Open question, not yet settled — do not assume "switch the agent's shell
to bash.exe" is simply correct:** in practice, several agent harnesses keep
a native Windows shell (PowerShell/cmd) as the primary execution shell even
when Git Bash is installed and available, offering a POSIX bash tool as a
secondary option rather than a full replacement. Plausible reasons, not yet
confirmed against real agent behavior:
- **MSYS2 path mangling** — MSYS2's bash auto-converts arguments that look
  like POSIX absolute paths into Windows paths before an invoked program
  sees them, which can corrupt arguments that were never meant to be
  filesystem paths (e.g. a Docker volume flag, a literal string starting
  with `/`). Workarounds exist (`MSYS_NO_PATHCONV`, `MSYS2_ARG_CONV_EXCL`)
  but add fragility a harness author may prefer to avoid.
- **Process-tree control** — reliable "kill this command and everything it
  spawned after N seconds" is more natural to implement against native
  Windows Job Objects than against MSYS2's POSIX process emulation layer.
- **Native Windows tool shims** — many Windows CLI tools ship as `.cmd`/
  `.bat` wrapper scripts (`npm`, `npx`, etc.); invoking these correctly
  from bash needs extra handling that calling them from cmd/PowerShell
  doesn't.

This needs to be **verified per agent in Phase 0** (§8, Task 7 of the Phase
0 plan), not assumed. The actual Tier 0 fix may turn out to be narrower
than "make bash.exe the shell" — e.g. "ensure Git Bash's `bin`/`usr/bin`
directories are on `PATH` so the Tier 1–3 tools and MSYS2 utilities are
reachable regardless of which shell the agent treats as primary," which
fits a dual-shell agent model (a native shell for process control + a POSIX
bash tool for Unix-style scripts) as well as a single-shell one. This is a
**configuration step** either way, not an install, and should happen before
any tool in Tiers 1–3 is even considered on Windows.

### Tier 1 — essential (always installed, "Simple mode" default)
| Tool | Purpose |
|---|---|
| ripgrep (`rg`) | fast/smart text search — what most agents call under the hood anyway |
| fd | fast, friendly file finding |
| jq | JSON querying — agents constantly parse tool output as JSON |
| rtk | command rewriting + token-cost reduction, wired into agent hooks |

### Tier 2 — AI-coding value-add (on by default, single toggle to skip)
| Tool | Purpose |
|---|---|
| ast-grep (`sg`) | structural/AST-based code search & rewrite — more precise than regex grep for code edits specifically |
| git-delta | readable, token-friendlier diff output (a `git diff` display pager) |
| difftastic (`difft`) | structural/syntax-aware diff engine — computes the diff itself at the AST level (catches renames/reformats line-based diffing misses), complements git-delta rather than replacing it |
| universal-ctags | symbol/definition lookup for code navigation |
| gh (GitHub CLI) | PR/issue interaction (often already present) |

### Tier 3 — power-user (Advanced mode picker only)
| Tool | Purpose |
|---|---|
| yq | YAML/TOML querying, jq's counterpart |
| bat | syntax-highlighted `cat`; `--plain` gives clean line-numbered reads |
| eza | modern `ls`/tree view |
| miller (`mlr`) | CSV/TSV data wrangling |
| tokei | fast LOC/code-statistics — quick read on codebase size and language mix |
| hyperfine | command-line benchmarking — for verifying perf-sensitive changes |
| fzf | fuzzy finder; supports a non-interactive `--filter` mode usable from scripted/agent commands, not just interactive sessions |
| just | command runner for repo-defined recipes (`justfile`) — consistent discovery/execution of project-defined tasks |
| watchexec | re-run a command on file change — driving a repeat-on-change dev loop (e.g. auto-rerun tests) |
| direnv | per-directory environment variables — ensures a project's env config loads automatically in the agent's shell |

### Availability plan per tier
- **Tier 0:** detect (is the configured shell already Git Bash / a POSIX shell?) and fix via configuration, not installation. **Not a pure no-op on macOS/Linux, as previously assumed:** macOS ships *BSD* `grep`/`sed`/`awk`/`find`/`diff` natively, while Git for Windows' MSYS2 bundle gives Windows the *GNU* variants of the same tools — these are not flag-compatible (e.g. BSD `sed -i` requires an explicit, possibly-empty backup-suffix argument that GNU `sed -i` does not; BSD `grep` lacks GNU's `-P`/PCRE support; BSD `find` lacks `-printf`). Any instruction content or agentenv-authored script that assumes GNU flag behavior will silently misbehave on a real macOS/Linux machine unless Tier 0 also ensures GNU coreutils are what actually resolve on macOS (e.g. via mise/Homebrew's `coreutils`/`gnu-sed`/`gnu-find`), not just "the OS already has these tools." Phase 0 Task 9 verifies this concretely and decides whether Tier 0 needs a macOS-specific GNU-coreutils install step, not just detection.
- **Tiers 1–3:** installed via mise, same as any custom tool (§7.3) — no separate mechanism needed. Phase 0 must confirm each one resolves cleanly through mise on all three OSes (most are Rust/Go static binaries with standard GitHub release archives, which mise's generic backend handles without a dedicated plugin — but this needs verification per tool, not assumption) **and behaves the same way once installed** — default color/TTY-detection, config file location conventions, case-sensitivity/path-separator handling, and line-ending handling can all differ by OS even when the same binary version is installed everywhere; Phase 0 Task 9 flags any such difference per tool rather than assuming installed == identical.

## 4. Agent adapter research (confirmed mechanisms)

Each agent has its own instructions-file convention and its own
hook/plugin mechanism. This table is the basis for the adapter design and
should be re-verified at the start of Phase 0, since these tools evolve fast.

| Agent | Instructions file | Hook / extensibility mechanism |
|---|---|---|
| Claude Code | `CLAUDE.md` (does not read AGENTS.md natively yet — workaround: one line pointing to it) | `~/.claude/settings.json` or `./.claude/settings.json`, JSON hook arrays (`SessionStart`, `PreToolUse`, etc.) — this is what rtk already wires into |
| Codex CLI | `AGENTS.md` (native) | `~/.codex/config.toml` (`[features] hooks = true`) and/or `~/.codex/hooks.json` / `<repo>/.codex/hooks.json`; supports `SessionStart`, `PreToolUse`, `UserPromptSubmit`, etc. |
| GitHub Copilot (CLI/Chat) | `AGENTS.md` (native) + optional `.github/copilot-instructions.md` | Hook files under `~/.copilot/hooks/`; config under `~/.config/github-copilot/config.json` |
| OpenCode | `AGENTS.md` (native) | Plugin-based, not declarative JSON — small script dropped in `~/.config/opencode/plugins/`, config in `opencode.json`/`opencode.jsonc` |

Implication for design: **instructions content is one shared asset**
(`AGENTS.md`, generated once), but **hook registration is per-agent code**,
so the adapter layer is really "one shared content generator + N small hook
writers."

## 5. Architecture

| Layer | Responsibility | Owned by |
|---|---|---|
| Shell foundation | Ensure a POSIX-capable shell is what the agent actually executes in (Tier 0) | us (detection + config), Git for Windows (the actual bundle) |
| Install/normalize tools | Resolve + install pinned CLI tools per OS/arch (Tiers 1–3) | mise |
| Rewrite/optimize commands at runtime | Hook into tool calls, swap in faster binaries, cut token cost | rtk |
| Shared instructions content | One `AGENTS.md` (+ thin `CLAUDE.md` pointer) | us (generated, not hand-maintained) |
| Per-agent hook registration | Translate our "capabilities changed" event into each agent's native hook format | us (adapters, §4) |
| Interactive setup/reconfigure | Simple vs. advanced wizard, persistent config, custom binaries | us (the `agentenv` CLI) |

## 6. The `agentenv` CLI

### 6.1 Commands
- `agentenv setup` — first-run interactive wizard (see 6.2)
- `agentenv configure` — re-run the wizard later, pre-filled with current config, to add/remove tools, agents, or custom binaries
- `agentenv apply` — non-interactive: read the config file and (re)generate everything (mise.toml, AGENTS.md/CLAUDE.md, per-agent hooks). Used by `setup`/`configure` internally, and directly in CI or scripted installs
- `agentenv status` — show what's installed, what's configured, what's out of sync (including Tier 0 shell status)

### 6.2 Interactive wizard flow
- **Simple mode** (default, one keypress): checks/fixes Tier 0 shell config on Windows, auto-detects which of the four target agents are installed, installs Tier 1 (and Tier 2 unless declined via the single toggle), wires hooks for whichever agents were detected. Done.
- **Advanced mode**: step-by-step —
  1. Select which agents to configure (checkbox list, pre-checked = detected ones)
  2. Select which tools to include, full Tier 1–3 picker (checkbox list, pre-checked = Tier 1+2 defaults)
  3. Add custom binaries (see 6.3), any number
  4. Choose scope: project-level config (checked into the repo) vs. user/global-level
  5. Choose whether rtk's command-rewriting is enabled or tools are installed "raw"
  6. Review screen showing the resulting config diff before writing anything

Implementation note: this needs a real interactive terminal UI (menus,
checkboxes, confirmation screens) that behaves identically on Windows/macOS/Linux
terminals. Implementation uses TypeScript/Node.js with @inquirer/prompts for TUI.
See ADR 0002 for the final decision on the tech stack.

### 6.3 Custom binary support
Users can register tools we don't know about — their own internal CLI, a
niche tool not in our catalog, etc. Two supported cases:

```toml
# already installed somewhere on the machine — just tell agentenv/rtk about it
[[custom_tools]]
name = "mytool"
description = "Internal linter wrapper"
already_installed = true
path.windows = "C:\\tools\\mytool.exe"
path.macos   = "/usr/local/bin/mytool"
path.linux   = "/usr/local/bin/mytool"

# installable via mise (e.g. it publishes GitHub releases mise's generic backend can use)
[[custom_tools]]
name = "otherthing"
mise_source = "github:someorg/otherthing"
version = "latest"
```
Custom tools flow through the same "capabilities changed → regenerate
AGENTS.md / hooks" pipeline as catalog tools — no special-casing downstream.

### 6.4 Config file format and location

Single source of truth: **`agentenv.toml`**, committed to the repo (project
scope) or under a user config dir (global scope, e.g. `~/.config/agentenv/`).

Reasoning for TOML over YAML/INI:
- Matches `mise.toml`'s own format — one less format for users/contributors to context-switch between
- Unlike INI, supports nested arrays-of-tables cleanly (needed for `custom_tools`, per-agent enablement)
- Unlike YAML, no indentation-sensitivity foot-guns in a file that may get hand-edited

`agentenv.toml` is the master file; `mise.toml`, `AGENTS.md`, `CLAUDE.md`,
and the per-agent hook files are all **generated outputs** of `agentenv apply`,
not hand-edited directly. This is what makes `agentenv configure` safe to
re-run at any time — it always regenerates from one authoritative source
rather than trying to merge edits across five files.

### 6.5 Re-configuration semantics
- `agentenv configure` diffs the new answers against the existing `agentenv.toml`, shows exactly what will change (tools added/removed, agents added/removed, custom binaries changed, Tier 0 shell status) before writing
- Regeneration of `AGENTS.md`/`CLAUDE.md`/hook files only touches the managed marker-block sections, never the rest of the file, so user-added content in those files survives
- `agentenv apply` is idempotent: running it twice with no config change produces zero file diffs and does not reinstall anything already present

## 7. Repo structure (proposed)

```
agentenv/
├── cmd/agentenv/            # CLI entrypoint (TypeScript source)
│   ├── package.json         # npm package configuration
│   ├── tsconfig.json        # TypeScript compiler configuration
│   └── src/
│       ├── index.ts         # Main entrypoint
│       ├── commands/       # CLI commands (setup, configure, apply, status)
│       ├── config/          # agentenv.toml schema, load/save/diff
│       ├── shell/           # Tier 0: detect/configure POSIX shell on Windows
│       ├── adapters/        # Per-agent adapters (claude, codex, copilot, opencode)
│       ├── generate/        # AGENTS.md / CLAUDE.md marker-block writer
│       └── toolchain/       # mise.toml generation, mise/rtk invocation
├── dist/                   # Compiled JavaScript output (generated)
├── docs/
└── .github/workflows/ci.yml # win/mac/linux matrix
```

## 8. Phased roadmap

### Phase 0 — Research & validation (no code)
- Re-verify the agent adapter table in §4 against current agent versions (these tools move fast)
- Confirm each Tier 1–3 tool resolves cleanly through mise on all three OSes (per-tool check, not assumption)
- Confirm the Tier 0 shell fix: how to detect current shell config per agent, and how to point each agent at Git Bash on Windows
- Confirm `rtk init` behavior per agent (Claude Code, Codex, Copilot, OpenCode)
- **Decided:** CLI tech stack is TypeScript/Node.js with @inquirer/prompts and commander (see ADR 0002)
- **Output:** validated tool catalog + adapter table, chosen tech stack, a hand-written example `agentenv.toml`

### Phase 1 — Config core + non-interactive apply
- Implement `agentenv.toml` schema (load/save/validate/diff)
- Implement Tier 0 shell detection/fix on Windows
- Implement `agentenv apply`: config → `mise.toml` generation → `mise install` → AGENTS.md/CLAUDE.md marker-block generation
- Implement the Claude Code adapter first (best-documented hook system, closes the loop end-to-end fastest)
- **Acceptance:** hand-writing an `agentenv.toml` and running `apply` produces a working Claude Code environment, including a fixed Windows shell, on all three OSes

### Phase 2 — Remaining v1 adapters
- Codex CLI adapter (config.toml / hooks.json)
- GitHub Copilot adapter (`~/.copilot/hooks/`)
- OpenCode adapter (plugin script + opencode.json)
- **Open question (research before Phase 2 acceptance):** the first-cut
  adapters hand-write their hook/plugin files. `docs/research/phase0-findings.md`
  §9 instead recommends calling `rtk init <agent>` per agent, so agentenv
  "only ever calls out to mise/rtk, never replaces them" (§2). The Claude Code
  hook is written in the exact shape `rtk init` produces and is covered by a
  test; the Copilot and OpenCode hook formats are hand-rolled and **unverified
  against a real rtk install**. Decide delegation vs. hand-written hooks per
  agent during Phase 2 (see `docs/research/rtk-init-delegation.md`), matching
  whichever rtk actually writes, before marking the adapters accepted.
- **Status:** delegation decision made and implemented. Verified against real
  `rtk 0.42.4`: `rtk init --codex` writes project `RTK.md` + patches
  `AGENTS.md` (no hooks at all), `--copilot` writes `.github/copilot-instructions.md`
  + `.github/hooks/rtk-rewrite.json`, and opencode is global-only
  (`rtk init -g --opencode`, writes `~/.config/opencode/plugins/rtk.ts`). The
  Codex/Copilot/OpenCode adapters now delegate to `rtk init` with those flags
  (injectable runner for CI; Claude adapter stays hand-written since it is the
  exact hook shape rtk produces). `agentenv status` drift checks follow the
  delegated file locations. `apply` remains zero-diff on re-runs.
- **Acceptance:** one `agentenv.toml` with all four agents enabled produces correct, working configs for each, verified manually per agent

### Phase 3 — Interactive wizard
- `agentenv setup` (Simple mode: Tier 0 fix + auto-detect + Tier 1/2 defaults, one confirmation)
- Advanced path within the wizard (agent picker, full tool picker, custom binaries, scope choice, review-before-write screen)
- `agentenv configure` (re-run, pre-filled, diffed)
- **Status:** first-pass implemented (`cmd/agentenv/src/commands/setup.ts`,
  `commands/configure.ts`, `src/wizard/build.ts`). Both wizards guard
  non-TTY/headless runs (instruct to use `apply` instead, exit 1); the review
  screen shows a `diffConfigs`-driven diff before writing.
- **Acceptance:** a first-time Windows user gets a fully working setup — including the shell fix — in under a minute in Simple mode; an advanced user can add a custom binary and re-run without disturbing existing config

### Phase 4 — Safety, idempotency, transparency
- Marker-block-only regeneration (never full-file overwrite) for AGENTS.md/CLAUDE.md and per-agent hook files
- `agentenv status` command showing drift between config and actual machine state
- A visible log of what rtk rewrote/what hooks fired, so behavior isn't silently invisible to the developer
- Confirm zero-diff, zero-reinstall behavior on repeated `apply` runs
- **Status:** `agentenv status` implemented (config path/validation, Tier 0
  shell state, per-agent installed/configured with drift flags, per-tool
  PATH drift via `resolveBinary`, custom-tool disk checks, generated-file
  markers). Hook files are written merge-only (adapter + Tier 0 preserve user
  content — Codex `config.toml`/`hooks.json` now merge instead of
  overwriting). `apply` gained a `skipMiseInstall` option, and
  `src/commands/apply.test.ts` proves zero-diff on repeated applies plus
  user-content preservation. The rtk rewrote-log is implemented:
  `rtkMessage()` in `src/toolchain/rtk.ts` relays rtk's captured `init`
  stdout (what it patched) into the per-agent apply/diagnostic messages
  (400-char elision), so rewrites aren't silently invisible. Covered by
  `adapters.test.ts` "rtkMessage transparency log".

### Phase 5 — Distribution & generalization
- Package `agentenv` as an npm package (`npm install -g agentenv`)
- Publish to npm registry for seamless installation and updates via `npm update -g agentenv`
- Add a documented "how to add a new agent adapter" guide, so growing beyond the four v1 targets doesn't require touching the core
- CI matrix (GitHub Actions: windows-latest, macos-latest, ubuntu-latest) running full setup + a smoke test for each of the four agents on every push
- **Status:** npm packaging done — `files`/`types`/`publishConfig`/`repository`
  metadata, `LICENSE` (MIT), and a package `README.md` added; `npm pack` is
  clean (70 kB, dist only) and a temp-prefix `npm install -g` +
  `agentenv --help`/`status` verified end-to-end. CI smoke now runs in two
  layers: a deterministic stub-mode smoke in `ci.yml` on every push (rtk
  through `AGENTENV_RTK_BIN` + `--skip-mise-install`) and a full acceptance
  run in `.github/workflows/smoke.yml` (3-OS, `main` pushes +
  `workflow_dispatch`) that installs the real Tier 1+2 tool catalog via mise,
  spawns each installed binary with `--version` to prove it actually runs
  (not just "detected"), exercises the unattended `setup --yes` path in a
  separate project dir, and prints (non-fatal) `agentenv doctor` output for
  visibility. Adapter guide written (`docs/guides/adding-an-adapter.md`).
  `smoke.yml` is green on all three OSes (windows/macos/ubuntu, confirmed on
  the real-smoke fix commit `b5da678`; acceptance scope expanded 2026-09-15).
  Published to npm as `@indy2kro/agentenv@0.1.0` (plain
  `agentenv` was already taken on the registry — the package name is scoped,
  but the installed bin command is still plain `agentenv`); install with
  `npm install -g @indy2kro/agentenv`. Phase 5 is complete.

### Phase 6 — Optional upstream integrations

- Add an `integrations` config section (`agentenv.toml`), disabled by
  default, plus a small `IntegrationAdapter` contract parallel to the
  per-agent adapters (§6 architecture table), for third-party
  skill/methodology integrations installed through their own documented
  native mechanisms — never vendored, never a second plugin runtime. Full
  design: `docs/superpowers/specs/2026-09-14-optional-integrations-design.md`
  (local planning doc, not committed — see that file's own repo if you need
  it regenerated). Implementation plan:
  `docs/superpowers/plans/2026-09-14-superpowers-integration.md` (same
  caveat).
- First integration: Superpowers (`github:obra/superpowers`). Upstream now
  documents installers for many more coding-agent harnesses than agentenv's
  four v1 targets, but among those four, only Claude Code has a documented,
  non-interactive, ref-pinnable installer (`claude plugin marketplace add` /
  `claude plugin install`). Copilot documents a command of the same shape
  but no way to pin a ref, and Codex CLI/OpenCode have no fixed
  non-interactive command at all, so all three report `unsupported` with
  manual-install hints rather than run unpinned or unreviewed — see
  `docs/research/superpowers-install-mechanisms.md` (re-verified against the
  upstream README on 2026-09-15).
- `gh` gains authenticated/unauthenticated/unknown reporting in
  `agentenv status` via `gh auth status --hostname github.com`; agentenv
  never manages GitHub credentials.
- **Status: complete — all 7 tasks landed.** The full `integrations`
  config schema (defaults, validation, TOML round-trip, diff reporting), the
  read-only `gh` auth probe, and the `IntegrationAdapter` contract +
  `SuperpowersAdapter` are wired into the rest of the CLI:
  `agentenv apply` runs the Superpowers install/update step (idempotent,
  skips with a warning unless `allow_hooks = true`, since Superpowers
  registers a Claude Code `SessionStart` hook); `agentenv status` reports an
  Integrations section (enabled/disabled, source, ref, scope, per-agent
  state) and a `gh` auth line under Tools; `agentenv setup` preserves
  whatever integrations config already exists and never enables one itself;
  `agentenv configure` (Advanced mode) adds an explicit opt-in step showing
  the full source/ref/scope/agents/hooks/external-request summary before
  installing anything. Shared rendering helpers for both `apply` and
  `status` live in `cmd/agentenv/src/integrations/render.ts`. `npm test` runs
  every `*.test.js` under `dist/` via Node's built-in recursive test
  discovery (`node --test`, run from `dist/`) instead of a hand-maintained
  file list, so new test files are picked up automatically.
- **Acceptance (met):** `agentenv apply` with
  `integrations.superpowers.enabled = true` and `allow_hooks = true`
  installs Superpowers for Claude Code idempotently; `agentenv status` shows
  its state; `setup`/`configure` preserve and (Advanced mode only) offer
  explicit opt-in.

## 9. Testing strategy

- CI matrix across the three OSes × four agents is the primary safety net
- Smoke test per agent: run `agentenv apply`, then confirm the agent's own config/hook files parse and contain the expected entries (not a full end-to-end agent session, just config correctness)
- Idempotency test: run `apply` twice, assert no file changes and no reinstall attempts on the second run
- Windows-specific test: confirm Tier 0 detection correctly identifies a missing/misconfigured shell and that the fix actually results in the agent executing through Git Bash
- Manual periodic re-check of the adapter table (§4) and tool catalog (§3), since both are moving targets

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Agent hook mechanisms change or are undocumented/unstable (esp. Copilot, OpenCode, which are newer/less standardized than Claude Code's) | Isolate all agent-specific logic in its own adapter module; a breaking change touches one adapter, not the core |
| AGENTS.md adoption gaps (an agent's AGENTS.md support lags or is partial) | CLAUDE.md-style pointer-file pattern as a fallback for any agent that doesn't yet read AGENTS.md natively |
| Git for Windows not installed at all (rare, but possible on a fresh machine) | Tier 0 check should detect this explicitly and prompt to install Git for Windows first, rather than silently failing later on missing grep/sed/etc. |
| A catalog tool doesn't resolve cleanly through mise on one OS | Verified per-tool in Phase 0 before it's promoted into the default profile; falls back to "custom tool" treatment (manual path) if unresolved |
| mise or rtk introduces a breaking change | Pin versions in generated `mise.toml`; bump deliberately, never automatically |
| Scope creep — wizard/config work pulls us toward building our own installer | Non-goals in §2 stay authoritative; the CLI only ever calls out to mise/rtk, never replaces them |
| Custom-binary config drifting from what's actually on a user's disk | `agentenv status` surfaces drift explicitly rather than silently failing |

## 11. Success criteria

- One command (`agentenv setup`) gets a new machine — including a fresh Windows box — to a working state for all four target agents, in Simple mode
- Advanced users can add a custom binary and reconfigure without hand-editing five different files
- AGENTS.md/CLAUDE.md content stays short and stable regardless of how many tools are configured
- Adding a fifth agent later requires only a new adapter module, no core changes
- Zero custom binaries/installers maintained by us for the underlying dev tools — mise and rtk still do all of that

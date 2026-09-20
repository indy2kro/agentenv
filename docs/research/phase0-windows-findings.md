# Phase 0 — Windows Findings (Consolidated Research)

**Date:** 2026-09-13 (updated 2026-09-19)  
**Phase:** Research & Validation (Complete)  
**Status:** All 9 tasks completed, catalog re-verified against the current
32-tool catalog on 2026-09-19

This document consolidates the Phase 0 research tasks (Tasks 1-9) into a
single reference. It was produced on a Windows machine (Git Bash + mise +
rtk); its macOS and Linux columns are confidence ratings, not measurements.
The measured results for those platforms live in
`phase0-macos-live-verification.md` and `phase0-linux-verification.md`.

---

## 1. Tool Catalog Validation (Tasks 1-4)

### Full 32-Tool Catalog (Tier 1-3)

Resolve status re-verified on 2026-09-19 with `mise ls-remote` (mise
2026.9.11 windows-x64). macOS/Linux install results are measured in the two
companion verification docs.

| # | Tool | Bin | Tier | mise Spec | Windows (resolve) | Status |
|---|---|---|---|---|---|---|
| 1 | ripgrep | `rg` | 1 | `aqua:BurntSushi/ripgrep` | ✅ 15.2.0 | **Validated** |
| 2 | fd | `fd` | 1 | `aqua:sharkdp/fd` | ✅ 10.5.0 | **Validated** |
| 3 | jq | `jq` | 1 | `aqua:jqlang/jq` | ✅ 1.8.2 | **Validated** |
| 4 | rtk | `rtk` | 1 | `aqua:rtk-ai/rtk` (also external winget) | ✅ 0.49.0 | **Validated** (pinned) |
| 5 | ast-grep | `sg` | 2 | `aqua:ast-grep/ast-grep` | ✅ 0.45.3 | **Validated** |
| 6 | git-delta | `delta` | 2 | `aqua:dandavison/delta` | ✅ 0.19.2 | **Validated** |
| 7 | gh | `gh` | 2 | `aqua:cli/cli` | ✅ 2.101.0 | **Validated** |
| 8 | difftastic | `difft` | 2 | `aqua:Wilfred/difftastic` | ✅ 0.70.0 | **Validated** |
| 9 | yq | `yq` | 3 | `aqua:mikefarah/yq` | ✅ 4.53.6 | **Validated** |
| 10 | bat | `bat` | 3 | `aqua:sharkdp/bat` | ✅ 0.26.1 | **Validated** |
| 11 | eza | `eza` | 3 | `vfox:jdx/vfox-eza` | ✅ 0.23.5 | **Validated** |
| 12 | miller | `mlr` | 3 | `aqua:johnkerl/miller` | ✅ 6.21.0 | **Validated** |
| 13 | tokei | `tokei` | 3 | **None (fallback)** | audited 15.0.0 | **Fallback required** |
| 14 | hyperfine | `hyperfine` | 3 | `aqua:sharkdp/hyperfine` | ✅ 1.20.0 | **Validated** |
| 15 | fzf | `fzf` | 3 | `aqua:junegunn/fzf` | ✅ 0.74.4 | **Validated** |
| 16 | just | `just` | 3 | `aqua:casey/just` | ✅ 1.58.0 | **Validated** |
| 17 | watchexec | `watchexec` | 3 | `aqua:watchexec/watchexec` | ✅ 2.7.3 | **Validated** |
| 18 | direnv | `direnv` | 3 | `aqua:direnv/direnv` | ✅ 2.37.1 | **Validated** |
| 19 | ripgrep-all | `rga` | 3 | `aqua:phiresky/ripgrep-all` | ⚠️ 0.10.10 (resolves) | **Windows: manual install** |
| 20 | zoxide | `zoxide` | 3 | `aqua:ajeetdsouza/zoxide` | ✅ 0.10.0 | **Validated** |
| 21 | shellcheck | `shellcheck` | 3 | `aqua:koalaman/shellcheck` | ✅ 0.11.0 | **Validated** |
| 22 | uv | `uv` | 3 | `aqua:astral-sh/uv` | ✅ (latest) | **Validated** |
| 23 | xh | `xh` | 3 | `aqua:ducaale/xh` | ✅ 0.26.2 | **Validated** |
| 24 | actionlint | `actionlint` | 3 | `aqua:rhysd/actionlint` | ✅ 1.7.12 | **Validated** |
| 25 | gitleaks | `gitleaks` | 3 | `aqua:gitleaks/gitleaks` | ✅ 8.30.1 | **Validated** |
| 26 | gum | `gum` | 3 | `aqua:charmbracelet/gum` | ✅ 2.0.1 | **Validated** |
| 27 | glow | `glow` | 3 | `aqua:charmbracelet/glow` | ✅ 3.0.0 | **Validated** |
| 28 | jless | `jless` | 3 | `aqua:PaulJuliusMartinez/jless` | ⚠️ 0.9.0 (resolves) | **Windows: manual install** |
| 29 | sd | `sd` | 3 | `aqua:chmln/sd` | ✅ 1.1.0 | **Validated** |
| 30 | tealdeer | `tldr` | 3 | `aqua:tealdeer-rs/tealdeer` | ✅ 1.9.0 | **Validated** |
| 31 | duckdb | `duckdb` | 3 | `aqua:duckdb/duckdb` | ✅ 1.5.5 | **Validated** |
| 32 | qsv | `qsv` | 3 | `aqua:jqnatividad/qsv` | ✅ 23.0.1 | **Validated** |

### Summary Statistics

| Category | Count | Tools |
|---|---|---|
| **Validated (Tier 1-3)** | 29 | ripgrep, fd, jq, rtk, ast-grep, git-delta, gh, difftastic, yq, bat, eza, miller, hyperfine, fzf, just, watchexec, direnv, zoxide, shellcheck, uv, xh, actionlint, gitleaks, gum, glow, sd, tealdeer, duckdb, qsv |
| **Fallback required (any OS)** | 1 | tokei (needs a `custom_tools` fallback; not in mise's registry) |
| **Windows: manual install only** | 2 | ripgrep-all (`rga`), jless — their only mise backends support `linux`/`darwin` |

### Registry and Naming Notes

- `universal-ctags` was **removed** from the catalog during Phase 1 — it is not
  in the mise registry on any OS and has no prebuilt binaries upstream. It no
  longer appears in `TOOL_KEYS` (`src/config/schema.ts`).
- Registry names differ from config keys for `git_delta` → `delta`,
  `ast_grep` → `ast-grep`, and `tealdeer` → `tealdeer` (binary `tldr`).
  These are **naming conventions only** and do not affect functionality.
- `tokei` resolves (`aqua:XAMPPRocky/tokei` splits a version) but **cannot be
  installed** through any mise backend (`aqua` rejects the cargo package type;
  `cargo:tokei` requires a Rust toolchain). Enabling it prints a validation
  warning; users supply a `custom_tools` or manual fallback instead.

---

## 2. Per-OS Behavioral Parity (Task 9)

### GNU vs. BSD Question Resolution

**Finding:** The GNU/BSD split is **real and current** — macOS ships BSD variants
of `grep`, `sed`, `awk`, `find`, `diff` natively, while Windows gets GNU variants
via Git for Windows' MSYS2 bundle. These are **not flag-compatible**:

| Tool | GNU Flag | BSD (macOS) Flag | Impact |
|---|---|---|---|
| grep | `-P` (PCRE) | Not supported | PCRE regex patterns fail |
| sed | `-i` (no backup) | `-i ''` (empty backup) | In-place edits fail |
| awk | `-i inplace` | Not supported | In-place editing unavailable |
| find | `-regex`, `-printf` | Not supported | Advanced patterns fail |
| diff | `--color`, `--side-by-side` | Not supported | Color output unavailable |

**Tier 0 Fix Required:** Tier 0's scope **expands beyond Windows** — it must also:
- **macOS:** Detect BSD vs. GNU tool usage; install Homebrew packages (`coreutils`, `gnu-sed`, `grep`, `findutils`, `gawk`, `diffutils`) if BSD tools are detected; prioritize their `gnubin` paths (`$(brew --prefix coreutils)/libexec/gnubin`) in `PATH`. Note: Homebrew GNU packages install with `g`-prefixed names by default (`ggrep`, `gsed`, `gfind`, `gawk`) and do **not** silently shadow BSD tools.
- **Linux:** Detect and recommend distro-specific GNU package installation (most Linux distros already ship GNU, but Alpine and others may not)
- **Windows:** Ensure Git for Windows' `bin`/`usr/bin` directories are on `PATH` (already in spec)

**Detection Caveat:** Tier 0 detection should check the resolved binary's actual `--version` output or `type -a` behavior, not just `PATH` presence. On machines with Claude Code installed, `grep` and `find` may be shadowed by shell functions that dispatch to `ugrep` and `bfs` respectively, which are separate from both BSD/GNU variants.

### Tool Behavioral Parity Summary

| Category | Count | Tools | Notes |
|---|---|---|---|
| **Identical across all OSes** | 29 | All validated tools above | Static binaries with no OS-specific code paths |
| **Minor documented differences** | 2 | git-delta (Intel Mac x86_64 asset), hyperfine (macOS x86_64 via Rosetta) | Edge cases only; see live macOS verification |
| **Major documented differences** | 0 | — | eza macOS gap is now validated |
| **Windows: manual install only** | 2 | ripgrep-all (`rga`), jless | mise backends support `linux`/`darwin` only |
| **Install issue (all OS)** | 1 | tokei | Cannot install via mise on any OS; `custom_tools` fallback required |
| **Shell function shadowing** | 2 | grep, find | On machines with Claude Code, may be shadowed by `ugrep`/`bfs` shell functions |

**Verification Sources:**
- Windows: `docs/research/tier-tools-windows.md` and live verification
- macOS: `docs/research/phase0-macos-live-verification.md`
- Linux: `docs/research/phase0-linux-verification.md`

---

## 3. Agent Adapter Table (Task 5)

### Updated Table (Confirmed Unchanged)

| Agent | Instructions File | Hook/Extensibility Mechanism | Confirmed Unchanged? | Source |
|---|---|---|---|---|
| Claude Code | `CLAUDE.md` (does **not** read `AGENTS.md` natively — use pointer) | `settings.json` with JSON hook arrays (`PreToolUse`, `PostToolUse`, `SessionStart`); hooks in `~/.claude/hooks/` | ✅ Yes | [Claude Code Hooks Docs](https://code.claude.com/docs/en/hooks) |
| Codex CLI | `AGENTS.md` (native) | `config.toml` (`[features] hooks = true`) + `hooks.json`; supports `SessionStart`, `PreToolUse`, `UserPromptSubmit` | ✅ Yes | [Codex Config Reference](https://developers.openai.com/codex/config-reference) |
| GitHub Copilot | `AGENTS.md` (native) + optional `.github/copilot-instructions.md` | Hook files under `~/.copilot/hooks/`; config under `~/.config/github-copilot/config.json` | ✅ Yes | Original spec §4 |
| OpenCode | `AGENTS.md` (native) | Plugin scripts in `~/.config/opencode/plugins/`; config in `opencode.json`/`opencode.jsonc` | ✅ Yes | Original spec §4 |

**Design Implication (Reconfirmed):**
> Instructions content is one shared asset (`AGENTS.md`, generated once), but
> hook registration is per-agent code, so the adapter layer is really "one shared
> content generator + N small hook writers."

**No changes** were found to the adapter mechanisms described in §4. All four agents
maintain the same instructions-file and hook/extensibility mechanisms.

---

## 4. RTK `init` Behavior and Rewrite-Rule Coverage (Task 6)

### Per-Agent `rtk init` Support

| Agent | Command | Writes | Status |
|---|---|---|---|
| Claude Code | `rtk init` (default) | `PreToolUse` hook in `settings.json` calling `rtk hook claude` | ✅ **Confirmed working** (live on this machine) |
| Codex CLI | `rtk init --codex` | Uses `AGENTS.md` + `RTK.md`; configures Codex's native hooks | ✅ **Documented support** |
| GitHub Copilot | `rtk init --copilot` | Hook files under `~/.copilot/hooks/` | ✅ **Documented support** |
| OpenCode | `rtk init --opencode` | Plugin in `~/.config/opencode/plugins/` + config | ✅ **Documented support** |

**Note:** `rtk init` also supports `--gemini`, `--agent <AGENT>` for other agents, but
these are outside the v1 target set.

### Rewrite-Rule Coverage (32 Tools)

| Category | Count | Tools | Notes |
|---|---|---|---|
| **Built-in rewrite today** | 4 | ripgrep (via `grep`), fd (via `find`), git-delta (via `git diff`), gh | Category-level rewrites |
| **No applicable rewrite** | 13 | jq, difftastic, yq, bat, eza, miller, tokei, hyperfine, zoxide, shellcheck, uv, gum, glow | Already token-efficient or not applicable |
| **Theoretical custom rule possible** | 4 | ast-grep, ripgrep-all, xh, sd | Would require upstream rtk changes |
| **N/A** | 1 | rtk | This is rtk itself |
| **No rewrite needed** | 10 | fzf, just, watchexec, direnv, actionlint, gitleaks, jless, tealdeer, duckdb, qsv | Already token-friendly |

**Key Finding:** rtk's rewrites are at the **command category level** (e.g., all
`grep` calls → `rtk grep`), not the specific binary level. So `ripgrep` benefits
from rtk's `grep` rewrite even though the rewrite is for the `grep` command category.

**Custom Rewrite Rules:** Not supported through user config — requires editing Rust
source code and rebuilding rtk. This is intentional to avoid user errors.

**Implication for agentenv:** Tools rtk doesn't cover cannot be added via
agentenv configuration. They require upstream rtk changes. The current design
(agentenv drives mise/rtk, rtk handles rewrites) is intentionally non-overlapping.

---

## 5. Tier 0 Shell Detection/Fix (Task 7)

### Per-Agent Shell Configuration

| Agent | Config File | Detection Key | Fix Key/Value | Configurable? |
|---|---|---|---|---|
| Claude Code | `settings.json` | `env.CLAUDE_CODE_GIT_BASH_PATH` | `env.CLAUDE_CODE_GIT_BASH_PATH` = Git Bash path | ✅ Yes |
| Codex CLI | `config.toml` | `[windows].shell_path` | `[windows].shell_path` = Git Bash path | ✅ Yes |
| GitHub Copilot | Shell env / `config.json` | `SHELL` environment variable | `export SHELL` = Git Bash path | ✅ Yes |
| OpenCode | `opencode.json` | `shell` / `defaultShell` | `shell` = Git Bash path | ✅ Yes |

**Key Finding — Dual-Shell Model Confirmed:**
The original dev plan (§3) posed an open question about whether the Tier 0 fix
is "switch the agent's shell to bash.exe." This research confirms the fix is
**narrower than switching shells** — all four v1 agents support some form of
shell override via configuration:

- Claude Code: `env.CLAUDE_CODE_GIT_BASH_PATH`
- Codex CLI: `[windows].shell_path`
- GitHub Copilot: `SHELL` environment variable
- OpenCode: `shell` / `defaultShell` in `opencode.json`

The dual-shell model (native shell for process control + POSIX bash for Unix-style
scripts) is fully supported by ensuring Git Bash tools are reachable via `PATH`.

**No agent requires a shell switch that can't be achieved via configuration.**

### Git Bash Verification on This Machine

**Location:** `C:\Program Files\Git\usr\bin\bash.exe`

**Bundled tools:** All 14 Tier 0 tools confirmed present and resolving:
- `/usr/bin/grep`, `/usr/bin/sed`, `/usr/bin/awk`, `/usr/bin/find`, `/usr/bin/diff`
- `/usr/bin/tar`, `/usr/bin/gzip`, `/mingw64/bin/curl`
- `/usr/bin/cat`, `/usr/bin/ls`, `/usr/bin/mkdir`, `/usr/bin/rm`, `/usr/bin/cp`
- `/usr/bin/mv`, `/usr/bin/less`

---

## 6. Chosen Tech Stack

| Component | Choice | Version | Rationale |
|---|---|---|---|
| Language | TypeScript (Node.js) | 5.0+ | Leverages Node.js (already required by all v1 agents) |
| TUI Library | @inquirer/prompts | ^1.0.0 | Declarative form/wizard primitives, cross-platform |
| CLI Framework | commander | ^12.0.0 | Simple API, TypeScript support, subcommand support |
| Config Parser | toml | ^3.0.0 | TOML parsing for agentenv.toml config files |
| Build Command | `npm run build` | N/A | Compiles TypeScript to JavaScript |

**Decision File:** `docs/decisions/0002-cli-tech-stack.md`

**Alternatives Considered and Rejected:**
- Go + Bubble Tea v2: More low-level, requires manual form state management
- Rust + Ratatui: Contributor friction (Rust toolchain requirement)
- Node.js + Ink: Fails zero-runtime-dependency criterion

**Consequences:**
- ✅ Zero runtime dependency for end users
- ✅ Consistent cross-platform behavior
- ✅ Simple build and cross-compilation
- ⚠️ Larger binary size than Rust (5-10 MB vs. 1-2 MB)
- ⚠️ Go learning curve for contributors

---

## 7. Open Risks Carried Into Phase 1

### From Tool Catalog Validation

1. **tokei (Tier 3):**
   - **Risk:** Requires Rust/cargo toolchain; no prebuilt binaries upstream; `aqua:XAMPPRocky/tokei` does not work (aqua backend rejects cargo package type)
   - **Mitigation:** Must use a `custom_tools` fallback (manual/`already_installed` path) or platform-specific package: Homebrew (`tokei`, bottled on macOS), or custom binary path
   - **Action:** Mark as custom tool; warn users; never a hard failure in `status`/`doctor` (it renders with a `-` marker because `apply` never tries to install it)

2. **git-delta (Tier 2) on Intel Mac:**
   - **Risk:** Release 0.19.2 missing x86_64-apple-darwin asset (0.18.2 had it)
   - **Mitigation:** Verify on real Intel Mac runner in Phase 5 CI
   - **Action:** Needs CI verification before promoted to default
   - **Status:** git-delta on Apple Silicon (arm64) is now **Validated** via live macOS verification

3. **eza (Tier 3) on macOS:**
   - **Risk:** Previously flagged as "Needs CI verification"
   - **Mitigation:** N/A — now **Validated** via live macOS verification (vfox backend resolves to native arm64 binary)
   - **Action:** Promoted to Validated; no longer a risk

4. **hyperfine (Tier 3) on macOS:**
   - **Risk:** Only ships x86_64-apple-darwin asset; runs via Rosetta 2 on Apple Silicon
   - **Mitigation:** Works transparently via Rosetta on Apple Silicon Macs with Xcode tools installed
   - **Action:** Document as minor caveat, not a blocker; no functional impact

### From Behavioral Parity

5. **GNU/BSD Tool Parity:**
   - **Risk:** BSD tools on macOS lack GNU flags; scripts assuming GNU behavior will fail
   - **Mitigation:** Tier 0 must include macOS-specific step to detect and install Homebrew GNU packages
   - **Action:** Expand Tier 0 implementation to cover macOS and Linux (not just Windows)

### From RTK Rewrite Coverage

6. **Limited Rewrite Coverage:**
   - **Risk:** Only 4 command categories (grep, find, git diff, gh) have built-in rtk rewrite rules
   - **Mitigation:** rtk's category-level rewrites cover the most impactful tools (grep, find, git diff); others are already token-efficient or not applicable
   - **Action:** Document which tools benefit from rtk in AGENTS.md; no agentenv changes needed

### From Tier 0 Shell Fix

7. **Per-Agent Shell Configuration Complexity:**
   - **Risk:** Four different configuration mechanisms across four agents
   - **Mitigation:** agentenv's adapter layer abstracts this — each adapter handles its own agent's config format
   - **Action:** No risk to core; isolated in per-agent adapters

8. **Shell Function Shadowing (New):**
   - **Risk:** Tier 0 detection probing through `/bin/sh` may miss shell functions that shadow tools in interactive shells (e.g., Claude Code's `ugrep`/`bfs` for `grep`/`find`)
   - **Mitigation:** Detection should probe through the agent's actual shell context, not just `/bin/sh`; check resolved binary version output or use `type -a`
   - **Action:** Update detection logic to account for shell function shadowing

---

## 8. Phase 0 Output Deliverables

| Deliverable | Location | Status |
|---|---|---|
| Tool catalog validation (32 tools) | `docs/research/tier-tools-windows.md`, `tier-tools-crossplatform.md`, `new-tools-windows.md`, `new-tools-crossplatform.md` | ✅ Complete |
| Re-verified agent adapter table | `docs/research/agent-adapters.md` | ✅ Complete |
| Confirmed `rtk init` behavior | `docs/research/rtk-init-behavior.md` | ✅ Complete |
| Confirmed Tier 0 shell fix | `docs/research/tier0-shell-fix.md` | ✅ Complete |
| Chosen tech stack | `docs/decisions/0002-cli-tech-stack.md` | ✅ Complete |
| Per-OS behavioral parity | `docs/research/tool-behavior-parity.md` | ✅ Complete |
| **Live macOS verification** | `docs/research/phase0-macos-live-verification.md` | ✅ Complete |
| **Live Linux verification** | `docs/research/phase0-linux-verification.md` | ✅ Complete |
| **Example `agentenv.toml`** | `agentenv.toml.example` (repo root) | ✅ Complete |
| **Consolidated findings** | `docs/research/phase0-windows-findings.md` | ✅ **This document** |

---

## 9. Input for Phase 1

### Schema Requirements (from Tool Catalog)

`agentenv.toml` must support:
- **Enabled agents:** claude, codex, copilot, opencode (4 v1 targets)
- **Tool tiers:** Tier 1 (4 tools), Tier 2 (4 tools), Tier 3 (24 tools)
- **Per-tool enable/disable:** Boolean flags or tier-level toggles
- **Custom tools:** Two types:
  - `already_installed = true` with OS-specific paths
  - `mise_source` with version pinning
- **Scope:** Project-level vs. user/global-level (affects file locations)
- **rtk integration:** Enable/disable rtk's command rewriting

### Fallback Strategies Required

For tools that failed validation:
1. **tokei:** Document as custom tool requiring a manual install path (Homebrew `tokei` on macOS, `cargo install tokei` or apt on Linux, cargo/choco on Windows); never a hard failure in `status`/`doctor`
2. **ripgrep-all (`rga`) and `jless` on Windows:** their mise backends only support `linux`/`darwin`; on Windows users must install them manually (`custom_tools`/`already_installed`), or simply leave them disabled (Tier 3, default off)

### Tier 0 Implementation Requirements

- **Windows:** Check Git for Windows installation; ensure `bin`/`usr/bin` on PATH
- **macOS:** Detect BSD vs. GNU tools (accounting for shell function shadowing); install Homebrew packages (`coreutils`, `gnu-sed`, `grep`, `findutils`, `gawk`, `diffutils`) if needed; prepend `$(brew --prefix coreutils)/libexec/gnubin` to PATH
- **Linux:** Check for GNU tools; recommend distro packages if missing (most distros already ship GNU)
- **All platforms:** Detection should check resolved binary version output or `type -a` behavior, not just `PATH` presence, to catch shell function shadowing

### rtk Integration Requirements

- Call `rtk init` per-agent during `agentenv apply` (or `agentenv setup`)
- Only call for enabled agents
- Document which tools benefit from rtk rewrites in AGENTS.md

### Adapters Required (Phase 2)

Four adapters to implement (one per v1 agent):
1. Claude Code adapter — writes `CLAUDE.md` pointer + `settings.json` hooks
2. Codex CLI adapter — writes `config.toml` + `hooks.json`
3. GitHub Copilot adapter — writes `~/.copilot/hooks/*`
4. OpenCode adapter — writes plugin + `opencode.json`

---

## 10. Checklist for Phase 1 Readiness

- [x] Tool catalog validated (32 tools, 29 Windows-resolvable, 1 fallback required, 2 Windows manual-only)
- [x] Agent adapter table re-verified (no changes)
- [x] `rtk init` behavior confirmed (all supported agents)
- [x] Tier 0 shell detection/fix approach confirmed (per-agent config, dual-shell model)
- [x] Tech stack decided (TypeScript + @inquirer/prompts + commander)
- [x] Per-OS behavioral parity verified (29 identical, 2 minor differences, 0 major differences)
- [x] Consolidated findings document (this document)
- [x] Live macOS verification (`phase0-macos-live-verification.md`)
- [x] Live Linux verification (`phase0-linux-verification.md`)
- [x] Example `agentenv.toml` file (`agentenv.toml.example` in repo root)

**Phase 0 is complete.** All verification documents have been created and findings consolidated.

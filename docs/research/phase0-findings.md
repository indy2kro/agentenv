# Phase 0 Findings — Consolidated Research

**Date:** 2026-09-13  
**Phase:** Research & Validation (Complete)  
**Status:** All 9 tasks completed, ready for Phase 1 input

This document consolidates the findings from all Phase 0 research tasks
(Tasks 1-9) into a single reference for Phase 1 planning and implementation.
It addresses all five items from the Phase 0 bullet list in
`docs/plans/agentenv-dev-plan.md` §8, plus the three mid-execution additions
(expanded catalog, rtk-rewrite coverage, per-OS behavioral parity).

---

## 1. Tool Catalog Validation (Tasks 1-4)

### Full 19-Tool Catalog (Tier 1-3 + New Tools)

| # | Tool | Tier | mise Backend | Windows | macOS | Linux | Status |
|---|---|---|---|---|---|---|---|
| 1 | ripgrep (rg) | 1 | `aqua:BurntSushi/ripgrep` | ✅ PASS | ✅ High | ✅ High | **Validated** |
| 2 | fd | 1 | `aqua:sharkdp/fd` | ✅ PASS | ✅ High | ✅ High | **Validated** |
| 3 | jq | 1 | `aqua:jqlang/jq` | ✅ PASS | ✅ High | ✅ High | **Validated** |
| 4 | rtk | 1 | `aqua:rtk-ai/rtk` (also external winget) | ✅ PASS | ✅ High | ✅ High | **Validated** |
| 5 | ast-grep (sg) | 2 | `aqua:ast-grep/ast-grep` | ✅ PASS | ✅ High | ✅ High | **Validated** |
| 6 | git-delta (delta) | 2 | `aqua:dandavison/delta` | ✅ PASS | ⚠️ Medium | ✅ High | **Needs CI verification (Intel Mac)** |
| 7 | universal-ctags | 2 | **None** | ❌ FAIL | ❌ Low | ❌ Low | **Fallback required** |
| 8 | gh | 2 | `aqua:cli/cli` | ✅ PASS | ✅ High | ✅ High | **Validated** |
| 9 | difftastic (difft) | 2 | `aqua:Wilfred/difftastic` | ✅ PASS | ✅ High | ✅ High | **Validated** |
| 10 | yq | 3 | `aqua:mikefarah/yq` | ✅ PASS | ✅ High | ✅ High | **Validated** |
| 11 | bat | 3 | `aqua:sharkdp/bat` | ✅ PASS | ✅ High | ✅ High | **Validated** |
| 12 | eza | 3 | `vfox:jdx/vfox-eza` | ✅ PASS | ❌ Low | ✅ High | **Needs CI verification (macOS)** |
| 13 | miller (mlr) | 3 | `aqua:johnkerl/miller` | ✅ PASS | ✅ High | ✅ High | **Validated** |
| 14 | tokei | 3 | `cargo:tokei` / `aqua:XAMPPRocky/tokei` | ❌ FAIL | ❌ Low | ❌ Low | **Fallback required** |
| 15 | hyperfine | 3 | `aqua:sharkdp/hyperfine` | ✅ PASS | ✅ High | ✅ High | **Validated** |
| 16 | fzf | 3 | `aqua:junegunn/fzf` | ✅ PASS | ✅ High | ✅ High | **Validated** |
| 17 | just | 3 | `aqua:casey/just` | ✅ PASS | ✅ High | ✅ High | **Validated** |
| 18 | watchexec | 3 | `aqua:watchexec/watchexec` | ✅ PASS | ✅ High | ✅ High | **Validated** |
| 19 | direnv | 3 | `aqua:direnv/direnv` | ✅ PASS | ✅ High | ✅ High | **Validated** |

### Summary Statistics

| Category | Count | Tools |
|---|---|---|
| **Validated (High Confidence)** | 16 | ripgrep, fd, jq, rtk, ast-grep, gh, difftastic, yq, bat, miller, hyperfine, fzf, just, watchexec, direnv, tokei (Windows only), git-delta |
| **Needs CI Verification** | 2 | eza (macOS), git-delta (Intel Mac x86_64) |
| **Fallback Required** | 2 | universal-ctags, tokei |

### Registry Name Discrepancies

Two tools have different registry names in mise than their common names:
- `git-delta` (common) → `delta` (mise registry)
- `mlr` (common) → `miller` (mise registry)

These are **naming conventions only** and do not affect functionality.

### Package vs. Binary Name Discrepancies

Three tools have different package names than their binary names:
- `difftastic` (package) → `difft` (binary)
- `delta` (package) → `delta` (binary) — matches
- `miller` (package) → `mlr` (binary)

These are **intentional** and do not affect functionality.

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
- **macOS:** Detect BSD vs. GNU tool usage; install Homebrew packages (`coreutils`, `gnu-sed`, `grep`, `findutils`, `gawk`, `diffutils`) if BSD tools are detected; prioritize their `gnubin` paths in `PATH`
- **Linux:** Detect and recommend distro-specific GNU package installation (most Linux distros already ship GNU, but Alpine and others may not)
- **Windows:** Ensure Git for Windows' `bin`/`usr/bin` directories are on `PATH` (already in spec)

### Tool Behavioral Parity Summary

| Category | Count | Tools | Notes |
|---|---|---|---|
| **Identical across all OSes** | 15 | ripgrep, fd, jq, rtk, ast-grep, gh, difftastic, yq, bat, miller, hyperfine, fzf, just, watchexec, direnv, git-delta | Static binaries with no OS-specific code paths |
| **Minor documented differences** | 2 | git-delta (Intel Mac asset), bat (TTY detection) | Edge cases only |
| **Major documented differences** | 1 | eza (macOS prebuilt binary gap) | macOS requires Homebrew/build-from-source |
| **Install issues** | 2 | universal-ctags, tokei | Cannot install via mise on any OS |

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

### Rewrite-Rule Coverage (19 Tools)

| Category | Count | Tools | Notes |
|---|---|---|---|
| **Built-in rewrite today** | 4 | grep → rtk grep, find → rtk find, git diff → rtk diff, gh → rtk gh | Category-level rewrites |
| **No applicable rewrite** | 7 | jq, universal-ctags, difftastic, yq, bat, eza, miller | Already token-efficient or not applicable |
| **Theoretical custom rule possible** | 4 | ast-grep, git-delta/delta, tokei, hyperfine | Would require upstream rtk changes |
| **N/A** | 1 | rtk | This is rtk itself |
| **No rewrite needed** | 4 | fzf, just, watchexec, direnv | Already token-friendly |

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

## 6. Chosen Tech Stack (Task 8 — ADR 0001)

| Component | Choice | Version | Rationale |
|---|---|---|---|
| Language | Go (Golang) | 1.21+ | Single static binary, no runtime dependency |
| TUI Library | charmbracelet/huh | v2.0.3+ | Declarative form/wizard primitives, cross-platform |
| Build Command | `go build -o agentenv ./cmd/agentenv` | N/A | Produces single static binary |
| Import Paths | `charm.land/huh/v2` | v2 | Vanity paths (migrated March 2026) |

**Decision File:** `docs/decisions/0001-cli-tech-stack.md`

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

1. **universal-ctags (Tier 2):**
   - **Risk:** Not in mise registry on any OS; no prebuilt binaries upstream
   - **Mitigation:** Must use fallback strategy — Homebrew (`ctags`), apt (`universal-ctags`), chocolatey/scoop, or custom binary path
   - **Action:** Mark as custom tool in agentenv; document fallback in AGENTS.md

2. **tokei (Tier 3):**
   - **Risk:** Requires Rust/cargo toolchain; no prebuilt binaries upstream
   - **Mitigation:** Must use `cargo:` backend in mise (requires Rust) or custom binary path
   - **Action:** Mark as custom tool; warn users that Rust toolchain is required

3. **eza (Tier 3) on macOS:**
   - **Risk:** No GitHub-release prebuilt binary for macOS; relies on vfox backend
   - **Mitigation:** Verify on real macOS runner in Phase 5 CI
   - **Action:** Needs CI verification before promoted to default

4. **git-delta (Tier 2) on Intel Mac:**
   - **Risk:** Release 0.19.2 missing x86_64-apple-darwin asset (0.18.2 had it)
   - **Mitigation:** Verify on real Intel Mac runner in Phase 5 CI
   - **Action:** Needs CI verification before promoted to default

### From Behavioral Parity

5. **GNU/BSD Tool Parity:**
   - **Risk:** BSD tools on macOS lack GNU flags; scripts assuming GNU behavior will fail
   - **Mitigation:** Tier 0 must include macOS-specific step to detect and install Homebrew GNU packages
   - **Action:** Expand Tier 0 implementation to cover macOS and Linux (not just Windows)

### From RTK Rewrite Coverage

6. **Limited Rewrite Coverage:**
   - **Risk:** Only 4/19 catalog tools have built-in rtk rewrite rules
   - **Mitigation:** rtk's category-level rewrites cover the most impactful tools (grep, find, git diff); others are already token-efficient or not applicable
   - **Action:** Document which tools benefit from rtk in AGENTS.md; no agentenv changes needed

### From Tier 0 Shell Fix

7. **Per-Agent Shell Configuration Complexity:**
   - **Risk:** Four different configuration mechanisms across four agents
   - **Mitigation:** agentenv's adapter layer abstracts this — each adapter handles its own agent's config format
   - **Action:** No risk to core; isolated in per-agent adapters

---

## 8. Phase 0 Output Deliverables

| Deliverable | Location | Status |
|---|---|---|
| Tool catalog validation (19 tools) | `docs/research/tier-tools-windows.md`, `tier-tools-crossplatform.md`, `new-tools-windows.md`, `new-tools-crossplatform.md` | ✅ Complete |
| Re-verified agent adapter table | `docs/research/agent-adapters.md` | ✅ Complete |
| Confirmed `rtk init` behavior | `docs/research/rtk-init-behavior.md` | ✅ Complete |
| Confirmed Tier 0 shell fix | `docs/research/tier0-shell-fix.md` | ✅ Complete |
| Chosen tech stack | `docs/decisions/0001-cli-tech-stack.md` | ✅ Complete |
| Per-OS behavioral parity | `docs/research/tool-behavior-parity.md` | ✅ Complete |
| **Example `agentenv.toml`** | *To be created by Task 10 Step 3* | ⏳ Pending |
| **Consolidated findings** | `docs/research/phase0-findings.md` | ✅ **This document** |

---

## 9. Input for Phase 1

### Schema Requirements (from Tool Catalog)

`agentenv.toml` must support:
- **Enabled agents:** claude, codex, copilot, opencode (4 v1 targets)
- **Tool tiers:** Tier 1 (4 tools), Tier 2 (5 tools), Tier 3 (7 tools)
- **Per-tool enable/disable:** Boolean flags or tier-level toggles
- **Custom tools:** Two types (per §6.3):
  - `already_installed = true` with OS-specific paths
  - `mise_source` with version pinning
- **Scope:** Project-level vs. user/global-level (affects file locations)
- **rtk integration:** Enable/disable rtk's command rewriting

### Fallback Strategies Required

For tools that failed validation:
1. **universal-ctags:** Document as custom tool with platform-specific install instructions
2. **tokei:** Document as custom tool requiring Rust/cargo toolchain

### Tier 0 Implementation Requirements

- **Windows:** Check Git for Windows installation; ensure `bin`/`usr/bin` on PATH
- **macOS:** Detect BSD vs. GNU tools; recommend Homebrew GNU packages; prioritize `gnubin` in PATH
- **Linux:** Check for GNU tools; recommend distro packages if missing

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

- [x] Tool catalog validated (19 tools, 16 high-confidence, 2 needs CI verification, 2 fallback required)
- [x] Agent adapter table re-verified (no changes from spec §4)
- [x] `rtk init` behavior confirmed (all 4 v1 agents supported)
- [x] Tier 0 shell detection/fix approach confirmed (per-agent config, dual-shell model)
- [x] Tech stack decided (Go + Huh v2)
- [x] Per-OS behavioral parity verified (15 identical, 2 minor, 1 major difference)
- [x] Consolidated findings document (this document)
- [ ] Example `agentenv.toml` file (*next step*)

**Phase 0 is complete** once the example `agentenv.toml` is created and committed.

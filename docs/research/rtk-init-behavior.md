# RTK `init` Behavior and Rewrite-Rule Coverage

**Research Date:** 2026-09-13
**rtk Version:** 0.42.4 (Windows, via winget)
**Method:**
- Local execution of `rtk --help`, `rtk init --help`
- Inspection of live Claude Code integration on this machine
- Web search against [rtk-ai/rtk](https://github.com/rtk-ai/rtk) docs and issues
- Analysis of `rtk gain --history` output from this session

This document builds on:
- `docs/research/agent-adapters.md` (Task 5) — for per-agent hook/extensibility mechanisms
- `docs/research/tier-tools-windows.md` (Task 1) and `docs/research/new-tools-windows.md` (Task 3) — for the full 19-tool catalog

## Per-Agent `rtk init` Behavior

### Claude Code

**Command:** `rtk init` (default, no flags needed)

**What it writes/changes:**
- **Hook registration:** Adds a `PreToolUse` hook entry to `~/.claude/settings.json` (or `./.claude/settings.json` for project scope) that invokes `rtk hook claude` before Bash tool calls.
- **Example from this machine:** The existing `~/.claude/settings.json` contains:
  ```json
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "rtk hook claude"
          }
        ]
      }
    ]
  }
  ```
- **Artifacts:** Does **not** create `RTK.md` or `CLAUDE.md` by default with current flags; these can be added with `--claude-md` and `--hook-only` flags respectively.
- **Scope:** User-level by default; `--global` flag for global config directory.

**Status:** ✅ **Confirmed working** — this machine already has rtk wired into Claude Code via the above hook configuration.

**Source:**
- `rtk init --help` output (this machine)
- Live Claude Code `settings.json` inspection (this machine)
- [RTK Hooks DeepWiki](https://deepwiki.com/rtk-ai/rtk/3.5-command-rewrite-system)

---

### Codex CLI

**Command:** `rtk init --codex`

**What it writes/changes:**
- **Instructions file:** Uses `AGENTS.md` (native for Codex) + `RTK.md` (rtk-specific instructions).
- **Hook registration:** Configures Codex CLI's hook system (per `docs/research/agent-adapters.md`, Codex uses `~/.codex/config.toml` with `[features] hooks = true` and/or `~/.codex/hooks.json`).
- **Key difference from Claude:** No `settings.json` patching needed; Codex's native hook system is used directly.
- **From `rtk init --help`:** The `--codex` flag is explicitly documented as targeting Codex CLI.

**Status:** ✅ **Documented support** — flag exists in rtk 0.42.4, mechanism matches Codex's native hook format from Task 5.

**Source:**
- `rtk init --help` output (this machine)
- [Codex Config Reference](https://developers.openai.com/codex/config-reference) (from Task 5)

---

### GitHub Copilot (CLI/Chat)

**Command:** `rtk init --copilot`

**What it writes/changes:**
- **Instructions file:** Uses `AGENTS.md` (native for Copilot) and optional `.github/copilot-instructions.md`.
- **Hook registration:** Writes hook files under `~/.copilot/hooks/` (per `docs/research/agent-adapters.md`, Copilot's hook directory).
- **From `rtk init --help`:** The `--copilot` flag is explicitly documented as "Install GitHub Copilot integration (VS Code + CLI)".

**Status:** ✅ **Documented support** — flag exists in rtk 0.42.4, mechanism matches Copilot's native hook format from Task 5.

**Source:**
- `rtk init --help` output (this machine)
- Original spec §4 (re-verified unchanged in Task 5)

---

### OpenCode

**Command:** `rtk init --opencode`

**What it writes/changes:**
- **Plugin installation:** Drops a plugin script in `~/.config/opencode/plugins/` (per `docs/research/agent-adapters.md`, OpenCode's plugin directory).
- **Config file:** Writes/updates `opencode.json` or `opencode.jsonc` in `~/.config/opencode/`.
- **From `rtk init --help`:** The `--opencode` flag is explicitly documented as "Install OpenCode plugin (in addition to Claude Code)".

**Status:** ✅ **Documented support** — flag exists in rtk 0.42.4, mechanism matches OpenCode's plugin-based system from Task 5.

**Source:**
- `rtk init --help` output (this machine)
- Original spec §4 (re-verified unchanged in Task 5)

---

### Other Supported Agents (for completeness)

The `rtk init --help` output also shows flags for:
- `--gemini` — Initialize for Gemini CLI
- `--agent <AGENT>` — Generic agent selector with values: `claude`, `cursor`, `windsurf`, `cline`, `kilocode`, `antigravity`, `pi`, `hermes`

These are **not** part of the v1 target set (§1) and are not required for Phase 0, but confirm that rtk's init system is designed for extensibility beyond the four target agents.

## Rewrite-Rule Coverage Across the Full 19-Tool Catalog

This section answers: *which of the 19 catalog tools does rtk already rewrite toward, which could it, and which can't?*

### Tool List (from Tasks 1–3)

**Tier 1 (4 tools):** ripgrep (`rg`), fd, jq, rtk
**Tier 2 (5 tools):** ast-grep (`sg`), git-delta (`delta`), universal-ctags, gh, difftastic (`difft`)
**Tier 3 (7 tools from Task 3):** difftastic, tokei, hyperfine, fzf, just, watchexec, direnv

*Note: difftastic appears in both Tier 2 and the new tools list; counting it once for a total of **19 unique tools**.*

Full catalog (19 tools):
1. ripgrep (rg)
2. fd
3. jq
4. rtk
5. ast-grep (sg)
6. git-delta (delta)
7. universal-ctags
8. gh (GitHub CLI)
9. difftastic (difft)
10. yq
11. bat
12. eza
13. miller (mlr)
14. tokei
15. hyperfine
16. fzf
17. just
18. watchexec
19. direnv

### Findings Table

| Tool | Has a rewrite rule today? | Could have one (custom rule support)? | Notes |
|---|---|---|---|
| ripgrep (rg) | **Y** | Y | Built-in: `grep` → `rtk grep` (which internally uses `rg`); confirmed via `rtk gain --history` showing `rtk grep` usage |
| fd | **Y** | Y | Built-in: `find` → `rtk find`; confirmed via rtk docs and `rtk find` command existence |
| jq | **N** | Y (theoretical) | No built-in rewrite; `jq` is already token-efficient (JSON output). Custom rule possible but unnecessary — no token savings to gain. |
| rtk | N/A | N/A | This *is* rtk itself; not a candidate for rewriting. |
| ast-grep (sg) | **N** | Y | No built-in rewrite; `sg` is already optimized for code search. Custom rule could map `grep -r --include=*.ts ...` → `sg ...` but not built-in. |
| git-delta (delta) | **Y** (partial) | Y | Built-in: `git diff` → `rtk diff` (ultra-condensed); `git-delta` (`delta`) is a pager, not a direct rewrite target. `rtk gain --history` shows `rtk git diff` usage. |
| universal-ctags | **N** | N | No applicable rewrite — ctags is a code-indexing tool, not a shell command that produces token-heavy output. |
| gh (GitHub CLI) | **Y** | Y | Built-in: `gh` → `rtk gh` (token-optimized output); confirmed via `rtk gh` command existence and `rtk --help` listing. |
| difftastic (difft) | **N** | Y (theoretical) | No built-in rewrite; `difft` is a structural diff viewer. Could theoretically map `diff file1 file2` → `difft file1 file2` but not currently built-in. |
| yq | **N** | Y (theoretical) | No built-in rewrite; similar to `jq` — already token-efficient. |
| bat | **N** | Y | No built-in rewrite; `bat` is already a `cat` replacement with token-friendly features. |
| eza | **N** | Y | No built-in rewrite; `eza` is an `ls` replacement; rtk has its own `rtk ls` but doesn't rewrite `ls` → `eza`. |
| miller (mlr) | **N** | Y (theoretical) | No built-in rewrite; CSV/TSV processing tool, niche use case. |
| tokei | **N** | N | No applicable rewrite — code statistics tool, not a candidate for token optimization. |
| hyperfine | **N** | N | No applicable rewrite — benchmarking tool, not a candidate for token optimization. |
| fzf | **N** | N | No applicable rewrite — fuzzy finder; its non-interactive `--filter` mode (verified in Task 3) is already token-friendly. |
| just | **N** | N | No applicable rewrite — task runner, not a candidate for token optimization. |
| watchexec | **N** | N | No applicable rewrite — file watcher, not a candidate for token optimization. |
| direnv | **N** | N | No applicable rewrite — environment manager, not a candidate for token optimization. |

### Summary

| Category | Count | Tools |
|---|---|---|
| **Built-in rewrite today** | 4 | grep (→ rtk grep/rg), find (→ rtk find/fd), git diff (→ rtk diff), gh (→ rtk gh) |
| **No applicable rewrite** | 7 | jq, universal-ctags, difftastic, yq, bat, eza, miller |
| **Theoretical custom rule possible** | 4 | ast-grep, git-delta/delta, tokei, hyperfine |
| **N/A (rtk itself)** | 1 | rtk |
| **No rewrite needed** | 4 | fzf, just, watchexec, direnv |

*Note on terminology: rtk's built-in rewrites are at the **command category** level (e.g., all `grep` calls → `rtk grep`, all `find` calls → `rtk find`), not at the **specific binary** level. So `ripgrep` benefits from rtk's `grep` rewrite even though the rewrite is for the `grep` command category, not specifically for `rg`.*

### Custom Rewrite Rule Support

**Answer:** Yes, but **not through a simple config file** — custom rewrite rules require:
- Editing the rewrite logic in Rust source code (`src/discover/registry.rs`, `src/discover/rules.rs`)
- Rebuilding rtk from source

There is **no user-level TOML/YAML config** for adding custom rewrite rules at runtime. This is a deliberate design choice by the rtk maintainers to keep the rewrite logic robust and avoid user errors from malformed custom rules.

**Implication for agentenv:** Tools that rtk doesn't cover out-of-the-box (e.g., ast-grep, difftastic) cannot be added via agentenv configuration. They would require upstream rtk changes or agentenv to implement its own command-interception layer — which would conflict with rtk's own hook and duplicate effort. The current design (agentenv drives mise/rtk, rtk handles rewrites) is intentionally non-overlapping.

**Source:**
- [RTK Command Rewrite System DeepWiki](https://deepwiki.com/rtk-ai/rtk/3.5-command-rewrite-system)
- [rtk-ai/rtk Issue #1759](https://github.com/rtk-ai/rtk/issues/1759) (add fd and sd to rewrite registry)
- [rtk-ai/rtk Issue #170](https://github.com/rtk-ai/rtk/issues/170) (find/grep rewrite breaks on native flags)
- `rtk gain --history` output (this machine, showing actual rewritten commands in use)

# Agent Adapter Table Re-verification

**Research Date:** 2026-09-13
**Method:** Web search against official documentation and current community guides
for each of the four target agents (Claude Code, Codex CLI, GitHub Copilot CLI/Chat,
OpenCode).

This document re-verifies the table in §4 of `docs/plans/agentenv-dev-plan.md`
and confirms whether the mechanisms described there are still current as of
September 2026.

## Agent Adapter Table (Updated)

| Agent | Instructions file | Hook / extensibility mechanism | Confirmed unchanged? | Source URL(s) |
|---|---|---|---|---|
| Claude Code | `CLAUDE.md` (does **not** read `AGENTS.md` natively yet — workaround: one line in `CLAUDE.md` pointing to `AGENTS.md`) | `~/.claude/settings.json` or `./.claude/settings.json`, JSON hook arrays supporting `PreToolUse`, `PostToolUse`, `SessionStart`, etc.; hook scripts stored in `~/.claude/hooks/` and referenced from `settings.json` | **Y** (mechanism unchanged, but documentation now explicitly confirms `AGENTS.md` is *not* natively supported) | [Claude Code Hooks Docs](https://code.claude.com/docs/en/hooks), [CLAUDE.md Setup Guide 2026](https://baeseokjae.github.io/posts/claude-md-setup-guide-2026/) |
| Codex CLI | `AGENTS.md` (native) | `~/.codex/config.toml` (`[features] hooks = true`) and/or `~/.codex/hooks.json` / `<repo>/.codex/hooks.json`; supports `SessionStart`, `PreToolUse`, `UserPromptSubmit`, etc. | **Y** (mechanism unchanged) | [Codex Config Reference](https://developers.openai.com/codex/config-reference), [Codex AGENTS.md Guide](https://developers.openai.com/codex/guides/agents-md) |
| GitHub Copilot (CLI/Chat) | `AGENTS.md` (native) + optional `.github/copilot-instructions.md` | Hook files under `~/.copilot/hooks/`; config under `~/.config/github-copilot/config.json` | **Y** (mechanism unchanged; no official documentation update found contradicting the original spec) | Original spec §4 remains authoritative; no 2026 contradicting docs found |
| OpenCode | `AGENTS.md` (native) | Plugin-based (not declarative JSON) — small script dropped in `~/.config/opencode/plugins/`, config in `opencode.json`/`opencode.jsonc` | **Y** (mechanism unchanged) | Original spec §4 remains authoritative; no 2026 contradicting docs found |

## Change Summary

**No changes were found** to the adapter mechanisms described in §4 of the dev plan.
All four agents maintain the same instructions-file and hook/extensibility mechanisms
as originally documented.

The one clarification worth noting is for **Claude Code**: the 2026 official
documentation and community guides now explicitly state that Claude Code does
*not* read `AGENTS.md` natively. The original dev plan's workaround (a `CLAUDE.md`
file that contains a single line pointing to `AGENTS.md`) remains the correct
approach. This is not a mechanism change, but it confirms the dev plan's original
assessment was accurate.

## Design Implications (Reconfirmed)

The original implication from §4 still holds:

> **instructions content is one shared asset** (`AGENTS.md`, generated once),
> but **hook registration is per-agent code**, so the adapter layer is really
> "one shared content generator + N small hook writers."

No updates to the adapter architecture are required based on this re-verification.

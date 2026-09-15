# Research: Superpowers Native Installation Mechanisms Per Agent

**Status:** Resolved — feeds `docs/superpowers/plans/2026-09-14-superpowers-integration.md`.

**Re-verified 2026-09-15** against the current `obra/superpowers` README.
Upstream now documents installers for many more harnesses than agentenv's
four v1 targets (Antigravity, Cursor, Devin CLI, Factory Droid, Gemini CLI,
Grok Build CLI, Kimi Code, Pi, Hermes Agent, in addition to the four below) —
out of scope here, but a reminder that this integration isn't Claude-specific
upstream, only agentenv's *automation* of it is scoped to the four v1 agents.
The findings below for those four are unchanged.

## The Question

`docs/superpowers/specs/2026-09-14-optional-integrations-design.md` requires
the Superpowers integration adapter to "use the integration's documented
native installation mechanism for each supported agent" and to report
"manual action required" rather than "execute an unreviewed remote command"
whenever a host's installer cannot accept a pinned ref non-interactively.
This doc records what's actually documented per agent, so the plan doesn't
invent CLI flags.

## Sources

- Claude Code plugin docs: https://code.claude.com/docs/en/discover-plugins
  (official Anthropic docs, fetched 2026-09-14)
- `obra/superpowers` README (upstream project's own per-agent install
  instructions), fetched via web search + page fetch 2026-09-14
- `obra/superpowers-marketplace` (the catalog repo Claude Code's `/plugin
  marketplace add` / `claude plugin marketplace add` actually clones)

## Findings

### Claude Code — fully documented, non-interactive, ref-pinnable ✅

Two-step process, both scriptable outside an interactive session:

```
claude plugin marketplace add obra/superpowers-marketplace[#<ref>]
claude plugin install superpowers@superpowers-marketplace --scope <user|project>
```

- `claude plugin marketplace add <owner/repo>[#<ref>]` clones the marketplace
  repo at a specific tag/branch/commit when `#<ref>` is appended (confirmed:
  docs show this exact syntax for a GitLab URL; GitHub `owner/repo` shorthand
  clones the same way, so the ref suffix applies identically).
- `claude plugin install <plugin>@<marketplace>` installs to **user scope by
  default**; `--scope project` targets the project. This lines up with the
  design's `scope = "user" | "project"` field 1:1.
- Both commands run outside an interactive session (`claude plugin ...`, no
  leading `/`), so `agentenv apply` can invoke them non-interactively.
- Marketplace add is idempotent-ish: re-running it against an existing name
  updates rather than erroring per docs ("Refresh plugin listings"); detect
  step still checks first so `apply` never reinstalls needlessly.

**Ruling: Claude Code gets full automated install/detect/status support.**

### Codex CLI — interactive only, no pinning ⚠️

Upstream's own install note for Codex: "Available through official Codex
marketplace... CLI: Search via `/plugins`, then select Install Plugin." No
non-interactive command and no ref-pinning mechanism is documented anywhere
upstream or in Codex's own docs as of this research.

**Ruling: report `manual action required` — do not attempt automated
install.** The adapter's `apply()`/`status()` surface the exact interactive
steps as a message; it never shells out for Codex.

### GitHub Copilot CLI — commands exist upstream, pinning unconfirmed ⚠️

Upstream's install note for Copilot CLI:

```
copilot plugin marketplace add obra/superpowers-marketplace
copilot plugin install superpowers@superpowers-marketplace
```

This mirrors Claude Code's own two-step shape (both projects converged on
similar plugin CLIs), and it is what the Superpowers maintainers themselves
document for Copilot. However: (a) this note has no independently-verifiable
official Copilot CLI documentation confirming it (unlike Claude Code, which
we cross-checked against `code.claude.com/docs`), and (b) there is no
documented `#<ref>` or equivalent pin syntax for `copilot plugin marketplace
add`. Per the design's own rule — "Native installers that cannot accept a
pinned ref must be reported as manual/unsupported rather than silently
falling back to a floating branch" — an unpinnable install is not eligible
for automation regardless of whether the base command works.

**Ruling: report `manual action required`, but the message includes the
upstream-documented commands as a copyable hint** (same treatment as Codex,
distinguished only in the hint text). Do not execute these commands. Revisit
automation once Copilot CLI's own docs confirm a pin mechanism.

### OpenCode — delegates to a file, no fixed command ⚠️

Upstream's own install note for OpenCode: "Command: Fetch instructions from
`.opencode/INSTALL.md`" — i.e. there is no single fixed command at all; the
installer is whatever that file says, which can change per release and is
not something a fixed, reviewed allowlist entry can safely encode.

**Ruling: report `manual action required`.**

## Design Consequence

Only the Claude Code adapter shells out. The other three always return a
`detect`/`status` result of `unsupported` (or `manual action required` on
`apply`) with the upstream-documented hint text, never executing a command.
This satisfies the spec's "reviewed allowlist... arbitrary commands from
TOML are invalid" and "manual action required instead of executing an
unreviewed remote command" requirements exactly, and keeps the adapter
honest about what it can actually verify.

If Codex/Copilot/OpenCode later publish an equivalent non-interactive,
ref-pinnable install command, promoting them to automated follows the same
pattern as the Claude Code adapter — no architecture change needed.

# Open Question: Delegate Hook Wiring to `rtk init` vs. Hand-Write Hooks

**Status:** Resolved — implemented in the adapter catalog as of 2026-09-16.

The current implementation delegates RTK initialization for all nine supported
agents through the shared `RtkDelegationAdapter` where RTK owns the integration
surface. The four-agent wording in the original findings below is retained as
historical research context.

## The Question

Should the per-agent adapters write hook config themselves, or should they
invoke `rtk init <agent> ...` and let rtk own hook registration?

`docs/research/phase0-findings.md` §9 ("rtk Integration Requirements") states:

> - Call `rtk init` per-agent during `agentenv apply` (or `agentenv setup`)
> - Only call for enabled agents

This matches the dev plan's core constraint (`docs/plans/agentenv-dev-plan.md`
§2 / §10): "the CLI only ever calls out to mise/rtk, never replaces them."

The current adapters, however, hand-write the hook files:

| Agent | Hand-written location | Status |
|---|---|---|
| Claude Code | `PreToolUse` `rtk hook claude` entry in `~/.claude/settings.json` | ✅ Matches exactly what `rtk init` writes (verified), tested |
| Codex CLI | `~/.codex/config.toml` (`[features] hooks`) + `~/.codex/hooks.json` | ⚠️ Plausible but not verified against a real rtk install |
| GitHub Copilot | `~/.copilot/hooks/pre-tool-use` script calling `rtk hook copilot` | ⚠️ Unverified hook-file format |
| OpenCode | `~/.config/opencode/plugins/rtk-optimizer.js` plugin | ⚠️ Plugin API shape is likely wrong/out of date |

## Why It Matters

- **Correctness:** rtk moves fast; its generated hooks are the ground truth for
  each agent's current format. Hand-written copies drift and break silently.
- **Duplication:** hand-writing hooks re-implements `rtk init`, contradicting
  §2's "thin orchestration" constraint.
- **Safety:** `rtk init` handles idempotency and preserves existing user hooks
  in the way rtk's maintainers intend.

## Options

1. **Delegate fully:** when `rtk.enabled` (and the agent's `rtk.init.*` flag)
   is set, the adapter runs `rtk init <flags>` for that agent and only owns the
   non-rtk responsibilities (instructions files, Tier 0 shell override,
   `agentenv.toml`-scoped config). Simplest, most aligned with §9.
2. **Delegate per-agent where verified, hand-write where not:** keep the tested
   Claude hook as-is; run `rtk init --codex` / `--copilot` / `--opencode` for
   the rest. Requires rtk binary to be reachable after `mise install`.
3. **Keep all hand-written:** only viable if every hand-written format is
   verified against the real rtk output for the pinned rtk version.

## Verified Findings (rtk 0.42.4, 2026-09-14)

Queried via `rtk init --help` and `rtk init --<agent> --dry-run -v` (in a
throwaway HOME; no files written). This machine has `rtk 0.42.4` on PATH
from mise.

`rtk init` flags for the original four v1 agents:

| Flag | Behavior (dry-run) | Matches current adapter? |
|---|---|---|
| `--agent claude` (default) | Patches `~/.claude/settings.json` with the `PreToolUse` `rtk hook claude` entry | ✅ yes — adapter already writes this exact structure |
| `--codex` | Creates project `RTK.md` + patches `AGENTS.md` — **no hooks.json, no config.toml patching** | ❌ no — adapter writes `~/.codex/hooks.json` + `[features] hooks` |
| `--copilot` | Writes `.github/copilot-instructions.md` + `.github/hooks/rtk-rewrite.json` (VS Code/CLI `PreToolUse` + `preToolUse`) | ❌ no — adapter writes `~/.copilot/hooks/pre-tool-use` shell script |
| `--opencode` | Installs OpenCode plugin (in addition to Claude) | ⚠️ untested dry-run; flag exists |

Other relevant flags: `--agent <cursor|windsurf|cline|kilocode|antigravity|kimi|pi|hermes|droid>`,
`--gemini`, `--show`, `--claude-md` (legacy), `--hook-only`, `--auto-patch`,
`--no-patch`, `--uninstall`, `--dry-run`, `--trust-filters` / `--no-trust-filters`.

**Note on flag stability:** As of rtk 0.49.0, `--codex` and `--copilot` flags are
undocumented in `rtk init --help` output but still function correctly. These
flags may be at risk of removal in future rtk versions without appearing in
changelogs. Consider asserting their presence in CI smoke tests.

Consequences:

1. **Codex and Copilot hand-written hooks do not match real rtk.** rtk's Codex
   path is intentionally *hook-free* (AGENTS.md + RTK.md pattern), and its
   Copilot path targets the VS Code/CLI `.github/hooks/` mechanism rather than
   a `~/.copilot/hooks/pre-tool-use` script. Per §2's constraint, agentenv
   should stop hand-writing these and delegate.
2. **Side effect: rtk history database.** Every `rtk init` call (and by extension,
   every `agentenv apply` with RTK enabled) creates `~/.local/share/rtk/history.db`
   — a command-history database in the user's home. This should be noted in
   Phase 4's transparency log so users understand what files are being created.
2. **Recommendation: option 2** — keep the Claude hook (verified match, tested),
   and for Codex/Copilot invoke `rtk init --codex` / `--copilot` (and
   `--opencode` for OpenCode) from the adapters when `rtk.enabled`. The hooks
   rtk writes are project-scoped (`.codex` via RTK.md in project, `.github/`),
   so agentenv scopes them naturally per project.
3. `rtk init` is prompt-y by default (`--auto-patch`/`--no-patch` control the
   settings.json ask); the adapters should pass `--dry-run` to report intent
   in `status`/`configure` without writing, or run with the patch flags for
   non-interactive apply.

## Historical Phase 2 Verification Checklist

On each OS, after `mise install` makes `rtk` available:

1. Run `rtk init <agent>` for each target agent and diff the written files
   against what the adapter currently writes — largely **done above**; the
   remaining gap is the OpenCode plugin file rtk actually generates.
2. Confirm `rtk init` is idempotent / safe to re-run.
3. The delegation boundary was subsequently recorded in the implementation:
   Claude Code retains its verified native adapter, while the other supported
   agents use RTK delegation.

## Related

- `docs/research/agent-adapters.md` — per-agent hook/extensibility mechanisms
- `docs/research/rtk-init-behavior.md` — confirmed `rtk init` flags 0.42.4
- `docs/research/phase0-findings.md` §9 — rtk integration requirements
- `cmd/agentenv/src/adapters/` — current hand-written implementation
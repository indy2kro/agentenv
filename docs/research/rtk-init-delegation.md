# Open Question: Delegate Hook Wiring to `rtk init` vs. Hand-Write Hooks

**Status:** Open — to be resolved during Phase 2, before adapter acceptance.

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

## What to Verify in Phase 2

On each OS, after `mise install` makes `rtk` available:

1. Run `rtk init <agent>` for each target agent and diff the written files
   against what the adapter currently writes.
2. Confirm `rtk init` is idempotent / safe to re-run.
3. Confirm the exact flag names for Codex (`--codex`), Copilot (`--copilot`),
   OpenCode (`--opencode`) and whether an agent selection flag (`--agent`)
   should be used instead for any of them.
4. Decide option 1–3 above and record the decision back in
   `docs/plans/agentenv-dev-plan.md` Phase 2.

## Related

- `docs/research/agent-adapters.md` — per-agent hook/extensibility mechanisms
- `docs/research/rtk-init-behavior.md` — confirmed `rtk init` flags 0.42.4
- `docs/research/phase0-findings.md` §9 — rtk integration requirements
- `cmd/agentenv/src/adapters/` — current hand-written implementation
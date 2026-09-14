# agentenv

Give AI coding agents a consistent, capable shell environment on Windows,
macOS, and Linux, with minimal setup friction — without maintaining any dev
tools ourselves. Thin orchestration + config layer on top of
[mise](https://mise.jdx.dev), [rtk](https://github.com/rtk-ai/rtk), and
[AGENTS.md](https://agents.md).

v1 targets: Claude Code, OpenAI Codex CLI, GitHub Copilot (CLI/Chat),
OpenCode.

Full design and rationale: [`docs/plans/agentenv-dev-plan.md`](docs/plans/agentenv-dev-plan.md).

## Status

Phase 0 (research & validation) is complete. Phase 1 (config core +
non-interactive `apply`, Tier 0 shell fix, Claude Code adapter) is
implemented and under active hardening; Phase 2 (Codex/Copilot/OpenCode
adapters) is scaffolded with test coverage. The CLI lives in
[`cmd/agentenv/`](cmd/agentenv/README.md). See `docs/plans/agentenv-dev-plan.md`
§8 for the phase roadmap, and `docs/research/` / `docs/decisions/` for the
validated findings behind it.

## Repo layout

See `docs/plans/agentenv-dev-plan.md` §7 for the full structure. The active
implementation is `cmd/agentenv/` (TypeScript CLI); `internal/` and
`templates/` are stubs awaiting their phase.

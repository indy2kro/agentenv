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

Phase 0 (research & validation) in progress. See `docs/research/` and
`docs/decisions/` as they land.

## Repo layout

See `docs/plans/agentenv-dev-plan.md` §7 for the full proposed structure;
each `internal/` and `cmd/` subdirectory has its own `README.md` stub
describing what it will own and which phase populates it.

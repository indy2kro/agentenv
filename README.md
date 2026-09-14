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

Phase 0 (research & validation) is complete. Phases 1–4 are implemented:
config core + non-interactive `apply` (idempotent, zero-diff), Tier 0 shell
fix, all four adapters (Claude hand-written, Codex/Copilot/OpenCode delegated
to `rtk init`), the interactive wizard (`setup`/`configure`), and `status`
drift reporting. Phase 5 (npm packaging + CI) is done short of `npm publish`:
`agentenv` is publishable (`npm pack` clean) and installable via
`npm install -g agentenv`; CI runs a deterministic smoke on every push and a
full-setup real installation smoke (mise + real `rtk init`, all three OSes)
on `main`. The CLI lives in [`cmd/agentenv/`](cmd/agentenv/README.md). See
`docs/plans/agentenv-dev-plan.md` §8 for the phase roadmap,
`docs/guides/adding-an-adapter.md` for extending to a fifth agent, and
`docs/research/` / `docs/decisions/` for the validated findings behind it.

## Repo layout

See `docs/plans/agentenv-dev-plan.md` §7 for the full structure. The active
implementation is `cmd/agentenv/` (TypeScript CLI); `internal/` and
`templates/` are stubs awaiting their phase.

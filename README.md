# agentenv

Give AI coding agents a consistent, capable shell environment on Windows,
macOS, and Linux, with minimal setup friction — without maintaining any dev
tools ourselves. Thin orchestration + config layer on top of
[mise](https://mise.jdx.dev), [rtk](https://github.com/rtk-ai/rtk), and
[AGENTS.md](https://agents.md).

v1 targets: Claude Code, OpenAI Codex CLI, GitHub Copilot (CLI/Chat),
OpenCode.

**Using agentenv?** Start with the user guide:
[`cmd/agentenv/README.md`](cmd/agentenv/README.md) (install, commands,
`agentenv.toml` reference, troubleshooting).

**Working on agentenv itself?** Full design and rationale:
[`docs/plans/agentenv-dev-plan.md`](docs/plans/agentenv-dev-plan.md).

## Status

Phase 0 (research & validation) is complete. Phases 1–4 are implemented:
config core + non-interactive `apply` (idempotent, zero-diff), Tier 0 shell
fix, all four adapters (Claude hand-written, Codex/Copilot/OpenCode delegated
to `rtk init`), the interactive wizard (`setup`/`configure`), and `status`
drift reporting, plus a transparency log of what rtk rewrote during apply.

Phase 5 (npm packaging + CI) is done — the package is published to npm as
[`@indy2kro/agentenv`](https://www.npmjs.com/package/@indy2kro/agentenv)
(plain `agentenv` was already taken on the registry); install with
`npm install -g @indy2kro/agentenv` — it installs the `agentenv` command
itself, unchanged. Releases are one button: run the `Release` GitHub
Actions workflow (patch/minor/major or an exact version) and it bumps the
version, gates the tree, verifies the tarball, runs
`npm publish --provenance`, tags the release, and creates the GitHub release
(see [`docs/guides/releasing.md`](docs/guides/releasing.md)).
CI runs a deterministic smoke on every push and a full-setup real installation
smoke (mise + real `rtk init`, verified green on all three OSes) on `main`.

Phase 6 (optional upstream integrations, e.g. Superpowers) is **done**: the
`agentenv.toml` `[integrations.superpowers]` config schema, a Claude
Code-only installer adapter (`claude plugin marketplace add` / `claude
plugin install`, ref-pinned), and a read-only `gh` auth-status probe are all
wired into `apply`, `status`, `setup`, and `configure`. See
[`docs/plans/agentenv-dev-plan.md`](docs/plans/agentenv-dev-plan.md) §Phase 6
for details and rationale.

The CLI lives in [`cmd/agentenv/`](cmd/agentenv/README.md). See
`docs/plans/agentenv-dev-plan.md` §8 for the phase roadmap,
`docs/guides/adding-an-adapter.md` for extending to a fifth agent, and
`docs/research/` / `docs/decisions/` for the validated findings behind it.

## Repo layout

See `docs/plans/agentenv-dev-plan.md` §7 for the full structure. The active
implementation is `cmd/agentenv/` (TypeScript CLI); `internal/` and
`templates/` are stubs awaiting their phase.

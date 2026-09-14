# agentenv

> Give AI coding agents a consistent, capable shell environment on Windows,
> macOS, and Linux — with minimal setup friction, and without maintaining any
> dev tools yourself.

`agentenv` is a thin orchestration + config layer on top of
[mise](https://mise.jdx.dev) (tool installation), [rtk](https://github.com/rtk-ai/rtk)
(command rewriting + hooks), and [AGENTS.md](https://agents.md) (repo-level
instructions). It never re-implements any dev tool — it drives mise/rtk and
writes config files.

v1 targets: **Claude Code**, **OpenAI Codex CLI**, **GitHub Copilot**
(CLI/Chat), **OpenCode**.

## Install

```sh
npm install -g agentenv
```

Requires Node.js >= 18. To do anything useful you also need
[mise](https://mise.jdx.dev) installed (agentenv generates a `mise.toml` and
delegates tool installation to it).

## Usage

```sh
agentenv setup        # first-run interactive wizard (simple or advanced)
agentenv configure    # re-run the wizard, pre-filled with current config
agentenv apply        # non-interactive: config file -> everything, idempotent
agentenv status       # what's installed, configured, and out of sync
```

`setup` (Simple mode) auto-detects which of the four agents are installed,
offers the default tool set (Tier 1 + Tier 2), and wires hooks for whatever is
detected. `apply` is safe to re-run at any time: with no config change it
produces zero file diffs and installs nothing twice.

Agent hook/plugin wiring for Codex CLI, Copilot, and OpenCode is delegated to
`rtk init`; Claude Code is wired by agentenv with the exact hook shape rtk
produces. Per-agent hook files are written merge-only, preserving user content.

## Configuration

The single source of truth is an `agentenv.toml` file — committed to the repo
(project scope: `./agentenv.toml`) or user-global
(`~/.config/agentenv/agentenv.toml`). `mise.toml`, `AGENTS.md`, `CLAUDE.md`,
and the per-agent hook files are all generated outputs of `agentenv apply`.

See [`docs/plans/agentenv-dev-plan.md`](../docs/plans/agentenv-dev-plan.md) for
the full config schema, tool catalog, and phase roadmap, and
[`docs/research/`](../docs/research/) for the validated agent/adapter findings.

## Development

```sh
npm install
npm run build   # tsc -> dist/
npm test        # build + node:test suites (10 files)
npm run lint    # eslint --max-warnings 0
npm run format:check
```

## License

MIT
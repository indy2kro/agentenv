# agentenv

Give AI coding agents a consistent, capable shell environment on Windows,
macOS, and Linux — with minimal setup friction and without maintaining any dev
tools yourself. `agentenv` is a thin orchestration + config layer on top of
[mise](https://mise.jdx.dev) (tool installation), [rtk](https://github.com/rtk-ai/rtk)
(command rewriting + hooks), and [AGENTS.md](https://agents.md) (repo-level
instructions). It never re-implements a dev tool — it drives mise/rtk and
writes config files for you.

Supports nine agents: **Claude Code**, **OpenAI Codex CLI**, **GitHub Copilot
(CLI/Chat)**, **OpenCode**, **Gemini CLI**, **Cursor**, **Windsurf**,
**Cline CLI**, and **Mistral Vibe**. Claude Code and Codex CLI are on by
default; the rest are opt-in.

If you've ever watched an agent fumble because `rg`/`fd`/`jq` weren't on PATH,
or redo the same hook-wiring dance for a different config file format, this
fixes that:

- **One command** — `agentenv setup` gets a fresh machine to a working state
  for whichever supported agents you have installed, Windows included.
- **One source of truth** — a single `agentenv.toml` drives everything:
  `mise.toml`, `AGENTS.md`/`CLAUDE.md`, and each agent's hook files are all
  generated from it, never hand-maintained.
- **Nothing reinvented** — tool installation is 100% mise; command rewriting
  and hooks are 100% rtk.
- **Safe to re-run** — `agentenv apply` is idempotent; with no config change
  it touches nothing and reinstalls nothing.

## Getting started

```sh
npm install -g @indy2kro/agentenv   # the installed command is plain `agentenv`
agentenv setup                       # interactive wizard → writes config → applies
```

Prerequisites: **Node.js >= 22.13** and **[mise](https://mise.jdx.dev)** on
PATH (a hard prerequisite — see [`docs/guides/installing.md`](docs/guides/installing.md)).
Not in a terminal? Use `agentenv setup --yes` or `agentenv apply` against a
hand-written `agentenv.toml`.

## Commands at a glance

| Command | What it does |
|---|---|
| `setup` (alias `configure`) | Interactive wizard (agents, tools, custom binaries, scope, rtk, Superpowers) that reviews a diff before applying. `--yes` runs unattended. |
| `apply` | Non-interactive: read `agentenv.toml`, install tools, generate everything. Idempotent. `--skip-mise-install`, `--dry-run`. |
| `status` | What's configured vs. actually installed, where they disagree (drift). `--short`, `--json`. |
| `doctor` | Read-only machine sanity check (mise, shims, shell, config, tools, agents) independent of your config. `--json`. |
| `update` | Unattended update of mise + config tools (pinned tools are never moved). |
| `uninstall` | Remove config tools from mise's store; `apply` reinstalls them. |
| `shell-fix` | Inspect/`--revert` the per-user Windows shell changes `apply` records. |
| `completion <shell>` | Shell completion for `bash`, `zsh`, `fish`, or `powershell`. |

Every command, flag, example, exit-code semantics, and troubleshooting:
**[`docs/usage.md`](docs/usage.md)**.

## Configuration (`agentenv.toml`)

One file, project-scoped (`./agentenv.toml`, committed) or user-scoped
(`~/.config/agentenv/agentenv.toml`). Everything else is generated. Full
annotated example, the tool catalog, custom tools, version pins, and the
optional Superpowers integration:

**[`docs/configuration.md`](docs/configuration.md)**.

## Development

The implementation is a TypeScript CLI under [`cmd/agentenv/`](cmd/agentenv/README.md).

```sh
cd cmd/agentenv
npm install
npm run build        # tsc -> dist/
npm test             # build + node:test suites
npm run lint         # eslint --max-warnings 0
npm run format:check
```

See also:

- [`docs/README.md`](docs/README.md) — index of all documentation.
- [`cmd/agentenv/README.md`](cmd/agentenv/README.md) — install from source,
  dev loop, architecture.
- [`docs/guides/adding-an-adapter.md`](docs/guides/adding-an-adapter.md) —
  wiring in a new agent.
- [`docs/guides/releasing.md`](docs/guides/releasing.md) — shipping an npm
  release (one-button `Release` workflow).
- [`docs/plans/agentenv-dev-plan.md`](docs/plans/agentenv-dev-plan.md) — the
  design doc of record: goals, phased roadmap, current status.

## License

MIT
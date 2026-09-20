# agentenv

**Give AI coding agents a working toolbelt on any machine — without setting it
up yourself.**

If you've ever watched Claude Code, Codex, Copilot, or any other AI coding agent
stumble because `rg` or `jq` weren't installed, or redo the same config dance
for a third different agent, this project is for you. `agentenv` handles the
boring "set up my dev environment" part so your agents can just work — on
Windows, macOS, and Linux alike.

## Why you need this

AI coding agents are only as capable as the tools around them. They assume a
normal developer shell: fast search, JSON parsing, git helpers, a good diff
viewer, and so on. On a fresh machine — especially a default Windows setup —
most of that is missing. Agents then flail, burn tokens guessing, and
half-install tools ad hoc, leaving a mess behind.

`agentenv` fixes that by giving every agent you use the same consistent,
capable environment, from a single point of control.

## What you get

- **One setup, every agent.** Your tools and instructions apply across
  **Claude Code, OpenAI Codex CLI, GitHub Copilot, OpenCode, Gemini CLI,
  Cursor, Windsurf, Cline CLI, and Mistral Vibe** — no per-agent config
  sprawl to hand-maintain.
- **One file to rule them all.** Edit a single `agentenv.toml`. The tool list,
  the instruction files agents read (`AGENTS.md`/`CLAUDE.md`), and every
  agent's hook files are all generated from it.
- **Windows, handled properly.** Deep down a shell on Windows is a different
  world; agents routinely trip over it. `agentenv` fixes the classic
  PowerShell/Git-Bash toolchain problems for you and records exactly what it
  changed, so it can be reverted.
- **Reproducible.** A teammate clones the repo and runs one command; they get
  the same tools, the same versions, the same instructions. No "works on my
  machine."
- **Safe and reversible.** Re-running `apply` changes nothing if you changed
  nothing. `status` shows you exactly where your config and reality disagree.
  `uninstall` cleans up; Windows shell changes can be rolled back.
- **Nothing reinvented.** `agentenv` is a thin orchestration layer, not
  another stack to learn: [mise](https://mise.jdx.dev) installs the tools,
  [rtk](https://github.com/rtk-ai/rtk) wires the command hooks, and the
  instructions follow the [AGENTS.md](https://agents.md) standard.

## How it works — in one picture

```
agentenv.toml ──► agentenv apply
                   ├── mise installs your tools (rg, fd, jq, gh, …)
                   ├── generates AGENTS.md / CLAUDE.md instructions
                   └── wires each agent's hooks (via rtk)

                    ┌──────────────────────┐
                    │  Claude Code   Codex  │
                    │  Copilot   OpenCode   │
                    │  Gemini   Cursor      │
                    │  Windsurf   Cline     │
                    │  Vibe                 │
                    └──────────────────────┘
                       everyone sees the same
                       tools and instructions
```

## Quick start

```sh
npm install -g @indy2kro/agentenv   # the installed command is plain `agentenv`
agentenv setup                       # interactive wizard → writes config → applies
```

That's it. `setup` walks you through your choices, shows you the diff before
changing anything, and applies it. No prompts? Use `agentenv setup --yes`, or
hand-write `agentenv.toml` and run `agentenv apply`.

Prerequisites: **Node.js >= 22.13** and **[mise](https://mise.jdx.dev)** on
PATH (a hard prerequisite — see [`docs/guides/installing.md`](docs/guides/installing.md)).

## Commands at a glance

| Command | What it does |
|---|---|
| `setup` (alias `configure`) | Interactive wizard (agents, tools, custom binaries, scope, rtk, Superpowers) that reviews a diff before applying. `--yes` runs unattended. |
| `apply` | Non-interactive: read `agentenv.toml`, install tools, generate everything. Idempotent. `--skip-mise-install`, `--dry-run`. |
| `status` | What's configured vs. actually installed, where they disagree (drift). `--short`, `--json`. |
| `doctor` | Read-only machine sanity check: mise, shims, shell, config, tools, agents. `--json`. |
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

## License

MIT
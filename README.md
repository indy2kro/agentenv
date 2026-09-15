# agentenv

Give AI coding agents a consistent, capable shell environment on Windows,
macOS, and Linux, with minimal setup friction — without maintaining any dev
tools ourselves. `agentenv` is a thin orchestration + config layer on top of
[mise](https://mise.jdx.dev) (tool installation), [rtk](https://github.com/rtk-ai/rtk)
(command rewriting + hooks), and [AGENTS.md](https://agents.md) (repo-level
instructions). It never re-implements any dev tool — it just drives mise/rtk
and writes config files for you.

It targets four AI coding agents: **Claude Code**, **OpenAI Codex CLI**,
**GitHub Copilot** (CLI/Chat), and **OpenCode**.

If you've ever had an AI coding agent fumble because `grep`/`fd`/`jq` weren't
on PATH, or watched every agent redo the same hook-wiring dance for a
different config file format, that's what this fixes:

- **One command** (`agentenv setup`) gets a fresh machine — Windows included
  — to a working state for whichever of the four agents you have installed.
- **A single source of truth** (`agentenv.toml`) drives everything else:
  `mise.toml`, `AGENTS.md`/`CLAUDE.md`, and each agent's own hook files are
  all generated from it, never hand-maintained.
- **Nothing is reinstalled or reinvented.** Tool installation is 100% mise;
  command rewriting/hooks are 100% rtk. agentenv only ever calls out to them
  and writes config.
- **Safe to re-run.** `agentenv apply` is idempotent — run it as often as you
  like; with no config change it touches nothing and reinstalls nothing.

## Requirements

- **Node.js >= 22.13** to run the CLI itself.
- **[mise](https://mise.jdx.dev)** installed and on PATH — agentenv generates
  a `mise.toml` and delegates all tool installation to it. Without mise,
  `agentenv apply`/`setup` can still generate config files but can't install
  anything.
- **Git for Windows**, if you're on Windows — agentenv's Tier 0 shell fix
  relies on the POSIX toolchain it bundles.
- Optionally, whichever of the four agents you want configured already
  installed (agentenv detects what's present; it doesn't install the agents
  themselves).

## Install

```sh
npm install -g @indy2kro/agentenv
```

This installs the `agentenv` command itself, unchanged. The package is
published under the scoped name `@indy2kro/agentenv` (plain `agentenv` was
already taken on the registry). Installing from source instead? See
[`cmd/agentenv/README.md`](cmd/agentenv/README.md#install).

## Quick start

```sh
agentenv setup
```

This is Simple mode: it auto-detects which of the four agents are installed,
offers the default tool set (Tier 1 always, Tier 2 unless you decline),
writes `agentenv.toml`, and wires everything up in one pass — including the
Windows shell fix if you're on Windows. Answer three prompts (agents, Tier 2
on/off, project vs. user scope) and you're done.

Prefer full control over exactly which tools and agents get configured? Run
`agentenv configure` instead. Not in an interactive terminal (CI, a script)?
`setup`/`configure` both refuse to run and tell you to use `agentenv apply`
against a hand-written or previously-saved `agentenv.toml` instead.

## Commands

| Command | What it does |
|---|---|
| `agentenv setup` | Interactive first-run wizard, Simple mode: detect agents, pick Tier 1(+2) tools, pick scope, then applies immediately. |
| `agentenv configure` | Interactive Advanced-mode wizard: pick agents, the full Tier 1–3 tool picker, add custom binaries, choose scope, toggle rtk, optionally opt into Superpowers, review a diff, then confirm before applying. Re-run any time — it pre-fills every prompt from your current `agentenv.toml`. |
| `agentenv apply [--skip-mise-install]` | Non-interactive: read `agentenv.toml` and (re)generate everything — `mise.toml`, `AGENTS.md`/`CLAUDE.md`, per-agent hook files, the Tier 0 shell fix. Safe to run in CI or a script. |
| `agentenv status` | Read-only report: what's configured, what's actually installed, and where the two disagree (drift) — per agent, per tool, per generated file, plus optional integrations and `gh` auth. |
| `agentenv doctor` | Standalone environment sanity check (mise, shims, config, tools, agents) — independent of any `agentenv.toml`. |
| `agentenv update` | Unattended update of mise itself and the mise-managed tools in your config. |

`setup`/`configure` both write `agentenv.toml` and then call the same `apply`
logic internally, so the end state is identical either way. Output is
colorized when your terminal supports it; pass `--no-color` to force it off.

Full command reference, `agentenv.toml` schema, tool catalog, custom tools,
optional integrations, and troubleshooting: **[`cmd/agentenv/README.md`](cmd/agentenv/README.md)**.

## Configuration (`agentenv.toml`)

Everything flows from one file, either committed to the project root
(`scope = "project"`, the default) or in your user config dir
(`scope = "user"`). `mise.toml`, `AGENTS.md`, `CLAUDE.md`, and per-agent hook
files are all **generated outputs** — never hand-edit them; edit
`agentenv.toml` and re-run `apply` instead.

```toml
scope = "project"

[agents]
claude_code = true
codex_cli   = true
copilot     = true
opencode    = true

[tools]
# Tier 1 (essential, on by default)
ripgrep = true
fd      = true
jq      = true
rtk     = true
# Tier 2 (AI-coding value-add, on by default)
ast_grep   = true
git_delta  = true
gh         = true
difftastic = true
# Tier 3 (power-user, off by default) — see cmd/agentenv/README.md for the full list
yq = false

[rtk]
enabled = true
```

Every field is optional and falls back to a documented default — see
[`cmd/agentenv/README.md`](cmd/agentenv/README.md#configuration-agentenvtoml)
for the full annotated example, the tool catalog, custom tools, and the
optional [Superpowers](https://github.com/obra/superpowers) integration.

## Development

The active implementation is [`cmd/agentenv/`](cmd/agentenv/README.md)
(TypeScript CLI); `internal/` and `templates/` are stubs awaiting a future
phase.

```sh
cd cmd/agentenv
npm install
npm run build    # tsc -> dist/
npm test         # build + node:test suites (node --test, auto-discovered)
npm run lint     # eslint --max-warnings 0
npm run format:check
```

See [`docs/guides/adding-an-adapter.md`](docs/guides/adding-an-adapter.md) for
wiring in a fifth agent, [`docs/guides/releasing.md`](docs/guides/releasing.md)
for shipping a new npm version (one-button `Release` GitHub Actions workflow),
and [`docs/plans/agentenv-dev-plan.md`](docs/plans/agentenv-dev-plan.md) for
the full design, config schema rationale, and phase-by-phase project status.
`docs/research/` and `docs/decisions/` hold the validated findings and ADRs
behind those decisions.

## License

MIT

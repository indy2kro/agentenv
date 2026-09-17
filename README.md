# agentenv

Give AI coding agents a consistent, capable shell environment on Windows,
macOS, and Linux, with minimal setup friction — without maintaining any dev
tools ourselves. `agentenv` is a thin orchestration + config layer on top of
[mise](https://mise.jdx.dev) (tool installation), [rtk](https://github.com/rtk-ai/rtk)
(command rewriting + hooks), and [AGENTS.md](https://agents.md) (repo-level
instructions). It never re-implements any dev tool — it just drives mise/rtk
and writes config files for you.

It supports nine AI coding agents: **Claude Code**, **OpenAI Codex CLI**,
**GitHub Copilot** (CLI/Chat), **OpenCode**, **Gemini CLI**, **Cursor**,
**Windsurf**, **Cline CLI**, and **Mistral Vibe**. Claude Code and Codex CLI
are enabled by default; the remaining agents are opt-in.

If you've ever had an AI coding agent fumble because `grep`/`fd`/`jq` weren't
on PATH, or watched every agent redo the same hook-wiring dance for a
different config file format, that's what this fixes:

- **One command** (`agentenv setup`) gets a fresh machine — Windows included
  — to a working state for whichever supported agents you have installed.
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
- **[mise](https://mise.jdx.dev)** installed and on PATH — a hard
  prerequisite. agentenv never installs tools itself: it generates a
  `mise.toml` and delegates 100% of tool installation to mise (whose shims dir
  is where agent PATH stays consistent). `agentenv apply`/`setup` fail fast
  with install instructions when mise is missing; the only exception is
  `apply --skip-mise-install`, which generates files without installing
  (advanced/CI). See [`docs/guides/installing.md`](docs/guides/installing.md).
- **Git for Windows**, if you're on Windows — agentenv's Tier 0 shell fix
  relies on the POSIX toolchain it bundles.
- Optionally, whichever supported agents you want configured already
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

The wizard walks you through agents, the full tool picker (Tiers 1–3 on one
page; Tier 1 and Tier 2 pre-checked, Tier 3 off), optional custom binaries,
scope, rtk, and the optional Superpowers integration, then shows you a diff
and applies in one pass — including the Windows shell fix if you're on
Windows. It pre-fills every prompt from an existing `agentenv.toml`, so it's
safe to re-run any time.

The same flow is also reached via `agentenv configure` (an alias of `setup`).
The interactive `setup`/`configure` wizard requires a terminal (TTY); not in
one? Run it unattended instead — `agentenv setup --yes` picks defaults (or
re-applies your existing `agentenv.toml`), and `agentenv apply` works against
any hand-written or previously-saved config.

## Commands

| Command | What it does |
|---|---|
| `agentenv setup` (alias `configure`) | Interactive wizard: pick agents, the full Tier 1–3 tool picker (one page, Tier 1+2 pre-checked, Tier 3 off), add custom binaries, choose scope, toggle rtk, optionally opt into Superpowers, review a diff, then confirm before applying. Pre-fills every prompt from your current `agentenv.toml`. |
| `agentenv apply [--skip-mise-install]` | Non-interactive: read `agentenv.toml` and (re)generate everything — `mise.toml`, `AGENTS.md`/`CLAUDE.md`, per-agent hook files, the Tier 0 shell fix. Safe to run in CI or a script. |
| `agentenv status` | Read-only report: what's configured, what's actually installed, and where the two disagree (drift) — per agent, per tool, per generated file, plus optional integrations and `gh` auth. |
| `agentenv doctor` | Standalone environment sanity check (mise, shims, config, tools, agents) — independent of any `agentenv.toml`. |
| `agentenv update` | Unattended update of mise itself and the mise-managed tools in your config. |

`setup` (alias `configure`) writes `agentenv.toml` and then calls the same
`apply` logic internally, so a hand-run `apply` reaches the same end state. Output is
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
gemini_cli  = false
cursor      = false
windsurf    = false
cline       = false
vibe        = false

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
yq          = false
ripgrep_all = false
zoxide      = false
shellcheck  = false
uv          = false
xh          = false
actionlint  = false
gitleaks    = false
gum         = false
glow        = false
jless       = false
sd          = false
tealdeer    = false
duckdb      = false
qsv         = false

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

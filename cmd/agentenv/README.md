# agentenv

> Give AI coding agents a consistent, capable shell environment on Windows,
> macOS, and Linux — with minimal setup friction, and without maintaining any
> dev tools yourself.

`agentenv` is a thin orchestration + config layer on top of
[mise](https://mise.jdx.dev) (tool installation), [rtk](https://github.com/rtk-ai/rtk)
(command rewriting + hooks), and [AGENTS.md](https://agents.md) (repo-level
instructions). It never re-implements any dev tool — it just drives mise/rtk
and writes config files for you.

It targets four AI coding agents: **Claude Code**, **OpenAI Codex CLI**,
**GitHub Copilot** (CLI/Chat), and **OpenCode**.

> **⚠️ Not yet published to npm.** `npm install -g agentenv` does not work
> yet — see [Install](#install) below for installing from source in the
> meantime. Everything else in this guide (commands, config, tool catalog)
> already works once you've built it locally.

## Contents

- [Why agentenv](#why-agentenv)
- [Requirements](#requirements)
- [Install](#install)
- [Quick start](#quick-start)
- [Commands](#commands)
- [Configuration (`agentenv.toml`)](#configuration-agentenvtoml)
- [Tool catalog](#tool-catalog)
- [Custom tools](#custom-tools)
- [Optional integrations (experimental, not yet active)](#optional-integrations-experimental-not-yet-active)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [What's still missing](#whats-still-missing)

## Why agentenv

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

### From source (works today)

```sh
git clone https://github.com/indy2kro/agentenv.git
cd agentenv/cmd/agentenv
npm install
npm run build
npm link          # makes `agentenv` available globally on PATH
```

`npm link` symlinks this checkout's `dist/index.js` as the global `agentenv`
binary — rerun `npm run build` after pulling changes, no need to `npm link`
again. Prefer not to touch global state? Run it in place instead:

```sh
node dist/index.js setup
```

### From npm (coming soon)

```sh
npm install -g agentenv
```

This will work once the package is published — see
[What's still missing](#whats-still-missing).

## Quick start

```sh
agentenv setup
```

This is Simple mode: it auto-detects which of the four agents are installed,
offers the default tool set (Tier 1 always, Tier 2 unless you decline),
writes `agentenv.toml`, and wires everything up in one pass — including the
Windows shell fix if you're on Windows. Answer three prompts (agents, Tier 2
on/off, project vs. user scope) and you're done.

Prefer full control over exactly which tools and agents get configured?
Run `agentenv configure` instead (see [Commands](#commands)).

Not in an interactive terminal (CI, a script)? `setup`/`configure` both
refuse to run and tell you to use `agentenv apply` against a hand-written or
previously-saved `agentenv.toml` instead.

## Commands

| Command | What it does |
|---|---|
| `agentenv setup` | Interactive first-run wizard, Simple mode: detect agents, pick Tier 1(+2) tools, pick scope, then applies immediately. |
| `agentenv configure` | Interactive Advanced-mode wizard: pick agents, the full Tier 1–3 tool picker, add custom binaries, choose scope, toggle rtk, review a diff of what will change, then confirm before applying. Re-run any time — it pre-fills every prompt from your current `agentenv.toml`. |
| `agentenv apply [--skip-mise-install]` | Non-interactive: read `agentenv.toml` and (re)generate everything — `mise.toml`, `AGENTS.md`/`CLAUDE.md`, per-agent hook files, the Tier 0 shell fix. Safe to run in CI or a script. `--skip-mise-install` generates files only, without running `mise install` (useful for a fast dry-run or when mise isn't available). |
| `agentenv status` | Read-only report: what's configured, what's actually installed, and where the two disagree (drift) — per agent, per tool, per generated file. |
| `agentenv --version` / `agentenv --help` | Standard `commander`-generated version/help output; every subcommand also takes `--help`. |

`setup`/`configure` both write `agentenv.toml` and then call the same
`apply` logic internally, so the end state is identical either way — the
only difference is how you got there.

## Configuration (`agentenv.toml`)

Everything flows from one file. It lives either in the project root
(`./agentenv.toml`, scope = `"project"`, committed to the repo so your whole
team shares it) or in your user config dir
(`~/.config/agentenv/agentenv.toml` — or the Windows equivalent via
`%USERPROFILE%`, scope = `"user"`). `agentenv apply`/`status` look in the
project directory first, then fall back to the user-scope file.

`mise.toml`, `AGENTS.md`, `CLAUDE.md`, and the per-agent hook files are all
**generated outputs** of `agentenv apply` — never hand-edit them; edit
`agentenv.toml` and re-run `apply` (or `configure`) instead. Regeneration
only touches a marker-block section of `AGENTS.md`/`CLAUDE.md`, so any
content you've added outside that block survives.

Full annotated example:

```toml
# "project" (default, committed to the repo) or "user" (global, ~/.config/agentenv/)
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
# Tier 3 (power-user, off by default) — see the Tool catalog below for the full list
yq = false
bat = false
# ...

# Your own tool, already installed somewhere on the machine
[[custom_tools]]
name = "mytool"
description = "Internal linter wrapper"
already_installed = true
path_windows = "C:\\tools\\mytool.exe"
path_macos   = "/usr/local/bin/mytool"
path_linux   = "/usr/local/bin/mytool"

# Your own tool, installable via mise (e.g. it publishes GitHub releases)
[[custom_tools]]
name = "otherthing"
mise_source = "github:someorg/otherthing"
version = "latest"

[rtk]
enabled = true
[rtk.init]
claude_code = true
codex_cli   = true
copilot     = true
opencode    = true

[tier0]
check_enabled = true   # Windows POSIX-shell fix; set false to skip it

[generate]
marker_start = "<!-- agentenv-managed-start -->"
marker_end   = "<!-- agentenv-managed-end -->"
files = ["AGENTS.md", "CLAUDE.md"]

# See "Optional integrations" below — this section is parsed and validated
# today, but agentenv apply/status do not act on it yet.
[integrations.superpowers]
enabled = false
```

Every field is optional — omit anything and it falls back to the documented
default. Run `agentenv configure` if you'd rather build this file
interactively than hand-write it; the review screen at the end shows you the
exact diff before anything is written.

## Tool catalog

| Tier | Tools | Default |
|---|---|---|
| **1 — essential** | `ripgrep` (rg), `fd`, `jq`, `rtk` | always on |
| **2 — AI-coding value-add** | `ast_grep` (sg), `git_delta` (delta), `gh`, `difftastic` (difft) | on (Simple mode asks once) |
| **3 — power-user** | `universal_ctags`, `yq`, `bat`, `eza`, `miller` (mlr), `tokei`, `hyperfine`, `fzf`, `just`, `watchexec`, `direnv` | off — pick individually via `agentenv configure` |

All of Tiers 1–3 install through mise the same way — no separate mechanism.
Two tools (`universal_ctags`, `tokei`) aren't in mise's registry on every
platform; enabling them prints a validation warning suggesting a
`custom_tools` fallback entry instead.

## Custom tools

Anything not in the catalog — an internal CLI, a niche tool, anything you
already have — goes in `[[custom_tools]]` (see the example above). Two
supported shapes:

- **Already installed:** `already_installed = true` plus whichever of
  `path_windows`/`path_macos`/`path_linux` apply. `agentenv status` checks
  the path for your current OS and flags it if missing.
- **Installable via mise:** `mise_source = "github:owner/repo"` (mise's
  generic backend, works for most tools that publish GitHub release
  archives) plus an optional `version` (defaults to `"latest"`).

Custom tools flow through the exact same "config changed → regenerate
`AGENTS.md`/hooks" pipeline as catalog tools.

## Optional integrations (experimental, not yet active)

`agentenv.toml` has a `[integrations.superpowers]` section for optionally
installing [Superpowers](https://github.com/obra/superpowers) — a
third-party Claude Code skill/methodology plugin — through its own
documented installer, never bundled or forked. The schema is fully
implemented today (validation, defaults, `agentenv configure`'s pending
opt-in step) but **`agentenv apply`/`status` do not act on it yet** — setting
`enabled = true` today parses and validates cleanly but has no effect. See
[What's still missing](#whats-still-missing).

When it lands, only Claude Code will get a fully automated install (via
`claude plugin marketplace add` / `claude plugin install`, pinned to a
specific `ref`) — Codex CLI, Copilot, and OpenCode have no safe
non-interactive installer documented upstream today, so they'll always
report "unsupported" with manual-install instructions instead. See
[`docs/research/superpowers-install-mechanisms.md`](../../docs/research/superpowers-install-mechanisms.md)
for why.

`agentenv` also never touches GitHub credentials: a `gh` auth-status probe
(`gh auth status --hostname github.com`, read-only, never `gh auth login`)
exists in the codebase but — like the rest of this section — isn't wired
into `agentenv status`'s output yet either.

## Troubleshooting

- **`agentenv setup`/`configure` exits immediately saying it's
  interactive** — you're running it in a non-TTY context (CI, a piped
  script). Use `agentenv apply` against a config file instead.
- **A tool shows as enabled in `agentenv status` but not found on PATH** —
  run `agentenv apply` (it calls `mise install`), or check that mise itself
  is installed and on PATH. `--skip-mise-install` intentionally leaves tools
  uninstalled; don't use it for your real run.
- **Windows: agents aren't picking up ripgrep/fd/etc.** — check the "Tier 0
  (shell)" block in `agentenv status`. If it reports not POSIX-compatible,
  re-run `agentenv apply`; if Git Bash truly isn't installed, install
  [Git for Windows](https://gitforwindows.org) first.
- **A hook file has content you added by hand, and you're worried `apply`
  will clobber it** — it won't. Regeneration only replaces the marker-block
  section (`<!-- agentenv-managed-start -->` … `<!-- agentenv-managed-end
  -->`); everything else in the file is left alone.
- **`agentenv apply` reports a validation error and refuses to run** — fix
  the listed field in `agentenv.toml`; errors block `apply` deliberately
  (warnings don't).

## Development

```sh
npm install
npm run build   # tsc -> dist/
npm test        # build + node:test suites
npm run lint    # eslint --max-warnings 0
npm run format:check
```

See [`docs/guides/adding-an-adapter.md`](../../docs/guides/adding-an-adapter.md)
for wiring in a fifth agent, and
[`docs/plans/agentenv-dev-plan.md`](../../docs/plans/agentenv-dev-plan.md)
for the full design, config schema rationale, and phase roadmap.

## What's still missing

- **npm publish.** The package is not yet on the npm registry —
  `npm install -g agentenv` doesn't work today; install
  [from source](#install) instead. (Needs npm publish credentials on a
  maintainer's machine; everything else — `npm pack`, a real
  `npm install -g` from a tarball, CI — is already verified working.)
- **Optional integrations aren't wired up yet.** The `[integrations.superpowers]`
  config schema, its Claude Code installer adapter, and the read-only `gh`
  auth probe all exist and are tested, but nothing in `apply`, `status`,
  `setup`, or `configure` calls them yet — see
  [Optional integrations](#optional-integrations-experimental-not-yet-active)
  above. Tracked in
  [`docs/plans/agentenv-dev-plan.md`](../../docs/plans/agentenv-dev-plan.md)
  Phase 6.

## License

MIT

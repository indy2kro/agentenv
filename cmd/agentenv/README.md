# agentenv

> Give AI coding agents a consistent, capable shell environment on Windows,
> macOS, and Linux — with minimal setup friction, and without maintaining any
> dev tools yourself.

`agentenv` is a thin orchestration + config layer on top of
[mise](https://mise.jdx.dev) (tool installation), [rtk](https://github.com/rtk-ai/rtk)
(command rewriting + hooks), and [AGENTS.md](https://agents.md) (repo-level
instructions). It never re-implements any dev tool — it just drives mise/rtk
and writes config files for you.

It supports nine AI coding agents: **Claude Code**, **OpenAI Codex CLI**,
**GitHub Copilot** (CLI/Chat), **OpenCode**, **Gemini CLI**, **Cursor**,
**Windsurf**, **Cline CLI**, and **Mistral Vibe**. Claude Code and Codex CLI
are enabled by default; the remaining agents are opt-in.

> **📦 Published as `@indy2kro/agentenv`.** The npm package name is scoped
> (`agentenv` was already taken) — install with
> `npm install -g @indy2kro/agentenv`. The command it installs is still
> plain `agentenv`. See [Install](#install) below.

## Contents

- [Why agentenv](#why-agentenv)
- [Requirements](#requirements)
- [Install](#install)
- [Quick start](#quick-start)
- [Commands](#commands)
- [Configuration (`agentenv.toml`)](#configuration-agentenvtoml)
- [Tool catalog](#tool-catalog)
- [Custom tools](#custom-tools)
- [Optional integrations](#optional-integrations)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Why agentenv

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
- **[mise](https://mise.jdx.dev)** installed and on PATH — agentenv generates
  a `mise.toml` and delegates all tool installation to it. Without mise,
  `agentenv apply`/`setup` can still generate config files but can't install
  anything.
- **Git for Windows**, if you're on Windows — agentenv's Tier 0 shell fix
  relies on the POSIX toolchain it bundles.
- Optionally, whichever supported agents you want configured already
  installed (agentenv detects what's present; it doesn't install the agents
  themselves).

## Install

### From npm (recommended)

```sh
npm install -g @indy2kro/agentenv
```

This installs the `agentenv` command itself, unchanged. The package is
published under the scoped name `@indy2kro/agentenv` (plain `agentenv` was
already taken on the registry).

### From source

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

Releases are one button: run the `Release` GitHub Actions workflow from the
repo's Actions tab (patch/minor/major or an exact version). It bumps the
version in `package.json` + `package-lock.json`, gates the tree, publishes
with npm provenance, tags the release, and creates the GitHub release.
Maintainers: see [`docs/guides/releasing.md`](../../docs/guides/releasing.md).

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

The same flow is also reached via `agentenv configure` (an alias of `setup`;
see [Commands](#commands)).

Not in an interactive terminal (CI, a script)? `setup` refuses to run and
tells you to use `agentenv apply` against a hand-written or previously-saved
`agentenv.toml` instead.

## Commands

| Command | What it does |
|---|---|
| `agentenv setup` (alias `configure`) | Interactive wizard: pick agents, the full Tier 1–3 tool picker (one page, Tier 1+2 pre-checked), add custom binaries, choose scope, toggle rtk, optionally opt into Superpowers, review a diff of what will change, then confirm before applying. Re-run any time — it pre-fills every prompt from your current `agentenv.toml`. |
| `agentenv apply [--skip-mise-install]` | Non-interactive: read `agentenv.toml` and (re)generate everything — `mise.toml`, `AGENTS.md`/`CLAUDE.md`, per-agent hook files, the Tier 0 shell fix. Safe to run in CI or a script. `--skip-mise-install` generates files only, without running `mise install` (useful for a fast dry-run or when mise isn't available). |
| `agentenv status` | Read-only report: what's configured, what's actually installed, and where the two disagree (drift) — per agent, per tool, per generated file. |
| `agentenv --version` / `agentenv --help` | Standard `commander`-generated version/help output; every subcommand also takes `--help`. |

`setup` (alias `configure`) writes `agentenv.toml` and then calls the same
`apply` logic internally, so a hand-run `apply` reaches the same end state.

Output is colorized when your terminal supports it (auto-detected, honors
`NO_COLOR`/`FORCE_COLOR`); pass `--no-color` (before or after the subcommand)
to force it off.

## Configuration (`agentenv.toml`)

Everything flows from one file. It lives either in the project root
(`./agentenv.toml`, scope = `"project"`, committed to the repo so your whole
team shares it) or in your user config dir
(`~/.config/agentenv/agentenv.toml` — or the Windows equivalent via
`%USERPROFILE%`, scope = `"user"`). `agentenv apply`/`status` look in the
project directory first, then fall back to the user-scope file.

`mise.toml`, `AGENTS.md`, `CLAUDE.md`, and the per-agent hook files are all
**generated outputs** of `agentenv apply` — never hand-edit them; edit
`agentenv.toml` and re-run `apply` instead (or run the `setup` wizard to
edit interactively). Regeneration
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
# Tier 3 (power-user, off by default) — see the Tool catalog below for the full list
yq          = false
bat         = false
eza         = false
miller      = false
tokei       = false
hyperfine  = false
fzf         = false
just        = false
watchexec   = false
direnv      = false
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
default. Run `agentenv setup` if you'd rather build this file
interactively than hand-write it; the review screen at the end shows you the
exact diff before anything is written.

## Supported agents

| Agent | Config key | Default |
|---|---|---|
| Claude Code | `claude_code` | on |
| OpenAI Codex CLI | `codex_cli` | on |
| GitHub Copilot | `copilot` | off |
| OpenCode | `opencode` | off |
| Gemini CLI | `gemini_cli` | off |
| Cursor | `cursor` | off |
| Windsurf | `windsurf` | off |
| Cline CLI | `cline` | off |
| Mistral Vibe | `vibe` | off |

`agentenv setup` detects installed agents and pre-checks them in the wizard.
Use `--agents` (with unattended `setup --yes`) when you need to select the
supported set explicitly without the wizard.

## Tool catalog

| Tier | Tools | Default |
|---|---|---|
| **1 — essential** | `ripgrep` (rg), `fd`, `jq`, `rtk` | always on |
| **2 — AI-coding value-add** | `ast_grep` (sg), `git_delta` (delta), `gh`, `difftastic` (difft) | on by default (pre-checked in the wizard) |
| **3 — power-user** | `yq`, `bat`, `eza`, `miller` (mlr), `tokei`, `hyperfine`, `fzf`, `just`, `watchexec`, `direnv`, `ripgrep_all` (rga), `zoxide`, `shellcheck`, `uv`, `xh`, `actionlint`, `gitleaks`, `gum`, `glow`, `jless`, `sd`, `tealdeer` (tldr), `duckdb`, `qsv` | off by default — toggle any in the wizard |

All of Tiers 1–3 install through mise the same way — no separate mechanism.
One tool (`tokei`) isn't in mise's registry on every platform; enabling it
prints a validation warning suggesting a `custom_tools` fallback entry
instead.

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

## Optional integrations

Agentenv can optionally install third-party skill/methodology integrations
through their own documented native installers — never bundled, never
forked. The first is [Superpowers](https://github.com/obra/superpowers).
Superpowers itself now supports a long list of coding agents/harnesses, but
of agentenv's original four v1 targets, only Claude Code has a documented,
non-interactive, ref-pinnable installer today
(`claude plugin marketplace add` / `claude plugin install`). Copilot
documents a command of the same shape but no way to pin a ref, and Codex
CLI/OpenCode have no fixed non-interactive command at all — so those three
are always reported as `unsupported` in `agentenv status`, with manual
install hints, rather than run unpinned or unreviewed. See
[`docs/research/superpowers-install-mechanisms.md`](../../docs/research/superpowers-install-mechanisms.md)
for the per-agent findings and why.

Disabled by default. To opt in:

```toml
[integrations.superpowers]
enabled = true
source = "github:obra/superpowers"
ref = "v6.3.0"
scope = "user"
agents = ["claude_code"]
allow_hooks = true          # Superpowers registers a SessionStart hook
allow_external_requests = false
```

`agentenv apply` installs/updates it idempotently for Claude Code (skipping
and warning if `allow_hooks` isn't explicitly `true`, since Superpowers
registers a `SessionStart` hook), and `agentenv status` reports an
**Integrations** section with enabled/disabled, source, ref, scope, and each
agent's installed/missing/unsupported/drifted state. The `setup` wizard
offers this as an explicit opt-in step (Step 6), showing the full
source/ref/scope/agents/hooks/external-request summary before installing
anything. Outside the wizard, `apply`/`status` always preserve whatever is
already configured.

`agentenv` also never touches GitHub credentials: `agentenv status` reports
`gh` authentication (authenticated/unauthenticated/unknown) via a read-only
`gh auth status --hostname github.com` probe; agentenv never runs
`gh auth login` or reads token values.

## Troubleshooting

- **`agentenv setup` exits immediately saying it's interactive** — you're
  running it in a non-TTY context (CI, a piped script). Use `agentenv apply`
  against a config file instead (or unattended `agentenv setup --yes`).
- **A tool shows as enabled in `agentenv status` but not found on PATH** —
  run `agentenv apply` (it calls `mise install`), or check that mise itself
  is installed and on PATH. `--skip-mise-install` intentionally leaves tools
  uninstalled; don't use it for your real run.
- **Windows: agents aren't picking up ripgrep/fd/etc.** — check the "Tier 0
  (shell)" block in `agentenv status`. It lists each enabled agent's shell
  override state; if any show `✗` or it says "Fix: run `agentenv apply`",
  re-run `agentenv apply`. If Git Bash truly isn't installed, install
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
for wiring in a fifth agent, [`docs/guides/releasing.md`](../../docs/guides/releasing.md)
for shipping a new npm version (one-button `Release` workflow), and
[`docs/plans/agentenv-dev-plan.md`](../../docs/plans/agentenv-dev-plan.md)
for the full design, config schema rationale, and phase roadmap.

## License

MIT

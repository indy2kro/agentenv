# agentenv — User Guide

`agentenv` gives AI coding agents (Claude Code, Codex CLI, GitHub Copilot,
OpenCode, Gemini CLI, Cursor, Windsurf, Cline CLI, Mistral Vibe) a consistent,
capable shell environment. It is a thin orchestration layer: [mise](https://mise.jdx.dev)
installs the tools, [rtk](https://github.com/rtk-ai/rtk) does command
rewriting + hooks, and `AGENTS.md`/`CLAUDE.md` carry the repo instructions.
agentenv just generates the config files and drives the other tools.

- Configuration reference (`agentenv.toml`): [`configuration.md`](configuration.md)
- Exit-code contract: [`guides/exit-codes.md`](guides/exit-codes.md)
- The mise prerequisite: [`guides/installing.md`](guides/installing.md)

## Requirements

- **Node.js >= 22.13** to run the CLI itself.
- **[mise](https://mise.jdx.dev)** installed and on PATH. This is a hard
  prerequisite: agentenv never installs tools itself, it generates a
  `mise.toml` and delegates 100% of tool installation to mise. `setup`/`apply`
  fail fast with install instructions when mise is missing (the only exception
  is `apply --skip-mise-install`, which generates files only). See
  [`guides/installing.md`](guides/installing.md).
- **Git for Windows**, if you're on Windows (the Tier 0 shell fix points
  agents at Git Bash's POSIX toolchain).
- Whichever supported agents you want configured — installed and on PATH.
  agentenv detects what's present; it doesn't install the agents themselves.

## Install

```sh
npm install -g @indy2kro/agentenv
```

The package is published as `@indy2kro/agentenv` (plain `agentenv` was already
taken on the registry); the command it installs is still plain `agentenv`.
Installing from source and connecting a dev checkout are covered in the
[`cmd/agentenv/README.md`](../cmd/agentenv/README.md).

You can also install mise itself at the same time:

```sh
winget install jdx.mise        # Windows
brew install mise              # macOS
curl https://mise.jdx.dev/install.sh | sh   # Linux
```

Then **open a new terminal** so `mise` is on PATH.

## Quick start

```sh
agentenv setup
```

The wizard walks through 7 steps and ends by showing the exact diff before
applying:

1. **Select agents** — detected installed agents are pre-checked.
2. **Select tools** — the full Tier 1–3 picker on one page (Tiers 1 + 2
   pre-checked, Tier 3 off).
3. **Add custom binaries** — `[[custom_tools]]` entries.
4. **Choose scope** — `project` (committed to the repo) or `user` (global).
5. **Token optimization** — rtk on/off.
6. **Optional integrations** — Superpowers opt-in with full settings review.
7. **Review** — the diff of everything that will change, then confirm.

Every prompt pre-fills from an existing `agentenv.toml`, so re-running the
wizard is safe. `agentenv configure` is an alias for `setup`.

The wizard requires an interactive terminal (TTY). In CI or a script use
unattended mode instead (below).

## Unattended / CI

```sh
# Detect installed agents + defaults, write agentenv.toml, and apply —
# no prompts. Re-applies your existing agentenv.toml if one is found.
agentenv setup --yes

# Or apply a hand-written/versioned config directly (never prompts):
agentenv apply

# Generate files only, without installing tools (fast CI dry-run shape;
# not a substitute for a real run).
agentenv apply --skip-mise-install
```

`setup --yes` extra controls:

| Flag | Meaning |
|---|---|
| `-a, --agents <agents>` | Comma-separated agents to configure (e.g. `--agents claude_code,copilot`). |
| `--scope <project\|user>` | Config scope (default `project`). |
| `--no-tier2` | Skip Tier 2 tools. |
| `--no-rtk` | Disable rtk command rewriting. |
| `--superpowers [ref]` | Enable Superpowers; optional tag/branch/commit ref (e.g. `--superpowers v6.3.0`). |
| `--config <path>` | Apply an existing `agentenv.toml` at that path. |

## Commands

### `agentenv setup` (alias `configure`)

Interactive wizard described in [Quick start](#quick-start). In a TTY it never
writes anything until you approve the review diff. Unattended with `--yes`
(flag table above).

### `agentenv apply`

The single pipeline all of `setup`/`configure`/`apply` funnel into. Reads
`agentenv.toml` and, in order:

1. Checks the mise prerequisite (fail fast with instructions if missing).
2. Tier 0 — Windows shell fix (agents pointed at Git Bash's toolchain).
3. Writes `mise.toml`, then `mise install`, then verifies each tool resolves.
4. Regenerates the marker-block sections of `AGENTS.md`/`CLAUDE.md`.
5. Wires each enabled agent (rtk init, or Claude Code's hand-written adapter).
6. Runs optional integrations (Superpowers).

| Flag | Meaning |
|---|---|
| `--skip-mise-install` | Generate files only — no `mise install`, no verification. For CI dry-runs or when mise isn't available. |
| `--dry-run` | Show what would be written/changed without changing anything. |
| `--shell-fix <mode>` | Override `[tier0].mode` for this run: `auto` (default; the Windows shell fix only writes files with a TTY), `always` (write even without one — pass this when an AI agent runs `apply`, which never has a TTY), or `never`. |
| `--scope <scope>` | config scope to apply: `project`\|`user` (default: nearest config), matching `update`/`uninstall`/`setup`. |
| `--json` | Emit one JSON document (`{success, configPath, baseDir, messages, errors, warnings, elapsedMs}`, or the dry-run plan shape with `--dry-run`) instead of the human report; suppresses the banner and streamed mise install output. |

`apply` is idempotent: with no config change it touches nothing and
reinstalls nothing.

The first time `apply` modifies a file it didn't create — `~/.claude/settings.json`,
or a project/user `AGENTS.md`/`CLAUDE.md` that predates agentenv — it saves
the original content next to it as `<file>.agentenv-backup`, once. Later
runs never overwrite that backup, so it always holds your true pre-agentenv
content; delete it (or add `*.agentenv-backup` to `.gitignore`) once you no
longer need it.

### `agentenv status`

A read-only report of what's configured vs. what's actually installed — where
they disagree is **drift**. Reports per agent, per tool, per generated file,
plus the Tier 0 shell block, `gh` auth, and any integrations.

```sh
agentenv status           # full human report
agentenv status --short   # one line per area
agentenv status --json    # one JSON document on stdout (machine-readable)
```

Tool markers match what `apply`'s verify step prints:

- `✓` resolves on PATH now
- `~` installed via mise but PATH is stale — **open a new terminal**
- `-` not managed by mise — install manually (never counted as failure)
- `✗` genuinely missing — this is drift

`status` exits `1` on real drift (missing tool, version pin mismatch,
unconfigured-but-installed agent, missing/unmanaged generated file, broken
integration, validation errors) and `0` otherwise. The exact definition is in
[`guides/exit-codes.md`](guides/exit-codes.md).

### `agentenv doctor`

A read-only machine sanity check: mise on PATH and the shims dir, the shell,
then (when an `agentenv.toml` exists) the config's enabled tools, RTK (when
enabled — resolves it the same way `apply` does, checks its version against
the pin, and runs `rtk gain` to rule out the unrelated `reachingforthejack/rtk`
name collision), and agents. It loads and validates the config, so a broken
config also shows up as `[fail]` — but `doctor` never changes anything.

```sh
agentenv doctor                 # full report
agentenv doctor --json          # machine-readable
agentenv doctor --section Tools # only the Tools section (index or prefix)
```

Each item is `[ok]` / `[warn]` / `[fail]`. A manual-install tool is `[warn]`
(not a failure); only genuinely missing tools/toolchain pieces `[fail]`. Any
`[fail]` → exit `1`.

### `agentenv update`

Unattended: updates mise itself and the mise-managed tools in your config.
Pinned tools (`tool_versions`) are never moved.

```sh
agentenv update            # mise self-update + mise up for enabled tools
agentenv update --self     # only the mise binary
agentenv update --tools    # only the tools
agentenv update --scope project|user
agentenv update --dry-run  # plan only (alias: --check)
agentenv update --watch    # watch mise.toml and auto-run mise up on change
agentenv update --json     # one JSON document ({success, messages, errors, elapsedMs}); not with --watch
```

### `agentenv uninstall`

Removes tools from mise's store (the cleanup counterpart to `apply`).

```sh
agentenv uninstall                 # every mise-managed tool in the config
agentenv uninstall jq fd           # specific tools (config key/binary/mise name)
agentenv uninstall --dry-run       # preview the plan, change nothing
agentenv uninstall --yes           # skip the confirmation prompt
agentenv uninstall --scope project|user
agentenv uninstall --json           # one JSON document ({success, message, toUninstall, alreadyGone})
```

`agentenv apply` reinstalls whatever you remove. Non-TTY runs require `--yes`.

### `agentenv shell-fix`

Inspect or revert the per-user Tier 0 shell changes `apply` records on
Windows. `apply` records every prior value; `--revert` restores them, skipping
any value you changed since (it refuses to clobber your edits).

```sh
agentenv shell-fix             # show what's recorded
agentenv shell-fix --json      # manifest as JSON (show only)
agentenv shell-fix --revert    # undo agentenv's changes
agentenv shell-fix --revert --dry-run   # preview the revert
```

`--json` + `--revert` is a usage error (exit `2`).

### `agentenv completion <shell>`

Prints a completion script for `bash`, `zsh`, `fish`, or `powershell`.

```sh
# bash
eval "$(agentenv completion bash)"
# zsh — put in ~/.zshrc
source <(agentenv completion zsh)
# powershell
agentenv completion powershell | Out-String | Invoke-Expression
```

### Global flags

Available to every subcommand (before or after it):

| Flag | Meaning |
|---|---|
| `--no-color` | Force colored output off. (Also honors `NO_COLOR`/`FORCE_COLOR` env vars; auto-detects TTY.) |
| `-q, --quiet` | Suppress banner/footer chrome; keep the data lines (e.g. "Setup complete!"). |
| `--no-spinner` | Disable the animated spinner, keeping its label and succeed/fail lines (no redrawing). Auto-off under `TERM=dumb` or `CI`. |
| `AGENTENV_ASCII=1` env var | Force ASCII status glyphs (`[ok]`/`[FAIL]`/`[warn]`/`[-]`) instead of `✓`/`✗`/`✅`/`⚠️`/`❌`/`·`. Auto-detected for `TERM=dumb` and (on Windows) a console code page other than 65001; set `AGENTENV_ASCII=0` to force Unicode back on. |
| `--debug` | On an unhandled error, print the failing command and stack trace. |
| `-V, --version` / `-h, --help` | Version / help (every subcommand also takes `--help`). |

## Exit codes

A documented, enforced contract:

- `0` — success (or intentional no-op, e.g. `setup` cancelled at review).
- `1` — operational issue: a command failed, or `status`/`doctor` detected
  real drift/failure.
- `2` — usage error: unknown command/option, invalid/incomplete arguments.

`--json` mirrors the process exit code inside the document as `exitCode`.
Full per-command details: [`guides/exit-codes.md`](guides/exit-codes.md).

## Maker / generated-file etiquette

- `mise.toml`, `AGENTS.md`, `CLAUDE.md`, and per-agent hook files are
  **generated**. Edit `agentenv.toml` and re-run `apply`.
- `AGENTS.md`/`CLAUDE.md` regeneration only replaces the marker-block section
  (`<!-- agentenv-managed-start -->` … `<!-- agentenv-managed-end -->`). Your
  hand-written content outside the block survives every `apply`.
- A partially-marked file (one marker left by a crash) is recovered safely,
  not clobbered.

## Windows notes (Tier 0)

On Windows, agents' shells can fall back to non-POSIX `find`/`grep`/etc.
`apply` detects this and points each configured agent at Git Bash's POSIX
toolchain, recording the change so `agentenv shell-fix --revert` can undo it.
Check the "Tier 0 (shell)" block in `status`; if an agent shows `✗`, re-run
`agentenv apply`. Tier 0 does nothing on macOS/Linux.

## Customizing for your needs

- Add your own tools (installed or via mise's `github:` backend) with
  `[[custom_tools]]` — [`configuration.md`](configuration.md#custom_tools).
- Pin exact versions with `[tool_versions]` — pinned tools are excluded from
  `update`.
- Toggle rtk agents under `[rtk.init]`.
- Opt into [Superpowers](https://github.com/obra/superpowers) via
  `[integrations.superpowers]` — the wizard offers this as an explicit step;
  once configured, `apply`/`status` always preserve it.

## Troubleshooting

- **`agentenv setup` says it's interactive-only** — you're not in a TTY (CI, a
  pipe). Use `agentenv apply` against a config, or `agentenv setup --yes`.
- **A tool is on in `status` but not on PATH** — run `agentenv apply` (it runs
  `mise install`), or check mise itself is installed. `--skip-mise-install`
  intentionally leaves tools uninstalled — don't use it for a real run.
- **`status` shows `~` for a tool** — it's installed but this shell's PATH is
  stale. Open a new terminal (or start a fresh shell in your agent).
- **`status` shows `-` for a tool** — that's expected for `tokei`/`rga`/`jless`
  where mise can't install them; install them manually (or add a
  `custom_tools` fallback).
- **Windows agents aren't picking up the tools** — check the "Tier 0 (shell)"
  block in `status`; if any agent shows `✗`, re-run `agentenv apply`. Install
  [Git for Windows](https://gitforwindows.org) first if it's truly missing.
- **`apply` refuses to run with a validation error** — fix the named field in
  `agentenv.toml`; errors block deliberately. Warnings don't block anything.
- **I hand-edited a generated file and worry about `apply`** — only the
  marker-block section is replaced; the rest of the file is untouched.
- **`gh` auth looks wrong in `status`** — it runs a read-only
  `gh auth status --hostname github.com` probe; transient/network failure
  shows as `unknown`, not a false "unauthenticated".

## Related docs

- [`configuration.md`](configuration.md) — every `agentenv.toml` key, the tool
  catalog, custom tools, integrations.
- [`guides/exit-codes.md`](guides/exit-codes.md) — the exit-code contract and
  the exact `status` drift definition.
- [`guides/installing.md`](guides/installing.md) — the mise prerequisite in
  depth.
- [`guides/adding-an-adapter.md`](guides/adding-an-adapter.md) — adding a new
  supported agent (maintainer doc).
- [`guides/releasing.md`](guides/releasing.md) — cutting an npm release.
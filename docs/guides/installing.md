# Installing mise (agentenv prerequisite)

This guide covers what mise is, why `agentenv` cannot work without it, how to
install it per OS, and how to verify the install. For what happens when mise
is missing (and the one exception to the requirement), see
[What fails if mise is missing](#what-fails-if-mise-is-missing).

## What mise is

[mise](https://mise.jdx.dev) is a cross-platform toolchain manager: it
resolves per-tool versions (from its registry or a tool's own GitHub
releases), installs them, and exposes the installed tools on `PATH` through a
**shims directory** (`~/.local/bin` by default). A "shim" is a tiny launcher
for one tool — `rg`, `fd`, `jq`, `rtk`, … — so any shell can resolve the tool
by its plain name.

## Why it is a hard requirement

`agentenv` never installs tools itself. It is a thin orchestration layer: it
generates a `mise.toml` from your `agentenv.toml` (plus the tool catalog) and
delegates 100% of installation to mise. `agentenv apply` then ensures mise's
global config points `shims_dir` at the shims directory and runs `mise
install`.

That shims directory is what keeps an agent's PATH consistent: once it is on
PATH, every installed tool resolves by name from PowerShell, cmd, or bash
alike. No shims, no consistently resolvable tools — which is exactly the
"agent can't find `grep`/`fd`/`jq`" problem `agentenv` exists to solve.

## Install

The commands below are exactly what agentenv itself prints when it finds mise
missing (see `miseInstallInstructions()` in `src/toolchain/mise.ts`).

### Windows

```sh
winget install jdx.mise
```

or the official PowerShell installer:

```powershell
irm https://mise.jdx.dev/install.ps1 | iex
```

mise is also available through other package managers (e.g. scoop) — see the
official docs below. Prefer winget or the installer script for the current
release.

### macOS

```sh
brew install mise
```

or the official curl installer:

```sh
curl https://mise.jdx.dev/install.sh | sh
```

### Linux

```sh
curl https://mise.jdx.dev/install.sh | sh
```

Some distributions also package mise; those can lag the current release, so
the curl installer is the recommended path.

## Verify

```sh
mise --version
```

If the command is not found right after installing, open a **new terminal** —
the installer adds mise to your shell config, which the current session
hasn't loaded yet. Full setup and configuration docs (shell activation, etc.):
<https://mise.jdx.dev/getting-started.html>.

## What fails if mise is missing

- **`agentenv apply`** aborts in its prerequisite check, before touching
  anything, with install instructions (exit `1`) — unless you pass
  `--skip-mise-install` (below).
- **`agentenv setup`** — both the interactive wizard and unattended
  `setup --yes` — fails the same way with the same instructions (exit `1`).
- **`agentenv update`** requires mise to self-update and to bump tools; it
  refuses with instructions when mise is missing (exit `1`).
- **`agentenv doctor`** reports mise as a `fail` item when it is not on PATH
  (exit `1`), so it surfaces before you ever get to a tool check.

The single exception is `agentenv apply --skip-mise-install`, which generates
`mise.toml`, `AGENTS.md`/`CLAUDE.md`, and the per-agent files **without**
installing anything. It exists for CI dry-runs and fast iteration where the
goal is file generation, not a working toolchain — it is not a way to use
agentenv without mise. See [`exit-codes.md`](exit-codes.md) for how each
command's exit code reflects the prerequisite.
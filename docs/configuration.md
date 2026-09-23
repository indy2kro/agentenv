# agentenv.toml — Configuration Reference

Everything `agentenv` does flows from one TOML file. It is the **only file you
hand-edit** — `mise.toml`, `AGENTS.md`/`CLAUDE.md`, and every per-agent hook
file you see are *generated outputs* of `agentenv apply` (see
[Generated files](#generated-files)).

- User guide (install, commands, workflows): [`usage.md`](usage.md)
- Command/exit-code contract: [`guides/exit-codes.md`](guides/exit-codes.md)
- Installing mise (the one hard prerequisite): [`guides/installing.md`](guides/installing.md)

## Where the file lives

| Scope | Location | Meaning |
|---|---|---|
| `project` (default) | `<project-root>/agentenv.toml` | Committed to the repo; the whole team shares it. |
| `user` | `~/.config/agentenv/agentenv.toml` | Global defaults for every project. Honors `XDG_CONFIG_HOME` when set (otherwise `~/.config/agentenv` on every platform). |

`agentenv` looks for `<project-root>/agentenv.toml` starting at the current
directory and searching upward through its parents (the way `git`/`mise`
find their own config), then falls back to the user-scope file — so a
personal `~/.config/agentenv/agentenv.toml` applies anywhere, an in-repo file
overrides it per project, and commands run from a subdirectory (e.g.
`repo/src`) still find `repo/agentenv.toml` and apply against `repo/`, not
the subdirectory.

## Getting started

Run the wizard to build the file interactively, or read this reference and
write it by hand:

```sh
agentenv setup         # interactive wizard → writes agentenv.toml → applies
agentenv setup --yes   # unattended: detect agents + defaults
```

## Full annotated example

```toml
# "project" (default) or "user". Controls where this file lives and where
# generated files go (see "Where the file lives" above).
scope = "project"

[agents]
claude_code = true       # default: on
codex_cli   = true       # default: on
copilot     = false      # opt-in
opencode    = false
gemini_cli  = false
cursor      = false
windsurf    = false
cline       = false
vibe        = false

[tools]
# Tier 1 — essential, on by default
ripgrep = true
fd      = true
jq      = true
rtk     = true
# Tier 2 — AI-coding value-add, on by default
ast_grep   = true
git_delta  = true
gh         = true
difftastic = true
# Tier 3 — power-user, off by default. See the [Tools] table below.
yq          = false
bat         = false
eza         = false
miller      = false
tokei       = false      # not in mise's registry — needs a custom_tools fallback
hyperfine   = false
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
taplo       = false
hadolint    = false
trivy       = false

# Optional per-tool version pins. A pinned tool installs at exactly that
# version and is excluded from `agentenv update`; unpinned tools resolve to
# `latest`. See "Version pins" below.
[tool_versions]
jq = "1.7.1"

# Your own tools, either already installed somewhere (first shape) or
# installable through mise's generic GitHub-releases backend (second shape).
[[custom_tools]]
name = "mytool"
description = "Internal linter wrapper"
already_installed = true
path_windows = "C:\\tools\\mytool.exe"
path_macos   = "/usr/local/bin/mytool"
path_linux   = "/usr/local/bin/mytool"

[[custom_tools]]
name = "otherthing"
mise_source = "github:someorg/otherthing"
version = "latest"

[rtk]
enabled = true            # command rewriting + agent hooks via rtk
[rtk.init]
claude_code = true        # run `rtk init` for each enabled agent
codex_cli   = true
copilot     = true
opencode    = true

[tier0]
# Windows-only POSIX shell fix (agents get pointed at Git Bash's toolchain).
check_enabled = true
# git_bash_path = "C:\\Program Files\\Git\\bin"   # override autodetection

[generate]
marker_start = "<!-- agentenv-managed-start -->"
marker_end   = "<!-- agentenv-managed-end -->"

# Optional Superpowers integration — see "Integrations" below.
[integrations.superpowers]
enabled = false
# source = "github:obra/superpowers"
# ref = "v6.3.0"
# scope = "user"
# agents = ["claude_code"]
# allow_hooks = false
# allow_external_requests = false
```

Every field is optional; anything omitted falls back to the default listed
below. `agentenv status` validates the file (errors block `apply`, warnings do
not — see [Validation](#validation)).

## Top-level keys

| Key | Type | Default | Purpose |
|---|---|---|---|
| `scope` | `"project"` \| `"user"` | `"project"` | Where to look for / write config and generated files. |
| `agents` | table | all **off** except `claude_code` + `codex_cli` (**on**) | Enables the per-agent adapters. |
| `tools` | table | Tier 1 + 2 **on**, Tier 3 **off** | Enables the [tool catalog](#tools) tools. |
| `tool_versions` | table | — | [Per-tool version pins](#version-pins). |
| `custom_tools` | array of tables | — | [Custom tools](#custom-tools) outside the catalog. |
| `rtk` | table | enabled | [rtk command rewriting + hooks](#rtk). |
| `tier0` | table | check_enabled | [Windows shell fix](#tier0). |
| `generate` | table | marker strings | [Marker block](#generated-files) for regenerate-in-place. |
| `advanced` | table | — | Reserved (`default_mode`, `show_diff_preview`). Parsed/round-tripped but not yet honored. |
| `integrations` | table | superpowers disabled | [Third-party integrations](#integrations). |

## `[agents]`

One boolean per supported AI coding agent:

| Key | Agent | Default |
|---|---|---|
| `claude_code` | Claude Code | on |
| `codex_cli` | OpenAI Codex CLI | on |
| `copilot` | GitHub Copilot (CLI/Chat) | off |
| `opencode` | OpenCode | off |
| `gemini_cli` | Gemini CLI | off |
| `cursor` | Cursor | off |
| `windsurf` | Windsurf | off |
| `cline` | Cline CLI | off |
| `vibe` | Mistral Vibe | off |

`agentenv setup` detects which agents are installed and pre-checks them; an
enabled agent that isn't installed is reported (never fatal) by
`status`/`doctor`.

### Relocated agent config directories

Each agent's hooks/instructions are written to its own config directory,
honoring that agent's own relocation env var when set to an absolute path
(a relative value is ignored, falling back to the default, rather than
silently resolving against the current directory):

| Agent | Default | Override |
|---|---|---|
| `claude_code` | `~/.claude` | `CLAUDE_CONFIG_DIR` |
| `codex_cli` | `~/.codex` | `CODEX_HOME` |
| `copilot` | `~/.config/github-copilot` | `XDG_CONFIG_HOME` |
| `opencode` | `~/.config/opencode` | `XDG_CONFIG_HOME` |

`~` above means `$HOME`/`%USERPROFILE%`, falling back to Node's `os.homedir()`
when neither is set.

## `[tools]`

The installable tool catalog. Everything in it is installed by **mise** —
agentenv only writes the `mise.toml`.

| Tier | Key | Binary | Default | Description |
|---|---|---|---|---|
| 1 | `ripgrep` | `rg` | on | Fast text search (use instead of `grep -r`) |
| 1 | `fd` | `fd` | on | Fast, user-friendly file finder |
| 1 | `jq` | `jq` | on | Lightweight flexible command-line JSON processor |
| 1 | `rtk` | `rtk` | on | CLI proxy that reduces LLM token consumption by 60–90% |
| 2 | `ast_grep` | `sg` | on | Structural/AST-based code search and rewrite |
| 2 | `git_delta` | `delta` | on | Syntax-highlighted git diff pager |
| 2 | `gh` | `gh` | on | GitHub CLI for repository operations |
| 2 | `difftastic` | `difft` | on | Structural diff tool that understands syntax |
| 3 | `yq` | `yq` | off | YAML/TOML processor (jq for YAML) |
| 3 | `bat` | `bat` | off | `cat` clone with syntax highlighting and git integration |
| 3 | `eza` | `eza` | off | Modern replacement for `ls` |
| 3 | `miller` | `mlr` | off | CSV/TSV data processing |
| 3 | `tokei` | `tokei` | off | Fast code statistics (LOC) — *not in mise's registry* |
| 3 | `hyperfine` | `hyperfine` | off | Command-line benchmarking tool |
| 3 | `fzf` | `fzf` | off | Fuzzy finder with a non-interactive filter mode |
| 3 | `just` | `just` | off | Command runner for project recipes |
| 3 | `watchexec` | `watchexec` | off | File watcher that runs commands on changes |
| 3 | `direnv` | `direnv` | off | Environment variable manager |
| 3 | `ripgrep_all` | `rga` | off | ripgrep-based search across archives, docs, and code — *no Windows install* |
| 3 | `zoxide` | `zoxide` | off | Smarter `cd` with fuzzy matching and learning |
| 3 | `shellcheck` | `shellcheck` | off | Shell script linter |
| 3 | `uv` | `uv` | off | Fast Python package and project manager |
| 3 | `xh` | `xh` | off | HTTP client with a curl-like interface |
| 3 | `actionlint` | `actionlint` | off | GitHub Actions workflow linter |
| 3 | `gitleaks` | `gitleaks` | off | Secrets scan and protection (detect leaked secrets) |
| 3 | `gum` | `gum` | off | Styled prompts and spinners for shell scripts |
| 3 | `glow` | `glow` | off | Markdown renderer for the terminal |
| 3 | `jless` | `jless` | off | Interactive JSON pager — *no Windows install* |
| 3 | `sd` | `sd` | off | Intuitive find-and-replace for text files |
| 3 | `tealdeer` | `tldr` | off | Fast, community-driven man pages (tldr) |
| 3 | `duckdb` | `duckdb` | off | Embeddable analytical SQL database |
| 3 | `qsv` | `qsv` | off | Ultra-fast CSV data processing toolkit |
| 3 | `taplo` | `taplo` | off | TOML linter/formatter (complements yq) |
| 3 | `hadolint` | `hadolint` | off | Dockerfile linter |
| 3 | `trivy` | `trivy` | off | Vulnerability, secret, and IaC scanner |

### Tools mise cannot install everywhere

Three catalog tools are never installed by mise and need a manual fallback (or
a `custom_tools` entry). They render with a `-` marker in `agentenv status` and
a `[warn]` in `agentenv doctor` — never as a failure, because `apply` never
tries to install them in the first place:

- **`tokei`** — not in mise's registry at all (any platform). Enabling it
  prints a validation warning suggesting a `custom_tools` fallback.
- **`ripgrep_all`** and **`jless`** — their only mise backends support
  `linux`/`darwin` only; on Windows you must install them manually.

### Version pins

Without a pin, a tool resolves to `latest`. Pinning `version.windows`,
`version.macos`, and/or `version.linux` inside a `[[custom_tools]]` entry pins
the custom tool per-platform. For catalog tools, use `[tool_versions]`:

```toml
[tool_versions]
jq = "1.7.1"
```

A pinned catalog tool is installed at exactly that version and is **excluded
from `agentenv update`** (pinned versions are never moved by `mise up`).
`agentenv status` reports version drift when a pinned tool's installed version
doesn't match.

## `[[custom_tools]]`

Anything not in the catalog — an internal CLI, a niche tool, something already
on your machine. Two supported shapes:

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Tool key (also how it's announced in generated instructions). **Required.** |
| `description` | string | One-line summary agents see. **Required.** |
| `already_installed` | boolean | This tool is already on the machine; provide the path for your OS. |
| `path_windows` | string | Absolute path when `already_installed` (Windows). |
| `path_macos` | string | Absolute path when `already_installed` (macOS). |
| `path_linux` | string | Absolute path when `already_installed` (Linux). |
| `mise_source` | string | mise generic backend, e.g. `github:owner/repo`. |
| `version` | string | Install target for `mise_source`; defaults to `latest`. |

- **Already installed** (`already_installed = true` + the path for your OS):
  `agentenv status` checks that path exists for your platform and flags it as
  `MISSING on disk` if not.
- **Installable via mise** (`mise_source = "github:owner/repo"`): installed and
  verified like a catalog tool.

Custom tools flow through the exact same "config changed → regenerate →
install → verify" pipeline as catalog tools. Orphaned entries (neither shape
completed) and duplicate names are validation **errors**.

## `[rtk]`

`rtk` does the command rewriting and per-agent hook wiring.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | boolean | `true` | Whether agentenv runs rtk at all. Set `false` to skip command rewriting/hooks. |
| `init` | table | all agents `true` | Which agents get `rtk init` run for them (one boolean per agent key). |

## `[tier0]`

Windows-only. Makes agents' shells POSIX-compatible by pointing them at Git
Bash's toolchain instead of letting them fall back to Windows' non-POSIX
utilities. Every change `apply` makes here is recorded so
`agentenv shell-fix --revert` can restore it.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `check_enabled` | boolean | `true` | Set `false` to skip the Tier 0 check/fix on Windows. |
| `git_bash_path` | string | autodetected | Override the Git Bash `bin` path when detection fails. |
| `mode` | `"auto"` \| `"always"` \| `"never"` | `"auto"` | Whether the fix actually writes files. `"auto"` only does so with a TTY; an AI agent running `apply`/`setup --yes` never has one, so set `"always"` (or pass `apply --shell-fix always`) to have Tier 0 apply for it too. `"never"` always just checks and reports. |

On non-Windows platforms this section has no effect (`status` reports it as
N/A).

## Generated files

`agentenv apply` writes four kinds of generated files from this config:

- `mise.toml` — declares the selected tools + pins.
- `AGENTS.md` — repo-level instructions (the [AGENTS.md](https://agents.md)
  standard) for every enabled agent.
- `CLAUDE.md` — Claude Code's project instructions.
- Per-agent hook/config files — through rtk (or, for Claude Code, a
  hand-written adapter that matches the exact hook shape `rtk init` produces).

**Always edit `agentenv.toml` and re-run `apply` — never hand-edit generated
files.** The one deliberate exception: `AGENTS.md`/`CLAUDE.md` regeneration
only replaces a marker-block section:

```html
<!-- agentenv-managed-start -->
(agentenv's content — regenerated on every apply)
<!-- agentenv-managed-end -->
```

Anything you've written outside that block survives every `apply`. If a crash
leaves *one* marker behind, the next `apply` treats the file as partial and
recovers it without clobbering your content.

In **user scope** (`scope = "user"`), the baseDir copies still land in
`~/.config/agentenv/` for reference, but the same marker-preserved instructions
are additionally written into each *enabled* agent's own user-level instruction
file — the one that agent actually reads every session:

| Agent | User-level instruction file |
|---|---|
| Claude Code | `~/.claude/CLAUDE.md` |
| Codex CLI | `~/.codex/AGENTS.md` |
| OpenCode | `~/.config/opencode/AGENTS.md` |
| GitHub Copilot | `~/.copilot/copilot-instructions.md` |
| Gemini CLI | `~/.gemini/AGENTS.md` |
| Cursor | `~/.cursor/AGENTS.md` |
| Windsurf | `~/.windsurf/AGENTS.md` |
| Cline | `~/.cline/AGENTS.md` |
| Mistral Vibe | `~/.vibe/AGENTS.md` |

The same agentenv-managed marker block (and preservation rule) applies there, so
existing hand-written user instructions are never replaced.

### `[generate]`

| Key | Type | Default | Meaning |
|---|---|---|---|
| `marker_start` | string | `<!-- agentenv-managed-start -->` | Opening marker for the regenerated block. |
| `marker_end` | string | `<!-- agentenv-managed-end -->` | Closing marker. |
| `files` | string[] | `["AGENTS.md", "CLAUDE.md"]` | **Parsed but not yet honored** — the generator always writes both files. Reserved for future narrowing. |

## `[advanced]`

`default_mode` and `show_diff_preview` are parsed, merged, diffed, and
round-tripped, but command behavior has not been wired to them yet. Treat the
section as reserved.

## Integrations

Second-kind adapters that agentenv invokes but does **not** own the config of:
agentenv calls a third-party installer and reports
`detect`/`apply`/`status` results, it never forks or bundles the integration.

### Superpowers

The [Superpowers](https://github.com/obra/superpowers) skill/methodology system
installed through its *own* native installers. Disabled by default.

```toml
[integrations.superpowers]
enabled = true
source = "github:obra/superpowers"
ref = "v6.3.0"          # tag/branch/commit; defaults to the shipped pin
scope = "user"          # where to install; "project" | "user"
agents = ["claude_code"]
allow_hooks = true      # Superpowers registers a SessionStart hook
allow_external_requests = false
```

| Key | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | boolean | `false` | Run the integration on `apply`. |
| `source` | string | `github:obra/superpowers` | Installer source to pass through. |
| `ref` | string | `v6.3.0` | Ref to install (pinned). |
| `scope` | `"project"` \| `"user"` | inherits top-level `scope` | Where the integration is installed. |
| `agents` | string[] | `["claude_code", "codex_cli", "copilot", "opencode"]` | Agents to target. |
| `allow_hooks` | boolean | `false` | Allow the integration to register hooks. |
| `allow_external_requests` | boolean | `false` | Allow outbound requests. |

Not every agent has a documented, strict, ref-pinnable installer. Superpowers
targets that agentenv can't automate are reported as `unsupported` with manual
install hints — never run unpinned or unreviewed (see
[`research/superpowers-install-mechanisms.md`](research/superpowers-install-mechanisms.md)).

## Validation

`agentenv status` runs `validateConfig` on the resolved file and reports
**errors** and **warnings** separately:

- **Errors block `apply`** (it refuses to run) and flip `status`/`doctor` to
  exit `1`. Examples: invalid `scope`, a non-boolean `tools` value (e.g.
  `tools.ripgrep = "false"`), an orphaned/duplicate custom tool, an invalid
  `integrations.superpowers.scope`.
- **Warnings never block anything**, but are shown. Examples: any enabled
  tool (like `tokei`) that mise can't install on this platform; an unknown
  top-level table or key anywhere in the file (e.g. `[tool]`, `scop =
  "user"`, `[rtk] enable = true`), which comes with a "did you mean"
  suggestion when one is close.

## Related reading

- [`usage.md`](usage.md) — installing the CLI, every command with flags and
  examples, unattended/CI use, troubleshooting.
- [`guides/exit-codes.md`](guides/exit-codes.md) — the `0`/`1`/`2` contract and
  the full `status` drift definition.
- [`guides/installing.md`](guides/installing.md) — the mise prerequisite.
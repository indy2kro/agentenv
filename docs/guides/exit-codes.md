# Exit codes and machine-readable output

`agentenv` is safe to drive from scripts: every command exits `0`, `1`, or
`2` with a stable meaning, two commands (`status`, `doctor`) can emit a
single JSON document on stdout, and a global `-q/--quiet` strips banner
chrome while keeping the data lines.

## The exit-code contract

| Code | Meaning |
|------|---------|
| `0` | Success / clean — the requested operation completed and the environment satisfies it |
| `1` | Operational issue — a command failed, or `status`/`doctor` detected real drift or failure |
| `2` | Usage error — invalid or missing arguments/flags |

`2` applies across every command: an unknown command/option or a missing
required argument exits `2` (the contract is enforced at the commander
boundary, `src/cli/exit.ts`). `--help` and `--version` exit `0` — they are
successful informational exits, not errors.

### Per-command semantics

| Command | `0` when | `1` when |
|---------|----------|----------|
| `setup` (alias `configure`) | config written and (where requested) tools/applied | any step failed. Idempotent: an existing config is updated in place, never a failure. A user-cancel at the review screen exits `0` (an intentional no-op, not an error). |
| `apply` | all steps completed with no failures | any step failed (mise missing, install failed, tool verification failed, …) |
| `status` | no validation errors AND no drift (see below) | config missing or invalid, or drift detected |
| `update` | tools/runtime updated to latest | an update step failed, including a failed shims precondition |
| `uninstall` | targets removed from the mise store (or nothing to remove — "Nothing to uninstall."); `--dry-run` previews and exits `0` | no config found, unknown tool argument, mise missing with real targets, a failed `mise ls --json`/`mise uninstall`, or a non-TTY run without `--yes` |
| `doctor` | no `fail` items | any `fail` item (`warn` items do not flip the code) |

### `status` drift definition

`status` exits `1` when any of these is true:

- validation errors are present (validation warnings alone do **not** flip it);
- an enabled catalog tool's binary is not resolvable on PATH;
- an enabled agent is installed but not configured (`installed && !configured`).
  An enabled-but-never-installed agent is **not** drift (it is reported with
  `installed: false` but doesn't flip the code, matching `doctor`, which
  warns rather than fails on a missing agent CLI);
- a generated file (`mise.toml`, `AGENTS.md`, `CLAUDE.md`) is missing, or
  exists but is missing its managed marker block;
- an enabled integration reports a `missing` or `drifted` state for one of
  the agents it targets. `unsupported` is not drift — it is a documented,
  benign state for agents without a native installer;
- a `custom_tools` entry marked `already_installed` has its OS-specific path
  missing on disk (status flags it as `MISSING on disk`).

## `--json` (`status` and `doctor` only)

`--json` is available on the two read-only reporting commands. When set, the
command emits a **single JSON document on stdout and nothing else** (diagnostics
stay on stderr, which is silent on success), skips banner/color, and implies
quiet mode. The process exit code still applies — it is set by the same logic
as the human path and is mirrored inside the document as `exitCode` — so a
consumer can branch on both the code and the structured body.

`status --json` always emits a complete document, including on missing or
invalid config:

- **no config found** → `config: null`, `scope: null`, `baseDir: null`, empty
  collections, `exitCode: 1`;
- **config found but unreadable/invalid** → `config: <path>` (the path is kept
  so a consumer can distinguish "no config" from "broken config"), the parse
  or validation message(s) in `validation.errors`, all other collections
  empty, `exitCode: 1`.

Passing `--json` to `setup`/`configure`/`apply`/`update`/`uninstall` is a usage
error: it hits commander's unknown-option handling and exits `2`. The
mutating commands' meaningful contract is the exit code, not a parsed body.

Example:

```sh
$ agentenv status --json | jq .exitCode
1
```

## Global `-q/--quiet`

`-q` (or `--quiet`) is global — it can appear before or after the subcommand.
It:

- suppresses banner/footer chrome — the `=== ... ===`-delimited heading and
  complete lines rendered via the banner helper;
- keeps the data lines themselves, including result lines a script may want
  (`Setup complete!`, `Update complete!`, `Configuration applied
  successfully!`);
- leaves stderr unchanged;
- implies nothing about JSON: `--json` *implies* quiet, but quiet does **not**
  imply JSON (the human data lines are still printed).

Banners are also gated on `process.stdout.isTTY`, so piped output already
starts at the data even without `-q`.
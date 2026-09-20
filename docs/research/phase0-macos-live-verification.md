# Phase 0 — Live macOS Verification

**Date:** 2026-09-14
**Machine:** macOS 15.7.9 (Sequoia), Apple Silicon (arm64), zsh, Homebrew 6.0.21
**Purpose:** `docs/research/phase0-windows-findings.md` consolidates desk research and one
real-machine pass on **Windows**. This document re-runs the macOS-relevant Phase 0
checks (Task 9's "needs CI verification" items in particular) against a real macOS
box instead of assumption, per the dev plan's own repeated instruction ("verified
per-tool, not assumed").

---

## 1. Baseline state of this machine (before any changes)

| Item | Found |
|---|---|
| `mise` | **Not installed** |
| `rtk` | Installed via Homebrew, **v0.44.1** (`/opt/homebrew/bin/rtk`) — newer than the `0.42.4` the existing docs tested against |
| `grep` | Shadowed by a **shell function** (from Claude Code's own shell-snapshot mechanism, not rtk) that execs the underlying binary as `ugrep`, not GNU or BSD grep |
| `find` | Same mechanism, execs as `bfs` (breadth-first find), not GNU/BSD find |
| `sed` | Plain BSD sed (`/usr/bin/sed`, no `--version` support) |
| `awk` | macOS's "one true awk" (`/usr/bin/awk`) |
| `diff` | Apple/FreeBSD diff |
| GNU `grep` | Already present via Homebrew as **a dependency of something else** (not user-installed directly) |
| `coreutils`/`gnu-sed`/`findutils`/`gawk` | **Not installed** |

**Finding not previously documented:** the "BSD vs GNU" framing in
`phase0-windows-findings.md` §2 is real for `sed`/`awk`/`diff`, but on a machine already
running Claude Code, `grep`/`find` are commonly shadowed by **Claude Code's own
shell-snapshot substitution** (`ugrep`/`bfs`), which is separate from both the
BSD/GNU split and from rtk. Tier 0 detection logic should not assume `which grep`
reflects the system default — it may reflect a Claude-Code-injected shell function
instead. Detection should check the resolved binary's actual `--version` output
(or `type`/`command -v` behavior) rather than just presence on `PATH`.

---

## 2. Tool catalog — real `mise install` on macOS arm64

Installed `mise` fresh (`curl https://mise.run | sh`, official installer, to
`~/.local/bin/mise`, not activated in shell rc — inert unless invoked directly).
Then ran `mise install <spec>@latest` for every Tier 1–3 catalog entry in an
isolated scratch directory.

| Tool | Spec | Result | Version resolved | Asset |
|---|---|---|---|---|
| ripgrep | `aqua:BurntSushi/ripgrep` | ✅ PASS | 15.2.0 | `aarch64-apple-darwin.tar.gz` (native arm64) |
| fd | `aqua:sharkdp/fd` | ✅ PASS | 10.5.0 | native arm64 |
| jq | `aqua:jqlang/jq` | ✅ PASS | 1.8.2 | `jq-macos-arm64` |
| rtk | `aqua:rtk-ai/rtk` | ✅ PASS | 0.49.0 | native arm64 |
| ast-grep | `aqua:ast-grep/ast-grep` | ✅ PASS | 0.45.3 | native arm64 |
| git-delta | `aqua:dandavison/delta` | ✅ **PASS** | 0.19.2 | native arm64 — resolves fine on Apple Silicon |
| gh | `aqua:cli/cli` | ✅ PASS | 2.100.0 | native arm64 |
| difftastic | `aqua:Wilfred/difftastic` | ✅ PASS | 0.70.0 | native arm64 |
| yq | `aqua:mikefarah/yq` | ✅ PASS | 4.53.6 | native arm64 |
| bat | `aqua:sharkdp/bat` | ✅ PASS | 0.26.1 | native arm64 |
| eza | `vfox:jdx/vfox-eza` | ✅ **PASS** | 0.23.5 | native arm64 — resolves fine, contradicts prior "Needs CI verification" flag |
| miller | `aqua:johnkerl/miller` | ✅ PASS | 6.21.0 | native arm64 |
| hyperfine | `aqua:sharkdp/hyperfine` | ⚠️ PASS, not native | 1.20.0 | **`x86_64-apple-darwin.tar.gz`** — runs under Rosetta on Apple Silicon, no arm64 asset published upstream |
| fzf | `aqua:junegunn/fzf` | ✅ PASS | 0.74.4 | native arm64 |
| just | `aqua:casey/just` | ✅ PASS | 1.58.0 | native arm64 |
| watchexec | `aqua:watchexec/watchexec` | ✅ PASS | 2.7.2 | native arm64 |
| direnv | `aqua:direnv/direnv` | ✅ PASS | 2.37.1 | native arm64 |
| universal-ctags | `universal-ctags` (mise registry) | ❌ FAIL | — | `not found in mise tool registry` — confirmed, as documented |
| tokei | `tokei` / `cargo:tokei` | ❌ FAIL | — | mise's own registry lists `aqua:XAMPPRocky/tokei`, but that entry itself redirects to the `cargo` backend (`package type 'cargo' is not supported in the aqua backend`); the cargo backend then fails outright with no local Rust toolchain present. **Confirmed: no path to a prebuilt tokei binary through mise on macOS**, exactly as documented, but the failure mode is one hop deeper than "not in registry" — worth noting for anyone debugging it.

**Corrections to `phase0-windows-findings.md`'s "Needs CI Verification" list:**
- **eza on macOS** — resolves cleanly via `vfox:jdx/vfox-eza`, native arm64 binary. Can be promoted to "Validated" without waiting for CI.
- **git-delta on Apple Silicon** — resolves cleanly, native arm64. (The doc's Intel-Mac x86_64 asset concern for delta 0.19.2 is a separate, narrower risk — not reproducible on this arm64 box; still needs an Intel runner to confirm.)
- **hyperfine** — new finding, not previously flagged: only ships an x86_64 asset for macOS upstream. Works fine via Rosetta 2 (present by default on Apple Silicon Macs with Xcode tools installed) but is not a native arm64 binary. Low risk, but should be called out in the catalog notes rather than marked identically to the native-arm64 tools.

### Fallback path for the two mise failures (macOS-specific)

Both `universal-ctags` and `tokei` resolve as **bottled (prebuilt) Homebrew
formulae** on macOS — no compilation needed:
```
brew info universal-ctags   # stable 6.2.1, bottled
brew info tokei             # stable 15.0.0, bottled
```
This means the "custom tool, manual install" fallback documented in
`phase0-windows-findings.md` §7 has a concrete, low-friction implementation on macOS
specifically: `agentenv` can shell out to `brew install <formula>` as the
macOS-specific fallback path for registry gaps, rather than only documenting a
manual instruction to the user. (Same tools still need their own fallback
strategy on Linux/Windows — not verified here.)

---

## 3. Tier 0 — GNU/BSD parity, live check

Homebrew already has GNU `grep` installed (as a dependency of another package),
but not `coreutils`, `gnu-sed`, `findutils`, or `gawk`. All four are available as
**bottled** (prebuilt, no build step) Homebrew formulae:

| Formula | Bottled? | Provides |
|---|---|---|
| `coreutils` | ✅ | GNU `cat`/`ls`/`cp`/etc. under `gnubin` (not `PATH`-active by default; needs prepending `$(brew --prefix coreutils)/libexec/gnubin`) |
| `gnu-sed` (alias `gsed`) | ✅ | GNU `sed`, install as `gsed` unless prefixed |
| `grep` | ✅ (already installed) | GNU `grep`, installs as `ggrep` unless prefixed |
| `findutils` | ✅ | GNU `find`, installs as `gfind` unless prefixed |
| `gawk` | ✅ | GNU `awk`, installs as `gawk` |

**Confirms and sharpens `phase0-windows-findings.md` §2's macOS mitigation:** the
Homebrew packages exist and install without compiling, but by default they
install under `g`-prefixed binary names (`gsed`, `ggrep`, `gfind`) — they do
**not** silently shadow the BSD tools. The `gnubin` directory
(`$(brew --prefix coreutils)/libexec/gnubin`) is what agentenv's Tier 0 fix
would need to prepend onto `PATH` to make plain `sed`/`grep`/`find` resolve to
the GNU versions, exactly as the existing doc's mitigation describes — this is
now confirmed against real Homebrew formula metadata rather than assumed.

---

## 4. `rtk init` — live dry-run and real-run on macOS, current version (0.44.1)

Ran real dry-runs (`--dry-run`) and one real (non-dry) run in throwaway scratch
directories, for every agent mode relevant to the v1 target list:

```
$ rtk init --dry-run                     # Claude Code (default)
[dry-run] would add rtk instructions to CLAUDE.md
[dry-run] would create .rtk/filters.toml template: .rtk/filters.toml

$ rtk init --codex --dry-run
[dry-run] would create RTK.md: RTK.md
[dry-run] would add @RTK.md reference to AGENTS.md: AGENTS.md

$ rtk init --copilot --dry-run
[dry-run] would add Copilot instructions to ./.github/copilot-instructions.md
[dry-run] would create Copilot hook config: ./.github/hooks/rtk-rewrite.json

$ rtk init --opencode --dry-run
rtk: OpenCode plugin is global-only. Use: rtk init -g --opencode

$ rtk init -g --opencode --dry-run
[dry-run] would create OpenCode plugin: /Users/…/.config/opencode/plugins/rtk.ts
```

This **exactly matches** what `docs/research/rtk-init-delegation.md` and
`phase0-windows-findings.md` §4 already documented against rtk `0.42.4` — confirmed
unchanged behavior on macOS at the newer `0.44.1`, live, not just read from rtk's
own docs.

**One real (non-dry) run** of `rtk init --auto-patch` (Claude mode, project
scope, fresh directory) actually wrote:
- `CLAUDE.md` — marker-blocked (`<!-- rtk-instructions v2 --> … <!-- /rtk-instructions -->`), confirming the "marker-block only" regeneration style agentenv's own plan (§6.5) wants to replicate is exactly what rtk itself already does
- `.rtk/filters.toml` — a commented template, no active filters

**Notably, it did *not* write a project-local `.claude/settings.json` hook.**
On this machine, the actual Claude Code `PreToolUse` hook (`rtk hook claude`)
already lives in the **global** `~/.claude/settings.json` from an earlier
`rtk init -g` run — `rtk init` (project scope) does not duplicate a
project-level hook when a working global one is already registered. Adapter
design implication: agentenv's Claude adapter needs to check *global* hook
state, not just project-local state, before deciding a hook still needs to be
written.

### New flags not in the existing docs (version drift, 0.42.4 → 0.44.1/0.49.0)

`rtk init --help` on this machine additionally exposes, beyond what
`rtk-init-behavior.md` documented:
- `--agent <AGENT>` with `cursor`, `windsurf`, `cline`, `kilocode`,
  `antigravity`, `kimi`, `pi`, `hermes`, `droid` — all outside the four v1
  targets, but confirms the "isolate per-agent logic in adapters, a 5th agent
  is additive" design (§6, §11) is already how rtk itself is structured upstream.
- `--uninstall` — removes rtk artifacts for the selected mode. Worth using in
  agentenv's own uninstall/reset flows instead of hand-deleting marker blocks.
- `--trust-filters` / `--no-trust-filters` — custom-filter trust prompts,
  relevant if agentenv ever surfaces `.rtk/filters.toml` in its own wizard.
- `--dry-run` (combine with `-v` for content preview) — directly useful for
  agentenv's own "review screen showing the resulting config diff before
  writing anything" (§6.2 step 6); agentenv could shell out to
  `rtk init --dry-run -v` and fold its output into that review screen rather
  than re-implementing a diff preview for the rtk-owned files.

None of this changes any Phase 0 conclusion — it's additive confirmation that
the rtk-delegation decision (§8, Phase 2 status) still holds on the current
release.

---

## 5. Net changes to this findings set vs. `phase0-windows-findings.md`

| Item | Prior status | Now |
|---|---|---|
| eza on macOS | "Needs CI verification" | **Validated** (native arm64, real install) |
| git-delta on Apple Silicon | "Needs CI verification" | **Validated** (Intel-only asset risk remains, untouched by this check) |
| universal-ctags / tokei fallback | "custom tool, manual install" (unspecified mechanism) | **Homebrew bottled formula**, concretely installable by agentenv on macOS without a compiler |
| hyperfine on macOS | Listed as fully "Validated," no OS caveat | Runs via Rosetta (x86_64 asset only) — add a caveat, not a blocker |
| Tier 0 GNU/BSD fix | Recommended, not verified against real formula metadata | Confirmed: `coreutils`/`gnu-sed`/`grep`/`findutils`/`gawk` all bottled, install under `g`-prefixed names, need explicit `gnubin` `PATH` prepend |
| `grep`/`find` resolution on a dev machine | Assumed to reflect BSD/GNU split only | Can be shadowed by Claude Code's own `ugrep`/`bfs` shell-function substitution — detection logic should check resolved version output, not just `PATH` presence |
| `rtk init` behavior (Claude/Codex/Copilot/OpenCode) | Verified on one machine at v0.42.4 | Re-confirmed unchanged on macOS at v0.44.1, including the "no duplicate project hook when global hook exists" nuance |

**No architectural conclusion in the dev plan changes.** This pass **removes two
"needs CI verification" flags** (eza, git-delta on arm64), **adds one new minor
caveat** (hyperfine/Rosetta), and **sharpens two mitigations that were
previously stated but not checked against real package metadata** (the Homebrew
fallback for ctags/tokei, and the `gnubin` PATH detail for Tier 0 on macOS).

## 6. Housekeeping

`mise` was installed to `~/.local/bin/mise` on this machine to run the above
checks (official `mise.run` installer). It was **not** activated in `.zshrc` —
it sits inert unless invoked by full path or explicit `PATH` export, and is easy
to remove (`rm -rf ~/.local/bin/mise ~/.local/share/mise`) if you'd rather it
not be there. All tool installs done during this check
(`~/.local/share/mise/installs/…`) are similarly inert and safe to delete;
none of them were added to any `mise.toml`/config, so nothing is "activated"
system-wide.

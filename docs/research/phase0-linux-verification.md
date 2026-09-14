# Phase 0 — Linux verification (measured, not inferred)

**Date:** 2026-09-14
**Machine:** Ubuntu 26.04.1 LTS, x86_64, Node v24.18.0, npm 11.17.0
**Under test:** mise 2026.9.7, rtk 0.49.0 (the version pinned in `mise.toml`), agentenv @ `b148fea`
**Method:** everything run under a throwaway `HOME` + sandboxed `MISE_DATA_DIR`/`CACHE`/`STATE`/`CONFIG`. No real user config touched.

`docs/research/phase0-findings.md` was produced on a Windows box; its macOS and Linux
columns are confidence ratings, not measurements. This document replaces the Linux
column with measured results.

---

## 1. Tier 0 — shell foundation (Tasks 7 & 9)

All 14 bundled utilities present, all resolving to `/usr/bin`, all GNU:

| Tool | Version |
|---|---|
| grep | GNU grep 3.12 |
| sed | GNU sed 4.9 |
| awk | GNU Awk 5.3.2 |
| find | GNU findutils 4.10.0 |
| diff | GNU diffutils 3.12 |

Remaining 9 (`tar gzip curl cat ls mkdir rm cp mv less`) all present in `/usr/bin`.

GNU-only flag probes — **7/7 supported**: `grep -P`, `sed -i` (no backup suffix),
`awk -i inplace`, `find -printf`, `find -regex`, `diff --color`, `diff --side-by-side`.

**Conclusion:** on mainstream glibc Linux, Tier 0 needs **detection only** — no install
step. This confirms the plan's assumption (§3 "Availability plan per tier") for Ubuntu.
The Alpine/musl caveat in `phase0-findings.md` §2 is untested and should stay flagged.

### ⚠️ New finding — Tier 0 detection can measure the wrong `grep`

`shell/detector.ts:197` probes GNU-ness with
`execSync('grep -P --version')`. `execSync` goes through `/bin/sh`, so it resolves
the **binary on PATH**. But agent harnesses may shadow these commands with *shell
functions* in the interactive shell the agent actually runs commands in — Claude Code
on this machine replaces `grep` with a function dispatching to **ugrep** and `find`
with one dispatching to **bfs**:

```
$ type grep
grep is a function
grep () { ... exec -a ugrep "$_cc_bin" -G --ignore-files ... }
```

So `agentenv status` will report "GNU grep, `-P` supported" while the agent's own
`grep` call lands on ugrep with different flag semantics. This is exactly the class
of silent misbehaviour Tier 0 exists to prevent, and it is invisible to the current
probe. Worth probing through the agent's own shell (or at minimum reporting what
`type -a grep` says) rather than through `/bin/sh`.

---

## 2. Tool catalog — 19 tools actually installed via mise (Tasks 1–4)

`mise ls-remote <spec>` then `mise install <spec>@latest` then `<bin> --version`.

| # | Tool | Spec | Resolve | Install | Version installed |
|---|---|---|---|---|---|
| 1 | ripgrep | `aqua:BurntSushi/ripgrep` | OK | OK | 15.2.0 |
| 2 | fd | `aqua:sharkdp/fd` | OK | OK | 10.5.0 |
| 3 | jq | `aqua:jqlang/jq` | OK | OK | jq-1.8.2 |
| 4 | rtk | `aqua:rtk-ai/rtk` | OK | OK | 0.49.0 |
| 5 | ast-grep | `aqua:ast-grep/ast-grep` | OK | OK | 0.45.3 |
| 6 | git-delta | `aqua:dandavison/delta` | OK | OK | 0.19.2 |
| 7 | universal-ctags | *(none)* | **FAIL** | **FAIL** | not in mise registry |
| 8 | gh | `aqua:cli/cli` | OK | OK | 2.100.0 |
| 9 | difftastic | `aqua:Wilfred/difftastic` | OK | OK | 0.70.0 |
| 10 | yq | `aqua:mikefarah/yq` | OK | OK | v4.53.6 |
| 11 | bat | `aqua:sharkdp/bat` | OK | OK | 0.26.1 |
| 12 | eza | `vfox:jdx/vfox-eza` | OK | OK | (installs and runs) |
| 13 | miller | `aqua:johnkerl/miller` | OK | OK | mlr 6.21.0 |
| 14 | tokei | `aqua:XAMPPRocky/tokei` | OK | **FAIL** | see below |
| 15 | hyperfine | `aqua:sharkdp/hyperfine` | OK | OK | 1.20.0 |
| 16 | fzf | `aqua:junegunn/fzf` | OK | OK | 0.74.4 |
| 17 | just | `aqua:casey/just` | OK | OK | 1.58.0 |
| 18 | watchexec | `aqua:watchexec/watchexec` | OK | OK | 2.7.2 |
| 19 | direnv | `aqua:direnv/direnv` | OK | OK | 2.37.1 |

**17 / 19 install and execute on Linux.**

### Corrections to `phase0-findings.md`

- **eza (row 12)** — predicted "✅ High" on Linux; **confirmed measured**. The vfox
  backend works. (macOS remains the open one.)
- **git-delta (row 6)** — 0.19.2 installs cleanly on Linux x86_64. The missing-asset
  risk is Intel-Mac-specific only, as the doc says.
- **tokei (row 14)** — the doc lists `aqua:XAMPPRocky/tokei` as an alternative to
  `cargo:tokei`. The aqua spec **resolves** (`ls-remote` lists up to 15.0.0) but
  **cannot install**, with an explicit error:

  ```
  package type `cargo` is not supported in the aqua backend.
  Use the cargo backend instead: cargo:tokei.
  ```

  So the outcome (❌) is right but the reason in the doc ("no prebuilt binaries
  upstream") is imprecise, and `aqua:XAMPPRocky/tokei` should be **removed** from the
  catalog rather than listed as an option — it resolves, which means a naive
  "does `ls-remote` work?" validation would wrongly mark it green.

- **universal-ctags (row 7)** — confirmed: `mise ERROR universal-ctags not found in
  mise tool registry`. Linux fallback exists and is easy: `apt` candidate
  **6.2.1-1** is available on Ubuntu 26.04 (`apt install universal-ctags`).

---

## 3. `rtk init` per-agent behaviour on Linux (Task 6)

Run against the pinned **rtk 0.49.0**, each in a fresh `HOME` + project dir.
All exited 0 and wrote exactly what `RTK_INIT_FLAGS` expects:

| Invocation | Exit | Files written |
|---|---|---|
| `rtk init --codex` | 0 | `./RTK.md`, `./AGENTS.md` (adds `@RTK.md` ref). **No hooks** — rtk states Codex CLI has no command hook, so the agent is told to prefix `rtk` itself |
| `rtk init --copilot` | 0 | `./.github/copilot-instructions.md`, `./.github/hooks/rtk-rewrite.json` |
| `rtk init -g --opencode` | 0 | `$XDG_CONFIG_HOME/opencode/plugins/rtk.ts` (respects `XDG_CONFIG_HOME`) |
| `rtk init` (default, Claude) | 0 | `./CLAUDE.md`, `./.rtk/filters.toml` |

**`RTK_INIT_FLAGS` in `src/toolchain/rtk.ts` is correct on Linux at 0.49.0.**

### ⚠️ `--codex` and `--copilot` are undocumented at 0.49.0

`rtk init --help` on 0.49.0 lists only `-g/--global`, `--opencode`, `--gemini`,
`--agent <AGENT>`, `--show`, `--claude-md`, `--hook-only`. There is **no `--codex`
and no `--copilot`** in the help, and the `--agent` enum
(`claude, cursor, windsurf, cline, kilocode, antigravity, kimi, pi, hermes, droid,
vibe, omp`) doesn't contain them either. They still work — but agentenv is depending
on two hidden flags. That's a real pin-bump hazard: they could vanish in 0.50 without
appearing in a changelog diff of documented flags. Suggest asserting both in
`smoke.yml` (already partly there) and noting the dependency in
`docs/research/rtk-init-delegation.md`.

### ⚠️ Stale claim: rtk does not write a `settings.json` hook

`phase0-findings.md` §4 states `rtk init` (default) writes *"`PreToolUse` hook in
`settings.json` calling `rtk hook claude`"*. On Linux at 0.49.0 it writes
`CLAUDE.md` + `.rtk/filters.toml` and **no `settings.json` at all**.
`rtk init --hook-only` refuses without `--global`:

```
[warn] Warning: --hook-only only makes sense with --global
```

This does not break agentenv — the Claude adapter hand-writes its own hook — but it
invalidates the Phase 2 rationale in the dev plan (*"Claude adapter stays hand-written
since it is the exact hook shape rtk produces"*). At the pinned version that shape is
no longer observable, so the hand-written hook is now unverified against rtk, not
matched to it.

### Side effect worth surfacing

Every `rtk init` creates `~/.local/share/rtk/history.db` — a command-history database
in the user's home. `agentenv apply` will therefore create one. Phase 4's transparency
log is a good place to mention it.

---

## 4. agentenv CI suite on Linux

Run from a clean `npm ci` on Node 24.18.0:

| Step | Result |
|---|---|
| `npm run build` (tsc) | clean |
| `npm run lint` (eslint, `--max-warnings 0`) | clean |
| `npm run format:check` (prettier) | clean |
| `npm test` (10 suites) | **all pass, 0 fail** |
| `npm run smoke` (stub mode) | OK — apply + status for all four agents |
| `npm run smoke:real` (real mise + real `rtk init`) | OK — same, with real rtk 0.49.0 |

`engines: node >=22.13.0` — Node 24.18.0 works fine, so the 22/24 CI matrix covers it.

---

## 5. Documentation defects found while reading

1. **`phase0-findings.md` §10 contradicts §6.** The checklist says
   *"Tech stack decided (**Go + Huh v2**)"*, §6 and ADR 0002 say TypeScript /
   @inquirer/prompts / commander. §6's own consequences list still carries
   *"⚠️ Go learning curve for contributors"* and *"Larger binary size than Rust"* —
   leftovers from the Go draft.
2. **`AGENTS.md` points at `docs/decisions/0001-cli-tech-stack.md`;** the file on disk
   is `0002-cli-tech-stack.md`. (The dev plan correctly says 0002.)
3. **`phase0-findings.md` §8 lists the example `agentenv.toml` as "⏳ Pending —
   to be created by Task 10 Step 3"**, and §10's last checkbox is unticked with
   *"Phase 0 is complete once the example agentenv.toml is created"*. But
   `agentenv.toml.example` exists at the repo root (7.2 kB). Either tick the box or
   say why the root file isn't the deliverable — as written, Phase 0 reads as
   incomplete while the README says it's complete.
4. **Summary statistics table (§1)** says "Validated (High Confidence) | 16" and then
   lists 17 tools, including "tokei (Windows only)" which is marked ❌ FAIL on Windows
   in the table directly above it.

---

## 6. Suggested edits to the Linux column

| Row | Was | Should be |
|---|---|---|
| eza | ✅ High (inferred) | ✅ Verified — vfox backend installs on Ubuntu 26.04 |
| git-delta | ✅ High (inferred) | ✅ Verified — 0.19.2 x86_64 |
| tokei | ❌ Low | ❌ Verified — aqua spec resolves but install rejects cargo package type; use `cargo:tokei` (needs Rust) |
| universal-ctags | ❌ Low | ❌ Verified — not in registry; Linux fallback `apt install universal-ctags` (6.2.1-1) |
| all 15 others | ✅ High (inferred) | ✅ Verified, with pinned versions above |

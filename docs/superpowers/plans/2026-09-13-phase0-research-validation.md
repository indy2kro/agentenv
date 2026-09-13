# Phase 0 — Research & Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the validated, evidence-backed inputs that every later phase of
`agentenv` depends on: a confirmed tool catalog (does every Tier 1–3 tool
actually resolve through mise?), a re-verified agent adapter table, confirmed
`rtk init` behavior per agent, a confirmed Tier 0 (Windows shell) fix
mechanism, a chosen CLI tech stack, and a hand-written example
`agentenv.toml`. Phase 0 produces **no application code** — its deliverable
is a set of research documents plus one example config file that Phase 1
will read as ground truth.

**Architecture:** Each task is a self-contained research spike that runs
concrete verification commands (or reads primary-source docs/release
metadata) and writes its findings to a dedicated markdown file under
`docs/research/` or `docs/decisions/`. The final task consolidates all
prior outputs into one findings doc and the example `agentenv.toml`. Tasks
run in order — later tasks (especially the final one) read the outputs of
earlier ones.

**Tech Stack:** mise (already installed, v2026.9.5+, Windows x64), rtk
(already installed, v0.42.4), git for Windows / Git Bash, markdown for all
research outputs. This machine is Windows-only — macOS/Linux tool
resolution must be verified via mise's own backend/registry metadata and
each tool's published release assets (research), not by executing on those
OSes; that execution gap is called out explicitly in Task 2 and carried
forward to the Phase 5 CI matrix (already in the roadmap) as the point
where it gets closed with real execution.

**Spec:** `docs/plans/agentenv-dev-plan.md` (sections referenced below use
`§N` to point at that file)

## Global Constraints

- v1 must support these four agents day one: Claude Code, OpenAI Codex CLI,
  GitHub Copilot (CLI/Chat), OpenCode (§1).
- Core (tool installation, instruction content, config format) must stay
  agent-agnostic; a 5th agent is an adapter, not a redesign (§1, §5, §11).
- Target platforms: Windows, macOS, Linux (§1).
- Config format is TOML, single source of truth `agentenv.toml` (§6.4).
- Non-goals stay authoritative: no custom installer/package manager, no
  forking CLI tools, no hand-maintained per-OS shell scripts (§2).
- Phase 0 produces no code — only validated research + one example config
  (§8, Phase 0).
- Tool catalog is fixed by tier in §3: Tier 1 = ripgrep, fd, jq, rtk;
  Tier 2 = ast-grep, git-delta, universal-ctags, gh; Tier 3 = yq, bat, eza,
  miller (`mlr`).

---

## Task 1: Verify Tier 1–3 tools resolve via mise on Windows

**Files:**
- Create: `docs/research/tier-tools-windows.md`

**Interfaces:**
- Produces: a per-tool table (tool name, tier, mise backend used, resolved
  version, install command that worked, pass/fail) that Task 7 copies into
  the consolidated findings doc verbatim.

- [ ] **Step 1: Confirm mise itself is available**

Run: `mise --version`
Expected: prints a version string (e.g. `2026.9.5 windows-x64 (...)`) with
exit code 0. If this fails, stop and report BLOCKED — Phase 0 cannot
proceed without mise on at least one OS.

- [ ] **Step 2: Create an isolated scratch mise project (do not touch global mise config)**

Run (from the repo root, in Git Bash):
```bash
mkdir -p /tmp/agentenv-phase0-mise && cd /tmp/agentenv-phase0-mise
cat > mise.toml <<'EOF'
[tools]
ripgrep = "latest"
fd = "latest"
jq = "latest"
EOF
```

- [ ] **Step 3: Install and verify Tier 1 tools (minus rtk, already separately confirmed installed)**

Run: `cd /tmp/agentenv-phase0-mise && mise install`
Record the exit code and full output.

Then run each of these and record stdout + exit code:
```bash
mise exec -- rg --version
mise exec -- fd --version
mise exec -- jq --version
```
For `rtk`, it is already installed on this machine outside mise (confirmed
via `rtk --version` → `rtk 0.42.4`, resolved to the `rtk-ai.rtk` winget
package, not the colliding `reachingforthejack/rtk` per `RTK.md`'s warning).
Separately check whether mise has a registry entry for it: run
`mise registry | grep -i rtk` (or `mise registry rtk` if that subcommand
exists in this mise version — try `mise registry --help` first to confirm
the right invocation) and record whether mise can resolve `rtk` at all, or
whether it must stay a "custom tool" (§6.3) pointing at the existing binary
path.

- [ ] **Step 4: Install and verify Tier 2 tools**

Update `/tmp/agentenv-phase0-mise/mise.toml` to add:
```toml
[tools]
"ast-grep" = "latest"
"git-delta" = "latest"
"universal-ctags" = "latest"
gh = "latest"
```
Run `mise install`, then verify each with `mise exec -- <bin> --version`
where the binary names are `sg` (ast-grep), `delta` (git-delta), `ctags`
(universal-ctags), `gh` (GitHub CLI). Record exit codes and versions. If
`gh` is already present on `PATH` outside mise, note that but still confirm
mise's own resolution succeeds or fails independently (don't let an
already-present system binary mask a mise resolution failure — check with
`mise which gh` after install).

- [ ] **Step 5: Install and verify Tier 3 tools**

Update `mise.toml` to add:
```toml
[tools]
yq = "latest"
bat = "latest"
eza = "latest"
mlr = "latest"
```
Run `mise install`, then verify each with `--version` through `mise exec`.
Record exit codes and versions.

- [ ] **Step 6: Write the findings file**

Create `docs/research/tier-tools-windows.md` with one markdown table:

| Tool | Tier | mise backend (from `mise install` output, e.g. `aqua:...`, `ubi:...`, `asdf:...`) | Resolved version | Windows result (PASS/FAIL) | Notes |
|---|---|---|---|---|---|

One row per tool (11 rows: ripgrep, fd, jq, rtk, ast-grep, git-delta,
universal-ctags, gh, yq, bat, eza, mlr — note rtk is the special case from
Step 3, mark its row's backend column as `n/a (external winget install)` if
mise has no registry entry for it). Below the table, add a short "Failures"
subsection listing any tool that did not resolve, with the exact error
output, so Task 7 and later phases know what needs a fallback plan.

- [ ] **Step 7: Clean up the scratch project**

Run: `rm -rf /tmp/agentenv-phase0-mise`
Confirm `git status` in the repo shows no stray changes from this task
other than the new `docs/research/tier-tools-windows.md` file.

- [ ] **Step 8: Commit**

```bash
git add docs/research/tier-tools-windows.md
git commit -m "docs: verify Tier 1-3 tool resolution via mise on Windows"
```

---

## Task 2: Research Tier 1–3 tool resolution on macOS/Linux (no execution available)

**Files:**
- Create: `docs/research/tier-tools-crossplatform.md`

**Interfaces:**
- Consumes: the tool list and Windows results from Task 1
  (`docs/research/tier-tools-windows.md`) — read that file first so this
  task's table can note where Windows already failed vs. where only
  macOS/Linux is unverified.
- Produces: a per-tool, per-OS (macOS, Linux) confidence table that Task 7
  copies into the consolidated findings doc, plus an explicit list of
  which tools need real execution in the Phase 5 CI matrix before they can
  be trusted.

- [ ] **Step 1: Read Task 1's output**

Read `docs/research/tier-tools-windows.md` in full.

- [ ] **Step 2: For each of the 12 tools, check published release assets**

For each tool (ripgrep, fd, jq, rtk, ast-grep, git-delta, universal-ctags,
gh, yq, bat, eza, mlr), use WebFetch/WebSearch to check the tool's GitHub
releases page (or, for jq, its official release page) for the presence of
prebuilt `darwin`/`macos` and `linux` archives (not source-only). Record,
per tool: whether macOS and Linux prebuilt binaries exist upstream (this is
what mise's generic/aqua/ubi backends need to install without a
per-tool plugin).

- [ ] **Step 3: Check mise's own backend registry for each tool**

Run: `mise registry` (on this Windows machine, listing is OS-independent —
mise's registry metadata is the same file regardless of host OS) and
`grep` for each of the 12 tool names. Record which backend mise uses for
each (`aqua:`, `ubi:`, `asdf:`, `core:`, etc.) — a `core:` or `aqua:`-backed
tool is high-confidence cross-platform since those backends carry
per-OS/arch asset maps; a bare `ubi:` entry is lower-confidence and worth
flagging for a closer look in Task 7's risk notes.

- [ ] **Step 4: Write the findings file**

Create `docs/research/tier-tools-crossplatform.md` with:
- One table: Tool | macOS prebuilt asset exists (Y/N + link) | Linux
  prebuilt asset exists (Y/N + link) | mise backend | Confidence
  (High/Medium/Low) | Notes
- A "Needs CI verification" list: every tool marked Medium/Low confidence,
  or any tool that failed on Windows in Task 1 — these are the ones the
  Phase 5 CI matrix (§8, Phase 5) must smoke-test on real macOS/Linux
  runners before Phase 1's tool catalog is trusted as final.

- [ ] **Step 5: Commit**

```bash
git add docs/research/tier-tools-crossplatform.md
git commit -m "docs: research macOS/Linux tool resolution via mise registry"
```

---

## Task 3: Re-verify the agent adapter table (§4)

**Files:**
- Create: `docs/research/agent-adapters.md`

**Interfaces:**
- Produces: an updated version of the §4 table (instructions file +
  hook/extensibility mechanism per agent), with a changed/confirmed marker
  per row, that Task 7 copies into the consolidated findings doc.

- [ ] **Step 1: Re-check Claude Code's mechanism**

Use WebFetch/WebSearch against Claude Code's official docs to confirm:
does Claude Code read `AGENTS.md` natively yet, or still require a
`CLAUDE.md` pointer? What are the current hook file locations and hook
event names (`SessionStart`, `PreToolUse`, etc.)? Record findings with the
doc URL(s) used as sources.

- [ ] **Step 2: Re-check Codex CLI's mechanism**

Use WebFetch/WebSearch against OpenAI Codex CLI docs to confirm the
`AGENTS.md` support claim, and the current location/format of
`~/.codex/config.toml` and/or `~/.codex/hooks.json` / `<repo>/.codex/hooks.json`,
and which hook events are supported. Record findings with sources.

- [ ] **Step 3: Re-check GitHub Copilot CLI/Chat's mechanism**

Use WebFetch/WebSearch against GitHub Copilot CLI docs to confirm
`AGENTS.md` support, the `.github/copilot-instructions.md` fallback, and
the current hook file location (`~/.copilot/hooks/`) and config location
(`~/.config/github-copilot/config.json`). Record findings with sources.

- [ ] **Step 4: Re-check OpenCode's mechanism**

Use WebFetch/WebSearch against OpenCode docs to confirm `AGENTS.md`
support, the plugin-script mechanism location
(`~/.config/opencode/plugins/`), and config file name/format
(`opencode.json`/`opencode.jsonc`). Record findings with sources.

- [ ] **Step 5: Write the findings file**

Create `docs/research/agent-adapters.md` with a markdown table matching
§4's shape (Agent | Instructions file | Hook/extensibility mechanism) plus
two extra columns: "Confirmed unchanged? (Y/N)" and "Source URL(s)". Add a
short note under any row that changed from §4, explaining exactly what's
different so Task 7 can flag it as a spec update needed before Phase 1/2.

- [ ] **Step 6: Commit**

```bash
git add docs/research/agent-adapters.md
git commit -m "docs: re-verify agent adapter table against current agent versions"
```

---

## Task 4: Confirm `rtk init` behavior per agent

**Files:**
- Create: `docs/research/rtk-init-behavior.md`

**Interfaces:**
- Consumes: `docs/research/agent-adapters.md` from Task 3 (read it first —
  rtk's per-agent hook writers need to match each agent's real hook
  format).
- Produces: a per-agent description of exactly what `rtk init <agent>`
  writes/changes, used by Task 7 and later by the Phase 1 Claude Code
  adapter implementer.

- [ ] **Step 1: Inspect rtk's own help output**

Run: `rtk --help` and `rtk init --help` (or `rtk proxy init --help` if
`init` is a subcommand under a different verb — check `rtk --help`'s
output first to find the right invocation). Record the full output.

- [ ] **Step 2: Confirm Claude Code behavior directly from this machine's config**

This machine already has rtk wired into Claude Code (per
`C:\Users\cradu\.claude\CLAUDE.md`'s "Ruflo Integration" note and
`RTK.md`'s hook-based usage description). Read
`C:\Users\cradu\.claude\settings.json` if it exists (or the project-level
`.claude/settings.json` if this repo has one) and record exactly which
hook entries rtk added (event name, matcher, command) as a concrete
worked example.

- [ ] **Step 3: Research rtk init for Codex CLI, Copilot, OpenCode**

Use WebFetch/WebSearch against rtk's own docs/README
(https://github.com/rtk-ai/rtk) to find whether `rtk init` supports Codex
CLI, GitHub Copilot, and OpenCode specifically (the dev plan's §3 rtk
bullet claims "native init support for multiple agents" — confirm this is
still true and get the exact per-agent commands/output shape). If rtk's
docs don't cover an agent, record that gap explicitly rather than guessing.

- [ ] **Step 4: Write the findings file**

Create `docs/research/rtk-init-behavior.md` with one subsection per agent
(Claude Code, Codex CLI, Copilot, OpenCode): what `rtk init` writes, where,
and any gaps found in Step 3.

- [ ] **Step 5: Commit**

```bash
git add docs/research/rtk-init-behavior.md
git commit -m "docs: confirm rtk init behavior per target agent"
```

---

## Task 5: Confirm the Tier 0 shell detection/fix approach

**Files:**
- Create: `docs/research/tier0-shell-fix.md`

**Interfaces:**
- Consumes: `docs/research/agent-adapters.md` (Task 3) for each agent's
  config file location.
- Produces: a concrete, per-agent description of (a) how to detect which
  shell the agent currently executes commands through on Windows, and (b)
  the exact config change that points it at Git Bash's `bash.exe` instead —
  used directly by the Phase 1 "Tier 0 shell detection/fix" implementation
  task.

- [ ] **Step 1: Confirm Git Bash's location and bundled tools on this machine**

Run: `where bash` and `bash -lc "which grep sed awk find diff tar gzip curl cat ls mkdir rm cp mv less"`
Record the resolved path to `bash.exe` (should be under
`...\Git\bin\bash.exe` or `...\Git\usr\bin\bash.exe`) and confirm each
listed tool resolves inside that bash.

- [ ] **Step 2: Research how Claude Code selects its execution shell on Windows**

Use WebFetch/WebSearch against Claude Code docs/settings schema to find
the config key that sets the shell/terminal Claude Code uses for Bash-tool
execution on Windows (e.g. a `shell` setting or environment variable).
Record the exact key name and expected value format.

- [ ] **Step 3: Research the same for Codex CLI, Copilot, OpenCode**

For each, use WebFetch/WebSearch to find whether/how the agent's config
lets you pin the shell executable on Windows, or whether it always shells
out through `cmd.exe`/PowerShell with no override (record this as a hard
gap if so — it changes the Tier 0 fix from "config" to "not currently
possible" for that agent).

- [ ] **Step 4: Write the findings file**

Create `docs/research/tier0-shell-fix.md` with one subsection per agent:
detection method (what to check to know if it's already using Git Bash)
and fix method (exact config key/value, or "no override available" if
Step 3 found a hard gap for that agent).

- [ ] **Step 5: Commit**

```bash
git add docs/research/tier0-shell-fix.md
git commit -m "docs: confirm Tier 0 Windows shell detection/fix per agent"
```

---

## Task 6: Decide the CLI implementation language and TUI library

**Files:**
- Create: `docs/decisions/0001-cli-tech-stack.md`

**Interfaces:**
- Produces: a committed decision (language + TUI library + rationale) that
  every later phase's implementation tasks assume as given.

- [ ] **Step 1: Confirm the candidate from the spec is still viable**

The spec (§6.2) names Go + `charmbracelet/huh` or `bubbletea` as the
candidate, citing "single static binary, no runtime dependency." Use
WebFetch/WebSearch to confirm both libraries are still maintained (check
last release date and open critical issues) and that they build/cross-compile
cleanly for windows/darwin/linux targets (check their own CI badges/docs
for a cross-compile matrix).

- [ ] **Step 2: Check at least one alternative for contrast**

Pick one concrete alternative stack (e.g. Rust + `ratatui`, or Node.js +
`ink`) and use WebFetch/WebSearch to note its distribution story
(single-binary via `cargo install`/cross-compile vs. requiring a Node
runtime on the target machine) — this is the axis the spec already cares
about ("no runtime dependency for the end user").

- [ ] **Step 3: Write the decision**

Create `docs/decisions/0001-cli-tech-stack.md` as a short ADR with these
sections: Context (link back to §6.2's constraint), Decision (the chosen
language + TUI library, pinned to a specific minimum version), Alternatives
considered (the one from Step 2, with why it was rejected), Consequences
(what this locks in for `cmd/agentenv/` in §7's proposed repo structure).

- [ ] **Step 4: Commit**

```bash
git add docs/decisions/0001-cli-tech-stack.md
git commit -m "docs: decide CLI implementation language and TUI library (ADR 0001)"
```

---

## Task 7: Consolidate Phase 0 findings and produce the example `agentenv.toml`

**Files:**
- Create: `docs/research/phase0-findings.md`
- Create: `agentenv.toml.example`

**Interfaces:**
- Consumes: every file produced by Tasks 1–6 (`tier-tools-windows.md`,
  `tier-tools-crossplatform.md`, `agent-adapters.md`,
  `rtk-init-behavior.md`, `tier0-shell-fix.md`,
  `0001-cli-tech-stack.md`) — read all six in full before writing.
- Produces: the single document Phase 1 planning reads as its input, plus
  a concrete example of the config format described in §6.3/§6.4 that
  Phase 1's schema implementation is validated against.

- [ ] **Step 1: Read all six prior research documents**

Read, in order: `docs/research/tier-tools-windows.md`,
`docs/research/tier-tools-crossplatform.md`,
`docs/research/agent-adapters.md`, `docs/research/rtk-init-behavior.md`,
`docs/research/tier0-shell-fix.md`, `docs/decisions/0001-cli-tech-stack.md`.

- [ ] **Step 2: Write the consolidated findings doc**

Create `docs/research/phase0-findings.md` with these sections, each one
either the relevant table copied in directly or a link to the source file
plus a one-paragraph summary:
1. Tool catalog validation (Tier 1–3, Windows-confirmed + cross-platform
   confidence) — flag any tool that must move to "custom tool" treatment
   per §6.3/§10 because it failed to resolve.
2. Agent adapter table (updated, with what changed vs. spec §4).
3. `rtk init` per-agent behavior summary.
4. Tier 0 shell fix per-agent summary.
5. Chosen tech stack (link to the ADR).
6. Open risks carried into Phase 1 (pull directly from each research doc's
   "Failures"/"gap"/"Needs CI verification" notes — do not silently drop
   any of them).

- [ ] **Step 3: Write the example config**

Create `agentenv.toml.example` at the repo root, by hand, matching §6.3
and §6.4's shape exactly: a top-level scope indicator, an enabled-agents
list, a tools section reflecting the Tier 1–3 catalog validated in Step 2
(mark any tool that failed validation with a comment noting the fallback),
and at least one `[[custom_tools]]` entry of each kind shown in §6.3
(one `already_installed = true` entry, one `mise_source` entry) so the
format is unambiguous to whoever writes the real TOML schema in Phase 1.

- [ ] **Step 4: Self-review against the spec**

Re-read `docs/plans/agentenv-dev-plan.md` §8's Phase 0 bullet list (five
items: re-verify adapter table, confirm tool resolution, confirm Tier 0
fix, confirm rtk init, decide tech stack) and confirm
`docs/research/phase0-findings.md` visibly addresses all five, plus the
stated Phase 0 output ("validated tool catalog + adapter table, chosen
tech stack, a hand-written example agentenv.toml"). Fix any gap found
before moving on.

- [ ] **Step 5: Commit**

```bash
git add docs/research/phase0-findings.md agentenv.toml.example
git commit -m "docs: consolidate Phase 0 findings and add example agentenv.toml"
```

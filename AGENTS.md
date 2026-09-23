# Agent instructions for the agentenv repo

Instructions for AI coding agents contributing to this repository (the
`agentenv` project itself — not the instructions `agentenv` generates for
other repos; those are written by `cmd/agentenv/src/generate/agentsmd.ts`).

## GitHub Actions

Always pin actions to a full commit SHA, never to a floating tag (`@v4`,
`@main`, etc.) — a tag can be moved to point at different, unreviewed code
after the fact; a SHA cannot. Add the human-readable version as a trailing
comment so the pin stays maintainable:

```yaml
- uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
```

When adding or updating a workflow step, resolve the SHA yourself (e.g.
`git ls-remote --tags <action-repo-url>`) — never guess or invent one.

Dependabot (`.github/dependabot.yml`) keeps the `github-actions` ecosystem
current — it opens PRs that bump the pinned SHA and its version comment
together, so the SHA-pinning rule above and Dependabot are meant to work
together, not in tension. Once the CLI tech stack is decided
(`docs/decisions/0002-cli-tech-stack.md`) and its module manifest exists,
add that ecosystem (e.g. `npm`) to `dependabot.yml` too.

## Remote operations

`origin` (`github.com/indy2kro/agentenv`) is a real, shared GitHub remote —
not a local-only sandbox. Never run `git push`, `git pull`, or `git fetch`
unless the human you're working with explicitly asks for it. If your local
branch and `origin` have diverged, stop and surface that rather than
resolving it yourself.

## What this repo is

`agentenv` is a thin orchestration + config layer that gives AI coding agents
(Claude Code, Codex CLI, Copilot, OpenCode) a consistent shell environment on
Windows/macOS/Linux. It never reimplements a dev tool: tool installation is
100% delegated to [mise](https://mise.jdx.dev), command rewriting/hooks to
[rtk](https://github.com/rtk-ai/rtk), and repo instructions follow the
[AGENTS.md](https://agents.md) standard. All the actual CLI code lives under
`cmd/agentenv/`; see `docs/README.md` for the docs index.

## Commands

All commands run from `cmd/agentenv/`:

```sh
npm run build          # tsc -> dist/
npm test               # build + run every dist/**/*.test.js via node:test
npm run test:coverage  # npm test + a line/branch/function coverage gate (CI: ubuntu + node 24 only)
npm run lint           # eslint src --max-warnings 0
npm run lint:fix
npm run format         # prettier --write src
npm run format:check
npm run smoke          # build + node scripts/smoke.mjs (stub rtk, deterministic)
npm run smoke:real     # build + node scripts/smoke.mjs --real (real mise + rtk init)
```

- `npm test` is `npm run build && cd dist && node --test`: Node's built-in
  test runner auto-discovers every compiled `*.test.js` recursively, so a new
  `*.test.ts` file (mirroring the source file it covers — `foo.ts` →
  `foo.test.ts` in the same directory) is picked up automatically; nothing to
  register in `package.json`.
- To target a single test file directly:
  `npm run build && node --test dist/config/schema.test.js`.
- `npm run test:coverage` gates on `--test-coverage-lines=80
  --test-coverage-branches=75 --test-coverage-functions=80` (Node's built-in
  `--experimental-test-coverage`), aggregate across the whole suite, not
  per-file. CI runs it once (ubuntu-latest, Node 24 only) — coverage doesn't
  vary by OS/Node version in practice, so gating every matrix combination
  would just multiply CI time for the same signal.
- `npm run prepare` wires Husky; the pre-commit hook runs
  `cd cmd/agentenv && npx lint-staged` (eslint --fix + prettier on staged
  `*.ts`).
- CI (`.github/workflows/ci.yml`) has three jobs: `lint-repo` (ubuntu-only,
  once — `actionlint` against `.github/workflows/*.yml`, which also
  shellchecks every embedded `run:` script, plus `gitleaks`) on every
  push/PR; `build-test` (windows/macos/ubuntu × Node 22/24 matrix — build,
  lint, format:check, test, stub smoke, and a CLI-surface check that
  version/help/completion work and cover every command) on every push/PR;
  and `acceptance` (real mise + `npm run smoke:real`, gated on `build-test`)
  on PRs, `main` pushes, and manual dispatch. Treat all four local gates
  (build, lint, format:check, test) as required before considering work
  done.
- Releases are one-button via the `Release` GitHub Actions workflow, never a
  manual `npm publish` — see `docs/guides/releasing.md`.

## Architecture

Everything flows from one user-authored file, `agentenv.toml` (schema in
`src/config/schema.ts`), resolved to either the project root or
`~/.config/agentenv/` (`src/config/scopes.ts`). This repo dogfoods its own
project-scope `agentenv.toml` (repo root) to pin the linters `lint-repo`
runs (`actionlint`, `gitleaks`, `shellcheck`) via mise — it declares no
`[agents]`, so running `agentenv apply` here also wires the default agents
(Claude Code, Codex CLI); do that deliberately, not as a side effect of
testing something else. `agentenv apply`
(`src/commands/apply.ts`, `applyConfiguration()`) is the single pipeline all
of `setup`/`configure`/`apply` funnel into, in this fixed order:

1. **Prerequisite check** — mise must be installed and on PATH, or apply
   fails fast with install instructions (`src/toolchain/mise.ts`).
2. **Tier 0** — Windows shell fix: detect/point agents at Git Bash's POSIX
   toolchain (`src/shell/detector.ts`).
3. **mise.toml generation** — config's `[tools]`/`[[custom_tools]]` become a
   generated `mise.toml` (`src/toolchain/mise.ts`), then `mise install` runs
   and tool PATH availability is verified.
4. **Instruction files** — `AGENTS.md`/`CLAUDE.md` are regenerated
   (`src/generate/agentsmd.ts`), but only inside a marker-block
   (`<!-- agentenv-managed-start/end -->` by default); hand-written content
   outside the markers is never touched. This is the same mechanism that
   generated the section of *this* file above — don't hand-edit generated
   blocks in output repos, but this repo's own `CLAUDE.md`/`AGENTS.md` are
   hand-maintained project docs, not `agentenv apply` output.
5. **Per-agent adapters** (`src/adapters/`) — one `BaseAdapter` subclass per
   agent: hand-written `claude.ts` plus thin `RtkDelegationAdapter` subclasses
   for `codex.ts`, `copilot.ts`, `opencode.ts`, `gemini.ts`, `cursor.ts`,
   `windsurf.ts`, `cline.ts`, `vibe.ts` — the full list in `adapters/index.ts`.
   Claude Code's adapter is hand-written (matches the exact hook shape
   `rtk init` would produce); every other adapter delegates to a real or
   injectable `rtk init` runner (`src/toolchain/rtk.ts`,
   `src/adapters/rtk-delegation.ts`) rather than hand-rolling hook files — see
   `docs/research/rtk-init-delegation.md` for why.
6. **Optional integrations** (`src/integrations/`) — a second, parallel
   adapter contract (`IntegrationAdapter` in `integrations/base.ts`) for
   third-party installers that agentenv invokes but doesn't own the config
   of (currently Superpowers, `integrations/superpowers.ts`). Contrast with
   step 5: agent adapters *own* agentenv-generated files; integration
   adapters *observe/invoke* someone else's installer and report
   `detect`/`apply`/`status` results. Superpowers is wired into
   `apply`/`status`/`setup` (`src/commands/apply.ts`,
   `src/commands/status.ts`, `src/integrations/`) behind
   `[integrations.superpowers]` in the config schema.

`agentenv status` (`src/commands/status.ts`) walks the same config to report
drift (configured vs. actually installed/on-PATH) without changing anything.
`agentenv doctor` (`src/commands/doctor.ts`) is a standalone read-only
environment sanity check (mise, shims dir, shell, config, per-agent binary
detection); it loads and validates a config when one exists but never changes
anything. `agentenv shell-fix` (`src/commands/shell-fix.ts`) is
the read/revert side of step 2: `apply` records every per-user Tier 0 edit in a
manifest (`src/shell/shell-fix-state.ts`, at
`userConfigDir()/shell-fix-state.json`) and `--revert` restores the recorded
prior values, refusing to touch a value the user changed after agentenv wrote
it.

Adding a new agent means adding one `BaseAdapter` implementation (for the
common rtk-delegated case a one-file `RtkDelegationAdapter` subclass, see
`src/adapters/windsurf.ts` as the template) and wiring it into the index
(`src/adapters/index.ts`), `AGENT_COMMANDS` in `src/adapters/detect.ts`, and
any config-key mapping in `src/config/schema.ts` — see
`docs/guides/adding-an-adapter.md`. The core (config schema, mise/rtk
invocation, marker-block generation) should not need to change.

## Testing conventions

Tests are `node:test` + `node:assert`, one `*.test.ts` beside the module it
covers, compiled and run from `dist/`. Several tests use injectable
dependencies instead of hitting the real world — e.g. `rtkInit`
(`RtkInitFn`) and `superpowersDeps`/`ClaudeCliRunner` are passed through
`ApplyOptions` specifically so `apply.test.ts` can stub `rtk`/`claude`
subprocess calls rather than requiring them installed in CI.

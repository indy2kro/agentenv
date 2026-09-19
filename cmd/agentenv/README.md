# agentenv (CLI source)

This directory is the active implementation of `agentenv`: a TypeScript CLI
that gives AI coding agents (Claude Code, Codex CLI, GitHub Copilot, OpenCode,
Gemini CLI, Cursor, Windsurf, Cline CLI, Mistral Vibe) a consistent shell
environment. It drives [mise](https://mise.jdx.dev) for tool installation,
[rtk](https://github.com/rtk-ai/rtk) for command rewriting + hooks, and
generates `AGENTS.md`/`CLAUDE.md` from one `agentenv.toml`.

- **User guide** (install, every command, exit codes, troubleshooting):
  [`../../docs/usage.md`](../../docs/usage.md)
- **Config reference** (all of `agentenv.toml`, the tool catalog, custom
  tools, integrations): [`../../docs/configuration.md`](../../docs/configuration.md)
- **Docs index**: [`../../docs/README.md`](../../docs/README.md)

## Install

### From npm

```sh
npm install -g @indy2kro/agentenv
```

The package is scoped (plain `agentenv` was taken); the installed command is
still plain `agentenv`.

### From source

```sh
git clone https://github.com/indy2kro/agentenv.git
cd agentenv/cmd/agentenv
npm install
npm run build
npm link          # makes `agentenv` available globally on PATH
```

`npm link` symlinks this checkout's `dist/index.js` as the global `agentenv`
binary — rerun `npm run build` after pulling, no need to link again. Prefer
not to touch global state? Run in place:

```sh
node dist/index.js setup
```

## Development

All commands run from this directory.

```sh
npm run build         # tsc -> dist/
npm test              # build + run every dist/**/*.test.js via node:test
npm run lint          # eslint src --max-warnings 0
npm run format:check  # prettier --check src
npm run smoke         # stub mode — deterministic, no real mise/rtk
npm run smoke:real    # real mise + rtk; installs the full catalog and runs the
                      # install -> uninstall roundtrip (destructive — removes
                      # every installed version of each catalog tool)
```

To target a single test file: `npm run build && node --test dist/config/schema.test.js`.

A new `*.test.ts` alongside the module it covers (mirroring `foo.ts` →
`foo.test.ts`) is picked up automatically by Node's recursive test discovery.
Tests use injectable dependencies for anything that would hit the real world
(e.g. `rtkInit`, `superpowersDeps`, `resolveBinary` — see `ApplyOptions` in
`src/commands/apply.ts`).

CI (`.github/workflows/ci.yml`) runs build/lint/format/test/smoke on a
windows/macos/ubuntu matrix, then a real-mise acceptance job on PRs and
`main`.

## Architecture

- `agentenv.toml` (schema: `src/config/schema.ts`) resolved from the project
  root or `~/.config/agentenv/` (`src/config/scopes.ts`).
- `agentenv apply` (`src/commands/apply.ts`) is the single pipeline
  `setup`/`configure`/`apply` funnel into: prerequisite check → Tier 0 Windows
  shell fix → `mise.toml` + `mise install` + verify → marker-block
  `AGENTS.md`/`CLAUDE.md` regeneration → per-agent adapters → optional
  integrations.
- Per-agent adapters in `src/adapters/`: a hand-written `claude.ts` plus
  rtk-delegating adapters for the rest (see
  [`../../docs/research/rtk-init-delegation.md`](../../docs/research/rtk-init-delegation.md)).
- `src/integrations/` holds the second, parallel adapter contract for
  third-party installers agentenv invokes but doesn't own (Superpowers).
- `agentenv status` (`src/commands/status.ts`) reports drift using the same
  per-tool classification as `apply`'s verify step
  (`toolAvailabilityClassification` in `src/toolchain/mise.ts`), so a tool
  `apply` deliberately skips is never flagged as drift elsewhere.

For wiring in a new agent, see
[`../../docs/guides/adding-an-adapter.md`](../../docs/guides/adding-an-adapter.md);
for the design rationale and roadmap,
[`../../docs/plans/agentenv-dev-plan.md`](../../docs/plans/agentenv-dev-plan.md).

## License

MIT
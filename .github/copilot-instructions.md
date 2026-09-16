# Copilot instructions for agentenv

This repository’s source of truth for repo-level guidance is `AGENTS.md`. Follow that file first. This file only captures the additional Copilot-specific working notes that are useful to keep nearby.

## Commands

Run all build/test/lint commands from `cmd/agentenv/`:

```sh
cd cmd/agentenv
npm install
npm run build
npm test
npm run lint
npm run format:check
```

For a single compiled test file:

```sh
cd cmd/agentenv
npm run build
node --test dist/config/schema.test.js
```

Use the same pattern for any `dist/**/*.test.js` target; the project relies on Node’s built-in test runner and compiles TypeScript before running tests.

## High-level architecture

- `agentenv.toml` is the user-authored source for configuration.
- The active implementation lives in `cmd/agentenv/`; `internal/` and `templates/` are still scaffolding/stubs.
- `agentenv apply` is the shared pipeline behind the setup/configure/apply flow: validate prerequisites, handle shell/toolchain setup, generate `mise.toml`, regenerate managed instruction blocks, and apply agent-specific adapter configuration.
- Agent-specific behavior is concentrated in `src/adapters/`; the project intentionally keeps the actual tool installation delegated to `mise` and hook behavior delegated to `rtk`.
- `agentenv status`/`doctor` are read-only checks for drift and environment health rather than mutation-heavy setup paths.

## Key conventions

- Keep generated files out of hand edits; if behavior needs to change, update the config or the generator path, then rerun the apply flow.
- Tests are colocated next to the module they cover and run from compiled output under `dist/`.
- The repo prefers injected dependencies in subprocess-heavy tests so CI does not depend on real `rtk`/agent installs.
- GitHub Actions in workflow files must pin actions to a full commit SHA and keep the human-readable version in a trailing comment.

Refer to `AGENTS.md` for broader repo rules and conventions, especially anything about workflow safety, environment constraints, and project-level expectations.

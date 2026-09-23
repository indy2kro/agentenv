# agentenv Documentation

The user-facing and maintainer docs for the `agentenv` project.

## For users

- **[`usage.md`](usage.md)** — the user guide: install, quick start, every
  command with flags and examples, unattended/CI use, `--json`, exit codes,
  Windows/Tier 0, troubleshooting.
- **[`configuration.md`](configuration.md)** — the `agentenv.toml` reference:
  every section and key with defaults, the full tool catalog, custom tools,
  version pins, rtk/tier0/generate/integrations, and validation rules.

Supporting references:

- [`guides/installing.md`](guides/installing.md) — the mise prerequisite in
  depth (the one hard requirement).
- [`guides/exit-codes.md`](guides/exit-codes.md) — the `0`/`1`/`2` exit-code
  contract and the exact `status` drift definition.

## For maintainers

- [`guides/adding-an-adapter.md`](guides/adding-an-adapter.md) — how to add a
  new supported AI coding agent.
- [`guides/releasing.md`](guides/releasing.md) — cutting an npm release
  (one-button `Release` workflow).

## Research & decisions

- [`research/`](research/) — validated findings behind implementation choices
  (e.g. [`superpowers-install-mechanisms.md`](research/superpowers-install-mechanisms.md)).
- [`decisions/`](decisions/) — architecture decision records
  (e.g. [`0002-cli-tech-stack.md`](decisions/0002-cli-tech-stack.md)).

Implemented phase plans and completed improvement-audit backlogs are removed
once their work lands (`git log -- docs/improvement-audit/` has the history);
the design rationale is captured in the files above. A still-open item from a
removed backlog stays tracked as a `TODO` comment at its actual call site
(e.g. `cmd/agentenv/src/commands/status.ts`'s windsurf/vibe rtk-install-path
note) instead of only living in a deleted doc.
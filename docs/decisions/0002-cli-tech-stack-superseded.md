# ADR 0002: CLI Implementation Language Pivot - TypeScript/Node.js

**Status:** Accepted  
**Date:** 2026-09-13  
**Author:** Cristian Radu  
**Supersedes:** ADR 0001 (0001-cli-tech-stack.md)  
**Related:** `docs/plans/agentenv-dev-plan.md` §6.2

## Context

ADR 0001 originally selected **Go + charmbracelet/huh** as the CLI tech stack, with the primary constraint being "zero runtime dependency for end users" — the goal was a single static binary that could be distributed without requiring users to install a runtime.

However, during Phase 0 research and validation, a critical observation emerged: **all four v1 target agents (Claude Code, Codex CLI, GitHub Copilot, OpenCode) already require Node.js 18+ to be installed on the user's machine.**

- Claude Code: Node.js-based CLI
- Codex CLI: Node.js-based
- GitHub Copilot CLI: Node.js-based
- OpenCode: Node.js-based

This means that **requiring Node.js as a runtime dependency for `agentenv` does not add any new burden to users** — they already have it installed as a prerequisite for using any of our target agents.

## Decision

**Language:** TypeScript (compiled to JavaScript/Node.js)  
**TUI Library:** @inquirer/prompts  
**CLI Framework:** commander  
**Config Parser:** toml (npm package)  
**Minimum Node.js Version:** 18.0.0  
**Build Tool:** TypeScript compiler (tsc)  
**Distribution:** npm package (`npm install -g agentenv`)  

### Rationale

#### TypeScript/Node.js as the Language

| Criterion | TypeScript/Node.js | Go (original choice) |
|---|---|---|
| Runtime dependency | ⚠️ Node 18+ required | ✅ Zero dependency (static binary) |
| Additional burden on users | ❌ **None** (already required by all v1 agents) | ✅ None |
| Distribution | ✅ `npm install -g agentenv`, updates via `npm update -g` | ✅ Single binary, GitHub releases |
| Cross-platform (Windows/macOS/Linux) | ✅ First-class support | ✅ First-class support |
| Build simplicity for contributors | ✅ `npm run build` | ✅ `go build` |
| Developer familiarity | ✅ High (JavaScript ecosystem widely known) | ⚠️ Moderate (Go less common for CLI tools) |
| Package management | ✅ npm handles dependencies automatically | ✅ Go modules, but manual binary builds |
| Ecoystem for TUI libraries | ✅ Mature (@inquirer/prompts, ink, etc.) | ✅ Mature (charmbracelet/huh, bubbletea) |

**TypeScript wins on practical grounds:** The runtime dependency criterion (the primary reason Go was chosen in ADR 0001) is **moot** because all target agents already require Node.js. Therefore, the only difference is developer ergonomics, and TypeScript provides:

1. **Easier distribution**: `npm install -g agentenv` is simpler than downloading and managing binary releases per OS/arch
2. **Automatic updates**: `npm update -g agentenv` handles version upgrades seamlessly
3. **Wider contributor pool**: JavaScript/TypeScript is more commonly known than Go
4. **Shared ecosystem**: Many CLI tools in the AI agent space (rtk, various agent frameworks) are already Node.js-based

#### @inquirer/prompts as the TUI Library

| Criterion | @inquirer/prompts | charmbracelet/huh v2 |
|---|---|---|
| Maintenance status (Sept 2026) | ✅ Actively maintained | ✅ Actively maintained |
| Cross-platform | ✅ Windows/macOS/Linux | ✅ Windows/macOS/Linux |
| Complexity for our use case | ✅ Low (declarative API for forms/wizards) | ✅ Low (declarative API) |
| Integration with ecosystem | ✅ Native npm package | ✅ Native Go |
| Maturity of form/checkbox support | ✅ Explicit primitives for forms | ✅ Explicit primitives for forms |

**@inquirer/prompts wins on ecosystem alignment:** It is the Node.js equivalent of Huh — declarative, actively maintained, and provides exactly the primitives we need (select, multi-select, confirm, input) for our wizard flow.

#### commander as the CLI Framework

| Criterion | commander | Custom | yargs | oclif |
|---|---|---|---|---|
| Simplicity | ✅ Very simple API | ⚠️ More work | ✅ Simple | ⚠️ Framework overhead |
| TypeScript support | ✅ Built-in | ✅ Native | ✅ Good | ✅ Good |
| Subcommand support | ✅ Native | ⚠️ Manual | ✅ Native | ✅ Native |
| Popularity | ✅ Very widely used | N/A | ✅ Widely used | ⚠️ Less common |

**commander wins on simplicity and popularity:** It is the most popular CLI framework for Node.js, has excellent TypeScript support, and provides exactly what we need for a multi-command CLI.

### Chosen Stack

| Component | Choice | Version | Rationale |
|---|---|---|---|
| Language | TypeScript | 5.0+ | Leverages Node.js (already required by all v1 agents), wide developer familiarity |
| TUI Library | @inquirer/prompts | ^1.0.0 | Declarative form/wizard primitives, cross-platform, actively maintained |
| CLI Framework | commander | ^12.0.0 | Simple API, TypeScript support, widely used, subcommand support |
| Config Parser | toml | ^3.0.0 | TOML parsing for agentenv.toml config files |
| Build Command | `tsc` | N/A | TypeScript compiler for ES module output |
| Package Manager | npm | 8+ | Standard Node.js package management |
| Import Path | `@inquirer/prompts`, `commander`, `toml` | N/A | All available via npm |
| Distribution | npm package | N/A | `npm install -g agentenv` |

## Alternatives Considered

### Alternative 1: Stick with Go + Huh (Original Decision)

**Rejected because:** While Go + Huh satisfies the zero runtime dependency criterion, that criterion is **no longer relevant** — all v1 agents require Node.js anyway. The practical benefits of TypeScript (easier distribution via npm, wider contributor pool, shared ecosystem) outweigh the theoretical benefit of zero runtime dependencies.

### Alternative 2: Rust + Ratatui (Original Alternative)

**Rejected because:** Same as ADR 0001 — Rust satisfies the single-binary/zero-dependency criterion, but the criterion is moot. Additionally, Rust has contributor friction (requires cargo toolchain) compared to Node.js/npm.

### Alternative 3: Node.js + Ink

**Rejected because:** Ink is a great TUI library, but @inquirer/prompts is more focused on our specific use case (forms/wizards) and has a simpler, more declarative API for the patterns we need (checkbox lists, confirmations, text inputs).

## Consequences

### Positive

1. **Seamless distribution**: Users can install with `npm install -g agentenv` and update with `npm update -g agentenv` — no manual downloads, no OS/arch-specific binaries to manage.
2. **Zero additional runtime burden**: Users already have Node.js installed (as a prerequisite for any v1 agent), so `agentenv` doesn't add any new dependency.
3. **Easier contributions**: More developers are familiar with TypeScript/JavaScript than Go, lowering the barrier to contribution.
4. **Shared ecosystem**: Integration with other Node.js-based tools (like rtk, which we already depend on) is more natural.
5. **Modern tooling**: TypeScript provides excellent developer experience with type checking, and npm handles dependency management automatically.
6. **Cross-platform consistency**: Node.js handles path separators, line endings, and other OS-specific details internally; the same code works on Windows/macOS/Linux.

### Negative / Trade-offs

1. **Runtime dependency**: Users need Node.js 18+ installed. **Mitigation:** This is already required by all v1 target agents, so there is no additional burden.
2. **Larger install footprint**: npm global packages include node_modules with all dependencies. **Mitigation:** Acceptable — modern systems have plenty of disk space, and the user experience is better.
3. **Version conflicts**: If users have old Node.js versions, they may need to upgrade. **Mitigation:** We specify `engines: { node: ">=18.0.0" }` in package.json, and npm will warn on incompatible versions.
4. **Slower startup**: Node.js CLI tools have a slight startup overhead compared to Go binaries. **Mitigation:** This is negligible for our use case (a configuration tool that runs infrequently).

### Locked-In Decisions

This decision **locks in** the following for `cmd/agentenv/`:

- **Source file extension:** `.ts` (TypeScript)
- **Package manager:** npm
- **Dependency:** `@inquirer/prompts`, `commander`, `toml`
- **Build output:** Compiled JavaScript in `dist/` directory
- **Build command:** `npm run build` (runs `tsc`)
- **Distribution:** npm package (`agentenv`)
- **Install command:** `npm install -g agentenv`
- **Update command:** `npm update -g agentenv`

This decision **does not** lock in:

- The internal package structure within `cmd/agentenv/`
- Specific form field choices (can be refined using @inquirer/prompts)
- The use of ES modules vs. CommonJS (TypeScript can output either)

## Links

- [@inquirer/prompts on GitHub](https://github.com/inquirerjs/inquirer/tree/main/packages/prompts)
- [commander on GitHub](https://github.com/tj/commander.js)
- [toml npm package](https://www.npmjs.com/package/toml)
- [TypeScript](https://www.typescriptlang.org/)
- [npm documentation](https://docs.npmjs.com/)
- [ADR 0001 (Superseded)](./0001-cli-tech-stack.md)

## Migration Notes

This ADR supersedes ADR 0001. The Go-based implementation in `cmd/agentenv/` (if any was started) should be replaced with the TypeScript implementation. The directory structure changes from Go conventions to Node.js/TypeScript conventions:

```
# Old (Go) - Superseded
cmd/agentenv/
├── main.go
├── go.mod
├── go.sum
└── internal/
    ├── config/
    ├── shell/
    ├── adapters/
    └── generate/

# New (TypeScript) - Current
cmd/agentenv/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── commands/
│   │   ├── setup.ts
│   │   ├── configure.ts
│   │   ├── apply.ts
│   │   └── status.ts
│   ├── config/
│   │   └── schema.ts
│   ├── shell/
│   │   └── detector.ts
│   ├── toolchain/
│   │   └── mise.ts
│   ├── generate/
│   │   └── agentsmd.ts
│   └── adapters/
│       ├── index.ts
│       ├── base.ts
│       ├── claude.ts
│       ├── codex.ts
│       ├── copilot.ts
│       └── opencode.ts
└── dist/
    └── index.js (compiled output)
```

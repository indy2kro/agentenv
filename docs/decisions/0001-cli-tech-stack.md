# ADR 0001: CLI Implementation Language and TUI Library

**Status:** Superseded by ADR 0002  
**Date:** 2026-09-13  
**Author:** Mistral Vibe (research phase)  
**Related:** `docs/plans/agentenv-dev-plan.md` §6.2

> **This ADR has been superseded by [ADR 0002](./0002-cli-tech-stack-superseded.md).**
>
> The decision to use Go + Huh v2 was reversed in favor of TypeScript/Node.js with @inquirer/prompts.
> See ADR 0002 for the current tech stack decision.

## Context

The `agentenv` CLI needs to provide an interactive terminal UI (menus, checkboxes,
confirmation screens) that behaves identically on Windows, macOS, and Linux
(§6.2). The CLI is an orchestrator — it never installs anything itself, only
drives mise/rtk and writes config files. The dev plan's spec (§6.2) proposed Go
as the candidate language, citing "single static binary, no runtime dependency" as
the key constraint.

The original spec named `charmbracelet/huh` or `bubbletea` as candidate TUI
libraries. This ADR re-verifies these candidates against current (September 2026)
reality and evaluates at least one alternative for contrast.

## Decision

**Language:** Go (Golang)  
**TUI Library:** `charm.land/huh/v2` (Huh v2)  
**Minimum Go Version:** 1.21+ (for Huh v2 compatibility)  
**Minimum Huh Version:** v2.0.3+

### Rationale

#### Go as the Language

| Criterion | Go | Rust | Node.js + Ink |
|---|---|---|---|
| Single static binary | ✅ Yes (via `go build -o agentenv`) | ✅ Yes (via `cargo install` or cross-compile) | ❌ No (requires Node runtime on target machine) |
| Cross-platform (Windows/macOS/Linux) | ✅ Yes (first-class support) | ✅ Yes (first-class support) | ⚠️ Partial (Windows support lags; runtime dependency) |
| Build simplicity for contributors | ✅ Simple (`go build`) | ⚠️ Moderate (Rust toolchain required) | ⚠️ Moderate (Node/npm required) |
| Distribution to end users | ✅ Zero runtime dependency | ✅ Zero runtime dependency | ❌ Runtime required (Node 18+) |
| Ecosystem for TUI libraries | ✅ Mature (charmbracelet ecosystem) | ✅ Mature (ratatui) | ✅ Mature (ink, react-blessed) |

**Go wins on the primary constraint:** zero runtime dependency for end users.
Both Go and Rust satisfy this, but Go has a simpler build story for contributors
who may not have the Rust toolchain installed. Node.js fails on the runtime
dependency criterion.

#### Huh v2 as the TUI Library

| Criterion | Huh v2 | Bubble Tea v2 | Ratatui (Rust) |
|---|---|---|---|
| Maintenance status (Sept 2026) | ✅ Actively maintained (v2.0.3, March 2026 major release) | ✅ Actively maintained (v2, ongoing updates) | ✅ Actively maintained (community-driven) |
| Cross-platform | ✅ Windows/macOS/Linux | ✅ Windows/macOS/Linux | ✅ Windows/macOS/Linux |
| Complexity for our use case | ✅ Low (declarative API for forms/wizards) | ⚠️ Medium (more low-level, requires manual state management) | ⚠️ Medium (Rust learning curve) |
| Integration with Go ecosystem | ✅ Native Go | ✅ Native Go | ❌ Requires Rust |
| Maturity of form/checkbox support | ✅ Explicit form/wizard primitives | ⚠️ Manual (must build from primitives) | ⚠️ Manual (must build from primitives) |

**Huh v2 wins on ergonomics for our specific use case:** The Simple/Advanced
wizard flow (§6.2) requires checkbox lists, confirmation screens, and review
screens. Huh v2 provides **declarative primitives** for exactly these patterns:
- `Form` with `Input`, `Select`, `MultiSelect`, `Confirm` field types
- Automatic layout, validation, and theming
- Built-in keyboard navigation that works identically across platforms

Bubble Tea is the foundation Huh is built on, but it's lower-level — you'd need
to manually manage form state, cursor position, and validation. For a
configuration-wizard use case, Huh's higher-level abstractions are a better fit.

Ratatui + Rust is a strong alternative stack overall, but loses on the language
decision (Rust toolchain requirement for contributors) and on ergonomics for
form-heavy UIs.

### Chosen Stack

| Component | Choice | Version | Rationale |
|---|---|---|---|
| Language | Go | 1.21+ | Single static binary, no runtime dependency, simple build |
| TUI Library | charmbracelet/huh | v2.0.3+ | Declarative form/wizard primitives, cross-platform, actively maintained |
| Build Command | `go build -o agentenv ./cmd/agentenv` | N/A | Produces single static binary for all three OSes |
| Import Paths | `charm.land/huh/v2` | v2 | Migrated to vanity paths in March 2026 |

## Alternatives Considered

### Alternative 1: Go + Bubble Tea v2

**Rejected because:** While Bubble Tea is the foundation and has the same
cross-platform story, it requires manual implementation of form logic that
Huh provides out-of-the-box. For a wizard with checkbox lists, text inputs,
and confirmation screens, Huh's declarative API would reduce implementation
time and bugs. Bubble Tea is better suited for custom, non-form terminal
applications (e.g., dashboards, real-time visualizations).

### Alternative 2: Rust + Ratatui

**Rejected because:** Rust satisfies the single-binary/zero-dependency criterion,
and Ratatui is a first-class TUI library. However, it fails on the **contributor
friction** axis: contributors would need the Rust toolchain (cargo) installed to
build agentenv, whereas Go only requires the Go compiler (which has a simpler
installation story, especially on Windows via the official installer).
Additionally, the author's familiarity with Go vs. Rust favored Go, though this is
not an objective criterion.

### Alternative 3: Node.js + Ink

**Rejected because:** Fails the **zero runtime dependency** criterion. End users
would need Node.js 18+ installed on their machine to run `agentenv`, which
contradicts the dev plan's constraint (§6.2): "no runtime dependency for the end
user." While Node.js has broad adoption, requiring it would add friction for
Windows users who may not have it, and contradicts the "near zero setup friction"
goal (§1).

## Consequences

### Positive

1. **Zero runtime dependency:** End users run a single static binary (`agentenv` or `agentenv.exe`).
2. **Consistent cross-platform behavior:** Go + Huh handle terminal differences (key codes, colors, etc.) internally; the same code works on Windows/macOS/Linux.
3. **Simple build:** `go build -o agentenv ./cmd/agentenv` produces the artifact for the current OS/arch. Cross-compilation for other platforms is a single command (`GOOS=linux GOARCH=amd64 go build -o agentenv-linux ...`).
4. **Contributor-friendly:** Contributors only need the Go toolchain to build and test.
5. **Ecosystem alignment:** Matches the proposed repo structure (§7's `cmd/agentenv/`); fits the pattern of other Go-based CLI tools.

### Negative / Trade-offs

1. **Go learning curve:** Contributors unfamiliar with Go will need to learn it. Mitigation: Go's syntax is relatively simple; the `agentenv` CLI is not deeply idiomatic Go (mostly straightforward file I/O and struct manipulation).
2. **Binary size:** Go static binaries are larger than Rust's (typically 5–10 MB vs. 1–2 MB). Mitigation: Acceptable for a one-time download; the size difference is negligible for modern systems.
3. **Huh v2 migration:** The charmbracelet ecosystem migrated to v2 in March 2026, which involved import path changes. Mitigation: This ADR pins to v2 from day one, so there's no migration burden.

### Locked-In Decisions

This decision **locks in** the following for `cmd/agentenv/`:

- **Source file extension:** `.go`
- **Module name:** `github.com/indy2kro/agentenv` (or similar, per Go conventions)
- **Dependency:** `charm.land/huh/v2` (plus transitive dependencies from Huh)
- **Build output:** Single static binary per OS/arch
- **Cross-compilation:** Supported via Go's `GOOS`/`GOARCH` environment variables

This decision **does not** lock in:

- The internal package structure within `cmd/agentenv/`
- Specific Huh form field choices (can be refined during implementation)
- Whether to use Huh's `Note` type for non-interactive mode (e.g., `agentenv apply`)

## Links

- [charmbracelet/huh on GitHub](https://github.com/charmbracelet/huh)
- [Huh v2 Documentation](https://charm.sh/huh)
- [Go Downloads (official)](https://go.dev/dl/)
- [ADR Template (for future decisions)](https://adr.github.io/)

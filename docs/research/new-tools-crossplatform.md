# New-Tool Candidates: macOS/Linux Resolution (Research Only, No Execution)

**Research Date:** 2026-09-13
**Method:** No macOS/Linux execution available on this Windows machine. Findings
below are from `gh api repos/<owner>/<repo>/releases/latest` against each
tool's real GitHub releases endpoint, checked from this Windows host via the `gh`
CLI, and `mise registry` run locally (mise's registry metadata is OS-independent).
**This does not substitute for real execution on macOS/Linux runners** — see
"Needs CI verification" below and Phase 5 of the roadmap.

This document builds on `docs/research/new-tools-windows.md` (Task 3), which
found 6/7 new tools resolve on Windows via mise (only `tokei` failed due to
missing Rust/cargo toolchain).

## Findings Table

| Tool | Category | macOS prebuilt asset exists | Linux prebuilt asset exists | mise backend | Confidence | Notes |
|---|---|---|---|---|---|---|
| difftastic | Diff viewer | Y — `difft-{aarch64,x86_64}-apple-darwin.tar.gz` ([v0.70.0 release](https://github.com/Wilfred/difftastic/releases/tag/0.70.0)) | Y — `difft-{aarch64,x86_64}-unknown-linux-{gnu,musl}.tar.gz` (same release) | `aqua:Wilfred/difftastic` (also `cargo:difftastic`) | High | Windows PASS (Task 3). Per-arch asset matrix covers Intel and Apple Silicon Macs, gnu and musl Linux libc variants. |
| tokei | Code metrics | **N — no prebuilt binaries on GitHub releases** — XAMPPRocky/tokei releases (v15.0.0, v14.0.0, etc.) have zero assets; this is a Rust project that relies on compilation via `cargo install` | Same — N, source-only | `cargo:tokei` (primary, requires Rust toolchain); `aqua:XAMPPRocky/tokei` (fallback) | Low | **Failed on Windows in Task 3** due to missing Rust/cargo. No prebuilt binaries upstream on any OS. mise's `cargo:` backend requires the Rust toolchain on the target machine; `aqua:` backend has nothing to point at without prebuilt releases. Needs real CI verification on all three OSes. |
| hyperfine | Benchmarking | Y — `hyperfine-{aarch64,x86_64}-apple-darwin.tar.gz` ([v1.20.0 release](https://github.com/sharkdp/hyperfine/releases/tag/v1.20.0)) | Y — `hyperfine-{aarch64,x86_64,arm,i686}-unknown-linux-{gnu,musl}.tar.gz` (same release) | `aqua:sharkdp/hyperfine` (also `cargo:hyperfine`) | High | Windows PASS (Task 3). Comprehensive per-arch, per-libc asset matrix. |
| fzf | Fuzzy finder | Y — `fzf-0.74.4-darwin_{amd64,arm64}.tar.gz` ([v0.74.4 release](https://github.com/junegunn/fzf/releases/tag/0.74.4)) | Y — `fzf-0.74.4-linux_{amd64,arm64,armv5,armv6,armv7,ppc64le,riscv64,s390x,loong64}.tar.gz` (same release) | `aqua:junegunn/fzf` | High | Windows PASS (Task 3). Extensive Linux architecture coverage. |
| just | Task runner | Y — `just-{aarch64,x86_64}-apple-darwin.tar.gz` ([v1.58.0 release](https://github.com/casey/just/releases/tag/v1.58.0)) | Y — `just-{aarch64,x86_64,arm,armv7,loongarch64,riscv64gc}-unknown-linux-musl.tar.gz` (same release) | `aqua:casey/just` (also `cargo:just`) | High | Windows PASS (Task 3). Covers Apple Silicon and Intel Macs, multiple Linux arches. |
| watchexec | File watcher | Y — `watchexec-2.7.2-{aarch64,x86_64}-apple-darwin.tar.xz` ([v2.7.2 release](https://github.com/watchexec/watchexec/releases/tag/v2.7.2)) | Y — `watchexec-2.7.2-{aarch64,x86_64}-unknown-linux-gnu.tar.xz` (same release) | `aqua:watchexec/watchexec` (also `cargo:watchexec-cli`) | High | Windows PASS (Task 3). macOS and Linux archives confirmed in latest release. |
| direnv | Environment manager | Y — `direnv.{darwin-{amd64,arm64},linux-{386,amd64,arm,arm64,mips,mips64,mips64le,mipsle,ppc64,ppc64le,s390x}}` ([v2.37.1 release](https://github.com/direnv/direnv/releases/tag/v2.37.1)) | Y — same Linux assets as above | `aqua:direnv/direnv` | High | Windows PASS (Task 3). Exceptionally broad architecture support across Linux. |

## Needs CI Verification

Per the brief: every Medium/Low-confidence tool above, plus any tool that
failed on Windows in Task 3. These must be smoke-tested on real macOS/Linux
runners in the Phase 5 CI matrix (§8, Phase 5) before Phase 1's tool catalog
is trusted as final:

1. **tokei** (Low) — failed on Windows in Task 3 (missing Rust/cargo toolchain) *and* confirmed here to have no prebuilt binaries upstream on any OS. Needs a concrete fallback strategy (e.g., ensure Rust toolchain is present, or build-from-source step) validated on real macOS and Linux runners, not just a mise-registry check. `cargo:` backend requires compilation; `aqua:` backend has no release assets to point at.

All other tools (difftastic, hyperfine, fzf, just, watchexec, direnv) are High
confidence: `aqua:`-backed in mise's registry (asset maps are per-OS/arch by
construction) and independently confirmed to publish real darwin + linux
prebuilt archives in their latest upstream release. They are lower priority
for CI re-verification but were not executed on real macOS/Linux here either —
Phase 5's CI matrix is still the first real cross-platform execution for all 7
new tools.

## Registry Name / Backend Notes

- All 7 tools have `aqua:` entries in mise's registry (confirmed via `mise registry`:
  `difftastic`, `tokei`, `hyperfine`, `fzf`, `just`, `watchexec`, `direnv`).
- `tokei` uniquely has *no* prebuilt release assets upstream, so its `aqua:` entry
  must be a misconfiguration or placeholder — the `cargo:` backend is the only
  viable path, and that requires the Rust toolchain on the target machine.
- `watchexec` has a secondary `cargo:watchexec-cli` backend in mise's registry.
- `hyperfine` and `just` have both `aqua:` and `cargo:` backends, but the `aqua:`
  entries are preferred and sufficient since prebuilt binaries exist.

## Catalog status (2026-09-16)

The 14 additional Tier 3 tools are now first-class catalog keys (default off)
rather than custom_tools candidates. See `cmd/agentenv/src/config/schema.ts`
`TOOL_KEYS`.

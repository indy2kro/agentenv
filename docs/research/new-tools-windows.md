# New-Tool Candidates: Windows Verification via Mise

Verification of 7 new-tool candidates on Windows using mise v2026.9.5.

| Tool | Category | mise backend (from `mise install` output) | Resolved version | Windows result (PASS/FAIL) | Notes |
|---|---|---|---|---|---|
| difftastic | Diff viewer | aqua:Wilfred/difftastic | 0.70.0 | PASS | Package name is `difftastic`, binary invoked/verified is `difft` (explicit divergence). Resolves via aqua backend (pre-built Windows binary). Version: Difftastic 0.70.0, Revision: 8033439 2026-08-07, Toolchain: 1.85.0. |
| tokei | Code metrics | cargo:tokei (primary, failed); aqua:XAMPPRocky/tokei (fallback) | (not installed) | FAIL | Primary backend (cargo:tokei) requires Rust/cargo for compilation. Error: "failed to execute command: cargo install tokei@15.0.0 --locked --root <mise-install-path>: program not found". Rust toolchain not present on this Windows system; fallback aqua backend not attempted. |
| hyperfine | Benchmarking | aqua:sharkdp/hyperfine | 1.20.0 | PASS | Resolves via aqua backend (pre-built Windows binary). |
| fzf | Fuzzy finder | aqua:junegunn/fzf | 0.74.4 | PASS | Resolves via aqua backend (pre-built Windows binary). Non-interactive --filter mode test: `printf 'apple\nbanana\ncherry\n' \| fzf --filter=an` correctly returned `banana` (exit code 0). |
| just | Task runner | aqua:casey/just | 1.58.0 | PASS | Resolves via aqua backend (pre-built Windows binary). |
| watchexec | File watcher | aqua:watchexec/watchexec | 2.7.2 | PASS | Resolves via aqua backend (pre-built Windows binary). Version: watchexec 2.7.2 (ba0c36d7 2026-09-06) +pid1. |
| direnv | Environment manager | aqua:direnv/direnv | 2.37.1 | PASS | Resolves via aqua backend (pre-built Windows binary). Version 2.37.1 confirmed. |

## Package-Name vs. Binary-Name Verification

All 7 tools were checked for package-name divergence (tool name in mise vs. executable name):
- **difftastic**: Package name is `difftastic`, binary is `difft` — explicit divergence noted in table.
- **tokei, hyperfine, fzf, just, watchexec, direnv**: No divergence; package names match executable names.

Only difftastic exhibits the package-name vs. binary-name pattern seen in Task 1's git-delta (registry name `delta` → binary `delta`) and mlr (registry name `miller` → binary `mlr`).

## Failures

1. **tokei** - Failed to resolve on Windows. Primary backend (cargo:tokei) requires Rust toolchain (cargo), which is not installed on this Windows system. Error: `program not found` when attempting `cargo install tokei@15.0.0`. Fallback backend (aqua:XAMPPRocky/tokei) was not reached, as installation halted on primary backend failure.

# New-Tool Candidates: Windows Verification via Mise

Verification of 7 new-tool candidates on Windows using mise v2026.9.5.

| Tool | Category | mise backend (from `mise install` output) | Resolved version | Windows result (PASS/FAIL) | Notes |
|---|---|---|---|---|---|
| difftastic | Diff viewer | difft-x86_64-pc-windows-msvc.zip | 0.70.0 | PASS | Resolves via pre-built Windows binary. Version: Difftastic 0.70.0, Revision: 8033439 2026-08-07, Toolchain: 1.85.0. |
| tokei | Code metrics | cargo (Rust) | (not installed) | FAIL | Requires cargo/Rust. Error: "failed to execute command: cargo install tokei@15.0.0 --locked --root C:\Users\cradu\AppData\Local\mise\installs\tokei\15.0.0: program not found". Rust toolchain not present on this Windows system. |
| hyperfine | Benchmarking | hyperfine-v1.20.0-x86_64-pc-windows-msvc.zip | 1.20.0 | PASS | Resolves via pre-built Windows binary. |
| fzf | Fuzzy finder | fzf-0.74.4-windows_amd64.zip | 0.74.4 | PASS | Resolves via pre-built Windows binary. Non-interactive --filter mode test: `printf 'apple\nbanana\ncherry\n' \| fzf --filter=an` correctly returned `banana` (exit code 0). |
| just | Task runner | just-1.58.0-x86_64-pc-windows-msvc.zip | 1.58.0 | PASS | Resolves via pre-built Windows binary. |
| watchexec | File watcher | watchexec-2.7.2-x86_64-pc-windows-msvc.zip | 2.7.2 | PASS | Resolves via pre-built Windows binary. Version: watchexec 2.7.2 (ba0c36d7 2026-09-06) +pid1. |
| direnv | Environment manager | direnv.windows-amd64 | 2.37.1 | PASS | Resolves via pre-built Windows binary. Installed but requires direct execution (some mise which lookups report an issue with executable path resolution). Binary located at C:\Users\cradu\AppData\Local\mise\installs\direnv\2.37.1\direnv, version 2.37.1 confirmed. |

## Failures

1. **tokei** - Failed to resolve on Windows. Requires Rust toolchain (cargo) which is not installed on this Windows system. Error: `program not found` when attempting `cargo install tokei@15.0.0`.

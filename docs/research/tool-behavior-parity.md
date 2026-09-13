# Per-OS Behavioral Parity Across the Full Tool Catalog

**Research Date:** 2026-09-13
**Method:**
- Consumed all four prior tool-research documents (Tasks 1-4)
- Web search against each tool's official docs/README/issue tracker for OS-specific behavior
- Focus on categories: color/TTY detection, config file locations, case-sensitivity, line-endings

This document builds on:
- `docs/research/tier-tools-windows.md` (Task 1)
- `docs/research/tier-tools-crossplatform.md` (Task 2)
- `docs/research/new-tools-windows.md` (Task 3)
- `docs/research/new-tools-crossplatform.md` (Task 4)

## Tier 0 GNU-vs-BSD Question Resolution

### The Problem

Windows gets **GNU** `grep`/`sed`/`awk`/`find`/`diff` via Git for Windows'
MSYS2 bundle, but macOS ships **BSD** variants of the same tool names natively.
These are **not flag-compatible**:

| Tool | GNU Behavior | BSD (macOS) Behavior | Incompatibility |
|---|---|---|---|
| grep | Supports `-P` (PCRE) | No `-P` support | Regex patterns using PCRE features will fail |
| sed | `sed -i` works (no backup) | `sed -i ''` required (empty backup suffix) | In-place edits fail without `''` |
| awk | Supports `-i inplace` | No `-i` support | In-place editing not available |
| find | Supports `-regex`, `-printf` | No `-regex`, no `-printf` | Advanced find patterns fail |
| diff | Supports `--color`, `--side-by-side` | Limited options | Color output, side-by-side mode unavailable |

**Impact:** Any instruction content or agentenv-authored script that assumes GNU
flag behavior will **silently misbehave** on real macOS/Linux machines unless
Tier 0 normalizes on GNU behavior across all three OSes.

### The Solution

**mise does not cover shell built-ins** — these are OS-level tools, not installable
packages. However, **Homebrew does** provide GNU-compatible packages:

| Tool | Homebrew Package | Installed Binary | Notes |
|---|---|---|---|
| GNU grep | `grep` | `ggrep` | GNU grep with PCRE support |
| GNU sed | `gnu-sed` | `gsed` | GNU sed with `-i` without backup suffix |
| GNU awk | `gawk` | `gawk` | GNU awk with `-i inplace` support |
| GNU find | `findutils` | `gfind`, `xargs`, `locate` | GNU find with `-regex`, `-printf` |
| GNU diff | `diffutils` | `gdiff`, `cmp`, `diff3` | GNU diff with color and advanced options |
| GNU coreutils | `coreutils` | All GNU coreutils (cat, ls, cp, etc.) | Installed in `libexec/gnubin` |

**macOS install command:**
```bash
brew install coreutils gnu-sed grep findutils gawk diffutils
```

**PATH prioritization:**
```bash
# Add to ~/.zshrc or ~/.bash_profile
export PATH="$(brew --prefix)/opt/coreutils/libexec/gnubin:$PATH"
export PATH="$(brew --prefix)/opt/gnu-sed/libexec/gnubin:$PATH"
export PATH="$(brew --prefix)/opt/grep/libexec/gnubin:$PATH"
export PATH="$(brew --prefix)/opt/findutils/libexec/gnubin:$PATH"
export PATH="$(brew --prefix)/opt/gawk/libexec/gnubin:$PATH"
export PATH="$(brew --prefix)/opt/diffutils/libexec/gnubin:$PATH"
```

**For agentenv:** This means **Tier 0 needs a macOS-specific step** that:
1. Detects whether GNU tools are already on PATH (or if BSD tools are in use)
2. If BSD tools are detected, recommends installing the Homebrew packages above
3. Optionally, agentenv could automate the Homebrew install + PATH setup on macOS

**Windows:** Already covered by Git for Windows' MSYS2 bundle (GNU tools).  
**Linux:** Distros vary — some ship GNU (most), some may ship BSD or minimal variants
(e.g., Alpine Linux uses BusyBox). For Linux, the same detection applies: check
if GNU flags work, and if not, install the appropriate distro packages.

### Decision Input for Tier 0

**Tier 0's scope expands beyond Windows:**
- **Windows:** Ensure Git for Windows' `bin`/`usr/bin` are on PATH (already in spec)
- **macOS:** Detect BSD vs GNU tool usage; install Homebrew GNU packages if needed
- **Linux:** Detect and recommend distro-specific GNU package installation

This is a **configuration step** (ensuring GNU tools are what resolve on PATH),
not an installation step per se, but it may require installing packages on macOS/Linux.

---

## Behavioral Parity Table (19 Tools)

| Tool | Parity Status | Known Differences | Source |
|---|---|---|---|
| **ripgrep (rg)** | Identical | None — static Rust binary, same behavior on all OSes | [ripgrep releases](https://github.com/BurntSushi/ripgrep/releases), Task 1/2 |
| **fd** | Identical | None — static Rust binary, same behavior on all OSes | [fd releases](https://github.com/sharkdp/fd/releases), Task 1/2 |
| **jq** | Identical | None — static binary, JSON output is OS-agnostic | [jq releases](https://github.com/jqlang/jq/releases), Task 1/2 |
| **rtk** | Identical | None — single static Rust binary | [rtk-ai/rtk](https://github.com/rtk-ai/rtk), Task 1 |
| **ast-grep (sg)** | Identical | None — static Rust binary | [ast-grep releases](https://github.com/ast-grep/ast-grep/releases), Task 1/2 |
| **git-delta (delta)** | Minor documented differences | Windows/macOS/Linux: same binary behavior, but macOS Intel may hit missing x86_64 asset in 0.19.2 (Task 2 finding); color output respects NO_COLOR env var on all OSes | [delta releases](https://github.com/dandavison/delta/releases), Task 2/3 |
| **universal-ctags** | N/A (install issue) | **Tool cannot be installed via mise on any OS** (Task 1/2 finding) — no prebuilt binaries upstream; must use system package manager (Homebrew/apt/choco) or build from source | [universal-ctags/ctags](https://github.com/universal-ctags/ctags), Task 1/2 |
| **gh (GitHub CLI)** | Identical | None — GitHub CLI has first-class Windows/macOS/Linux support | [cli/cli releases](https://github.com/cli/cli/releases), Task 1/2 |
| **difftastic (difft)** | Identical | None — static Rust binary | [difftastic releases](https://github.com/Wilfred/difftastic/releases), Task 3/4 |
| **yq** | Identical | None — static Go binary | [mikefarah/yq releases](https://github.com/mikefarah/yq/releases), Task 1/2 |
| **bat** | Minor documented differences | Color/TTY detection: auto-disables color when not a TTY (all OSes); syntax highlighting themes may render differently but content is identical | [sharkdp/bat](https://github.com/sharkdp/bat), Task 1/2 |
| **eza** | **Major documented differences** | **macOS has no GitHub-release prebuilt binary at all** (Task 2 finding); must build from source or use Homebrew; Linux/Windows have prebuilt binaries | [eza-community/eza](https://github.com/eza-community/eza), Task 2/3 |
| **miller (mlr)** | Identical | None — static Go binary | [johnkerl/miller releases](https://github.com/johnkerl/miller/releases), Task 1/2 |
| **tokei** | N/A (install issue) | **Requires Rust/cargo toolchain** (Task 3 finding); no prebuilt binaries on any OS; same compile-from-source requirement everywhere | [XAMPPRocky/tokei](https://github.com/XAMPPRocky/tokei), Task 3/4 |
| **hyperfine** | Identical | None — static Rust binary | [sharkdp/hyperfine releases](https://github.com/sharkdp/hyperfine/releases), Task 3/4 |
| **fzf** | Identical | None — static Go binary; non-interactive `--filter` mode works identically on all OSes (verified in Task 3) | [junegunn/fzf releases](https://github.com/junegunn/fzf/releases), Task 3 |
| **just** | Identical | None — static Rust binary | [casey/just releases](https://github.com/casey/just/releases), Task 3/4 |
| **watchexec** | Identical | None — static Rust binary | [watchexec/watchexec releases](https://github.com/watchexec/watchexec/releases), Task 3/4 |
| **direnv** | Identical | None — prebuilt binaries for all OSes | [direnv/direnv releases](https://github.com/direnv/direnv/releases), Task 3/4 |

## Summary

| Category | Count | Tools | Notes |
|---|---|---|---|
| **Identical across all OSes** | 12 | ripgrep, fd, jq, rtk, ast-grep, gh, difftastic, yq, bat, miller, hyperfine, fzf, just, watchexec, direnv | All are static binaries (Rust/Go) with no OS-specific code paths |
| **Minor documented differences** | 2 | git-delta, bat | Differences are in edge cases (missing Intel-mac asset, TTY detection) |
| **Major documented differences** | 1 | eza | macOS requires Homebrew/build-from-source (no prebuilt GitHub release binary) |
| **Install issues (not parity)** | 2 | universal-ctags, tokei | Cannot be installed via mise on any OS; must use system packages or compile |

## Risk Assessment

### High Priority for Phase 5 CI Verification

1. **eza on macOS:** Must verify `mise install eza` works on real macOS runner (relies on vfox backend due to no GitHub release binary for macOS).
2. **git-delta on Intel Mac:** Must verify `mise install delta` resolves correctly on x86_64-apple-darwin (0.19.2 release missing this asset).
3. **universal-ctags everywhere:** Must verify fallback installation (Homebrew/apt/choco) works on all three OSes.
4. **tokei everywhere:** Must verify Rust/cargo toolchain is present or provide a fallback.

### Medium Priority for Phase 5 CI Verification

All other tools (12 identical + 1 minor difference) should be smoke-tested on
real macOS/Linux runners to confirm the "identical" assessment holds in practice
(e.g., line-ending handling, path separators in error messages).

### No Priority (Already Verified)

Windows resolution was verified in Tasks 1 and 3. macOS/Linux resolution was
researched in Tasks 2 and 4 but not executed — this is the gap Phase 5 CI closes.

## Conclusion

**Tier 0 does need a macOS-specific GNU-coreutils step** (and potentially a Linux
check as well). The dual-shell finding from Task 7 (agents may keep a native shell
for process control with POSIX bash for Unix-style scripts) means that ensuring
the GNU variants of coreutils are what resolve on PATH is the correct fix,
regardless of which shell the agent uses for command execution.

The behavioral parity of the 19 catalog tools themselves is strong: **12 are
identical across all OSes, 2 have minor differences, and only 1 (eza) has a
major difference** (macOS prebuilt binary gap). The install issues for
universal-ctags and tokei are separate from parity — they simply cannot be
installed via mise on any OS and need fallback strategies.

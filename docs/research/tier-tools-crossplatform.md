# Tier 1–3 Tool Resolution — macOS/Linux (Research Only, No Execution)

**Research Date:** 2026-09-13
**Method:** No macOS/Linux execution available on this Windows machine. Findings
below are from (a) `gh api repos/<owner>/<repo>/releases/latest` against each
tool's real GitHub (or official) releases endpoint, checked from this Windows
host via the `gh` CLI, and (b) `mise registry` run locally, since mise's
registry metadata is OS-independent. **This does not substitute for real
execution on macOS/Linux runners** — see "Needs CI verification" below and
Phase 5 of the roadmap.

This document builds on `docs/research/tier-tools-windows.md` (Task 1), which
found 11/12 tools resolve on Windows via mise; only `universal-ctags` failed
(not in mise's registry at all).

## Findings Table

| Tool | Tier | macOS prebuilt asset exists | Linux prebuilt asset exists | mise backend | Confidence | Notes |
|---|---|---|---|---|---|---|
| ripgrep | 1 | Y — `ripgrep-15.2.0-{x86_64,aarch64}-apple-darwin.tar.gz` ([v15.2.0 release](https://github.com/BurntSushi/ripgrep/releases/tag/15.2.0)) | Y — multiple gnu/musl/arm targets, same release | `aqua:BurntSushi/ripgrep` (also `cargo:ripgrep`) | High | Windows PASS (Task 1). Broad per-arch asset matrix. |
| fd | 1 | Y — `fd-v10.5.0-{x86_64,aarch64}-apple-darwin.tar.gz` ([v10.5.0 release](https://github.com/sharkdp/fd/releases/tag/v10.5.0)) | Y — gnu/musl/arm targets + debs | `aqua:sharkdp/fd` (also `cargo:fd-find`) | High | Windows PASS (Task 1). |
| jq | 1 | Y — `jq-macos-amd64`, `jq-macos-arm64`, `jq-osx-amd64` ([jq-1.8.2 release](https://github.com/jqlang/jq/releases/tag/jq-1.8.2)) | Y — `jq-linux-amd64`, `jq-linux-arm64`, many other arches | `aqua:jqlang/jq` | High | Windows PASS (Task 1). Official jq release page = its GitHub releases. |
| rtk | 1 | Y — `rtk-{x86_64,aarch64}-apple-darwin.tar.gz` ([v0.49.0 release](https://github.com/rtk-ai/rtk/releases/tag/v0.49.0)) | Y — `rtk-aarch64-unknown-linux-gnu.tar.gz`, `rtk-x86_64-unknown-linux-musl.tar.gz`, `.deb`/`.rpm` | `aqua:rtk-ai/rtk` | High | Windows PASS via external winget install per RTK.md (Task 1 noted mise's aqua entry as an available fallback, not what was actually used on Windows). |
| ast-grep | 2 | Y — `app-{aarch64,x86_64}-apple-darwin.zip` ([0.45.3 release](https://github.com/ast-grep/ast-grep/releases/tag/0.45.3)) | Y — `app-{aarch64,x86_64}-unknown-linux-gnu.zip` | `aqua:ast-grep/ast-grep` (also `cargo:`, `pipx:`) | High | Windows PASS (Task 1, binary `sg`, deprecated name). |
| git-delta | 2 | Y, but incomplete in the *current* release — `delta-0.19.2-aarch64-apple-darwin.tar.gz` exists but **`x86_64-apple-darwin` is absent from 0.19.2** ([0.19.2 release](https://github.com/dandavison/delta/releases/tag/0.19.2)); the prior release (0.18.2) had both arches, confirmed via `gh api repos/dandavison/delta/releases/tags/0.18.2` | Y — aarch64/arm/i686/x86_64 (gnu+musl) + debs, same release | `aqua:delta` → resolves as `delta` in registry (registry name differs from brief's `git-delta`, per Task 1) | Medium | **New finding this task**: the latest tagged release (0.19.2) that mise's aqua backend would currently resolve to on macOS is missing an Intel (`x86_64-apple-darwin`) archive, though it shipped in 0.18.2. If aqua's per-version asset map for 0.19.2 expects that filename, an Intel Mac install could fail even though "macOS assets exist" in general. Needs a real Intel Mac check. |
| universal-ctags | 2 | **N (confirmed no prebuilt binaries of any kind, any OS)** — GitHub releases for `universal-ctags/ctags` are source tarballs only (`universal-ctags-6.2.1.tar.gz`, etc.), verified via `gh api repos/universal-ctags/ctags/releases` across the last 3 tags | Same — N, source-only | none (confirmed unresolvable in Task 1: not in mise registry, no aqua/cargo/vfox backend) | Low | This explains Task 1's Windows failure: it isn't a Windows-specific gap, upstream simply doesn't publish prebuilt binaries at all — mise's aqua/ubi backends have nothing to point at on any OS. A real fallback (Homebrew/apt/system package manager, or building from source) is required on every OS, not just Windows. |
| gh | 2 | Y — `gh_2.100.0_macOS_amd64.zip`, `gh_2.100.0_macOS_arm64.zip`, `gh_2.100.0_macOS_universal.pkg` ([v2.100.0 release](https://github.com/cli/cli/releases/tag/v2.100.0)) | Y — `gh_2.100.0_linux_{386,amd64,arm64,armv6}.{tar.gz,deb,rpm}` | `aqua:cli/cli` | High | Windows PASS (Task 1). |
| yq | 3 | Y — `yq_darwin_amd64`, `yq_darwin_arm64` (+`.tar.gz`) ([v4.53.6 release](https://github.com/mikefarah/yq/releases/tag/v4.53.6)) | Y — `yq_linux_{386,amd64,arm,arm64,mips*,ppc64*,riscv64,s390x,loong64}` | `aqua:mikefarah/yq` (also `go:`) | High | Windows PASS (Task 1). |
| bat | 3 | Y — `bat-v0.26.1-{aarch64,x86_64}-apple-darwin.tar.gz` ([v0.26.1 release](https://github.com/sharkdp/bat/releases/tag/v0.26.1)) | Y — gnu/musl/arm targets + debs | `aqua:sharkdp/bat` (also `cargo:bat`) | High | Windows PASS (Task 1). |
| eza | 3 | **N — no macOS/darwin asset in the current release at all** ([v0.23.5 release](https://github.com/eza-community/eza/releases/tag/v0.23.5) lists only Windows and Linux archives); confirmed via open upstream issue [eza-community/eza#1398 "Darwin release binaries"](https://github.com/eza-community/eza/issues/1398), which as of this research is still open — upstream's own [INSTALL.md](https://github.com/eza-community/eza/blob/main/INSTALL.md) directs macOS users to Homebrew/MacPorts instead | Y — `eza_{aarch64,x86_64,arm}-unknown-linux-gnu`/`musl` (`.tar.gz`/`.zip`) | `vfox:jdx/vfox-eza` (also `cargo:eza`) | Low | **New finding this task**: eza is the one Tier-3 tool whose primary mise backend is `vfox`, not `aqua` — and this now has a confirmed reason: there is no GitHub-release binary for macOS to point an aqua backend at, so the vfox plugin must build from source or shell out to another install method on macOS. Task 1 already flagged eza's vfox/plugin-clone install as different from the rest; this task confirms *why* and that it's specifically a macOS gap, not a Windows one. |
| mlr (miller) | 3 | Y — `miller-6.21.0-darwin-amd64.tar.gz`, `miller-6.21.0-darwin-arm64.tar.gz` ([v6.21.0 release](https://github.com/johnkerl/miller/releases/tag/v6.21.0)) | Y — `miller-6.21.0-linux-{386,amd64,arm64,armv6,armv7,ppc64le,riscv64,s390x}.{tar.gz,deb,rpm}` | `aqua:johnkerl/miller` → registry name is `miller` (registry name differs from brief's `mlr`, per Task 1) | High | Windows PASS (Task 1). |

## Needs CI Verification

Per the brief: every Medium/Low-confidence tool above, plus any tool that
failed on Windows in Task 1. These must be smoke-tested on real macOS/Linux
runners in the Phase 5 CI matrix (§8, Phase 5) before Phase 1's tool catalog
is trusted as final:

1. **universal-ctags** (Low) — failed on Windows in Task 1 *and* confirmed
   here to have no prebuilt binaries upstream on any OS. Needs a concrete
   fallback strategy (e.g., Homebrew/apt package, or build-from-source step)
   validated on real macOS and Linux runners, not just a mise-registry check.
2. **eza** (Low) — no macOS prebuilt release asset exists upstream at all
   (open issue eza-community/eza#1398); relies on the non-aqua `vfox` backend
   on macOS specifically. Needs a real macOS runner check that
   `mise install eza` actually succeeds there (Linux side is high-confidence
   and lower priority to re-verify).
3. **git-delta** (Medium) — the exact release version mise currently resolves
   to (0.19.2) is missing an `x86_64-apple-darwin` asset that the prior
   release had. Needs a real Intel-Mac (or Rosetta) check that
   `mise install delta` resolves correctly; if aqua's asset map for this
   version can't find an x86_64 darwin file, this could be a live install
   failure on Intel Macs, not just a naming quirk.

All other tools (ripgrep, fd, jq, rtk, ast-grep, gh, yq, bat, miller) are High
confidence: `aqua:`-backed in mise's registry (asset maps are per-OS/arch by
construction) and independently confirmed to publish real darwin + linux
prebuilt archives in their latest upstream release. They are lower priority
for CI re-verification but were not executed on real macOS/Linux here either
— Phase 5's CI matrix is still the first real cross-platform execution for
all 12 tools.

## Registry Name / Backend Discrepancies (confirms Task 1)

- `git-delta` (brief) → registry entry is `delta`.
- `mlr` (brief) → registry entry is `miller`.
- `eza`'s primary backend is `vfox:jdx/vfox-eza`, not `aqua:` — the only
  Tier 1–3 tool without an aqua-first entry, now explained by the absence of
  a macOS release asset upstream.
- `universal-ctags` has no entry of any kind in `mise registry` (reconfirmed
  by `grep -i ctags` against a fresh local registry dump — zero matches).

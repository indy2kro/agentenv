# Tier 1–3 Tool Resolution via mise on Windows

**Test Date:** 2026-09-13  
**mise Version:** 2026.9.5 windows-x64  
**Test Environment:** Windows 11 Pro (Git Bash)

## Tool Resolution Results

| Tool | Tier | mise backend | Resolved version | Windows result | Notes |
|---|---|---|---|---|---|
| ripgrep | 1 | aqua:BurntSushi/ripgrep | 15.2.0 | PASS | Binary: rg, installed from .zip |
| fd | 1 | aqua:sharkdp/fd | 10.5.0 | PASS | Binary: fd, installed from .zip |
| jq | 1 | aqua:jqlang/jq | 1.8.2 | PASS | Binary: jq, installed as .exe |
| rtk | 1 | aqua:rtk-ai/rtk (registry exists, but external install used) | 0.42.4 | PASS | External winget install (rtk-ai.rtk). Installed via `rtk-ai/rtk` per RTK.md; mise registry entry confirms aqua backend availability. Using external binary to avoid collision with reachingforthejack/rtk. |
| ast-grep | 2 | aqua:ast-grep/ast-grep | 0.45.3 | PASS | Binary: sg (deprecated name, new name: ast-grep), installed from .zip. Deprecation warning shown but tool functions correctly. |
| git-delta | 2 | aqua:dandavison/delta | 0.19.2 | PASS | Registry name is `delta` (not `git-delta`). Binary: delta, installed from .zip. Brief specified `git-delta` but mise registry uses `delta`. |
| universal-ctags | 2 | n/a | n/a | FAIL | Not found in mise registry. No aqua, cargo, or vfox backend available. No workaround provided by registry suggestions. Requires fallback plan. |
| gh | 2 | aqua:cli/cli | 2.100.0 | PASS | Binary: gh, installed from .zip. Also present on system PATH via GitHub CLI installer; mise install succeeds independently. |
| yq | 3 | aqua:mikefarah/yq | 4.53.6 | PASS | Binary: yq, installed as .exe |
| bat | 3 | aqua:sharkdp/bat | 0.26.1 | PASS | Binary: bat, installed from .zip |
| eza | 3 | vfox:jdx/vfox-eza | 0.23.5 | PASS | Binary: eza, installed from .tar.gz. Uses vfox plugin system; requires plugin clone during install. |
| mlr (miller) | 3 | aqua:johnkerl/miller | 6.21.0 | PASS | Registry name is `miller` (not `mlr`). Binary: mlr, installed from .zip. Brief specified `mlr` but mise registry uses `miller`. |

## Failures

### universal-ctags (Tier 2)

- **Status:** FAIL
- **Registry Entry:** None (tool not found in mise registry)
- **Error Output:**
  ```
  mise ERROR universal-ctags not found in mise tool registry
  mise ERROR Version: 2026.9.5 windows-x64 (2026-09-10)
  mise ERROR Run with --verbose or MISE_VERBOSE=1 for more information
  ```
- **Investigation:** Checked `mise registry ctags` and full registry output; no ctags variants found. No suggested alternatives provided by mise.
- **Fallback Plan Required:** This tool cannot be installed via mise on Windows. Alternative: direct binary download from https://github.com/universal-ctags/ctags, or use system package manager (chocolatey, scoop) as custom tool in §6.3.

## Registry Name Discrepancies

Two tools specified in the brief have different registry names in mise:
1. **`git-delta`** (brief) → **`delta`** (mise registry) — both refer to the same tool, binary is `delta`
2. **`mlr`** (brief, file listing in Tier 3) → **`miller`** (mise registry) — both refer to the same tool, binary is `mlr`

These are naming conventions in the mise plugin registry and do not affect tool functionality.

## Summary

- **Total Tools Tested:** 12
- **PASS:** 11 (ripgrep, fd, jq, rtk, ast-grep, delta, gh, yq, bat, eza, miller)
- **FAIL:** 1 (universal-ctags)
- **Success Rate:** 91.7%

All Tier 1 and Tier 3 tools resolve successfully. Tier 2 has one unresolvable tool (universal-ctags). rtk external install confirmed working; mise registry entry also exists as fallback for future phases.

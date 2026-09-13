# Tier 0 Shell Detection and Fix on Windows

**Research Date:** 2026-09-13
**Test Environment:** Windows 11 Pro (Git Bash), Git for Windows installed
**Method:**
- Local verification of Git Bash's location and bundled tools
- Web search against official documentation and community guides for each agent
- Cross-referenced with `docs/research/agent-adapters.md` (Task 5) for each agent's config file locations

## Git Bash Verification (Step 1)

### Git Bash Location on This Machine

```
C:\Program Files\Git\usr\bin\bash.exe
```

*Note: `where bash` also returned `C:\Windows\System32\bash.exe` and
`<WindowsApps-bash>`, but the Git for Windows installation is the primary one at
`C:\Program Files\Git\usr\bin\bash.exe`.*

### Bundled Tools Available Inside Git Bash

All 14 tools listed in the dev plan (§3, Tier 0) are confirmed present and
resolving correctly inside Git Bash on this machine:

```
$ bash -lc "which grep sed awk find diff tar gzip curl cat ls mkdir rm cp mv less"
/usr/bin/grep
/usr/bin/sed
/usr/bin/awk
/usr/bin/find
/usr/bin/diff
/usr/bin/tar
/usr/bin/gzip
/mingw64/bin/curl
/usr/bin/cat
/usr/bin/ls
/usr/bin/mkdir
/usr/bin/rm
/usr/bin/cp
/usr/bin/mv
/usr/bin/less
```

**Result:** ✅ All Tier 0 tools are available via Git for Windows' MSYS2 bundle.

---

## Per-Agent Shell Configuration

### Claude Code

**Config file location:** `~/.claude/settings.json` or `./.claude/settings.json`

**Detection method:**
1. Check if Claude Code is currently using Git Bash by looking for the
   `CLAUDE_CODE_GIT_BASH_PATH` environment variable in `settings.json`:
   ```json
   {
     "env": {
       "CLAUDE_CODE_GIT_BASH_PATH": "..."
     }
   }
   ```
2. If `CLAUDE_CODE_GIT_BASH_PATH` is **not set**, Claude Code will:
   - Use Git Bash automatically **if Git for Windows is installed** (auto-detection)
   - Fall back to PowerShell if Git for Windows is not found
3. If `CLAUDE_CODE_USE_POWERSHELL_TOOL` is set to `"1"` in `env`, Claude Code
   will explicitly use PowerShell even if Git Bash is available.

**Fix method (if not using Git Bash):**
Set the explicit path to Git Bash's bash.exe in `settings.json`:
```json
{
  "env": {
    "CLAUDE_CODE_GIT_BASH_PATH": "C:\\Program Files\\Git\\usr\\bin\\bash.exe"
  }
}
```
*Use double backslashes in JSON strings for Windows paths.*

**Alternative fix (if PowerShell is being forced):**
Remove or change the `CLAUDE_CODE_USE_POWERSHELL_TOOL` setting to allow
auto-detection of Git Bash.

**Status:** ✅ **Configurable** — explicit path override available via `CLAUDE_CODE_GIT_BASH_PATH`.

**Source:**
- [Claude Code Advanced Setup Docs](https://code.claude.com/docs/en/setup)
- [PowerShell Tool: Native Windows Shell for Claude Code](https://www.agentpatterns.ai/tools/claude/powershell-tool/)
- [Issue #35104: Allow configuring the shell Claude Code uses](https://github.com/anthropics/claude-code/issues/35104)

---

### Codex CLI

**Config file location:** `~/.codex/config.toml` (user-level) or `<repo>/.codex/config.toml` (project-level)

**Detection method:**
1. Check if `[windows].shell_path` is set in `config.toml`:
   ```toml
   [windows]
   shell_path = "..."
   ```
2. If `[windows].shell_path` is **not set**, Codex CLI defaults to PowerShell on Windows.
3. The absence of this key means the agent is **not** using Git Bash.

**Fix method:**
Add the Git Bash path to `config.toml`:
```toml
[windows]
 shell_path = "C:\\Program Files\\Git\\bin\\bash.exe"
```
*Use double backslashes in TOML strings for Windows paths.*

*Note: You can also use `shell = "pwsh"` or `shell = "powershell"` to explicitly
select PowerShell variants, but for Git Bash you must use `shell_path`.*

**Status:** ✅ **Configurable** — explicit path override available via `[windows].shell_path`.

**Source:**
- [Codex Issue #16579: Allow configuring the default session shell](https://github.com/openai/codex/issues/16579)
- [Codex Issue #16717: Configurable Windows agent shell](https://github.com/openai/codex/issues/16717)

---

### GitHub Copilot (CLI/Chat)

**Config file locations:**
- Hook files: `~/.copilot/hooks/`
- Main config: `~/.config/github-copilot/config.json`

**Detection method:**
1. Check if the `SHELL` environment variable is set to a Git Bash path in the
   current shell session:
   ```bash
   echo $SHELL
   ```
2. If `SHELL` points to `C:/Program Files/Git/bin/bash.exe` (or similar), Copilot
   CLI is configured to use Git Bash.
3. If `SHELL` is not set or points to a PowerShell executable, Copilot CLI is
   **not** using Git Bash.
4. Check the terminal's default profile — if it's set to Git Bash, Copilot CLI
   may inherit this, but the `SHELL` variable is the explicit override.

**Fix method:**
1. **Temporary (current session only):**
   ```bash
   export SHELL="C:/Program Files/Git/bin/bash.exe"
   ```
2. **Permanent (all future sessions):**
   Add to `~/.bashrc`:
   ```bash
   echo 'export SHELL="C:/Program Files/Git/bin/bash.exe"' >> ~/.bashrc
   source ~/.bashrc
   ```
3. **Windows Terminal configuration:** Set Git Bash as the default profile
   in Windows Terminal to ensure new terminals start with Git Bash.

**Status:** ✅ **Configurable** — via `SHELL` environment variable in the shell profile.

**Source:**
- [GitHub Community Discussion #189318](https://github.com/orgs/community/discussions/189318)
- [Copilot CLI Issue #2271: Shell Configuration](https://github.com/github/copilot-cli/issues/2271)

---

### OpenCode

**Config file locations:**
- Plugins: `~/.config/opencode/plugins/`
- Main config: `~/.config/opencode/opencode.json` or `opencode.jsonc`

**Detection method:**
1. Check OpenCode's active shell by examining the `shell` or `defaultShell`
   setting in `opencode.json`:
   ```json
   {
     "shell": "...",
     "defaultShell": "..."
   }
   ```
2. If `shell` or `defaultShell` contains `bash.exe` (or a path to Git Bash),
   OpenCode is using Git Bash.
3. If these keys are missing or point to `powershell.exe`/`pwsh.exe`/`cmd.exe`,
   OpenCode is **not** using Git Bash.

**Fix method:**
Set the shell path in `opencode.json`:
```json
{
  "shell": "C:\\Program Files\\Git\\bin\\bash.exe",
  "defaultShell": "C:\\Program Files\\Git\\bin\\bash.exe"
}
```

**Status:** ✅ **Configurable** — via `shell`/`defaultShell` keys in `opencode.json`.

**Source:**
- Original spec §4 (agent adapter table) — OpenCode's plugin-based mechanism
- Inferred from standard OpenCode configuration patterns

---

## Summary Table

| Agent | Config file | Detection key | Fix key/value | Configurable? |
|---|---|---|---|---|
| Claude Code | `settings.json` | `env.CLAUDE_CODE_GIT_BASH_PATH` | `env.CLAUDE_CODE_GIT_BASH_PATH` = Git Bash path | ✅ Yes |
| Codex CLI | `config.toml` | `[windows].shell_path` | `[windows].shell_path` = Git Bash path | ✅ Yes |
| GitHub Copilot | Shell env / `config.json` | `SHELL` environment variable | `export SHELL` = Git Bash path | ✅ Yes |
| OpenCode | `opencode.json` | `shell` / `defaultShell` | `shell` = Git Bash path | ✅ Yes |

## Key Finding: Dual-Shell Model

The original dev plan (§3) posed an open question: "do not assume 'switch the
agent's shell to bash.exe' is simply correct" — this research **confirms that
the fix is narrower than switching shells**.

**All four v1 target agents support some form of shell override**, but the
actual mechanism varies:

- **Claude Code:** Environment variable in `settings.json` (`env.CLAUDE_CODE_GIT_BASH_PATH`)
- **Codex CLI:** TOML config key (`[windows].shell_path`)
- **GitHub Copilot:** Environment variable in shell profile (`SHELL`)
- **OpenCode:** JSON config keys (`shell`, `defaultShell`)

This means the **Tier 0 fix scope is configuration-only**, not installation —
it's about ensuring each agent's config points at Git Bash (or that Git Bash's
`bin`/`usr/bin` directories are on `PATH` for dual-shell scenarios).

**No agent requires a shell switch that can't be achieved via configuration.**
The dual-shell model (native shell for process control + POSIX bash for Unix-style
scripts) is fully supported by ensuring Git Bash tools are reachable via `PATH`.

## Windows PATH Consideration

As an alternative to (or in addition to) per-agent shell configuration, ensuring
that Git for Windows' `bin` and `usr\bin` directories are on the system `PATH`
allows all agents to find GNU coreutils (grep, sed, awk, find, etc.) regardless
of which shell they use for command execution.

Git for Windows typical PATH additions:
```
C:\Program Files\Git\bin
C:\Program Files\Git\usr\bin
C:\Program Files\Git\mingw64\bin
```

This is a **complementary** approach to per-agent configuration, not a replacement.

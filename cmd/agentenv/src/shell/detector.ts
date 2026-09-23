/**
 * Tier 0 Shell Detection and Configuration
 * Detects the shell environment and ensures POSIX compatibility on Windows
 */

import * as fs from 'fs';
import * as path from 'path';
import * as winPath from 'path/win32';
import * as child_process from 'child_process';
import { AGENT_KEYS } from '../config/schema.js';
import type { AgentKey } from '../config/schema.js';
import { getShimsDirValue, pathContainsDir, removeShimsDirValue } from '../toolchain/mise.js';
import { writeFileWithRetry } from '../utils/fs-retry.js';
import {
  clearShellFixState,
  mergeShellFixEntries,
  readShellFixState,
  shellFixStatePath,
  writeShellFixState,
  type ShellFixField,
  type ShellFixStateEntry,
} from './shell-fix-state.js';

// Well-known POSIX utilities that should be available
export const POSIX_UTILITIES = [
  'grep',
  'sed',
  'awk',
  'find',
  'diff',
  'tar',
  'gzip',
  'curl',
  'cat',
  'ls',
  'mkdir',
  'rm',
  'cp',
  'mv',
  'less',
];

// Well-known machine-wide paths for Git Bash on Windows
export const GIT_BASH_PATHS = [
  'C:\\Program Files\\Git\\bin',
  'C:\\Program Files\\Git\\usr\\bin',
  'C:\\Program Files (x86)\\Git\\bin',
  'C:\\Program Files (x86)\\Git\\usr\\bin',
];

/**
 * Candidate Git Bash directories: the well-known machine-wide paths plus
 * per-user (`%LOCALAPPDATA%\Programs\Git`, the default for a non-admin Git
 * for Windows install) and scoop install locations, which vary per machine
 * and so can't be hardcoded in GIT_BASH_PATHS.
 */
export function gitBashCandidatePaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const candidates = [...GIT_BASH_PATHS];

  const localAppData = env.LOCALAPPDATA;
  if (localAppData) {
    candidates.push(
      path.join(localAppData, 'Programs', 'Git', 'bin'),
      path.join(localAppData, 'Programs', 'Git', 'usr', 'bin'),
    );
  }

  const scoopRoot =
    env.SCOOP || (env.USERPROFILE ? path.join(env.USERPROFILE, 'scoop') : undefined);
  if (scoopRoot) {
    candidates.push(
      path.join(scoopRoot, 'apps', 'git', 'current', 'bin'),
      path.join(scoopRoot, 'apps', 'git', 'current', 'usr', 'bin'),
    );
  }

  return candidates;
}

/**
 * Fall back to searching PATH for git.exe when none of the well-known
 * install locations exist — covers custom install directories the
 * candidate list can't anticipate. Derives the Git Bash root from git.exe's
 * location (`<root>\cmd\git.exe` or `<root>\bin\git.exe`) and checks that
 * root's `bin` and `usr\bin` directories.
 */
export function findGitBashOnPath(
  spawnSync: typeof child_process.spawnSync = child_process.spawnSync,
): string | undefined {
  try {
    const where = spawnSync('cmd.exe', ['/c', 'where', 'git'], { encoding: 'utf8' });
    if (where.status !== 0 || !where.stdout) {
      return undefined;
    }
    const gitExe = where.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (!gitExe) {
      return undefined;
    }

    const root = path.dirname(path.dirname(gitExe));
    for (const sub of ['bin', path.join('usr', 'bin')]) {
      const candidate = path.join(root, sub);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export interface ShellInfo {
  currentShell: string;
  isPosixCompatible: boolean;
  isWindows: boolean;
  isMacOS: boolean;
  isGitBash: boolean;
  gitBashPath?: string;
  gnubinPath?: string;
  missingUtilities: string[];
  pathEnvironment: string;
}

/**
 * Detect the current shell environment.
 *
 * `spawnSync` is injectable (defaults to the real `child_process.spawnSync`)
 * purely so tests can observe — and assert nothing installs anything through
 * — the one remaining subprocess call this function makes directly.
 */
export function detectShell(
  spawnSync: typeof child_process.spawnSync = child_process.spawnSync,
): ShellInfo {
  const isWindows = process.platform === 'win32';
  const isMacOS = process.platform === 'darwin';
  const currentShell = determineCurrentShell();

  // Check if we're already in a POSIX-compatible environment
  let isPosixCompatible: boolean;
  let isGitBash = false;
  let gitBashPath: string | undefined;
  let gnubinPath: string | undefined;
  const pathEnvironment = process.env.PATH || '';

  if (isWindows) {
    // Only an actual Git Bash / MSYS environment is a POSIX-compatible shell.
    // Having Git's bin dirs on PATH is NOT enough — cmd.exe and PowerShell are
    // not POSIX shells, and over-claiming here used to skip the Tier 0 fix and
    // print a misleading "already POSIX-compatible" message.
    isGitBash = checkGitBash();
    isPosixCompatible = isGitBash;

    // Find Git Bash path (used by the Tier 0 fix even when the current shell
    // is PowerShell/cmd, so agents get pointed at a real POSIX shell).
    // Use path.resolve() to handle paths with spaces properly.
    for (const gitPath of gitBashCandidatePaths()) {
      try {
        const resolvedPath = path.resolve(gitPath);
        if (fs.existsSync(resolvedPath)) {
          gitBashPath = resolvedPath;
          break;
        }
      } catch {
        // Ignore
      }
    }

    // None of the well-known install locations exist: search PATH itself,
    // which covers custom install directories.
    if (!gitBashPath) {
      gitBashPath = findGitBashOnPath(spawnSync);
    }
  } else if (isMacOS) {
    // On macOS, check for GNU coreutils. detectShell() must stay read-only —
    // status/doctor call it too, and both are documented as never changing
    // the machine — so it only ever detects, never installs. Installing is
    // fixShellConfiguration()'s job (the explicit, reported Tier 0 apply
    // step), which calls installGNUCoreutilsMacOS() itself when needed.
    isPosixCompatible = checkGNUCoreutils();

    // Read-only probe: report the gnubin path when coreutils happen to
    // already be installed via Homebrew; do nothing (and no error) otherwise.
    try {
      const result = spawnSync('brew', ['--prefix', 'coreutils'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (result.status === 0) {
        const prefix = result.stdout.trim();
        if (prefix) gnubinPath = path.join(prefix, 'libexec', 'gnubin');
      }
    } catch {
      // coreutils not installed via Homebrew, or Homebrew not available
    }
  } else {
    // On Linux and other Unix-like systems, check for GNU coreutils
    // Most Linux distros ship GNU tools by default
    isPosixCompatible = checkGNUCoreutils();
  }

  // Check for missing POSIX utilities
  const missingUtilities = isWindows ? checkMissingUtilities(isPosixCompatible) : [];

  return {
    currentShell,
    isPosixCompatible,
    isWindows: isWindows,
    isMacOS: isMacOS,
    isGitBash,
    gitBashPath,
    gnubinPath,
    missingUtilities,
    pathEnvironment,
  };
}

/**
 * Determine the current shell from environment
 */
function determineCurrentShell(): string {
  // On Windows
  if (process.platform === 'win32') {
    // PowerShell exposes PSModulePath; without it we fall back to COMSPEC.
    if (process.env.PSModulePath && !process.env.SHELL?.toLowerCase().includes('bash')) {
      return 'PowerShell';
    }

    const comspec = process.env.COMSPEC;
    const shell = process.env.SHELL;

    if (shell) {
      return shell;
    }

    if (comspec) {
      return comspec;
    }

    return 'Unknown Windows shell';
  }

  // On Unix-like systems
  const shell = process.env.SHELL;
  if (shell) {
    return shell;
  }

  return '/bin/sh';
}

/**
 * Check if we're running in Git Bash
 */
function checkGitBash(): boolean {
  if (process.platform !== 'win32') {
    return false;
  }

  try {
    // Check for MSYS2 environment variable
    if (process.env.MSYSTEM) {
      return true;
    }

    // Check for MINGW environment
    if (process.env.MSYS2_ARG_CONV_EXCL) {
      return true;
    }

    // Check if bash.exe is in the current process path
    const shell = process.env.SHELL || '';
    if (shell.toLowerCase().includes('bash')) {
      return true;
    }

    // Check PATH for Git Bash directories (spaces-safe, case-folded on win32)
    const pathEnv = process.env.PATH || '';
    for (const gitPath of gitBashCandidatePaths()) {
      if (pathContainsDir(pathEnv, gitPath)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Check if GNU coreutils are available (for macOS/Linux)
 * Uses `command -v` to get the resolved path, then checks version output.
 * This handles shell function shadowing (e.g., Claude Code's ugrep/bfs).
 */
export function checkGNUCoreutils(): boolean {
  if (process.platform === 'win32') {
    return false;
  }

  try {
    // Check if we have GNU versions of tools
    // Use `command -v` to get the actual resolved path (works through shell functions)
    // BSD vs GNU grep: GNU grep has -P flag for PCRE.
    const grepResult = child_process.spawnSync('sh', ['-c', 'command -v grep'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const grepPath = grepResult.stdout.trim();
    if (grepPath) {
      const grepCheck = child_process.spawnSync(grepPath, ['-P', '--version'], {
        stdio: 'ignore',
      });
      if (grepCheck.status === 0) return true;
    }

    // Check for GNU sed via resolved path (GNU sed supports --version; BSD sed does not).
    const sedResult = child_process.spawnSync('sh', ['-c', 'command -v sed'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const sedPath = sedResult.stdout.trim();
    if (sedPath) {
      const sedCheck = child_process.spawnSync(sedPath, ['--version'], { stdio: 'ignore' });
      if (sedCheck.status === 0) return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Install GNU coreutils on macOS via Homebrew.
 * Returns the gnubin path that needs to be prepended to PATH, or undefined if installation fails.
 */
function installGNUCoreutilsMacOS(): string | undefined {
  if (process.platform !== 'darwin') {
    return undefined;
  }

  try {
    // Check if Homebrew is installed
    const brewOk = child_process.spawnSync('sh', ['-c', 'command -v brew'], { stdio: 'ignore' });
    if (brewOk.status !== 0) {
      return undefined;
    }

    // Install coreutils, gnu-sed, grep, findutils, gawk if not already installed
    const packages = ['coreutils', 'gnu-sed', 'grep', 'findutils', 'gawk'];
    for (const pkg of packages) {
      // Only install when the formula is not already installed
      const listed = child_process.spawnSync('brew', ['list', '--formula', pkg], {
        stdio: 'ignore',
      });
      if (listed.status !== 0) {
        child_process.spawnSync('brew', ['install', '--quiet', pkg], { stdio: 'ignore' });
      }
    }

    // Get the gnubin path from coreutils
    const result = child_process.spawnSync('brew', ['--prefix', 'coreutils'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0) {
      return undefined;
    }
    const prefix = result.stdout.trim();
    const gnubinPath = path.join(prefix, 'libexec', 'gnubin');

    return gnubinPath;
  } catch {
    return undefined;
  }
}

/**
 * Check which POSIX utilities are missing on Windows
 */
export function checkMissingUtilities(isPosixCompatible: boolean): string[] {
  if (process.platform !== 'win32' || isPosixCompatible) {
    return [];
  }

  const missing: string[] = [];

  for (const util of POSIX_UTILITIES) {
    // `where` reports "not found" via a non-zero exit code (the INFO text goes
    // to stderr), so checking the exit status is what distinguishes "found".
    const where = child_process.spawnSync('cmd.exe', ['/c', 'where', util], { stdio: 'ignore' });
    if (where.status === 0) {
      continue;
    }
    const which = child_process.spawnSync('sh', ['-c', `command -v ${util}`], { stdio: 'ignore' });
    if (which.status === 0) {
      continue;
    }
    missing.push(util);
  }

  return missing;
}

/**
 * Generate shell configuration for an agent
 * Returns the shell configuration that should be used
 */
export function getShellConfiguration(shellInfo: ShellInfo): {
  shell: string;
  posixPath?: string;
  gnuPath?: string;
  needsConfiguration: boolean;
} {
  if (shellInfo.isWindows) {
    // On Windows
    if (shellInfo.isPosixCompatible) {
      return {
        shell: shellInfo.currentShell,
        posixPath: shellInfo.gitBashPath,
        needsConfiguration: false,
      };
    }

    // Need to configure Git Bash
    if (shellInfo.gitBashPath) {
      return {
        shell: 'bash.exe',
        posixPath: shellInfo.gitBashPath,
        needsConfiguration: true,
      };
    }

    // Git Bash not found
    return {
      shell: shellInfo.currentShell,
      needsConfiguration: true,
    };
  }

  // On macOS and Linux
  if (shellInfo.isPosixCompatible) {
    return {
      shell: shellInfo.currentShell,
      gnuPath: shellInfo.gnubinPath,
      needsConfiguration: false,
    };
  }

  // Need to configure GNU coreutils on macOS
  if (shellInfo.isMacOS && shellInfo.gnubinPath) {
    return {
      shell: shellInfo.currentShell,
      gnuPath: shellInfo.gnubinPath,
      needsConfiguration: true,
    };
  }

  // Cannot configure
  return {
    shell: shellInfo.currentShell,
    needsConfiguration: true,
  };
}

/**
 * Generate PATH addition for Git Bash on Windows
 */
export function generateGitBashPathAddition(gitBashPath: string): string {
  if (process.platform !== 'win32') {
    return '';
  }

  const binPath = path.join(gitBashPath, '..', 'mingw64', 'bin');
  const usrBinPath = path.join(gitBashPath, '..', 'usr', 'bin');

  return `${binPath};${usrBinPath}`;
}

/**
 * Generate PATH addition for GNU coreutils on macOS
 */
export function generateMacOSGNUPathAddition(gnubinPath: string): string {
  if (process.platform !== 'darwin') {
    return '';
  }

  return gnubinPath;
}

// Export the installation function for use by other modules
export { installGNUCoreutilsMacOS };

export type ShellFixAction = 'created' | 'updated' | 'unchanged' | 'skipped';

export interface ShellFixResult {
  agent: AgentKey;
  file: string;
  action: ShellFixAction;
  message: string;
  /** Present for created/updated writes: the record used by `shell-fix --revert`. */
  state?: ShellFixStateEntry;
}

export type ShellFixRevertAction = 'removed' | 'reverted' | 'skipped' | 'absent';

export interface ShellFixRevertResult {
  agent: AgentKey | 'mise';
  file: string;
  action: ShellFixRevertAction;
  message: string;
}

function priorField(key: string, previous: string | null, set?: string): ShellFixField {
  return { key, previous, set };
}

/**
 * Resolve the full path to bash.exe from a detected Git Bash directory.
 * Handles both the `usr\bin` form and the plain `bin` form Git for Windows ships.
 * Uses win32 path semantics so the result is correct regardless of host OS
 * (the tests exercise this on Linux CI).
 */
export function bashExecutable(gitBashPath: string): string {
  const parent = winPath.dirname(gitBashPath);
  if (winPath.basename(gitBashPath).toLowerCase() === 'bin') {
    if (winPath.basename(parent).toLowerCase() === 'usr') {
      return winPath.join(gitBashPath, 'bash.exe');
    }
    return winPath.join(parent, 'usr', 'bin', 'bash.exe');
  }
  return winPath.join(gitBashPath, 'bash.exe');
}

/**
 * Apply the per-agent Tier 0 shell override for one agent, per
 * docs/research/tier0-shell-fix.md:
 * - claude_code: env.CLAUDE_CODE_GIT_BASH_PATH in ~/.claude/settings.json
 * - codex_cli:   [windows] shell_path in ~/.codex/config.toml
 * - opencode:    shell + defaultShell in ~/.config/opencode/opencode.json
 * - copilot:     no per-file override exists (SHELL env var); skipped
 *
 * Existing user content is preserved; files are only written when a fix is
 * actually needed, so repeated runs degrade to "unchanged".
 */
export function applyAgentShellFix(agent: AgentKey, bashExe: string, home: string): ShellFixResult {
  switch (agent) {
    case 'claude_code':
      return patchClaudeShellFix(bashExe, home);
    case 'codex_cli':
      return patchCodexShellFix(bashExe, home);
    case 'opencode':
      return patchOpenCodeShellFix(bashExe, home);
    case 'copilot':
      return {
        agent,
        file: '',
        action: 'skipped',
        message:
          "copilot: no change needed — Copilot follows Git Bash's SHELL env var, and the Git Bash bin dirs already on PATH cover this in Git Bash",
      };
    case 'gemini_cli':
    case 'cursor':
    case 'windsurf':
    case 'cline':
    case 'vibe':
      return {
        agent,
        file: '',
        action: 'skipped',
        message: `${agent}: rtk delegation agent (no Tier 0 override needed)`,
      };
  }
}

function patchClaudeShellFix(bashExe: string, home: string): ShellFixResult {
  const file = path.join(home, '.claude', 'settings.json');
  let settings: Record<string, unknown>;

  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeFileWithRetry(
      file,
      JSON.stringify({ env: { CLAUDE_CODE_GIT_BASH_PATH: bashExe } }, null, 2),
    );
    return {
      agent: 'claude_code',
      file,
      action: 'created',
      message: `Set CLAUDE_CODE_GIT_BASH_PATH in ${file}`,
      state: {
        agent: 'claude_code',
        file,
        createdFile: true,
        fields: [priorField('env.CLAUDE_CODE_GIT_BASH_PATH', null, bashExe)],
      },
    };
  }

  try {
    settings = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {
      agent: 'claude_code',
      file,
      action: 'skipped',
      message: `${file} is not valid JSON; refusing to modify it`,
    };
  }

  const env = (settings.env ?? {}) as Record<string, unknown>;
  const bashKey = 'CLAUDE_CODE_GIT_BASH_PATH';
  if (env[bashKey] === bashExe) {
    return { agent: 'claude_code', file, action: 'unchanged', message: `Already set in ${file}` };
  }

  const previous = typeof env[bashKey] === 'string' ? (env[bashKey] as string) : null;
  env[bashKey] = bashExe;
  settings.env = env;
  writeFileWithRetry(file, JSON.stringify(settings, null, 2));
  return {
    agent: 'claude_code',
    file,
    action: 'updated',
    message: `Set CLAUDE_CODE_GIT_BASH_PATH in ${file}`,
    state: {
      agent: 'claude_code',
      file,
      createdFile: false,
      fields: [priorField('env.CLAUDE_CODE_GIT_BASH_PATH', previous, bashExe)],
    },
  };
}

function patchCodexShellFix(bashExe: string, home: string): ShellFixResult {
  const file = path.join(home, '.codex', 'config.toml');
  const valueLine = `shell_path = ${JSON.stringify(bashExe)}`;

  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeFileWithRetry(file, `[windows]\n${valueLine}\n`);
    return {
      agent: 'codex_cli',
      file,
      action: 'created',
      message: `Set [windows] shell_path in ${file}`,
      state: {
        agent: 'codex_cli',
        file,
        createdFile: true,
        fields: [priorField('[windows].shell_path', null, bashExe)],
      },
    };
  }

  const original = fs.readFileSync(file, 'utf-8');
  const updated = setTomlWindowsShellPath(original, valueLine);
  if (updated === original) {
    return { agent: 'codex_cli', file, action: 'unchanged', message: `Already set in ${file}` };
  }

  writeFileWithRetry(file, updated);
  return {
    agent: 'codex_cli',
    file,
    action: 'updated',
    message: `Set [windows] shell_path in ${file}`,
    state: {
      agent: 'codex_cli',
      file,
      createdFile: false,
      fields: [
        priorField('[windows].shell_path', readTomlWindowsShellPath(original) ?? null, bashExe),
      ],
    },
  };
}

function patchOpenCodeShellFix(bashExe: string, home: string): ShellFixResult {
  const file = path.join(home, '.config', 'opencode', 'opencode.json');

  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeFileWithRetry(file, JSON.stringify({ shell: bashExe, defaultShell: bashExe }, null, 2));
    return {
      agent: 'opencode',
      file,
      action: 'created',
      message: `Set shell/defaultShell in ${file}`,
      state: {
        agent: 'opencode',
        file,
        createdFile: true,
        fields: [priorField('shell', null, bashExe), priorField('defaultShell', null, bashExe)],
      },
    };
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {
      agent: 'opencode',
      file,
      action: 'skipped',
      message: `${file} is not valid JSON; refusing to modify it`,
    };
  }

  if (config.shell === bashExe && config.defaultShell === bashExe) {
    return { agent: 'opencode', file, action: 'unchanged', message: `Already set in ${file}` };
  }

  const priorShell = typeof config.shell === 'string' ? (config.shell as string) : null;
  const priorDefault =
    typeof config.defaultShell === 'string' ? (config.defaultShell as string) : null;
  config.shell = bashExe;
  config.defaultShell = bashExe;
  writeFileWithRetry(file, JSON.stringify(config, null, 2));
  return {
    agent: 'opencode',
    file,
    action: 'updated',
    message: `Set shell/defaultShell in ${file}`,
    state: {
      agent: 'opencode',
      file,
      createdFile: false,
      fields: [
        priorField('shell', priorShell, bashExe),
        priorField('defaultShell', priorDefault, bashExe),
      ],
    },
  };
}

/**
 * Rewrite a Codex config.toml so [windows] contains shell_path = valueLine.
 * Returns the original content when no change is needed.
 */
function setTomlWindowsShellPath(content: string, valueLine: string): string {
  const lines = content.split(/\r?\n/);
  let windowsSectionIndex = -1;
  let shellPathIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '[windows]') windowsSectionIndex = i;
    if (/^shell_path\s*=/.test(trimmed)) shellPathIndex = i;
  }

  if (windowsSectionIndex === -1) {
    return `${content.replace(/\s+$/, '')}\n\n[windows]\n${valueLine}\n`;
  }

  if (shellPathIndex !== -1) {
    if (lines[shellPathIndex].trim() === valueLine) return content;
    lines[shellPathIndex] = valueLine;
    return lines.join('\n');
  }

  lines.splice(windowsSectionIndex + 1, 0, valueLine);
  return lines.join('\n');
}

/**
 * Persist the revert records for the files an apply actually changed. Best
 * effort: a failure to record must never fail the apply itself.
 */
function recordShellFixState(results: ShellFixResult[], bashExe: string, statePath: string): void {
  const entries = results
    .map((result) => result.state)
    .filter((entry): entry is ShellFixStateEntry => entry !== undefined);
  if (entries.length === 0) return;
  try {
    const existing = readShellFixState(statePath);
    writeShellFixState(mergeShellFixEntries(existing, entries, bashExe), statePath);
  } catch {
    // Recording is advisory; the fix itself already succeeded.
  }
}

/**
 * Fix shell configuration for Windows and macOS
 * This is a Tier 0 fix - ensures POSIX utilities are available
 */
export function fixShellConfiguration(
  _baseDir: string = '.',
  agents: AgentKey[] = [...AGENT_KEYS],
  complex: boolean = process.stdin.isTTY === true,
  statePath: string = shellFixStatePath(),
): {
  success: boolean;
  message: string;
  gitBashPath?: string;
  gnubinPath?: string;
  results?: ShellFixResult[];
} {
  if (process.platform === 'win32') {
    const shellInfo = detectShell();

    if (shellInfo.isPosixCompatible) {
      return {
        success: true,
        message: 'Shell is already POSIX-compatible',
        gitBashPath: shellInfo.gitBashPath,
      };
    }

    if (!shellInfo.gitBashPath) {
      return {
        success: true,
        message:
          'Git Bash not found in common install locations or on PATH; install Git for Windows to enable Tier 0 shell fixes',
      };
    }

    // Non-TTY/test shell, or tier0.mode = "never": skip file writes, just
    // report the state. (Callers already prefix messages with "Tier 0: "
    // themselves, so this string must not repeat it.)
    if (!complex) {
      return {
        success: true,
        message: `checked; would fix ${agents.length} agent shell(s) — skipped (pass --shell-fix always, or run interactively, to apply)`,
        gitBashPath: shellInfo.gitBashPath,
      };
    }

    const bashExe = bashExecutable(shellInfo.gitBashPath);
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const results = agents.map((agent) => applyAgentShellFix(agent, bashExe, home));
    const written = results.filter(
      (result) => result.action === 'created' || result.action === 'updated',
    );
    recordShellFixState(written, bashExe, statePath);

    const message =
      written.length > 0
        ? `Current shell (${shellInfo.currentShell}) is not POSIX-compatible; pointed agents at Git Bash (${bashExe})`
        : `Git Bash detected at ${bashExe}; agent shell config already up to date`;

    return {
      success: true,
      message,
      gitBashPath: shellInfo.gitBashPath,
      results,
    };
  }

  // macOS and Linux: ensure GNU coreutils are available
  if (process.platform === 'darwin') {
    const shellInfo = detectShell();

    if (shellInfo.isPosixCompatible) {
      return {
        success: true,
        message: 'Shell is already POSIX-compatible',
        gnubinPath: shellInfo.gnubinPath,
      };
    }

    // Try to install GNU coreutils via Homebrew
    const gnubinPath = installGNUCoreutilsMacOS();
    if (!gnubinPath) {
      return {
        success: false,
        message:
          'GNU coreutils not found and could not be installed. Please install Homebrew and run: brew install coreutils gnu-sed grep findutils gawk',
      };
    }

    return {
      success: true,
      message: `GNU coreutils installed via Homebrew. Prepend ${gnubinPath} to PATH for GNU tools.`,
      gnubinPath,
    };
  }

  // Linux and other platforms
  const shellInfo = detectShell();
  if (shellInfo.isPosixCompatible) {
    return {
      success: true,
      message: 'Shell is already POSIX-compatible',
    };
  }

  return {
    success: false,
    message:
      'POSIX-compatible shell not detected. Most Linux distributions ship with GNU coreutils by default.',
  };
}

/**
 * Check whether a specific agent's own config already points it at a POSIX
 * (bash) shell — i.e. whether Tier 0's per-agent fix (applyAgentShellFix) has
 * actually taken effect for that agent. Reads exactly the field each
 * patch*ShellFix writes, so this stays in sync with what `apply` can affect;
 * it deliberately does not look at the current process's own shell/env,
 * since that's the interactive shell the user is running agentenv from, not
 * the target agent's configuration.
 */
export function checkAgentShellConfiguration(
  agent: AgentKey,
  home: string = process.env.HOME || process.env.USERPROFILE || '',
): { isConfigured: boolean; shell?: string; needsFix: boolean } {
  switch (agent) {
    case 'claude_code':
      return checkClaudeCodeShell(home);
    case 'codex_cli':
      return checkCodexShell(home);
    case 'copilot':
      return checkCopilotShell();
    case 'opencode':
      return checkOpenCodeShell(home);
    case 'gemini_cli':
    case 'cursor':
    case 'windsurf':
    case 'cline':
    case 'vibe':
      return { isConfigured: true, needsFix: false };
  }
}

function isBashPath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Check Claude Code shell configuration: reads env.CLAUDE_CODE_GIT_BASH_PATH,
 * the exact field patchClaudeShellFix writes.
 */
function checkClaudeCodeShell(home: string): {
  isConfigured: boolean;
  shell?: string;
  needsFix: boolean;
} {
  try {
    const settingsPath = path.join(home, '.claude', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as Record<
        string,
        unknown
      >;
      const env = (settings.env ?? {}) as Record<string, unknown>;
      const bashPath = env.CLAUDE_CODE_GIT_BASH_PATH;
      if (isBashPath(bashPath)) {
        return {
          isConfigured: true,
          shell: bashPath,
          needsFix: !bashPath.toLowerCase().includes('bash'),
        };
      }
    }
    return { isConfigured: false, needsFix: true };
  } catch {
    return { isConfigured: false, needsFix: true };
  }
}

/**
 * Extract the `shell_path` value from a Codex config.toml's [windows]
 * section, matching what setTomlWindowsShellPath writes.
 */
function readTomlWindowsShellPath(content: string): string | undefined {
  const lines = content.split(/\r?\n/);
  let inWindowsSection = false;
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (/^\[.*]$/.test(trimmed)) {
      inWindowsSection = trimmed === '[windows]';
      continue;
    }
    if (inWindowsSection) {
      // valueLine is built via JSON.stringify(bashExe) (patchCodexShellFix),
      // so a JSON-compatible quoted-string parse reverses it correctly.
      const match = /^shell_path\s*=\s*("(?:[^"\\]|\\.)*")$/.exec(trimmed);
      if (match) {
        try {
          return JSON.parse(match[1]) as string;
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

/**
 * Check Codex CLI shell configuration: reads [windows] shell_path from
 * config.toml, the exact field patchCodexShellFix writes.
 */
function checkCodexShell(home: string): {
  isConfigured: boolean;
  shell?: string;
  needsFix: boolean;
} {
  try {
    const configPath = path.join(home, '.codex', 'config.toml');
    if (fs.existsSync(configPath)) {
      const shellPath = readTomlWindowsShellPath(fs.readFileSync(configPath, 'utf-8'));
      if (isBashPath(shellPath)) {
        return {
          isConfigured: true,
          shell: shellPath,
          needsFix: !shellPath.toLowerCase().includes('bash'),
        };
      }
    }
    return { isConfigured: false, needsFix: true };
  } catch {
    return { isConfigured: false, needsFix: true };
  }
}

/**
 * GitHub Copilot has no per-file shell override (see applyAgentShellFix) —
 * it follows the SHELL env var, which Tier 0's Git Bash PATH entries already
 * cover, so there is nothing here for `apply` to fix.
 */
function checkCopilotShell(): { isConfigured: boolean; shell?: string; needsFix: boolean } {
  return { isConfigured: true, needsFix: false };
}

/**
 * Check OpenCode shell configuration: reads `shell`, the exact field
 * patchOpenCodeShellFix writes.
 */
function checkOpenCodeShell(home: string): {
  isConfigured: boolean;
  shell?: string;
  needsFix: boolean;
} {
  try {
    const configPath = path.join(home, '.config', 'opencode', 'opencode.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      const shell = config.shell;
      if (isBashPath(shell)) {
        return { isConfigured: true, shell, needsFix: !shell.toLowerCase().includes('bash') };
      }
    }
    return { isConfigured: false, needsFix: true };
  } catch {
    return { isConfigured: false, needsFix: true };
  }
}

/**
 * Remove the `shell_path` line that setTomlWindowsShellPath writes and, if that
 * leaves the `[windows]` section empty, the section header too. Returns the
 * content unchanged when no `shell_path` line is present.
 */
export function removeTomlWindowsShellPath(content: string): string {
  const lines = content.split(/\r?\n/);
  const shellPathIndex = lines.findIndex((line) => /^shell_path\s*=/.test(line.trim()));
  if (shellPathIndex === -1) return content;
  lines.splice(shellPathIndex, 1);

  const headerIndex = lines.findIndex((line) => line.trim() === '[windows]');
  if (headerIndex !== -1) {
    let empty = true;
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (/^\[.*]$/.test(trimmed)) break;
      if (trimmed !== '') {
        empty = false;
        break;
      }
    }
    if (empty) lines.splice(headerIndex, 1);
  }

  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

function revertResult(
  entry: ShellFixStateEntry,
  action: ShellFixRevertAction,
  message: string,
): ShellFixRevertResult {
  return { agent: entry.agent, file: entry.file, action, message };
}

function restoreClaudeShellFix(
  entry: ShellFixStateEntry,
  bashExe: string,
  dryRun: boolean,
): ShellFixRevertResult {
  if (!fs.existsSync(entry.file)) {
    return revertResult(entry, 'absent', `${entry.file} is already gone`);
  }
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(fs.readFileSync(entry.file, 'utf-8')) as Record<string, unknown>;
  } catch {
    return revertResult(entry, 'skipped', `${entry.file} is not valid JSON; leaving it untouched`);
  }
  const env = (settings.env ?? {}) as Record<string, unknown>;
  const key = 'CLAUDE_CODE_GIT_BASH_PATH';
  if (env[key] === undefined) {
    return revertResult(entry, 'absent', `No agentenv shell override in ${entry.file}`);
  }
  if (env[key] !== bashExe) {
    return revertResult(
      entry,
      'skipped',
      `${entry.file}: CLAUDE_CODE_GIT_BASH_PATH changed after agentenv set it; leaving it untouched`,
    );
  }
  const previous =
    entry.fields.find((field) => field.key === 'env.CLAUDE_CODE_GIT_BASH_PATH')?.previous ?? null;
  if (previous === null) delete env[key];
  else env[key] = previous;
  if (Object.keys(env).length === 0) delete settings.env;

  if (entry.createdFile && Object.keys(settings).length === 0) {
    if (!dryRun) fs.rmSync(entry.file, { force: true });
    return revertResult(entry, 'removed', `Removed ${entry.file} (created by agentenv)`);
  }
  if (!dryRun) writeFileWithRetry(entry.file, JSON.stringify(settings, null, 2));
  return revertResult(entry, 'reverted', `Restored ${entry.file}`);
}

function restoreCodexShellFix(
  entry: ShellFixStateEntry,
  bashExe: string,
  dryRun: boolean,
): ShellFixRevertResult {
  if (!fs.existsSync(entry.file)) {
    return revertResult(entry, 'absent', `${entry.file} is already gone`);
  }
  const content = fs.readFileSync(entry.file, 'utf-8');
  const current = readTomlWindowsShellPath(content);
  if (current === undefined) {
    return revertResult(entry, 'absent', `No agentenv shell override in ${entry.file}`);
  }
  if (current !== bashExe) {
    return revertResult(
      entry,
      'skipped',
      `${entry.file}: [windows] shell_path changed after agentenv set it; leaving it untouched`,
    );
  }
  const next = removeTomlWindowsShellPath(content);
  if (entry.createdFile && next.trim() === '') {
    if (!dryRun) fs.rmSync(entry.file, { force: true });
    return revertResult(entry, 'removed', `Removed ${entry.file} (created by agentenv)`);
  }
  if (next !== content && !dryRun) writeFileWithRetry(entry.file, next);
  return revertResult(entry, 'reverted', `Restored ${entry.file}`);
}

function restoreOpenCodeShellFix(
  entry: ShellFixStateEntry,
  bashExe: string,
  dryRun: boolean,
): ShellFixRevertResult {
  if (!fs.existsSync(entry.file)) {
    return revertResult(entry, 'absent', `${entry.file} is already gone`);
  }
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(fs.readFileSync(entry.file, 'utf-8')) as Record<string, unknown>;
  } catch {
    return revertResult(entry, 'skipped', `${entry.file} is not valid JSON; leaving it untouched`);
  }

  let changed = false;
  let drifted = false;
  for (const key of ['shell', 'defaultShell'] as const) {
    if (config[key] === undefined) continue;
    if (config[key] !== bashExe) {
      drifted = true;
      continue;
    }
    const previous = entry.fields.find((field) => field.key === key)?.previous ?? null;
    if (previous === null) delete config[key];
    else config[key] = previous;
    changed = true;
  }

  if (!changed && !drifted) {
    return revertResult(entry, 'absent', `No agentenv shell override in ${entry.file}`);
  }
  if (drifted && !changed) {
    return revertResult(
      entry,
      'skipped',
      `${entry.file}: shell/defaultShell changed after agentenv set it; leaving it untouched`,
    );
  }
  if (entry.createdFile && Object.keys(config).length === 0) {
    if (!dryRun) fs.rmSync(entry.file, { force: true });
    return revertResult(entry, 'removed', `Removed ${entry.file} (created by agentenv)`);
  }
  if (changed && !dryRun) writeFileWithRetry(entry.file, JSON.stringify(config, null, 2));
  return revertResult(entry, 'reverted', `Restored ${entry.file}`);
}

function restoreMiseShimsDir(
  entry: ShellFixStateEntry,
  _bashExe: string,
  dryRun: boolean,
): ShellFixRevertResult {
  const field = entry.fields.find((candidate) => candidate.key === 'shims_dir');
  const expected = field?.set;
  if (expected === undefined) {
    return revertResult(
      entry,
      'skipped',
      `${entry.file}: no recorded shims_dir value; leaving it untouched`,
    );
  }
  if (!fs.existsSync(entry.file)) {
    if (entry.createdFile) {
      return revertResult(entry, 'removed', `${entry.file} is already gone`);
    }
    return revertResult(entry, 'absent', `${entry.file} is already gone`);
  }
  const content = fs.readFileSync(entry.file, 'utf-8');
  const current = getShimsDirValue(content);
  if (current !== expected) {
    return revertResult(
      entry,
      'skipped',
      `${entry.file}: shims_dir changed after agentenv set it; leaving it untouched`,
    );
  }
  const next = removeShimsDirValue(content);
  if (entry.createdFile && next.trim() === '') {
    if (!dryRun) fs.rmSync(entry.file, { force: true });
    return revertResult(entry, 'removed', `Removed ${entry.file} (created by agentenv)`);
  }
  if (next !== content && !dryRun) writeFileWithRetry(entry.file, next);
  return revertResult(entry, 'reverted', `Restored ${entry.file}`);
}

function revertShellFixEntry(
  entry: ShellFixStateEntry,
  bashExe: string,
  dryRun: boolean,
): ShellFixRevertResult {
  switch (entry.agent) {
    case 'claude_code':
      return restoreClaudeShellFix(entry, bashExe, dryRun);
    case 'codex_cli':
      return restoreCodexShellFix(entry, bashExe, dryRun);
    case 'opencode':
      return restoreOpenCodeShellFix(entry, bashExe, dryRun);
    case 'mise':
      return restoreMiseShimsDir(entry, bashExe, dryRun);
    default:
      return revertResult(entry, 'skipped', `${entry.agent}: no revert handler`);
  }
}

/**
 * Undo the Tier 0 agent shell fixes recorded by previous applies. Each entry is
 * reverted only when the file still holds the value agentenv set; a value the
 * user changed afterwards is left untouched and reported as skipped, and the
 * manifest retains that entry so a later run can retry. Clears the manifest
 * once nothing is left to revert. With `dryRun`, reports what it would do
 * without touching any file or the manifest.
 */
export function revertShellFixes(
  statePath: string = shellFixStatePath(),
  dryRun: boolean = false,
): ShellFixRevertResult[] {
  const state = readShellFixState(statePath);
  if (!state) return [];

  const results: ShellFixRevertResult[] = [];
  const remaining: ShellFixStateEntry[] = [];
  for (const entry of state.entries) {
    const result = revertShellFixEntry(entry, state.bashExe, dryRun);
    results.push(result);
    if (result.action === 'skipped') remaining.push(entry);
  }

  if (dryRun) return results;
  if (remaining.length === 0) clearShellFixState(statePath);
  else writeShellFixState({ ...state, entries: remaining }, statePath);
  return results;
}

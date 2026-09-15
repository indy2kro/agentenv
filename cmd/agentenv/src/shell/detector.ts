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

// Well-known paths for Git Bash on Windows
export const GIT_BASH_PATHS = [
  'C:\\Program Files\\Git\\bin',
  'C:\\Program Files\\Git\\usr\\bin',
  'C:\\Program Files (x86)\\Git\\bin',
  'C:\\Program Files (x86)\\Git\\usr\\bin',
];

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
 * Detect the current shell environment
 */
export function detectShell(): ShellInfo {
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
    for (const gitPath of GIT_BASH_PATHS) {
      try {
        if (fs.existsSync(gitPath)) {
          gitBashPath = gitPath;
          break;
        }
      } catch {
        // Ignore
      }
    }
  } else if (isMacOS) {
    // On macOS, check for GNU coreutils
    isPosixCompatible = checkGNUCoreutils();

    // If GNU coreutils are not available, we may need to install them
    if (!isPosixCompatible) {
      gnubinPath = installGNUCoreutilsMacOS();
      if (gnubinPath) {
        isPosixCompatible = true;
      }
    } else {
      // Try to get the gnubin path if coreutils are installed
      try {
        const prefix = child_process
          .execSync('brew --prefix coreutils', { encoding: 'utf-8' })
          .trim();
        gnubinPath = path.join(prefix, 'libexec', 'gnubin');
      } catch {
        // coreutils not installed via Homebrew, or Homebrew not available
      }
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

    // Check PATH for Git Bash directories
    const pathEnv = process.env.PATH || '';
    const pathParts = pathEnv.split(';');

    for (const gitPath of GIT_BASH_PATHS) {
      if (pathParts.some((p) => p.toLowerCase() === gitPath.toLowerCase())) {
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
function checkGNUCoreutils(): boolean {
  if (process.platform === 'win32') {
    return false;
  }

  try {
    // Check if we have GNU versions of tools
    // Use `command -v` to get the actual resolved path (works through shell functions)
    // BSD vs GNU grep: GNU grep has -P flag for PCRE
    try {
      // First, get the resolved path - this will follow shell function aliases.
      // Then invoke the binary directly rather than building a shell string so
      // paths containing spaces keep working reliably.
      const grepPath = child_process.execSync('command -v grep', { encoding: 'utf-8' }).trim();
      child_process.spawnSync(grepPath, ['-P', '--version'], { stdio: 'ignore' });
      return true;
    } catch {
      // Try other indicators
    }

    // Check for GNU sed via resolved path
    try {
      const sedPath = child_process.execSync('command -v sed', { encoding: 'utf-8' }).trim();
      // GNU sed supports --version; BSD sed does not
      child_process.spawnSync(sedPath, ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      // Ignore
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
    child_process.execSync('command -v brew', { stdio: 'ignore' });

    // Install coreutils, gnu-sed, grep, findutils, gawk if not already installed
    const packages = ['coreutils', 'gnu-sed', 'grep', 'findutils', 'gawk'];
    for (const pkg of packages) {
      try {
        // Check if already installed
        child_process.execSync(`brew list --formula ${pkg}`, { stdio: 'ignore' });
      } catch {
        // Not installed, install it
        child_process.execSync(`brew install --quiet ${pkg}`, { stdio: 'ignore' });
      }
    }

    // Get the gnubin path from coreutils
    const prefix = child_process.execSync('brew --prefix coreutils', { encoding: 'utf-8' }).trim();
    const gnubinPath = path.join(prefix, 'libexec', 'gnubin');

    return gnubinPath;
  } catch {
    return undefined;
  }
}

/**
 * Check which POSIX utilities are missing on Windows
 */
function checkMissingUtilities(isPosixCompatible: boolean): string[] {
  if (process.platform !== 'win32' || isPosixCompatible) {
    return [];
  }

  const missing: string[] = [];

  for (const util of POSIX_UTILITIES) {
    try {
      // Try to find the utility
      child_process.execSync(`where ${util}`, { stdio: 'ignore' });
    } catch {
      try {
        child_process.execSync(`which ${util}`, { stdio: 'ignore' });
      } catch {
        missing.push(util);
      }
    }
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
        message: 'GitHub Copilot follows the SHELL env var; Git Bash bin dirs on PATH cover this',
      };
  }
}

function patchClaudeShellFix(bashExe: string, home: string): ShellFixResult {
  const file = path.join(home, '.claude', 'settings.json');
  let settings: Record<string, unknown>;

  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({ env: { CLAUDE_CODE_GIT_BASH_PATH: bashExe } }, null, 2),
    );
    return {
      agent: 'claude_code',
      file,
      action: 'created',
      message: `Set CLAUDE_CODE_GIT_BASH_PATH in ${file}`,
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

  env[bashKey] = bashExe;
  settings.env = env;
  fs.writeFileSync(file, JSON.stringify(settings, null, 2));
  return {
    agent: 'claude_code',
    file,
    action: 'updated',
    message: `Set CLAUDE_CODE_GIT_BASH_PATH in ${file}`,
  };
}

function patchCodexShellFix(bashExe: string, home: string): ShellFixResult {
  const file = path.join(home, '.codex', 'config.toml');
  const valueLine = `shell_path = ${JSON.stringify(bashExe)}`;

  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `[windows]\n${valueLine}\n`);
    return {
      agent: 'codex_cli',
      file,
      action: 'created',
      message: `Set [windows] shell_path in ${file}`,
    };
  }

  const original = fs.readFileSync(file, 'utf-8');
  const updated = setTomlWindowsShellPath(original, valueLine);
  if (updated === original) {
    return { agent: 'codex_cli', file, action: 'unchanged', message: `Already set in ${file}` };
  }

  fs.writeFileSync(file, updated);
  return {
    agent: 'codex_cli',
    file,
    action: 'updated',
    message: `Set [windows] shell_path in ${file}`,
  };
}

function patchOpenCodeShellFix(bashExe: string, home: string): ShellFixResult {
  const file = path.join(home, '.config', 'opencode', 'opencode.json');

  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ shell: bashExe, defaultShell: bashExe }, null, 2));
    return {
      agent: 'opencode',
      file,
      action: 'created',
      message: `Set shell/defaultShell in ${file}`,
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

  config.shell = bashExe;
  config.defaultShell = bashExe;
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  return {
    agent: 'opencode',
    file,
    action: 'updated',
    message: `Set shell/defaultShell in ${file}`,
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
 * Fix shell configuration for Windows and macOS
 * This is a Tier 0 fix - ensures POSIX utilities are available
 */
export function fixShellConfiguration(
  _baseDir: string = '.',
  agents: AgentKey[] = [...AGENT_KEYS],
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
        success: false,
        message:
          'Git Bash not found. Install Git for Windows (https://git-scm.com/download/win), then re-run `agentenv apply`.',
      };
    }

    const bashExe = bashExecutable(shellInfo.gitBashPath);
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const results = agents.map((agent) => applyAgentShellFix(agent, bashExe, home));
    const written = results.filter(
      (result) => result.action === 'created' || result.action === 'updated',
    );

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
 * Check if a specific agent is configured to use a POSIX shell
 */
export function checkAgentShellConfiguration(agent: string): {
  isConfigured: boolean;
  shell?: string;
  needsFix: boolean;
} {
  if (process.platform !== 'win32') {
    return {
      isConfigured: true,
      needsFix: false,
    };
  }

  // Agent-specific shell configuration check
  switch (agent) {
    case 'claude_code':
      // Claude Code uses SHELL environment variable or config
      return checkClaudeCodeShell();
    case 'codex_cli':
      return checkCodexShell();
    case 'copilot':
      return checkCopilotShell();
    case 'opencode':
      return checkOpenCodeShell();
    default:
      return {
        isConfigured: false,
        needsFix: true,
      };
  }
}

/**
 * Check Claude Code shell configuration
 */
function checkClaudeCodeShell(): { isConfigured: boolean; shell?: string; needsFix: boolean } {
  try {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const settingsPath = path.join(home, '.claude', 'settings.json');

    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(data);

      if (settings.shell) {
        return {
          isConfigured: true,
          shell: settings.shell,
          needsFix: !settings.shell.toLowerCase().includes('bash'),
        };
      }
    }

    return {
      isConfigured: false,
      needsFix: true,
    };
  } catch {
    return {
      isConfigured: false,
      needsFix: true,
    };
  }
}

/**
 * Check Codex CLI shell configuration
 */
function checkCodexShell(): { isConfigured: boolean; shell?: string; needsFix: boolean } {
  // Codex CLI respects the SHELL environment variable
  const shell = process.env.SHELL;

  if (shell && shell.toLowerCase().includes('bash')) {
    return {
      isConfigured: true,
      shell,
      needsFix: false,
    };
  }

  return {
    isConfigured: false,
    needsFix: true,
  };
}

/**
 * Check Copilot shell configuration
 */
function checkCopilotShell(): { isConfigured: boolean; shell?: string; needsFix: boolean } {
  // GitHub Copilot CLI respects the SHELL environment variable
  const shell = process.env.SHELL;

  if (shell && shell.toLowerCase().includes('bash')) {
    return {
      isConfigured: true,
      shell,
      needsFix: false,
    };
  }

  return {
    isConfigured: false,
    needsFix: true,
  };
}

/**
 * Check OpenCode shell configuration
 */
function checkOpenCodeShell(): { isConfigured: boolean; shell?: string; needsFix: boolean } {
  try {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const configPath = path.join(home, '.config', 'opencode', 'opencode.json');

    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(data);

      if (config.shell) {
        return {
          isConfigured: true,
          shell: config.shell,
          needsFix: !config.shell.toLowerCase().includes('bash'),
        };
      }
    }

    return {
      isConfigured: false,
      needsFix: true,
    };
  } catch {
    return {
      isConfigured: false,
      needsFix: true,
    };
  }
}

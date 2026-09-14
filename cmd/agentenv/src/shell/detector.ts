/**
 * Tier 0 Shell Detection and Configuration
 * Detects the shell environment and ensures POSIX compatibility on Windows
 */

import * as fs from 'fs';
import * as path from 'path';
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
  isGitBash: boolean;
  gitBashPath?: string;
  missingUtilities: string[];
  pathEnvironment: string;
}

/**
 * Detect the current shell environment
 */
export function detectShell(): ShellInfo {
  const isWindows = process.platform === 'win32';
  const currentShell = determineCurrentShell();

  // Check if we're already in a POSIX-compatible environment
  let isPosixCompatible: boolean;
  let isGitBash = false;
  let gitBashPath: string | undefined;
  const pathEnvironment = process.env.PATH || '';

  if (isWindows) {
    // Check if we're in Git Bash (MSYS2)
    isGitBash = checkGitBash();
    isPosixCompatible = isGitBash;

    // Find Git Bash path
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

    // Check PATH for Git Bash directories
    if (!isGitBash && gitBashPath) {
      // Check if Git Bash binaries are in PATH
      const pathParts = pathEnvironment.split(path.delimiter);
      const hasGitInPath = pathParts.some(
        (p) => p.includes('Git') && (p.includes('bin') || p.includes('usr\\bin')),
      );

      if (hasGitInPath) {
        isPosixCompatible = true;
      }
    }
  } else {
    // On Unix-like systems, check for GNU coreutils
    isPosixCompatible = checkGNUCoreutils();
  }

  // Check for missing POSIX utilities
  const missingUtilities = isWindows ? checkMissingUtilities(isPosixCompatible) : [];

  return {
    currentShell,
    isPosixCompatible,
    isWindows: isWindows,
    isGitBash,
    gitBashPath,
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
    const comspec = process.env.COMSPEC;
    const shell = process.env.SHELL;

    if (shell) {
      // In Git Bash, SHELL points to bash
      if (shell.includes('bash')) {
        return shell;
      }
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
 */
function checkGNUCoreutils(): boolean {
  if (process.platform === 'win32') {
    return false;
  }

  try {
    // Check if we have GNU versions of tools
    // BSD vs GNU grep: GNU grep has -P flag for PCRE
    try {
      child_process.execSync('grep -P --version', { stdio: 'ignore' });
      return true;
    } catch {
      // Try other indicators
    }

    // Check for GNU sed
    try {
      child_process.execSync('sed --version', { stdio: 'ignore' });
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
  needsConfiguration: boolean;
} {
  if (!shellInfo.isWindows) {
    return {
      shell: shellInfo.currentShell,
      needsConfiguration: false,
    };
  }

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
 */
export function bashExecutable(gitBashPath: string): string {
  const parent = path.dirname(gitBashPath);
  if (path.basename(gitBashPath).toLowerCase() === 'bin') {
    if (path.basename(parent).toLowerCase() === 'usr') {
      return path.join(gitBashPath, 'bash.exe');
    }
    return path.join(parent, 'usr', 'bin', 'bash.exe');
  }
  return path.join(gitBashPath, 'bash.exe');
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
 * Fix shell configuration for Windows
 * This is a Tier 0 fix - ensures POSIX utilities are available
 */
export function fixShellConfiguration(
  _baseDir: string = '.',
  agents: AgentKey[] = [...AGENT_KEYS],
): {
  success: boolean;
  message: string;
  gitBashPath?: string;
  results?: ShellFixResult[];
} {
  if (process.platform !== 'win32') {
    return {
      success: true,
      message: 'Not applicable on non-Windows systems',
    };
  }

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
      message: 'Git Bash not found. Please install Git for Windows first.',
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
      ? `Configured agent shell overrides (${written.map((result) => result.agent).join(', ')}) pointing at ${bashExe}`
      : `Git Bash detected at ${bashExe}; agent shell config already up to date`;

  return {
    success: true,
    message,
    gitBashPath: shellInfo.gitBashPath,
    results,
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

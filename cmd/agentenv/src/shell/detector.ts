/**
 * Tier 0 Shell Detection and Configuration
 * Detects the shell environment and ensures POSIX compatibility on Windows
 */

import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';

// Well-known POSIX utilities that should be available
export const POSIX_UTILITIES = [
  'grep', 'sed', 'awk', 'find', 'diff', 'tar', 'gzip', 'curl',
  'cat', 'ls', 'mkdir', 'rm', 'cp', 'mv', 'less'
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
  let isPosixCompatible = false;
  let isGitBash = false;
  let gitBashPath: string | undefined;
  let pathEnvironment = process.env.PATH || '';

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
      const gitBinPath = path.join(gitBashPath, '..', 'mingw64', 'bin');
      const gitUsrBinPath = path.join(gitBashPath, '..', 'usr', 'bin');
      
      // Check if Git Bash binaries are in PATH
      const pathParts = pathEnvironment.split(path.delimiter);
      const hasGitInPath = pathParts.some(p => 
        p.includes('Git') && (p.includes('bin') || p.includes('usr\\bin'))
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
  const missingUtilities = isWindows 
    ? checkMissingUtilities(isPosixCompatible)
    : [];
  
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
      if (pathParts.some(p => p.toLowerCase() === gitPath.toLowerCase())) {
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

/**
 * Fix shell configuration for Windows
 * This is a Tier 0 fix - ensures POSIX utilities are available
 */
export function fixShellConfiguration(baseDir: string = '.'): {
  success: boolean;
  message: string;
  gitBashPath?: string;
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
  
  // Try to find Git Bash
  if (!shellInfo.gitBashPath) {
    return {
      success: false,
      message: 'Git Bash not found. Please install Git for Windows first.',
    };
  }
  
  // For project scope, we need to configure the agent to use Git Bash
  // This is done through agent-specific configuration
  return {
    success: true,
    message: 'Git Bash detected. Agent configuration will be updated to use it.',
    gitBashPath: shellInfo.gitBashPath,
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

/**
 * Platform-specific Fallback Installations
 * Handles tools that cannot be installed via mise (tokei)
 * Implements platform-specific fallback paths as documented in phase0-findings.md
 */

import * as child_process from 'child_process';

/**
 * Platform-specific installation commands for tools not in mise registry
 */
export interface PlatformInstallCommand {
  macos: string[];
  linux: string[];
  windows: string[];
}

/**
 * Information about fallback tools
 */
export interface FallbackTool {
  name: string;
  description: string;
  install: PlatformInstallCommand;
  verify: PlatformInstallCommand;
  paths: {
    macos?: string;
    linux?: string;
    windows?: string;
  };
}

/**
 * Fallback tools that cannot be installed via mise
 * Based on Phase 0 findings:
 * - tokei: aqua:XAMPPRocky/tokei doesn't work, needs cargo:tokei (requires Rust)
 */
export const FALLBACK_TOOLS: Record<string, FallbackTool> = {
  tokei: {
    name: 'tokei',
    description: 'Fast LOC/code-statistics tool',
    install: {
      macos: ['brew install --quiet tokei'],
      linux: ['cargo install --quiet tokei', 'sudo apt-get install -y tokei'],
      windows: ['cargo install --quiet tokei', 'choco install tokei'],
    },
    verify: {
      macos: ['command -v tokei', 'tokei --version'],
      linux: ['command -v tokei', 'tokei --version'],
      windows: ['where tokei', 'tokei --version'],
    },
    paths: {
      macos: '/usr/local/bin/tokei',
      linux: '~/.cargo/bin/tokei',
      windows: '%USERPROFILE%\\.cargo\\bin\\tokei.exe',
    },
  },
};

/**
 * Tools that have special installation requirements
 * These are marked as "Fallback required" in phase0-findings.md
 */
export const FALLBACK_REQUIRED_TOOLS = ['tokei'];

/**
 * Check if a tool requires fallback installation
 */
export function requiresFallback(toolName: string): boolean {
  return FALLBACK_REQUIRED_TOOLS.includes(toolName);
}

/**
 * Tools whose only mise backend flatly refuses to resolve on certain
 * platforms (mise: "unsupported env: <os>/<arch>"), with no fallback install
 * path at all — unlike tokei above, there is nothing to shell out to.
 * Verified against mise 2026.9.11 on Windows: both ripgrep-all
 * (aqua:phiresky/ripgrep-all) and jless (aqua:PaulJuliusMartinez/jless)
 * declare only linux/darwin as supported envs.
 */
export const PLATFORM_UNSUPPORTED_TOOLS: Record<string, NodeJS.Platform[]> = {
  ripgrep_all: ['win32'],
  jless: ['win32'],
};

/** Whether mise cannot install this tool at all on the given platform. */
export function isPlatformUnsupported(
  toolName: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return PLATFORM_UNSUPPORTED_TOOLS[toolName]?.includes(platform) ?? false;
}

/**
 * Get the platform-specific installation command for a fallback tool
 */
export function getInstallCommand(toolName: string): string[] | undefined {
  const platform = process.platform;
  const fallbackTool = FALLBACK_TOOLS[toolName];

  if (!fallbackTool) {
    return undefined;
  }

  if (platform === 'darwin') {
    return fallbackTool.install.macos;
  } else if (platform === 'linux') {
    return fallbackTool.install.linux;
  } else if (platform === 'win32') {
    return fallbackTool.install.windows;
  }

  return undefined;
}

/**
 * Get the platform-specific verification command for a fallback tool
 */
export function getVerifyCommand(toolName: string): string[] | undefined {
  const platform = process.platform;
  const fallbackTool = FALLBACK_TOOLS[toolName];

  if (!fallbackTool) {
    return undefined;
  }

  if (platform === 'darwin') {
    return fallbackTool.verify.macos;
  } else if (platform === 'linux') {
    return fallbackTool.verify.linux;
  } else if (platform === 'win32') {
    return fallbackTool.verify.windows;
  }

  return undefined;
}

/**
 * Check if a fallback tool is installed on the current platform
 */
export function isFallbackToolInstalled(toolName: string): boolean {
  const verifyCommands = getVerifyCommand(toolName);

  if (!verifyCommands || verifyCommands.length === 0) {
    return false;
  }

  try {
    // Try each verification command until one succeeds
    for (const cmd of verifyCommands) {
      const shell = process.platform === 'win32' ? 'cmd.exe' : 'sh';
      const shellArgs = process.platform === 'win32' ? ['/c', cmd] : ['-c', cmd];
      const result = child_process.spawnSync(shell, shellArgs, { stdio: 'ignore', shell: true });
      if (result.status === 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Install a fallback tool on the current platform
 * Returns success status and any error message
 */
export function installFallbackTool(toolName: string): { success: boolean; message: string } {
  const installCommands = getInstallCommand(toolName);

  if (!installCommands || installCommands.length === 0) {
    return {
      success: false,
      message: `No installation commands defined for ${toolName} on ${process.platform}`,
    };
  }

  const fallbackTool = FALLBACK_TOOLS[toolName];

  try {
    // Try each installation command until one succeeds
    for (const cmd of installCommands) {
      try {
        const shell = process.platform === 'win32' ? 'cmd.exe' : 'sh';
        const shellArgs = process.platform === 'win32' ? ['/c', cmd] : ['-c', cmd];
        child_process.spawnSync(shell, shellArgs, { stdio: 'inherit', shell: true });

        // Verify installation was successful
        if (isFallbackToolInstalled(toolName)) {
          return {
            success: true,
            message: `Successfully installed ${fallbackTool?.description || toolName} via: ${cmd}`,
          };
        }
      } catch {
        // Try the next command
        continue;
      }
    }

    return {
      success: false,
      message: `Failed to install ${fallbackTool?.description || toolName}. Tried all available installation methods.`,
    };
  } catch (err) {
    return {
      success: false,
      message: `Error installing ${fallbackTool?.description || toolName}: ${err}`,
    };
  }
}

/**
 * Get the expected path for a fallback tool on the current platform
 */
export function getFallbackToolPath(toolName: string): string | undefined {
  const platform = process.platform;
  const fallbackTool = FALLBACK_TOOLS[toolName];

  if (!fallbackTool || !fallbackTool.paths) {
    return undefined;
  }

  if (platform === 'darwin' && fallbackTool.paths.macos) {
    return fallbackTool.paths.macos;
  } else if (platform === 'linux' && fallbackTool.paths.linux) {
    return fallbackTool.paths.linux;
  } else if (platform === 'win32' && fallbackTool.paths.windows) {
    return fallbackTool.paths.windows;
  }

  return undefined;
}

/**
 * Generate platform-specific advice for installing a fallback tool
 */
export function getFallbackInstallationAdvice(toolName: string): string {
  const platform = process.platform;
  const fallbackTool = FALLBACK_TOOLS[toolName];

  if (!fallbackTool) {
    return `Tool ${toolName} requires manual installation. Please install it according to your platform's package manager.`;
  }

  const installCommands = getInstallCommand(toolName);

  if (platform === 'darwin') {
    return `To install ${fallbackTool.description} on macOS, run: ${installCommands?.join(' or ')}`;
  } else if (platform === 'linux') {
    return `To install ${fallbackTool.description} on Linux, run: ${installCommands?.join(' or ')}`;
  } else if (platform === 'win32') {
    return `To install ${fallbackTool.description} on Windows, run: ${installCommands?.join(' or ')}`;
  }

  return `Tool ${toolName} requires manual installation.`;
}

/**
 * Generate custom tool configuration for fallback tools
 * This can be used when generating agentenv.toml for tools that need fallbacks
 */
export function generateFallbackCustomToolConfig(toolName: string): string {
  const fallbackTool = FALLBACK_TOOLS[toolName];

  if (!fallbackTool) {
    return '';
  }

  const lines: string[] = [];
  lines.push(`# ${fallbackTool.description}`);
  lines.push(`# Platform-specific fallback installation required`);
  lines.push(`# macOS: ${fallbackTool.install.macos.join(' or ')}`);
  lines.push(`# Linux: ${fallbackTool.install.linux.join(' or ')}`);
  lines.push(`# Windows: ${fallbackTool.install.windows.join(' or ')}`);
  lines.push(`[[custom_tools]]`);
  lines.push(`name = "${toolName}"`);
  lines.push(`description = "${fallbackTool.description}"`);
  lines.push(`already_installed = true`);

  if (fallbackTool.paths.macos) {
    lines.push(`path.macos = "${fallbackTool.paths.macos}"`);
  }
  if (fallbackTool.paths.linux) {
    lines.push(`path.linux = "${fallbackTool.paths.linux}"`);
  }
  if (fallbackTool.paths.windows) {
    lines.push(`path.windows = "${fallbackTool.paths.windows}"`);
  }

  return lines.join('\n');
}

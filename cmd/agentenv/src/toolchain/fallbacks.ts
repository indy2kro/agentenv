/**
 * Toolchain Fallbacks
 * Marks tools that cannot be installed via mise (tokei) and tools whose only
 * mise backend refuses to resolve on certain platforms, as documented in
 * phase0-windows-findings.md. The old per-platform install/verify/advice
 * helpers were dead public surface and were removed — tool installation is
 * delegated to mise or handled through `[[custom_tools]]`.
 */

/**
 * Tools that have special installation requirements
 * These are marked as "Fallback required" in phase0-windows-findings.md
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

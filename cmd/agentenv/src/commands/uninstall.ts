import type { AgentenvConfig } from '../config/schema.js';
import { BINARY_MAP } from '../config/schema.js';
import { getToolsToInstall, type InstalledToolState } from '../toolchain/mise.js';

export interface UninstallTarget {
  /** agentenv TOML key (the custom tool's name for custom tools). */
  key: string;
  /** mise registry name passed to `mise uninstall`. */
  miseName: string;
  /** BINARY_MAP[key] ?? key — defined for custom tools too. */
  binary: string;
}

/**
 * The uninstall parity set for apply: enabled non-fallback `[tools]` entries
 * (via getToolsToInstall) plus `[[custom_tools]]` entries that carry a
 * `mise_source`. Fallback-required tools are never mise-installed and are
 * therefore never uninstall targets. Deduplicated by miseName.
 */
export function calculateUninstallTargets(config: AgentenvConfig): UninstallTarget[] {
  const targets: UninstallTarget[] = [];
  const seen = new Set<string>();
  for (const tool of getToolsToInstall(config)) {
    if (seen.has(tool.miseName)) continue;
    seen.add(tool.miseName);
    targets.push({
      key: tool.name,
      miseName: tool.miseName,
      binary: BINARY_MAP[tool.name] ?? tool.name,
    });
  }
  for (const custom of config.custom_tools ?? []) {
    if (!custom.mise_source || seen.has(custom.mise_source)) continue;
    seen.add(custom.mise_source);
    targets.push({ key: custom.name, miseName: custom.mise_source, binary: custom.name });
  }
  return targets;
}

/**
 * Match CLI tool arguments against targets by agentenv key, binary name, or
 * mise name. Any argument matching nothing lands in `unknown` (the command
 * then aborts without acting). Duplicate matches are returned once.
 */
export function resolveToolArgs(
  args: string[],
  targets: UninstallTarget[],
): { matched: UninstallTarget[]; unknown: string[] } {
  const matched: UninstallTarget[] = [];
  const unknown: string[] = [];
  for (const arg of args) {
    const hit = targets.find(
      (target) => target.key === arg || target.binary === arg || target.miseName === arg,
    );
    if (hit) {
      if (!matched.includes(hit)) matched.push(hit);
    } else {
      unknown.push(arg);
    }
  }
  return { matched, unknown };
}

export interface UninstallPlan {
  toUninstall: string[];
  alreadyGone: string[];
}

/** Plan from a live installed-state map: installed ⇒ toUninstall, else alreadyGone. */
export function uninstallPlan(
  targets: UninstallTarget[],
  installedState: Record<string, InstalledToolState>,
): UninstallPlan {
  const toUninstall: string[] = [];
  const alreadyGone: string[] = [];
  for (const target of targets) {
    if (installedState[target.miseName]?.installed) toUninstall.push(target.miseName);
    else alreadyGone.push(target.miseName);
  }
  return { toUninstall, alreadyGone };
}

/**
 * Human lines for `--dry-run` (mode 'preview') or after a real uninstall
 * (mode 'result'). With stateUnknown=true (mise absent) every target renders
 * as "state unknown (mise not installed)" and the plan is ignored.
 */
export function renderUninstallSummary(
  targets: UninstallTarget[],
  plan: UninstallPlan,
  mode: 'preview' | 'result' = 'result',
  stateUnknown = false,
): string[] {
  if (stateUnknown) {
    return targets.map((t) => `  ${t.key} (${t.binary}) — state unknown (mise not installed)`);
  }
  const byName = new Map(targets.map((target) => [target.miseName, target]));
  const label = (name: string): string => {
    const target = byName.get(name);
    return target ? `${target.key} (${target.binary})` : name;
  };
  const marker = mode === 'preview' ? 'would uninstall' : 'removed';
  return [
    ...plan.toUninstall.map((name) => `  ${label(name)} — ${marker}`),
    ...plan.alreadyGone.map((name) => `  ${label(name)} — already gone`),
  ];
}

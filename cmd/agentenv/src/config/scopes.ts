/**
 * Scope Resolution
 * Determines where config (and generated files) live for a given scope,
 * matching agentenv.toml.example and the load path used by loadConfig().
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const SCOPE_VALUES = ['project', 'user'] as const;
export type ScopeValue = (typeof SCOPE_VALUES)[number];

/**
 * Validate a `--scope <value>` flag. Returns a normalized `scope` when the
 * flag was passed a valid value, an `error` when passed an invalid value, and
 * neither when the flag is absent (callers then fall back to nearest-config
 * resolution). Invalid values are a usage error — a typo must never silently
 * retarget the other scope.
 */
export function parseScopeFlag(value: string | undefined): { scope?: ScopeValue; error?: string } {
  if (value === undefined) return {};
  if (value === 'project' || value === 'user') return { scope: value };
  return { error: `invalid --scope "${value}" (expected "project" or "user")` };
}

export function userConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && path.isAbsolute(xdg)) {
    return path.join(xdg, 'agentenv');
  }
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.config', 'agentenv');
}

export function resolveScopeDir(scope: 'project' | 'user' | undefined): string {
  return scope === 'user' ? userConfigDir() : process.cwd();
}

export function configFilePath(scope: 'project' | 'user' | undefined): string {
  return path.join(resolveScopeDir(scope), 'agentenv.toml');
}

/**
 * Walk from `startDir` up to the filesystem root looking for `filename`, the
 * way git looks for `.git` and mise looks for `mise.toml`. Returns the first
 * match, or undefined if none exists all the way to the root.
 */
function findUpward(startDir: string, filename: string): string | undefined {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Locate an existing agentenv.toml: project config first — searching `cwd`
 * and its parent directories, so `agentenv status` from `repo/src` still
 * finds `repo/agentenv.toml` — then user/global. Returns the first match, or
 * undefined when none exists.
 */
export function findConfigPath(cwd: string = process.cwd()): string | undefined {
  const project = findUpward(cwd, 'agentenv.toml');
  if (project) return project;
  const user = path.join(userConfigDir(), 'agentenv.toml');
  if (fs.existsSync(user)) return user;
  return undefined;
}

/**
 * Scope Resolution
 * Determines where config (and generated files) live for a given scope,
 * matching agentenv.toml.example and the load path used by loadConfig().
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function userConfigDir(): string {
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
 * Locate an existing agentenv.toml: project config first, then user/global.
 * Returns the first match, or undefined when none exists.
 */
export function findConfigPath(cwd: string = process.cwd()): string | undefined {
  const project = path.join(cwd, 'agentenv.toml');
  if (fs.existsSync(project)) return project;
  const user = path.join(userConfigDir(), 'agentenv.toml');
  if (fs.existsSync(user)) return user;
  return undefined;
}

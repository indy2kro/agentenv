/**
 * Scope Resolution
 * Determines where config (and generated files) live for a given scope,
 * matching agentenv.toml.example and the load path used by loadConfig().
 */

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

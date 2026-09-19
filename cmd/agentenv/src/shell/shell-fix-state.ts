/**
 * Shell-fix state manifest (FEAT-06).
 *
 * The Tier 0 Windows fix (`detector.ts`) writes per-agent config keys into
 * files agentenv does not own. To make that reversible, every write records
 * the file, whether agentenv created it, and the prior value of each key it
 * set. `agentenv shell-fix --revert` reads this manifest to put things back.
 *
 * Stored under the user config dir (`shellFixStatePath`) so it is per-user,
 * not per-project, matching where the Tier 0 fix itself writes.
 */

import * as fs from 'fs';
import * as path from 'path';
import { userConfigDir } from '../config/scopes.js';
import type { AgentKey } from '../config/schema.js';

/** One key agentenv set, with the value found before it wrote (`null` = absent). */
export interface ShellFixField {
  /** Dotted location within the file, e.g. `env.CLAUDE_CODE_GIT_BASH_PATH`, `[windows].shell_path`, `shell`. */
  key: string;
  previous: string | null;
}

export interface ShellFixStateEntry {
  agent: AgentKey;
  file: string;
  /** True when agentenv created the whole file (revert may delete it). */
  createdFile: boolean;
  fields: ShellFixField[];
}

export interface ShellFixState {
  version: 1;
  bashExe: string;
  recordedAt: string;
  entries: ShellFixStateEntry[];
}

export function shellFixStatePath(): string {
  return path.join(userConfigDir(), 'shell-fix-state.json');
}

export function readShellFixState(statePath: string = shellFixStatePath()): ShellFixState | null {
  if (!fs.existsSync(statePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as ShellFixState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeShellFixState(
  state: ShellFixState,
  statePath: string = shellFixStatePath(),
): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function clearShellFixState(statePath: string = shellFixStatePath()): void {
  if (fs.existsSync(statePath)) fs.rmSync(statePath, { force: true });
}

/**
 * Merge freshly recorded entries into an existing manifest. For a file already
 * recorded, the original prior values win, so revert restores the true
 * pre-agentenv value even after several applies. `createdFile` stays sticky
 * once true (if we ever created the file, a later edit must not erase that).
 */
export function mergeShellFixEntries(
  existing: ShellFixState | null,
  entries: ShellFixStateEntry[],
  bashExe: string,
  now: string = new Date().toISOString(),
): ShellFixState {
  const byFile = new Map<string, ShellFixStateEntry>();
  for (const entry of existing?.entries ?? []) byFile.set(entry.file, entry);

  for (const entry of entries) {
    const prior = byFile.get(entry.file);
    if (!prior) {
      byFile.set(entry.file, entry);
      continue;
    }
    const known = new Set(prior.fields.map((field) => field.key));
    const fields = [...prior.fields];
    for (const field of entry.fields) {
      if (!known.has(field.key)) fields.push(field);
    }
    byFile.set(entry.file, {
      agent: prior.agent,
      file: prior.file,
      createdFile: prior.createdFile || entry.createdFile,
      fields,
    });
  }

  return { version: 1, bashExe, recordedAt: now, entries: [...byFile.values()] };
}

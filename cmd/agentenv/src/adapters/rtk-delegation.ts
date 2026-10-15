/**
 * Shared adapter for agents whose hook/config wiring is 100% delegated to
 * `rtk init <flags>` (Gemini CLI, Cursor, Windsurf, Cline, Mistral Vibe).
 * Mirrors the proven Codex delegation shape: rtk owns every hook file and
 * RTK.md; this adapter only creates the agent's config dir, runs `rtk init`,
 * and reports what appeared.
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseAdapter, type AdapterConfig, type AdapterResult } from './base.js';
import { isAgentInstalled } from './detect.js';
import type { AgentKey } from '../config/schema.js';
import {
  RTK_AGENT_MIN_VERSIONS,
  checkRtkInstallation,
  isRtkAgentSupportedByVersion,
  resolveRtkInit,
  rtkMessage,
} from '../toolchain/rtk.js';

export interface RtkDelegationOptions {
  agentKey: AgentKey;
  label: string;
  rtkFlags: string[];
  configDir: string;
  /** File (relative to baseDir, or absolute for global installs) whose appearance marks a successful `rtk init`. */
  expectedFile: string;
  /**
   * Directories a global `rtk init` delegation writes into besides `configDir`
   * (e.g. Cursor's `-g` install writes the shared RTK.md anchor into Claude
   * Code's `~/.claude`, and on Windows `rtk` errors instead of creating that
   * directory itself if it isn't already there).
   */
  extraGlobalDirs?: string[];
}

/**
 * Undo an `rtk init` delegation with `rtk init <same flags> --uninstall` where
 * that is safe (see SCOPED_RTK_UNINSTALLS), otherwise say what to do by hand. A missing rtk binary is not an error here: there is
 * nothing rtk can remove, and uninstalling tools must not require them.
 */
/** `rtk init` flag sets whose --uninstall is verified to affect only that agent. */
const SCOPED_RTK_UNINSTALLS = new Set(['--copilot', '-g --agent vibe']);

/** Whether `rtk init <flags> --uninstall` is safe to run for just this agent. */
export function isScopedRtkUninstall(rtkFlags: string[]): boolean {
  return SCOPED_RTK_UNINSTALLS.has(rtkFlags.join(' '));
}

export async function uninstallViaRtk(
  label: string,
  rtkFlags: string[],
  config: AdapterConfig,
): Promise<AdapterResult> {
  const result: AdapterResult = {
    success: true,
    message: '',
    filesCreated: [],
    filesModified: [],
    errors: [],
  };
  // Verified against rtk 0.49.0: only these uninstalls touch just their own
  // agent. A `-g` uninstall for windsurf (and, by the same code path, the other
  // global agents) removes the Claude Code hook, RTK.md, the OpenCode plugin
  // and the Cursor hook too, and project-level --codex/--agent cline uninstalls
  // are refused by rtk ("Uninstall only works with --global").
  if (!isScopedRtkUninstall(rtkFlags)) {
    result.message = rtkFlags.includes('-g')
      ? `${label}: rtk's global uninstall is not scoped to this agent (it would also remove your other agents' rtk wiring), so nothing was removed; run \`rtk init -g --uninstall\` yourself to remove all rtk wiring`
      : `${label}: rtk cannot uninstall project-level wiring, so nothing was removed; delete the rtk block from RTK.md/AGENTS.md in the project by hand`;
    return result;
  }
  const run = resolveRtkInit(config.rtkInit)([...rtkFlags, '--uninstall'], config.baseDir);
  if (run.success) {
    result.message = `${label}: removed rtk wiring (rtk init ${rtkFlags.join(' ')} --uninstall)`;
  } else if (run.message.startsWith('rtk binary not found')) {
    result.message = `${label}: rtk not found, so no rtk wiring was removed`;
  } else {
    result.success = false;
    result.message = `${label} cleanup failed`;
    result.errors.push(run.message + (run.stderr ? `: ${run.stderr.trim()}` : ''));
  }
  return result;
}

export class RtkDelegationAdapter extends BaseAdapter {
  private opts: RtkDelegationOptions;

  constructor(config: AdapterConfig, opts: RtkDelegationOptions) {
    super(config);
    this.opts = opts;
  }

  getName(): string {
    return this.opts.label;
  }

  getConfigDir(): string {
    return this.opts.configDir;
  }

  isInstalled(): boolean {
    return isAgentInstalled(this.opts.agentKey);
  }

  async initialize(): Promise<AdapterResult> {
    const result: AdapterResult = {
      success: true,
      message: '',
      filesCreated: [],
      filesModified: [],
      errors: [],
    };

    if (!this.config.enabled) {
      result.message = `${this.opts.label} adapter not enabled`;
      return result;
    }

    try {
      for (const dir of [this.opts.configDir, ...(this.opts.extraGlobalDirs ?? [])]) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          result.filesCreated.push(dir);
        }
      }
    } catch (err) {
      result.success = false;
      result.errors.push(
        `Failed to create config directory: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (this.config.rtkEnabled) {
      const hookResult = await this.configureHooks();
      if (hookResult.success) {
        result.filesCreated.push(...hookResult.filesCreated);
        result.filesModified.push(...hookResult.filesModified);
        result.message = hookResult.message;
      } else {
        result.success = false;
        result.errors.push(...hookResult.errors);
      }
    } else {
      result.message = `RTK disabled; no ${this.opts.label} hooks configured`;
    }

    return result;
  }

  async configureHooks(): Promise<AdapterResult> {
    const result: AdapterResult = {
      success: true,
      message: '',
      filesCreated: [],
      filesModified: [],
      errors: [],
    };

    if (!this.config.enabled) {
      result.message = `${this.opts.label} adapter not enabled`;
      return result;
    }

    // Proactive capability check: only spends a `rtk --version` subprocess
    // call when a verified minimum version actually exists for this agent
    // (RTK_AGENT_MIN_VERSIONS), so this stays free for every agent lacking
    // one. Confirmed-unsupported skips the real `rtk init` attempt entirely
    // instead of always trying it and parsing rtk's rejection text after
    // the fact.
    if (RTK_AGENT_MIN_VERSIONS[this.opts.agentKey]) {
      const checkInstallation = this.config.checkRtkInstallation ?? checkRtkInstallation;
      const { version } = checkInstallation(this.config.baseDir);
      if (isRtkAgentSupportedByVersion(this.opts.agentKey, version) === false) {
        result.success = false;
        result.errors.push(
          `rtk ${version ?? '(unresolved version)'} does not yet support "${this.opts.agentKey}" as an --agent value`,
        );
        return result;
      }
    }

    const expectedPath = path.isAbsolute(this.opts.expectedFile)
      ? this.opts.expectedFile
      : path.join(this.config.baseDir, this.opts.expectedFile);
    const existed = fs.existsSync(expectedPath);
    const run = resolveRtkInit(this.config.rtkInit)(this.opts.rtkFlags, this.config.baseDir);
    if (run.success) {
      if (!existed && fs.existsSync(expectedPath)) result.filesCreated.push(expectedPath);
      result.message = rtkMessage(run);
    } else {
      result.success = false;
      result.errors.push(run.message + (run.stderr ? `: ${run.stderr.trim()}` : ''));
    }

    return result;
  }

  async cleanup(): Promise<AdapterResult> {
    return uninstallViaRtk(this.opts.label, this.opts.rtkFlags, this.config);
  }
}

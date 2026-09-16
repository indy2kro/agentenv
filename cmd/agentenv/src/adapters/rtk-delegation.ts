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
import { resolveRtkInit, rtkMessage } from '../toolchain/rtk.js';

export interface RtkDelegationOptions {
  agentKey: AgentKey;
  label: string;
  rtkFlags: string[];
  configDir: string;
  /** Basename (within baseDir) whose appearance marks a successful `rtk init`. */
  expectedFile: string;
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
      if (!fs.existsSync(this.opts.configDir)) {
        fs.mkdirSync(this.opts.configDir, { recursive: true });
        result.filesCreated.push(this.opts.configDir);
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

    const expectedPath = path.join(this.config.baseDir, this.opts.expectedFile);
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
    return {
      success: true,
      message: `${this.opts.label} adapter cleaned up`,
      filesCreated: [],
      filesModified: [],
      errors: [],
    };
  }
}

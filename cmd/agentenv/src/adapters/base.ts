/**
 * Base Adapter Interface
 * Defines the common interface for all agent adapters
 */

import * as path from 'path';
import type { RtkInitFn } from '../toolchain/rtk.js';

export interface AdapterConfig {
  enabled: boolean;
  baseDir: string;
  rtkEnabled?: boolean;
  /** Injectable `rtk init` runner; defaults to the real rtk binary. */
  rtkInit?: RtkInitFn;
}

export interface AdapterResult {
  success: boolean;
  message: string;
  filesCreated: string[];
  filesModified: string[];
  errors: string[];
}

export interface HookConfig {
  name: string;
  type: 'pre' | 'post' | 'session' | 'tool';
  command: string;
  description: string;
}

export abstract class BaseAdapter {
  protected config: AdapterConfig;

  constructor(config: AdapterConfig) {
    this.config = config;
  }

  /**
   * Initialize the adapter
   */
  abstract initialize(): Promise<AdapterResult>;

  /**
   * Configure hooks for the agent
   */
  abstract configureHooks(): Promise<AdapterResult>;

  /**
   * Get the agent name
   */
  abstract getName(): string;

  /**
   * Check if the agent is installed
   */
  abstract isInstalled(): boolean;

  /**
   * Get the agent's configuration directory
   */
  abstract getConfigDir(): string;

  /**
   * Absolute path of the user-level instruction file this agent reads (e.g.
   * Claude Code reads ~/.claude/CLAUDE.md, most others ~/.config/<agent>/
   * AGENTS.md). Used in user/global scope, where a project-root AGENTS.md
   * would never be discovered. Subclasses override when the agent reads a
   * differently-named file (Claude Code) or a non-configDir location
   * (Copilot's ~/.copilot/copilot-instructions.md).
   */
  getUserInstructionFile(): string {
    return path.join(this.getConfigDir(), 'AGENTS.md');
  }

  /**
   * Clean up any generated files
   */
  abstract cleanup(): Promise<AdapterResult>;

  /**
   * Get agent-specific environment variables
   */
  getEnvVars(): Record<string, string> {
    return {};
  }
}

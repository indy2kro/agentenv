/**
 * Superpowers Integration Adapter
 * Installs github:obra/superpowers for Claude Code only, via `claude plugin
 * marketplace add` / `claude plugin install` — the only agent with a
 * documented, non-interactive, ref-pinnable installer. See
 * docs/research/superpowers-install-mechanisms.md for the other three
 * agents, which always report `unsupported` and never execute a command.
 */

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { resolveBinary } from '../adapters/detect.js';
import { AGENT_KEYS, resolveIntegrationScope } from '../config/schema.js';
import type { AgentKey, IntegrationConfig } from '../config/schema.js';
import type { IntegrationAdapter, IntegrationAgentState, IntegrationResult } from './base.js';

export const SUPERPOWERS_MARKETPLACE_REPO = 'obra/superpowers-marketplace';
export const SUPERPOWERS_PLUGIN_ID = 'superpowers@superpowers-marketplace';

const MANUAL_INSTALL_HINTS: Partial<Record<AgentKey, string>> = {
  codex_cli:
    'No non-interactive install is documented for Codex CLI. In an interactive Codex session, run /plugins, search "superpowers", and select Install Plugin.',
  copilot:
    'Upstream documents `copilot plugin marketplace add obra/superpowers-marketplace` then `copilot plugin install superpowers@superpowers-marketplace`, but no ref-pin mechanism is documented, so agentenv does not run this automatically. See docs/research/superpowers-install-mechanisms.md.',
  opencode:
    'OpenCode installation is driven by instructions fetched from .opencode/INSTALL.md in the Superpowers repo, which has no fixed command agentenv can safely automate. Follow that file manually.',
};

export interface ClaudeCliCommandResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/** Injectable so tests never spawn a real `claude` binary. */
export type ClaudeCliRunner = (args: string[], cwd: string) => ClaudeCliCommandResult;

const defaultClaudeCliRunner: ClaudeCliRunner = (args, cwd) => {
  const claudePath = resolveBinary('claude');
  if (!claudePath) {
    return { success: false, exitCode: null, stdout: '', stderr: 'claude CLI not found on PATH' };
  }
  try {
    const result = child_process.spawnSync(claudePath, args, {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return {
      success: result.status === 0,
      exitCode: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    };
  } catch (err) {
    return {
      success: false,
      exitCode: null,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
    };
  }
};

interface FsDeps {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: 'utf-8') => string;
  writeFileSync: (path: string, content: string) => void;
  mkdirSync: (path: string, opts?: { recursive?: boolean }) => void;
}

export interface SuperpowersAdapterDeps {
  runClaudeCli?: ClaudeCliRunner;
  fs?: FsDeps;
}

interface SuperpowersMarker {
  ref: string;
  scope: 'project' | 'user';
  installedAt: string;
}

export class SuperpowersAdapter implements IntegrationAdapter {
  private readonly runClaudeCli: ClaudeCliRunner;
  private readonly fsImpl: FsDeps;

  constructor(deps: SuperpowersAdapterDeps = {}) {
    this.runClaudeCli = deps.runClaudeCli ?? defaultClaudeCliRunner;
    this.fsImpl = deps.fs ?? fs;
  }

  getName(): string {
    return 'Superpowers';
  }

  isEnabled(config: IntegrationConfig | undefined): boolean {
    return config?.enabled === true;
  }

  private markerPath(baseDir: string): string {
    // path.posix rather than the platform `path` module: baseDir may be a
    // logical (test-injected) identifier rather than an OS path, and Node's
    // fs functions accept forward slashes on Windows regardless.
    return path.posix.join(baseDir, '.agentenv-state', 'integrations', 'superpowers.json');
  }

  private readMarker(baseDir: string): SuperpowersMarker | undefined {
    const file = this.markerPath(baseDir);
    if (!this.fsImpl.existsSync(file)) return undefined;
    try {
      return JSON.parse(this.fsImpl.readFileSync(file, 'utf-8')) as SuperpowersMarker;
    } catch {
      return undefined;
    }
  }

  private writeMarker(baseDir: string, marker: SuperpowersMarker): void {
    const file = this.markerPath(baseDir);
    this.fsImpl.mkdirSync(path.posix.dirname(file), { recursive: true });
    this.fsImpl.writeFileSync(file, JSON.stringify(marker, null, 2));
  }

  private detectClaudeCode(
    baseDir: string,
    config: IntegrationConfig | undefined,
  ): IntegrationAgentState {
    const list = this.runClaudeCli(['plugin', 'list'], baseDir);
    if (!list.success && list.exitCode === null) {
      return {
        agent: 'claude_code',
        state: 'unsupported',
        detail: list.stderr || 'claude CLI not found on PATH',
      };
    }

    // `claude plugin list` has no documented structured-output flag; this is
    // a best-effort text match on the plugin name. Revisit if a --json flag
    // is documented.
    const installed = list.stdout.toLowerCase().includes('superpowers');
    if (!installed) return { agent: 'claude_code', state: 'missing' };

    const marker = this.readMarker(baseDir);
    const requestedRef = config?.ref;
    if (marker && requestedRef && marker.ref !== requestedRef) {
      return {
        agent: 'claude_code',
        state: 'drifted',
        detail: `installed at ${marker.ref}, config requests ${requestedRef}`,
      };
    }
    return {
      agent: 'claude_code',
      state: 'installed',
      detail: marker ? `ref ${marker.ref}` : 'installed outside agentenv',
    };
  }

  async detect(baseDir: string, config: IntegrationConfig | undefined): Promise<IntegrationResult> {
    const scope = resolveIntegrationScope({}, config);
    const requestedAgents = config?.agents ?? [...AGENT_KEYS];
    const result: IntegrationResult = {
      name: this.getName(),
      source: config?.source,
      ref: config?.ref,
      scope,
      agents: [],
      changedFiles: [],
      nativeCommands: [],
      warnings: [],
      errors: [],
    };

    for (const agent of requestedAgents) {
      if (agent !== 'claude_code') {
        result.agents.push({ agent, state: 'unsupported', detail: MANUAL_INSTALL_HINTS[agent] });
        continue;
      }
      result.agents.push(this.detectClaudeCode(baseDir, config));
    }
    return result;
  }

  async status(baseDir: string, config: IntegrationConfig | undefined): Promise<IntegrationResult> {
    return this.detect(baseDir, config);
  }

  async apply(baseDir: string, config: IntegrationConfig | undefined): Promise<IntegrationResult> {
    const detected = await this.detect(baseDir, config);
    if (!this.isEnabled(config)) return detected;

    const ref = config?.ref;
    if (!ref || !config?.source) {
      detected.errors.push('integrations.superpowers.source and .ref must be set to apply');
      return detected;
    }

    for (const agentState of detected.agents) {
      if (agentState.agent !== 'claude_code') continue;

      if (config.allow_hooks !== true) {
        detected.warnings.push(
          'Superpowers registers a SessionStart hook; set integrations.superpowers.allow_hooks = true to permit installing it for Claude Code.',
        );
        continue;
      }

      if (agentState.state === 'installed') continue;

      const wasDrifted = agentState.state === 'drifted';
      const marketplaceArgs = [
        'plugin',
        'marketplace',
        'add',
        `${SUPERPOWERS_MARKETPLACE_REPO}#${ref}`,
      ];
      const marketplaceRun = this.runClaudeCli(marketplaceArgs, baseDir);
      detected.nativeCommands.push(`claude ${marketplaceArgs.join(' ')}`);
      if (!marketplaceRun.success) {
        detected.errors.push(
          `claude plugin marketplace add failed: ${marketplaceRun.stderr || marketplaceRun.stdout}`,
        );
        continue;
      }

      const installArgs = ['plugin', 'install', SUPERPOWERS_PLUGIN_ID, '--scope', detected.scope];
      const installRun = this.runClaudeCli(installArgs, baseDir);
      detected.nativeCommands.push(`claude ${installArgs.join(' ')}`);
      if (!installRun.success) {
        detected.errors.push(
          `claude plugin install failed: ${installRun.stderr || installRun.stdout}`,
        );
        continue;
      }

      const marker: SuperpowersMarker = {
        ref,
        scope: detected.scope,
        installedAt: new Date().toISOString(),
      };
      this.writeMarker(baseDir, marker);
      detected.changedFiles.push(this.markerPath(baseDir));
      agentState.state = 'installed';
      agentState.detail = wasDrifted ? `updated to ref ${ref}` : `ref ${ref}`;
    }

    if (config.allow_external_requests !== true) {
      detected.warnings.push(
        'external requests disabled: agentenv never installs the optional Superpowers visual companion',
      );
    }

    return detected;
  }
}

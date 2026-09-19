/**
 * Optional Upstream Integration Adapter Contract
 * Parallel to ../adapters (agent config adapters): integration adapters
 * invoke and observe third-party installation mechanisms instead of owning
 * agentenv-generated config. See
 * docs/research/superpowers-install-mechanisms.md.
 */

import type { AgentKey, IntegrationConfig } from '../config/schema.js';

export type IntegrationState = 'installed' | 'missing' | 'unsupported' | 'drifted';

export interface IntegrationAgentState {
  agent: AgentKey;
  state: IntegrationState;
  detail?: string;
}

export interface IntegrationResult {
  name: string;
  source?: string;
  ref?: string;
  scope: 'project' | 'user';
  agents: IntegrationAgentState[];
  changedFiles: string[];
  nativeCommands: string[];
  warnings: string[];
  errors: string[];
}

export interface IntegrationAdapter {
  getName(): string;
  isEnabled(config: IntegrationConfig | undefined): boolean;
  detect(baseDir: string, config: IntegrationConfig | undefined): Promise<IntegrationResult>;
  apply(baseDir: string, config: IntegrationConfig | undefined): Promise<IntegrationResult>;
  status(baseDir: string, config: IntegrationConfig | undefined): Promise<IntegrationResult>;
}

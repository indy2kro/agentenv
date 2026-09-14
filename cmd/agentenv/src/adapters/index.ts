/**
 * Agent Adapters Index
 * Exports all agent adapters for use by the CLI
 */

export { BaseAdapter, AdapterConfig, AdapterResult, HookConfig } from './base.js';
export { AGENT_COMMANDS, detectInstalledAgents } from './detect.js';
export type { DetectFn } from './detect.js';
export { ClaudeCodeAdapter } from './claude.js';
export { CodexCliAdapter } from './codex.js';
export { CopilotAdapter } from './copilot.js';
export { OpenCodeAdapter } from './opencode.js';

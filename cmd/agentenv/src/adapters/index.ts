/**
 * Agent Adapters Index
 * Exports all agent adapters for use by the CLI
 */

import type { AgentKey } from '../config/schema.js';
import { BaseAdapter, AdapterConfig } from './base.js';
import { ClaudeCodeAdapter } from './claude.js';
import { CodexCliAdapter } from './codex.js';
import { CopilotAdapter } from './copilot.js';
import { OpenCodeAdapter } from './opencode.js';
import { GeminiCliAdapter } from './gemini.js';
import { CursorAdapter } from './cursor.js';
import { WindsurfAdapter } from './windsurf.js';
import { ClineAdapter } from './cline.js';
import { VibeAdapter } from './vibe.js';

export { BaseAdapter, AdapterConfig, AdapterResult } from './base.js';
export { AGENT_COMMANDS, detectInstalledAgents } from './detect.js';
export type { DetectFn } from './detect.js';
export { ClaudeCodeAdapter } from './claude.js';
export { CodexCliAdapter } from './codex.js';
export { CopilotAdapter } from './copilot.js';
export { OpenCodeAdapter } from './opencode.js';
export { GeminiCliAdapter } from './gemini.js';
export { CursorAdapter } from './cursor.js';
export { WindsurfAdapter } from './windsurf.js';
export { ClineAdapter } from './cline.js';
export { VibeAdapter } from './vibe.js';
export { RtkDelegationAdapter } from './rtk-delegation.js';

/** Agent key -> adapter class, so callers can build any agent's adapter from config alone. */
export const ADAPTER_CLASSES: Record<AgentKey, new (config: AdapterConfig) => BaseAdapter> = {
  claude_code: ClaudeCodeAdapter,
  codex_cli: CodexCliAdapter,
  copilot: CopilotAdapter,
  opencode: OpenCodeAdapter,
  gemini_cli: GeminiCliAdapter,
  cursor: CursorAdapter,
  windsurf: WindsurfAdapter,
  cline: ClineAdapter,
  vibe: VibeAdapter,
};

/**
 * Optional Integration Adapters Index
 */

export type {
  IntegrationAdapter,
  IntegrationAgentState,
  IntegrationResult,
  IntegrationState,
} from './base.js';
export {
  SuperpowersAdapter,
  SUPERPOWERS_MARKETPLACE_REPO,
  SUPERPOWERS_PLUGIN_ID,
} from './superpowers.js';
export { integrationResultLines, integrationStateLine, ghAuthLine } from './render.js';
export type { ClaudeCliRunner, SuperpowersAdapterDeps } from './superpowers.js';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RTK_INIT_FLAGS } from './rtk.js';
import { AGENT_KEYS } from '../config/schema.js';

describe('RTK_INIT_FLAGS', () => {
  it('covers every agent key', () => {
    for (const key of AGENT_KEYS) {
      const flags = RTK_INIT_FLAGS[key];
      assert.ok(
        Array.isArray(flags) && flags.length > 0,
        `RTK_INIT_FLAGS missing or empty for ${key}`,
      );
    }
  });

  it('maps the five delegated agents to their correct rtk init flags', () => {
    // -g is mandatory for the global-only agents: real rtk 0.49.0 rejects
    // project-scoped init for them (surfaced by the smoke:real all-9 run).
    assert.deepEqual(RTK_INIT_FLAGS.gemini_cli, ['-g', '--gemini']);
    assert.deepEqual(RTK_INIT_FLAGS.cursor, ['-g', '--agent', 'cursor']);
    assert.deepEqual(RTK_INIT_FLAGS.windsurf, ['-g', '--agent', 'windsurf']);
    assert.deepEqual(RTK_INIT_FLAGS.cline, ['--agent', 'cline']);
    assert.deepEqual(RTK_INIT_FLAGS.vibe, ['-g', '--agent', 'vibe']);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RTK_INIT_FLAGS, isUnsupportedRtkAgentError } from './rtk.js';
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

describe('isUnsupportedRtkAgentError', () => {
  it('recognizes rtk clap-style "invalid value" rejection for the given agent', () => {
    const errors = [
      "rtk init -g --agent vibe failed (exit 2): error: invalid value 'vibe' for '--agent <AGENT>'\n\n  [possible values: claude, cursor, windsurf, cline, kilocode, antigravity, pi, hermes]",
    ];
    assert.equal(isUnsupportedRtkAgentError(errors, 'vibe'), true);
  });

  it('does not misfire on unrelated rtk failures', () => {
    assert.equal(isUnsupportedRtkAgentError(['rtk binary not found on PATH'], 'vibe'), false);
    assert.equal(
      isUnsupportedRtkAgentError(["invalid value 'cline' for '--agent <AGENT>'"], 'vibe'),
      false,
    );
  });
});

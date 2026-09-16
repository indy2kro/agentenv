import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_CONFIG_FILES } from './status.js';
import { AGENT_KEYS } from '../config/schema.js';

describe('status agent descriptors', () => {
  it('covers every agent key', () => {
    for (const key of AGENT_KEYS) {
      assert.ok(AGENT_CONFIG_FILES[key], `AGENT_CONFIG_FILES missing ${key}`);
      assert.ok(AGENT_CONFIG_FILES[key].label.length > 0);
    }
  });

  it('points new delegation agents at RTK.md', () => {
    assert.equal(AGENT_CONFIG_FILES.gemini_cli.label, 'Gemini CLI');
    assert.equal(AGENT_CONFIG_FILES.cursor.label, 'Cursor');
    assert.equal(AGENT_CONFIG_FILES.cline.label, 'Cline CLI');
    assert.match(AGENT_CONFIG_FILES.gemini_cli.check('/proj'), /RTK\.md$/);
    assert.match(AGENT_CONFIG_FILES.cursor.check('/proj'), /RTK\.md$/);
    assert.match(AGENT_CONFIG_FILES.cline.check('/proj'), /RTK\.md$/);
  });
});

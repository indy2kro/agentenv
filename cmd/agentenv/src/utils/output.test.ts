import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOutput } from './output.js';

describe('normalizeOutput', () => {
  it('strips carriage returns and keeps a single trailing newline', () => {
    assert.equal(normalizeOutput('a\r\nb\r\n\r\n'), 'a\nb\n');
    assert.equal(normalizeOutput('only\r'), 'only\n');
    assert.equal(normalizeOutput(''), '');
  });
});

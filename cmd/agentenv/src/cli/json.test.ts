import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSON_SCHEMA_VERSION, jsonEnvelope } from './json.js';

describe('jsonEnvelope', () => {
  it('adds schemaVersion and always provides messages[] and errors[]', () => {
    const doc = jsonEnvelope({ success: true, extra: 1 });
    assert.equal(doc.schemaVersion, JSON_SCHEMA_VERSION);
    assert.deepEqual(doc.messages, []);
    assert.deepEqual(doc.errors, []);
    assert.equal(doc.extra, 1);
  });

  it('mirrors a bare message into messages on success and errors on failure', () => {
    assert.deepEqual(jsonEnvelope({ success: true, message: 'done' }).messages, ['done']);
    const failed = jsonEnvelope({ success: false, message: 'nope' });
    assert.deepEqual(failed.errors, ['nope']);
    assert.deepEqual(failed.messages, []);
    assert.equal(failed.message, 'nope');
  });

  it('keeps explicit arrays untouched', () => {
    const doc = jsonEnvelope({ success: false, messages: ['a'], errors: ['b'] });
    assert.deepEqual(doc.messages, ['a']);
    assert.deepEqual(doc.errors, ['b']);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateMiseToml } from './mise.js';
import { DEFAULT_CONFIG } from '../config/schema.js';

describe('mise.toml generation', () => {
  it('pins rtk (invoked directly by agentenv) to a verified version', () => {
    const output = generateMiseToml(DEFAULT_CONFIG, []);
    assert.match(output, /rtk = "0\.49\.0"/);
  });

  it('is deterministic for an identical config', () => {
    const first = generateMiseToml(DEFAULT_CONFIG, []);
    const second = generateMiseToml(DEFAULT_CONFIG, []);
    assert.equal(first, second);
  });

  it('declares custom tools from their mise_source', () => {
    const output = generateMiseToml(DEFAULT_CONFIG, [
      { name: 'otherthing', mise_source: 'github:someorg/otherthing', version: 'v1.0.0' },
    ]);

    assert.match(output, /github:someorg\/otherthing = "v1\.0\.0"/);
  });

  it('uses latest when a custom tool version is omitted', () => {
    const output = generateMiseToml(DEFAULT_CONFIG, [
      { name: 'otherthing', mise_source: 'github:someorg/otherthing' },
    ]);

    assert.match(output, /github:someorg\/otherthing = "latest"/);
  });
});

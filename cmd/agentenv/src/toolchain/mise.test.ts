import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateMiseToml,
  getToolsToInstall,
  miseActivationHint,
  miseInstallInstructions,
  miseInstallOutcome,
  trustMiseToml,
  verifyToolAvailability,
} from './mise.js';
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

  it('honors pinned tool versions in the install planner', () => {
    const tools = getToolsToInstall(DEFAULT_CONFIG);
    const rtk = tools.find((tool) => tool.name === 'rtk');

    assert.ok(rtk);
    assert.equal(rtk?.version, '0.49.0');
  });
});

describe('mise install outcome parsing', () => {
  it('reports a fresh install', () => {
    assert.equal(
      miseInstallOutcome('8/8 · installed 3 tools · 5 already installed'),
      'mise install completed (installed 3 tools)',
    );
  });

  it('reports an already-installed state truthfully', () => {
    assert.equal(
      miseInstallOutcome('8/8 · installed 0 tools · 8 already installed'),
      'mise install completed (tools already installed, nothing to fetch)',
    );
  });

  it('falls back when output is unexpected', () => {
    assert.equal(miseInstallOutcome(''), 'mise install completed');
  });
});

describe('mise self-diagnosis helpers', () => {
  it('provides platform install instructions referencing mise', () => {
    const lines = miseInstallInstructions();
    assert.ok(lines.length >= 2);
    assert.ok(lines.some((line) => /winget|brew|curl/.test(line)));
  });

  it('provides an activation hint for tools not yet on PATH', () => {
    const hint = miseActivationHint();
    assert.ok(hint.length > 0);
  });

  it('verifies only enabled tools and maps each to its binary', () => {
    const availability = verifyToolAvailability({
      ...DEFAULT_CONFIG,
      tools: { ripgrep: true, difftastic: true, yq: false },
    });
    assert.deepEqual(
      availability.map((tool) => `${tool.key}:${tool.binary}`),
      ['ripgrep:rg', 'difftastic:difft'],
    );
    for (const tool of availability) {
      assert.equal(typeof tool.onPath, 'boolean');
    }
  });
});

describe('mise trust', () => {
  it('returns a structured failure when mise is not on PATH', () => {
    // trustMiseToml must fail gracefully (not throw) if `mise` cannot run,
    // e.g. on CI hosts or machines without mise installed.
    const result = trustMiseToml('nope.toml', '');
    assert.equal(typeof result.success, 'boolean');
    assert.equal(typeof result.message, 'string');
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  generateMiseToml,
  getShimsDirValue,
  getToolsToInstall,
  miseActivationHint,
  miseInstallInstructions,
  miseInstallOutcome,
  pathContainsDir,
  shimsDir,
  shimsDirOnPath,
  trustMiseToml,
  upsertShimsDir,
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

  it('keeps the project mise.toml free of shims_dir (that setting belongs to the global mise config)', () => {
    const output = generateMiseToml(DEFAULT_CONFIG, []);
    assert.equal(output.includes('shims_dir'), false);
    assert.ok(shimsDir().length > 0);
  });
});

describe('global mise config shims_dir', () => {
  it('creates a [settings] section with the shims_dir when the file is empty', () => {
    const output = upsertShimsDir('', 'C:\\Users\\me\\.local\\bin');
    assert.equal(output, '[settings]\nshims_dir = "C:/Users/me/.local/bin"\n');
  });

  it('appends a [settings] section and preserves existing content', () => {
    const output = upsertShimsDir('[env]\nFOO = "bar"', 'C:\\Users\\me\\.local\\bin');
    assert.ok(output.includes('[settings]'));
    assert.ok(output.includes('shims_dir = "C:/Users/me/.local/bin"'));
    assert.ok(output.startsWith('[env]\nFOO = "bar"'));
  });

  it('inserts shims_dir under an existing [settings] before the next section', () => {
    const output = upsertShimsDir(
      '[settings]\njobs = 4\n\n[env]\nFOO = "bar"',
      'C:\\Users\\me\\.local\\bin',
    );
    assert.equal(
      output,
      '[settings]\nshims_dir = "C:/Users/me/.local/bin"\njobs = 4\n\n[env]\nFOO = "bar"',
    );
  });

  it('replaces an existing shims_dir value in place', () => {
    const output = upsertShimsDir(
      '[settings]\nshims_dir = "C:/old/path"\n',
      'C:\\Users\\me\\.local\\bin',
    );
    assert.equal(output, '[settings]\nshims_dir = "C:/Users/me/.local/bin"\n');
  });

  it('does not treat [[array]] headers as section boundaries', () => {
    // shims_dir must only be injected into [settings], never after a nested array.
    const input = '[settings]\n\n[[tools]]\nname = "x"';
    const output = upsertShimsDir(input, 'C:\\Users\\me\\.local\\bin');
    assert.ok(output.startsWith('[settings]\nshims_dir = "C:/Users/me/.local/bin"\n'));
    assert.ok(output.endsWith('[[tools]]\nname = "x"'));
  });

  it('getShimsDirValue reads the honored value and ignores other sections', () => {
    assert.equal(
      getShimsDirValue('[settings]\nshims_dir = "C:/Users/me/.local/bin"\n'),
      'C:/Users/me/.local/bin',
    );
    assert.equal(getShimsDirValue('[env]\nshims_dir = "not-this"\n'), null);
    assert.equal(getShimsDirValue('[settings]\njobs = 4\n\n[tools]\n'), null);
  });
});

describe('PATH membership helpers', () => {
  it('pathContainsDir matches entries that resolve to the dir', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-'));
    const part = path.join(base, 'bin');
    const sep = path.delimiter;
    assert.equal(pathContainsDir(`${part}${sep}${base}`, part), true);
    assert.equal(pathContainsDir(`${base}${sep}${part}`, part), true);
    assert.equal(pathContainsDir(base, part), false);
  });

  it('shimsDirOnPath returns a boolean', () => {
    assert.equal(typeof shimsDirOnPath(), 'boolean');
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

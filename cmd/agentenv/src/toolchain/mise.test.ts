import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  MISE_TOOL_NAMES,
  generateMiseToml,
  getShimsDirValue,
  getToolsToInstall,
  getUpgradeableTools,
  getInstalledToolState,
  parseInstalledToolState,
  classifyToolResolvability,
  detectEulaPrompt,
  eulaPreflightHint,
  miseActivationHint,
  miseInstallInstructions,
  miseInstallOutcome,
  pathContainsDir,
  platformUnsupportedHint,
  shimsDir,
  shimsDirOnPath,
  trustMiseToml,
  upsertShimsDir,
  verifyCounts,
  verifyHintNeeded,
  verifyToolAvailability,
} from './mise.js';
import { DEFAULT_CONFIG, TOOL_KEYS } from '../config/schema.js';

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

  it('resolves config tool_versions pins in the generated mise.toml', () => {
    const config = { ...DEFAULT_CONFIG, tool_versions: { jq: '2.0.0' } };
    const output = generateMiseToml(config, []);

    assert.match(output, /^jq = "2\.0\.0"$/m);
    assert.doesNotMatch(output, /^jq = "latest"$/m);
  });

  it('records config tool_versions pins in the install planner', () => {
    const config = { ...DEFAULT_CONFIG, tool_versions: { jq: '1.4.0' } };
    const tools = getToolsToInstall(config);
    const jq = tools.find((tool) => tool.name === 'jq');

    assert.ok(jq);
    assert.equal(jq?.version, '1.4.0');
  });

  it('excludes tools mise cannot install at all on this platform (e.g. ripgrep_all/jless on win32)', () => {
    const config = {
      ...DEFAULT_CONFIG,
      tools: { ...DEFAULT_CONFIG.tools, ripgrep_all: true, jless: true },
    };
    const output = generateMiseToml(config, []);
    const tools = getToolsToInstall(config);
    if (process.platform === 'win32') {
      assert.doesNotMatch(output, /^ripgrep-all = /m);
      assert.doesNotMatch(output, /^jless = /m);
      assert.equal(
        tools.some((tool) => tool.name === 'ripgrep_all'),
        false,
      );
      assert.equal(
        tools.some((tool) => tool.name === 'jless'),
        false,
      );
      assert.match(platformUnsupportedHint(config), /ripgrep_all/);
      assert.match(platformUnsupportedHint(config), /jless/);
    } else {
      assert.match(output, /^ripgrep-all = /m);
      assert.match(output, /^jless = /m);
      assert.equal(platformUnsupportedHint(config), '');
    }
  });

  it('platformUnsupportedHint is empty when nothing enabled is platform-unsupported', () => {
    assert.equal(platformUnsupportedHint(DEFAULT_CONFIG), '');
  });

  it('getUpgradeableTools excludes rtk and pinned tools, keeps unpinned ones', () => {
    const upgradeable = getUpgradeableTools({
      ...DEFAULT_CONFIG,
      tool_versions: { jq: '1.7.1' },
    });

    assert.ok(upgradeable.includes('ripgrep'));
    assert.ok(upgradeable.includes('difftastic'));
    assert.equal(upgradeable.includes('rtk'), false);
    assert.equal(upgradeable.includes('jq'), false);
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
      assert.ok(['resolvable', 'needs-new-terminal', 'missing'].includes(tool.status));
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

describe('MISE_TOOL_NAMES invariant', () => {
  it('has a mise registry name for every catalog tool except custom-only ones', () => {
    const customOnly = new Set(['tokei']);
    for (const key of TOOL_KEYS) {
      if (customOnly.has(key)) continue;
      assert.ok(MISE_TOOL_NAMES[key], `MISE_TOOL_NAMES missing entry for tool: ${key}`);
    }
  });
});

describe('Windows 3-state verify and activation hint', () => {
  it('classifies on-path, shim-only, and missing binaries', () => {
    assert.equal(classifyToolResolvability(true, false, true), 'resolvable');
    assert.equal(classifyToolResolvability(false, true, true), 'needs-new-terminal');
    assert.equal(classifyToolResolvability(false, false, true), 'missing');
    assert.equal(classifyToolResolvability(false, true, false), 'missing');
  });

  it('treats a mise-installed tool off-PATH as needs-new-terminal on every OS', () => {
    // The Windows false-failure: `mise install` puts tools in mise's store but
    // does not always leave a shim in the shims dir, so PATH + shim alone
    // misread a successful install as "missing" and fail the whole apply.
    assert.equal(classifyToolResolvability(false, false, true, true), 'needs-new-terminal');
    assert.equal(classifyToolResolvability(false, false, false, true), 'needs-new-terminal');
    assert.equal(classifyToolResolvability(false, false, true, false), 'missing');
  });

  it('consults mise installed state before declaring a tool missing', () => {
    const availability = verifyToolAvailability(
      { ...DEFAULT_CONFIG, tools: { git_delta: true } },
      { installedState: { delta: { installed: true, versions: ['0.19.2'] } } },
    );
    assert.equal(availability.length, 1);
    assert.equal(availability[0].key, 'git_delta');
    assert.notEqual(availability[0].status, 'missing');
  });

  it('marks tools agentenv never installs via mise as manual, never missing', () => {
    // tokei is a fallback tool (manual install) and is deliberately absent
    // from the generated mise.toml, so `mise install` can never produce it.
    const availability = verifyToolAvailability(
      { ...DEFAULT_CONFIG, tools: { tokei: true } },
      { installedState: {} },
    );
    assert.equal(availability.length, 1);
    assert.equal(availability[0].status, 'manual');
    assert.equal(verifyCounts(availability).missing, 0);
    assert.equal(verifyHintNeeded(availability), false);
  });

  it('keeps the activation hint to three lines or fewer', () => {
    const hint = miseActivationHint();
    assert.ok(hint.split('\n').length <= 3);
  });

  it('emits a gitleaks EULA instruction without a yes-pipe', () => {
    const detection = detectEulaPrompt('Accept EULA for gitleaks? [y/n]', '');
    assert.deepEqual(detection.eulaTools, ['gitleaks']);
    assert.match(detection.eulaHint, /gitleaks requires accepting a EULA/);
    assert.equal(detection.eulaHint.includes('echo y'), false);
    const ahead = eulaPreflightHint({ tools: { gitleaks: true } });
    assert.match(ahead, /mise install gitleaks/);
    assert.equal(ahead.includes('echo y'), false);
  });
});

describe('getInstalledToolState', () => {
  it('parses the real object-keyed mise ls --json shape', () => {
    const state = getInstalledToolState(
      JSON.stringify({
        'ast-grep': [{ version: '0.45.3', install_path: 'x', installed: true, active: false }],
        delta: [{ version: '0.19.2', install_path: 'x', installed: false, active: true }],
      }),
    );
    assert.equal(state['ast-grep'].installed, true);
    assert.deepEqual(state['ast-grep'].versions, ['0.45.3']);
    assert.equal(state['delta'].installed, false);
    assert.deepEqual(state['delta'].versions, ['0.19.2']);
  });

  it('marks a tool installed when any of its versions is installed', () => {
    const state = getInstalledToolState(
      JSON.stringify({
        uv: [
          { version: '0.7.1', install_path: 'z', installed: false, active: false },
          { version: '0.8.2', install_path: 'y', installed: true, active: false },
        ],
      }),
    );
    assert.equal(state['uv'].installed, true);
    assert.deepEqual(state['uv'].versions, ['0.7.1', '0.8.2']);
  });

  it('parses a legacy array of {name, version}', () => {
    const state = getInstalledToolState(
      JSON.stringify([
        { name: 'jq', version: '1.8.2' },
        { name: 'fd', version: '10.5.0' },
      ]),
    );
    assert.equal(state['jq'].installed, true);
    assert.deepEqual(state['jq'].versions, ['1.8.2']);
  });

  it('returns an empty map for unparseable or empty output', () => {
    assert.deepEqual(getInstalledToolState(''), {});
    assert.deepEqual(getInstalledToolState('not json'), {});
  });
});

describe('parseInstalledToolState', () => {
  it('parses the same shapes as getInstalledToolState', () => {
    const state = parseInstalledToolState(
      JSON.stringify({ 'ast-grep': [{ version: '0.45.3', installed: true }] }),
    );
    assert.equal(state?.['ast-grep'].installed, true);
    assert.deepEqual(
      parseInstalledToolState(JSON.stringify([{ name: 'jq', version: '1.8.2' }]))?.['jq'].versions,
      ['1.8.2'],
    );
  });

  it('returns null for unparseable or unrecognized output (fail closed)', () => {
    assert.equal(parseInstalledToolState(''), null);
    assert.equal(parseInstalledToolState('not json'), null);
    assert.equal(parseInstalledToolState('['), null);
    assert.equal(parseInstalledToolState('null'), null);
    assert.equal(parseInstalledToolState('"jq"'), null);
  });

  it('treats "{}" as a valid empty state, not a failure', () => {
    assert.deepEqual(parseInstalledToolState('{}'), {});
    assert.notEqual(parseInstalledToolState('{}'), null);
  });
});

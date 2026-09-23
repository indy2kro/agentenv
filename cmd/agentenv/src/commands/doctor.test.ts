import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderDoctor, filterDoctorSections, wantsDoctorSection, gatherDoctor } from './doctor.js';
import type { DoctorSection, GatherDoctorDeps } from './doctor.js';
import { LOGO } from '../ui/output.js';
import { DEFAULT_CONFIG } from '../config/schema.js';
import type { AgentenvConfig } from '../config/schema.js';

describe('doctor renderer', () => {
  it('renders ok/warn/fail glyphs and sections in order', () => {
    const sections: DoctorSection[] = [
      {
        title: 'System',
        items: [{ status: 'ok', label: 'Shell', detail: 'PowerShell' }],
      },
      {
        title: 'Mise',
        items: [
          { status: 'ok', label: 'mise', detail: '2026.9.5' },
          { status: 'fail', label: 'shims_dir', detail: 'not set — run `agentenv apply`' },
        ],
      },
      {
        title: 'Tools',
        items: [{ status: 'warn', label: 'rg (ripgrep)', detail: 'not on PATH' }],
      },
    ];

    const output = renderDoctor(sections);
    assert.ok(output.includes(LOGO));
    assert.match(output, /\[ok\] {3}Shell — PowerShell/);
    assert.match(output, /\[fail\] shims_dir — not set — run `agentenv apply`/);
    assert.match(output, /\[warn\] rg \(ripgrep\) — not on PATH/);
    assert.ok(output.indexOf('System') < output.indexOf('Mise'));
    assert.ok(output.indexOf('Mise') < output.indexOf('Tools'));
  });

  it('omits the trailing dash when detail is empty', () => {
    const output = renderDoctor([
      { title: 'X', items: [{ status: 'ok', label: 'plain', detail: '' }] },
    ]);
    assert.match(output, /\[ok\] {3}plain\n/);
  });
});

import { doctorToJson } from './doctor.js';

describe('doctorToJson', () => {
  const sections: DoctorSection[] = [
    { title: 'System', items: [{ status: 'ok', label: 'OS', detail: 'linux' }] },
    { title: 'Tools', items: [{ status: 'warn', label: 'rg', detail: 'not on PATH' }] },
  ];

  it('reports ok / exit 0 when no item fails', () => {
    const json = doctorToJson(sections);
    assert.equal(json.command, 'doctor');
    assert.equal(json.status, 'ok');
    assert.equal(json.exitCode, 0);
    assert.deepEqual(json.sections, sections);
  });

  it('reports fail / exit 1 when any item fails', () => {
    const json = doctorToJson([
      { title: 'X', items: [{ status: 'fail', label: 'shims_dir', detail: 'unset' }] },
    ]);
    assert.equal(json.status, 'fail');
    assert.equal(json.exitCode, 1);
  });

  it('omits the heading when includeHeading is false', () => {
    assert.ok(!renderDoctor(sections, { includeHeading: false }).includes(LOGO));
    assert.ok(renderDoctor(sections).includes(LOGO));
  });
});

describe('filterDoctorSections', () => {
  const sections: DoctorSection[] = [
    { title: 'System', items: [{ status: 'ok', label: 'OS', detail: 'win32' }] },
    { title: 'Mise', items: [{ status: 'ok', label: 'mise', detail: 'x' }] },
    { title: 'Tools', items: [{ status: 'fail', label: 'rg', detail: 'missing' }] },
  ];

  it('selects by 1-based index', () => {
    const one = filterDoctorSections(sections, '1');
    assert.equal(one?.length, 1);
    assert.equal(one?.[0].title, 'System');
    assert.equal(filterDoctorSections(sections, '3')?.[0].title, 'Tools');
  });

  it('selects by case-insensitive title prefix', () => {
    assert.equal(filterDoctorSections(sections, 'tool')?.[0].title, 'Tools');
    assert.equal(filterDoctorSections(sections, 'TOOLS')?.[0].title, 'Tools');
  });

  it('returns undefined for an out-of-range index or unmatched prefix', () => {
    assert.equal(filterDoctorSections(sections, '9'), undefined);
    assert.equal(filterDoctorSections(sections, 'agents'), undefined);
  });
});

describe('wantsDoctorSection', () => {
  it('wants every section when there is no filter', () => {
    assert.equal(wantsDoctorSection(undefined, 'Tools'), true);
    assert.equal(wantsDoctorSection(undefined, 'RTK'), true);
  });

  it('wants every section for a numeric (index-based) filter — cannot be resolved cheaply', () => {
    assert.equal(wantsDoctorSection('3', 'Tools'), true);
    assert.equal(wantsDoctorSection('3', 'Agents'), true);
  });

  it('only wants the section matching a name-based filter (case-insensitive prefix)', () => {
    assert.equal(wantsDoctorSection('rtk', 'RTK'), true);
    assert.equal(wantsDoctorSection('RTK', 'RTK'), true);
    assert.equal(wantsDoctorSection('rtk', 'Tools'), false);
    assert.equal(wantsDoctorSection('rtk', 'Agents'), false);
  });
});

function section(sections: DoctorSection[], title: string): DoctorSection | undefined {
  return sections.find((s) => s.title === title || s.title.startsWith(title));
}

/** A fully healthy, deterministic baseline — every test overrides only what it needs to change. */
function baseDeps(overrides: Partial<GatherDoctorDeps> = {}): GatherDoctorDeps {
  const config: AgentenvConfig = {
    ...DEFAULT_CONFIG,
    agents: { claude_code: true },
    tools: { ripgrep: true },
    rtk: { enabled: false },
  };
  return {
    detectShell: () => ({
      currentShell: 'bash',
      isPosixCompatible: true,
      isWindows: false,
      isMacOS: false,
      isGitBash: false,
      missingUtilities: [],
      pathEnvironment: '',
    }),
    existsSync: () => true,
    readFileSync: (() =>
      '[settings]\nshims_dir = "/fake/shims"\n') as unknown as typeof import('fs').readFileSync,
    isMiseInstalled: () => true,
    getMiseVersion: () => '2026.1.1',
    miseGlobalConfigPath: () => '/fake/mise/config.toml',
    shimsDir: () => '/fake/shims',
    shimsDirOnPath: () => true,
    findConfigPath: () => '/fake/project/agentenv.toml',
    userConfigDir: () => '/fake/home/.config/agentenv',
    loadConfig: () => config,
    getInstalledToolState: () => ({}),
    toolAvailabilityClassification: () => 'resolvable',
    checkRtkInstallation: () => ({ resolvedPath: null, version: null, gainOk: null }),
    isAgentInstalled: () => true,
    ...overrides,
  };
}

describe('gatherDoctor — System', () => {
  it(
    'reports OS and shell without a Git Bash line on non-Windows',
    { skip: process.platform === 'win32' },
    () => {
      const sections = gatherDoctor(undefined, baseDeps());
      const system = section(sections, 'System');
      assert.ok(system?.items.some((i) => i.label === 'OS'));
      assert.ok(system?.items.some((i) => i.label === 'Shell' && i.detail === 'bash'));
      assert.ok(!system?.items.some((i) => i.label === 'Git Bash'));
    },
  );
});

describe('gatherDoctor — Mise', () => {
  it('reports a fail and stops (no further sections) when mise is not installed', () => {
    const sections = gatherDoctor(undefined, baseDeps({ isMiseInstalled: () => false }));
    assert.equal(sections.length, 2); // System, Mise — stops before Config/Tools/RTK/Agents.
    const mise = section(sections, 'Mise');
    assert.ok(mise?.items.some((i) => i.status === 'fail' && i.label === 'mise'));
    assert.ok(mise?.items.some((i) => i.label === 'Install'));
  });

  it('reports shims_dir ok when the global mise config matches, fail when it does not', () => {
    const ok = gatherDoctor(undefined, baseDeps());
    assert.ok(section(ok, 'Mise')?.items.some((i) => i.status === 'ok' && i.label === 'shims_dir'));

    const stale = gatherDoctor(
      undefined,
      baseDeps({
        readFileSync: (() =>
          '[settings]\nshims_dir = "/somewhere/else"\n') as unknown as typeof import('fs').readFileSync,
      }),
    );
    assert.ok(
      section(stale, 'Mise')?.items.some((i) => i.status === 'fail' && i.label === 'shims_dir'),
    );
  });

  it('reports shims_dir fail when the global config file does not exist at all', () => {
    const sections = gatherDoctor(undefined, baseDeps({ existsSync: () => false }));
    assert.ok(
      section(sections, 'Mise')?.items.some((i) => i.status === 'fail' && i.label === 'shims_dir'),
    );
  });

  it('reports shims-on-PATH as warn when not on PATH', () => {
    const sections = gatherDoctor(undefined, baseDeps({ shimsDirOnPath: () => false }));
    assert.ok(
      section(sections, 'Mise')?.items.some(
        (i) => i.status === 'warn' && i.label === 'shims on PATH',
      ),
    );
  });
});

describe('gatherDoctor — Config', () => {
  it('reports a warn and stops when no config is found', () => {
    const sections = gatherDoctor(undefined, baseDeps({ findConfigPath: () => undefined }));
    assert.equal(sections.length, 3); // System, Mise, Config
    assert.ok(
      section(sections, 'Config')?.items.some(
        (i) => i.status === 'warn' && i.label === 'agentenv.toml',
      ),
    );
  });

  it('reports validity fail and stops when the config fails to parse', () => {
    const sections = gatherDoctor(
      undefined,
      baseDeps({
        loadConfig: () => {
          throw new Error('bad toml');
        },
      }),
    );
    assert.equal(sections.length, 3);
    assert.ok(
      section(sections, 'Config')?.items.some(
        (i) => i.status === 'fail' && i.label === 'validity' && i.detail.includes('bad toml'),
      ),
    );
  });

  it('reports the user scope when the config path matches userConfigDir', () => {
    const sections = gatherDoctor(
      undefined,
      baseDeps({
        findConfigPath: () => '/fake/home/.config/agentenv/agentenv.toml',
        userConfigDir: () => '/fake/home/.config/agentenv',
      }),
    );
    assert.match(section(sections, 'Config')?.items[0].detail ?? '', /\(user scope\)/);
  });

  it('reports the project scope otherwise', () => {
    const sections = gatherDoctor(undefined, baseDeps());
    assert.match(section(sections, 'Config')?.items[0].detail ?? '', /\(project scope\)/);
  });

  it('reports validation errors as fail and warnings as warn items', () => {
    const sections = gatherDoctor(
      undefined,
      baseDeps({
        loadConfig: () =>
          ({ ...DEFAULT_CONFIG, agents: { not_a_real_agent: true } }) as AgentenvConfig,
      }),
    );
    const config = section(sections, 'Config');
    // An unknown top-level agent key is a validation error, not silently dropped.
    assert.ok(config?.items.some((i) => i.status === 'fail' && i.label === 'validity'));
  });
});

describe('gatherDoctor — Tools', () => {
  it('skips the mise probe entirely when --section filters elsewhere', () => {
    const sections = gatherDoctor(
      'agents',
      baseDeps({
        getInstalledToolState: () => {
          throw new Error('must not probe mise when Tools is filtered out');
        },
      }),
    );
    assert.ok(section(sections, 'Tools'));
  });

  it('classifies each enabled tool via toolAvailabilityClassification', () => {
    const sections = gatherDoctor(
      undefined,
      baseDeps({
        loadConfig: () => ({ ...DEFAULT_CONFIG, agents: {}, tools: { ripgrep: true, fd: true } }),
        toolAvailabilityClassification: (key) =>
          key === 'ripgrep' ? 'missing' : 'needs-new-terminal',
      }),
    );
    const tools = section(sections, 'Tools');
    assert.ok(tools?.items.some((i) => i.status === 'fail' && i.label.startsWith('rg ')));
    assert.ok(tools?.items.some((i) => i.status === 'warn' && i.label.startsWith('fd ')));
  });

  it('reports "no tools enabled" when the config enables none', () => {
    const sections = gatherDoctor(
      undefined,
      baseDeps({ loadConfig: () => ({ ...DEFAULT_CONFIG, agents: {}, tools: {} }) }),
    );
    assert.ok(section(sections, 'Tools')?.items.some((i) => i.label === 'none'));
  });
});

describe('gatherDoctor — RTK', () => {
  it('omits the RTK section entirely when rtk is disabled and not an enabled tool', () => {
    const sections = gatherDoctor(
      undefined,
      baseDeps({
        loadConfig: () => ({ ...DEFAULT_CONFIG, agents: {}, tools: {}, rtk: { enabled: false } }),
      }),
    );
    assert.equal(section(sections, 'RTK'), undefined);
  });

  it('includes the RTK section when tools.rtk is enabled even if [rtk].enabled is not', () => {
    const sections = gatherDoctor(
      undefined,
      baseDeps({
        loadConfig: () => ({
          ...DEFAULT_CONFIG,
          agents: {},
          tools: { rtk: true },
          rtk: { enabled: false },
        }),
      }),
    );
    assert.ok(section(sections, 'RTK'));
  });

  it('reports fail when rtk cannot be resolved at all', () => {
    const sections = gatherDoctor(
      undefined,
      baseDeps({
        loadConfig: () => ({ ...DEFAULT_CONFIG, agents: {}, tools: {}, rtk: { enabled: true } }),
        checkRtkInstallation: () => ({ resolvedPath: null, version: null, gainOk: null }),
      }),
    );
    assert.ok(
      section(sections, 'RTK')?.items.some((i) => i.status === 'fail' && i.label === 'rtk'),
    );
  });

  it('reports version ok and notes a mismatch against the pinned version', () => {
    const sections = gatherDoctor(
      undefined,
      baseDeps({
        loadConfig: () => ({ ...DEFAULT_CONFIG, agents: {}, tools: {}, rtk: { enabled: true } }),
        checkRtkInstallation: () => ({
          resolvedPath: '/mise/shims/rtk',
          version: 'rtk 0.1.0',
          gainOk: true,
        }),
      }),
    );
    const rtk = section(sections, 'RTK');
    const versionItem = rtk?.items.find((i) => i.label === 'version');
    assert.equal(versionItem?.status, 'ok');
    assert.match(versionItem?.detail ?? '', /agentenv pins/);
    assert.ok(rtk?.items.some((i) => i.label === 'rtk gain' && i.status === 'ok'));
  });

  it('warns on version when `rtk --version` failed, and fails rtk gain when it did', () => {
    const sections = gatherDoctor(
      undefined,
      baseDeps({
        loadConfig: () => ({ ...DEFAULT_CONFIG, agents: {}, tools: {}, rtk: { enabled: true } }),
        checkRtkInstallation: () => ({
          resolvedPath: '/usr/local/bin/rtk',
          version: null,
          gainOk: false,
        }),
      }),
    );
    const rtk = section(sections, 'RTK');
    assert.equal(rtk?.items.find((i) => i.label === 'version')?.status, 'warn');
    assert.equal(rtk?.items.find((i) => i.label === 'rtk gain')?.status, 'fail');
  });

  it('skips the rtk probe entirely when --section filters elsewhere', () => {
    const sections = gatherDoctor(
      'tools',
      baseDeps({
        loadConfig: () => ({ ...DEFAULT_CONFIG, agents: {}, tools: {}, rtk: { enabled: true } }),
        checkRtkInstallation: () => {
          throw new Error('must not probe rtk when RTK is filtered out');
        },
      }),
    );
    assert.deepEqual(section(sections, 'RTK')?.items, []);
  });
});

describe('gatherDoctor — Agents', () => {
  it('reports installed vs. not-installed agents', () => {
    const sections = gatherDoctor(
      undefined,
      baseDeps({
        loadConfig: () => ({
          ...DEFAULT_CONFIG,
          agents: { claude_code: true, codex_cli: true },
          tools: {},
        }),
        isAgentInstalled: (agent) => agent === 'claude_code',
      }),
    );
    const agents = section(sections, 'Agents');
    assert.equal(agents?.items.find((i) => i.label.startsWith('claude_code'))?.status, 'ok');
    assert.equal(agents?.items.find((i) => i.label.startsWith('codex_cli'))?.status, 'warn');
  });

  it('reports "no agents enabled" when none are configured', () => {
    const sections = gatherDoctor(
      undefined,
      baseDeps({ loadConfig: () => ({ ...DEFAULT_CONFIG, agents: {}, tools: {} }) }),
    );
    assert.ok(section(sections, 'Agents')?.items.some((i) => i.label === 'none'));
  });

  it('skips the per-agent probe entirely when --section filters elsewhere', () => {
    // isAgentInstalled would throw if called — reaching the assertion at all
    // (with the untouched "no agents enabled" placeholder, since the section
    // can't tell "skipped" from "genuinely empty" by item count) proves the
    // probe never ran.
    const sections = gatherDoctor(
      'tools',
      baseDeps({
        loadConfig: () => ({ ...DEFAULT_CONFIG, agents: { claude_code: true }, tools: {} }),
        isAgentInstalled: () => {
          throw new Error('must not probe agents when Agents is filtered out');
        },
      }),
    );
    assert.deepEqual(section(sections, 'Agents')?.items, [
      { status: 'warn', label: 'none', detail: 'no agents enabled' },
    ]);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_CONFIG_FILES,
  computeStatusExitCode,
  gatherStatus,
  renderStatus,
  renderStatusShort,
  statusToJson,
} from './status.js';
import type { StatusJson, StatusReport } from './status.js';
import { AGENT_KEYS } from '../config/schema.js';

describe('status agent descriptors', () => {
  it('covers every agent key', () => {
    for (const key of AGENT_KEYS) {
      assert.ok(AGENT_CONFIG_FILES[key], `AGENT_CONFIG_FILES missing ${key}`);
      assert.ok(AGENT_CONFIG_FILES[key].label.length > 0);
    }
  });

  it('points new delegation agents at their real (verified) artifact, not all at the same file', () => {
    assert.equal(AGENT_CONFIG_FILES.gemini_cli.label, 'Gemini CLI');
    assert.equal(AGENT_CONFIG_FILES.cursor.label, 'Cursor');
    assert.equal(AGENT_CONFIG_FILES.cline.label, 'Cline CLI');
    // cline is project-scoped (no -g) and genuinely writes RTK.md in baseDir.
    assert.match(AGENT_CONFIG_FILES.cline.check('/proj'), /RTK\.md$/);
    // gemini_cli (`-g --gemini`) writes GEMINI.md into its own global config
    // dir, not RTK.md in baseDir (SWEEP-04; verified live).
    assert.match(AGENT_CONFIG_FILES.gemini_cli.check('/proj'), /GEMINI\.md$/);
    assert.doesNotMatch(AGENT_CONFIG_FILES.gemini_cli.check('/proj'), /^\/proj/);
    // cursor (`-g --agent cursor`) writes into the shared Claude Code
    // anchor (~/.claude/RTK.md), not baseDir (SWEEP-04; verified live).
    assert.match(AGENT_CONFIG_FILES.cursor.check('/proj'), /\.claude[/\\]RTK\.md$/);
    assert.doesNotMatch(AGENT_CONFIG_FILES.cursor.check('/proj'), /^\/proj/);
  });
});

function base(overrides: Partial<StatusJson> = {}): StatusJson {
  return {
    command: 'status',
    config: '/tmp/agentenv.toml',
    scope: 'project',
    baseDir: '/tmp',
    exitCode: 0,
    validation: { errors: [], warnings: [] },
    agents: [],
    tools: [],
    customTools: [],
    generated: [],
    integrations: [],
    ...overrides,
  };
}

describe('computeStatusExitCode', () => {
  it('is 0 for a clean report', () => {
    assert.equal(computeStatusExitCode(base()), 0);
  });

  it('is 1 for missing config', () => {
    assert.equal(computeStatusExitCode(base({ config: null, scope: null, baseDir: null })), 1);
  });

  it('is 1 when validation errors exist', () => {
    assert.equal(computeStatusExitCode(base({ validation: { errors: ['bad'], warnings: [] } })), 1);
  });

  it('is 1 for a missing enabled tool', () => {
    assert.equal(
      computeStatusExitCode(
        base({
          tools: [
            {
              key: 'gh',
              binary: 'gh',
              tier: 3,
              found: false,
              status: 'missing',
              drift: true,
              pinned: null,
              installed: null,
            },
          ],
        }),
      ),
      1,
    );
  });

  it('is 1 for agent drift, 0 when merely not installed', () => {
    assert.equal(
      computeStatusExitCode(
        base({
          agents: [
            {
              key: 'claude_code',
              label: 'Claude Code',
              installed: true,
              configured: false,
              drift: true,
            },
          ],
        }),
      ),
      1,
    );
    assert.equal(
      computeStatusExitCode(
        base({
          agents: [
            {
              key: 'claude_code',
              label: 'Claude Code',
              installed: false,
              configured: false,
              drift: false,
            },
          ],
        }),
      ),
      0,
    );
  });

  it('is 1 for a missing or unmanaged generated file', () => {
    assert.equal(
      computeStatusExitCode(
        base({ generated: [{ label: 'AGENTS.md', exists: false, managed: false }] }),
      ),
      1,
    );
    assert.equal(
      computeStatusExitCode(
        base({ generated: [{ label: 'AGENTS.md', exists: true, managed: false }] }),
      ),
      1,
    );
  });

  it('is 1 for a found tool whose explicit version pin does not match the installed version', () => {
    assert.equal(
      computeStatusExitCode(
        base({
          tools: [
            {
              key: 'gh',
              binary: 'gh',
              tier: 3,
              found: true,
              status: 'resolvable',
              drift: true,
              pinned: '2.100.0',
              installed: '2.101.0',
            },
          ],
        }),
      ),
      1,
    );
  });

  it('is 1 for missing/drifted integrations, 0 for unsupported', () => {
    const integration = (drift: boolean) => ({
      key: 'superpowers',
      enabled: true,
      source: null,
      ref: null,
      scope: 'project',
      agents: [],
      states: [],
      drift,
    });
    assert.equal(computeStatusExitCode(base({ integrations: [integration(true)] })), 1);
    assert.equal(computeStatusExitCode(base({ integrations: [integration(false)] })), 0);
  });

  it('is 1 for a custom tool whose declared path is missing', () => {
    assert.equal(
      computeStatusExitCode(
        base({ customTools: [{ name: 'foo', status: 'MISSING on disk', drift: true }] }),
      ),
      1,
    );
  });

  it('ignores validation warnings', () => {
    assert.equal(
      computeStatusExitCode(base({ validation: { errors: [], warnings: ['advisory'] } })),
      0,
    );
  });
});

const noopConfig = {
  agents: {},
  tools: {},
  custom_tools: [],
  generate: {
    marker_start: '<!-- agentenv-managed-start -->',
    marker_end: '<!-- agentenv-managed-end -->',
  },
} as unknown as import('../config/schema.js').AgentenvConfig;

describe('gatherStatus', () => {
  it('returns a null-config report with exit 1 when no config exists', async () => {
    const report = await gatherStatus({ findConfigPath: () => undefined });
    assert.equal(report.config, null);
    assert.equal(report.exitCode, 1);
    assert.deepEqual(statusToJson(report).agents, []);
    const json = statusToJson(report);
    assert.ok(!('rtkEnabled' in json));
    assert.ok(!('tier0' in json));
    assert.ok(!('ghAuth' in json));
    assert.ok(!('integrationDetails' in json));
  });

  it('puts a load failure into validation.errors and keeps the path', async () => {
    const report = await gatherStatus({
      findConfigPath: () => '/tmp/agentenv.toml',
      loadConfig: () => {
        throw new Error('bad toml');
      },
      resolveScopeDir: () => '/tmp',
    });
    assert.equal(report.config, '/tmp/agentenv.toml');
    assert.deepEqual(report.validation.errors, ['bad toml']);
    assert.equal(report.exitCode, 1);
  });

  it('reports exit 0 for a drift-free config with no agents/tools/files', async () => {
    const report = await gatherStatus({
      findConfigPath: () => '/tmp/agentenv.toml',
      loadConfig: () => noopConfig,
      resolveScopeDir: () => '/tmp',
      validateConfig: () => ({ errors: [], warnings: [] }),
      getEnabledAgents: () => [],
      detectShell: () =>
        ({
          isWindows: false,
          isPosixCompatible: true,
          currentShell: 'bash',
          missingUtilities: [],
        }) as never,
      fileExists: () => true,
      hasManagedMarker: () => true,
    });
    assert.equal(report.exitCode, 0);
  });

  it('does not report a manual tool (no mise fallback) as drift', async () => {
    const report = await gatherStatus({
      findConfigPath: () => '/tmp/agentenv.toml',
      loadConfig: () => ({ ...noopConfig, tools: { tokei: true } }) as never,
      resolveScopeDir: () => '/tmp',
      validateConfig: () => ({ errors: [], warnings: [] }),
      getEnabledAgents: () => [],
      detectShell: () =>
        ({
          isWindows: true,
          isPosixCompatible: true,
          currentShell: 'bash',
          missingUtilities: [],
        }) as never,
      getInstalledToolState: () => ({}),
      resolveBinary: () => null,
      shimExists: () => false,
      fileExists: () => true,
      hasManagedMarker: () => true,
    });
    assert.equal(report.tools[0]?.status, 'manual');
    assert.equal(report.tools[0]?.drift, false);
    assert.equal(report.exitCode, 0);
  });

  it('does not report an installed-but-stale-PATH tool as drift', async () => {
    const report = await gatherStatus({
      findConfigPath: () => '/tmp/agentenv.toml',
      loadConfig: () => ({ ...noopConfig, tools: { gh: true } }) as never,
      resolveScopeDir: () => '/tmp',
      validateConfig: () => ({ errors: [], warnings: [] }),
      getEnabledAgents: () => [],
      detectShell: () =>
        ({
          isWindows: true,
          isPosixCompatible: true,
          currentShell: 'bash',
          missingUtilities: [],
        }) as never,
      getInstalledToolState: () => ({ gh: { installed: true, versions: ['3.0.0'] } }),
      resolveBinary: () => null,
      shimExists: () => false,
      fileExists: () => true,
      hasManagedMarker: () => true,
    });
    assert.equal(report.tools[0]?.status, 'needs-new-terminal');
    assert.equal(report.tools[0]?.drift, false);
    assert.equal(report.exitCode, 0);
  });

  it('reports a genuinely missing tool as drift', async () => {
    const report = await gatherStatus({
      findConfigPath: () => '/tmp/agentenv.toml',
      loadConfig: () => ({ ...noopConfig, tools: { gh: true } }) as never,
      resolveScopeDir: () => '/tmp',
      validateConfig: () => ({ errors: [], warnings: [] }),
      getEnabledAgents: () => [],
      detectShell: () =>
        ({
          isWindows: true,
          isPosixCompatible: true,
          currentShell: 'bash',
          missingUtilities: [],
        }) as never,
      getInstalledToolState: () => ({}),
      resolveBinary: () => null,
      shimExists: () => false,
      fileExists: () => true,
      hasManagedMarker: () => true,
    });
    assert.equal(report.tools[0]?.status, 'missing');
    assert.equal(report.tools[0]?.drift, true);
    assert.equal(report.exitCode, 1);
  });

  it('does not report a missing rtk-owned file as agent drift when rtk rewriting is off (BUG-06)', async () => {
    const report = await gatherStatus({
      findConfigPath: () => '/tmp/agentenv.toml',
      loadConfig: () =>
        ({ ...noopConfig, agents: { cline: true }, rtk: { enabled: false } }) as never,
      resolveScopeDir: () => '/tmp',
      validateConfig: () => ({ errors: [], warnings: [] }),
      getEnabledAgents: () => ['cline'],
      detectShell: () =>
        ({
          isWindows: true,
          isPosixCompatible: true,
          currentShell: 'bash',
          missingUtilities: [],
        }) as never,
      isAgentInstalled: () => true,
      // Only the agent's own RTK.md is "missing" — generated files still
      // "exist" so this test isolates agent drift from generated-file drift.
      fileExists: (file: string) => !file.endsWith('RTK.md'),
      hasManagedMarker: () => true,
    });
    assert.equal(report.agents[0]?.installed, true);
    assert.equal(report.agents[0]?.configured, false);
    assert.equal(report.agents[0]?.drift, false);
    assert.equal(report.exitCode, 0);
  });

  it('does report the same missing file as agent drift when rtk rewriting is on', async () => {
    const report = await gatherStatus({
      findConfigPath: () => '/tmp/agentenv.toml',
      loadConfig: () =>
        ({ ...noopConfig, agents: { cline: true }, rtk: { enabled: true } }) as never,
      resolveScopeDir: () => '/tmp',
      validateConfig: () => ({ errors: [], warnings: [] }),
      getEnabledAgents: () => ['cline'],
      detectShell: () =>
        ({
          isWindows: true,
          isPosixCompatible: true,
          currentShell: 'bash',
          missingUtilities: [],
        }) as never,
      isAgentInstalled: () => true,
      fileExists: () => false,
      hasManagedMarker: () => true,
    });
    assert.equal(report.agents[0]?.drift, true);
    assert.equal(report.exitCode, 1);
  });

  it('does not treat an unsupported integration state as drift', async () => {
    const report = await gatherStatus({
      findConfigPath: () => '/tmp/agentenv.toml',
      loadConfig: () =>
        ({
          ...noopConfig,
          integrations: { superpowers: { enabled: true, scope: 'project' } },
        }) as never,
      resolveScopeDir: () => '/tmp',
      validateConfig: () => ({ errors: [], warnings: [] }),
      getEnabledAgents: () => [],
      detectShell: () =>
        ({
          isWindows: false,
          isPosixCompatible: true,
          currentShell: 'bash',
          missingUtilities: [],
        }) as never,
      fileExists: () => true,
      hasManagedMarker: () => true,
      superpowersStatus: async () => ({
        name: 'Superpowers',
        scope: 'project',
        agents: [{ agent: 'copilot', state: 'unsupported' }],
        changedFiles: [],
        nativeCommands: [],
        warnings: [],
        errors: [],
      }),
    });
    assert.equal(report.integrations[0]?.drift, false);
    assert.equal(report.exitCode, 0);
  });
});

describe('renderStatusShort', () => {
  const clean = (): StatusReport => ({
    ...base(),
    rtkEnabled: true,
    tier0: null,
    ghAuth: null,
    miseVersion: '2026.9.5',
    integrationDetails: [],
  });

  it('collapses a clean report to one line per area', () => {
    const out = renderStatusShort(clean());
    assert.match(out, /Config: \/tmp\/agentenv\.toml/);
    assert.match(out, /Tools: 0 configured/);
    assert.match(out, /Agents: 0 enabled/);
    assert.match(out, /Generated files: 0/);
  });

  it('counts drifted areas without per-item detail', () => {
    const out = renderStatusShort({
      ...clean(),
      tools: [
        {
          key: 'gh',
          binary: 'gh',
          tier: 3,
          found: false,
          status: 'missing',
          drift: true,
          pinned: null,
          installed: null,
        },
      ],
      generated: [{ label: 'AGENTS.md', exists: false, managed: false }],
    });
    assert.match(out, /Tools: 1 configured, 1 drifted/);
    assert.match(out, /Generated files: 1, 1 missing\/unmanaged/);
    assert.doesNotMatch(out, /gh/);
  });
});

describe('renderStatus agent lines', () => {
  const report = (agents: StatusReport['agents']): StatusReport => ({
    command: 'status',
    config: '/tmp/agentenv.toml',
    scope: 'project',
    baseDir: '/tmp',
    exitCode: 0,
    validation: { errors: [], warnings: [] },
    agents,
    tools: [],
    customTools: [],
    generated: [],
    integrations: [],
    rtkEnabled: true,
    tier0: null,
    ghAuth: null,
    miseVersion: '2026.9.5',
    integrationDetails: [],
  });

  it('aligns the configured column for installed yes/no (UX-06)', () => {
    const out = renderStatus(
      report([
        {
          key: 'claude_code',
          label: 'Claude Code',
          installed: true,
          configured: true,
          drift: false,
        },
        { key: 'codex_cli', label: 'Codex CLI', installed: false, configured: false, drift: false },
      ]),
    );
    const yesLine = out.split('\n').find((line) => line.includes('Claude Code'));
    const noLine = out.split('\n').find((line) => line.includes('Codex CLI'));
    assert.ok(yesLine && noLine);
    assert.ok(yesLine.includes('installed: yes '));
    // 'no' is padded to width 3 before the three-space separator, so the
    // `configured:` column starts at the same offset on both lines.
    assert.equal(
      yesLine.indexOf('configured:'),
      noLine.indexOf('configured:'),
      'configured column must align regardless of yes/no',
    );
  });
});

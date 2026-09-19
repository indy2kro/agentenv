import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import toml from 'toml';
import {
  AGENT_KEYS,
  BINARY_MAP,
  DEFAULT_CONFIG,
  TOOL_DESCRIPTIONS,
  TOOL_KEYS,
  TOOL_TIERS,
  configToToml,
  diffConfigs,
  getEnabledAgents,
  loadConfig,
  resolveIntegrationScope,
  validateConfig,
} from './schema.js';
import type { AgentenvConfig, AgentKey, CustomTool } from './schema.js';
import { MISE_TOOL_NAMES, PINNED_TOOL_VERSIONS } from '../toolchain/mise.js';
import { TOOL_CATEGORIES } from '../generate/agentsmd.js';

describe('configuration persistence', () => {
  it('rejects malformed TOML instead of applying defaults', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-config-'));
    const configPath = path.join(directory, 'agentenv.toml');
    fs.writeFileSync(configPath, '[agents\nclaude_code = true');

    assert.throws(() => loadConfig(configPath), /Invalid agentenv configuration/);
  });

  it('serializes each custom tool as its own escaped TOML table', () => {
    const content = configToToml({
      custom_tools: [
        { name: 'first"tool', description: 'one\\two\nthree', mise_source: 'github:example/one' },
        { name: 'second', description: 'second tool', path_windows: 'C:\\tools\\second.exe' },
      ],
    });

    assert.equal((content.match(/\[\[custom_tools\]\]/g) ?? []).length, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(toml.parse(content).custom_tools)), [
      { name: 'first"tool', description: 'one\\two\nthree', mise_source: 'github:example/one' },
      { name: 'second', description: 'second tool', path_windows: 'C:\\tools\\second.exe' },
    ]);
  });

  it('accepts the dotted path.* custom-tool form from the docs example', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-config-'));
    const configPath = path.join(directory, 'agentenv.toml');
    fs.writeFileSync(
      configPath,
      [
        '[[custom_tools]]',
        'name = "universal-ctags"',
        'description = "symbols"',
        'already_installed = true',
        '[custom_tools.path]',
        'windows = "C:\\\\ctags\\\\ctags.exe"',
        'macos = "/usr/local/bin/ctags"',
      ].join('\n'),
    );

    const config = loadConfig(configPath);
    const ctags = config.custom_tools?.find((tool: CustomTool) => tool.name === 'universal-ctags');
    assert.equal(ctags?.path_windows, 'C:\\ctags\\ctags.exe');
    assert.equal(ctags?.path_macos, '/usr/local/bin/ctags');
  });

  it('resolves the dotted version.* custom-tool form for the current platform', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-config-'));
    const configPath = path.join(directory, 'agentenv.toml');
    fs.writeFileSync(
      configPath,
      [
        '[[custom_tools]]',
        'name = "universal-ctags"',
        'description = "symbols"',
        'already_installed = true',
        '[custom_tools.version]',
        'windows = "9.9.9-win"',
        'macos = "9.9.9-mac"',
        'linux = "9.9.9-linux"',
      ].join('\n'),
    );

    const expected =
      process.platform === 'win32'
        ? '9.9.9-win'
        : process.platform === 'darwin'
          ? '9.9.9-mac'
          : '9.9.9-linux';
    const config = loadConfig(configPath);
    const ctags = config.custom_tools?.find((tool: CustomTool) => tool.name === 'universal-ctags');
    assert.equal(ctags?.version, expected);
  });

  it('serializes tool_versions pins and round-trips them through loadConfig', () => {
    const content = configToToml({ tool_versions: { jq: '1.7.1', fd: '1.0' } });
    assert.match(content, /\[tool_versions\]/);
    assert.deepEqual(JSON.parse(JSON.stringify(toml.parse(content).tool_versions)), {
      jq: '1.7.1',
      fd: '1.0',
    });

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-config-'));
    const configPath = path.join(directory, 'agentenv.toml');
    fs.writeFileSync(configPath, content);
    const config = loadConfig(configPath);
    assert.equal(config.tool_versions?.jq, '1.7.1');
  });
});

describe('configuration validation', () => {
  const valid: AgentenvConfig = { scope: 'project', agents: { claude_code: true } };

  it('accepts a well-formed config', () => {
    assert.deepEqual(validateConfig(valid), { errors: [], warnings: [] });
  });

  it('rejects an unknown agent key', () => {
    const report = validateConfig({ agents: { gemini: true } as never });
    assert.ok(report.errors.some((error) => error.includes('Unknown agent "gemini"')));
  });

  it('rejects an unknown tool key', () => {
    const report = validateConfig({ tools: { ripgrep: true, wget: true } as never });
    assert.ok(report.errors.some((error) => error.includes('Unknown tool "wget"')));
  });

  it('rejects an invalid scope', () => {
    const report = validateConfig({ scope: 'system' as never });
    assert.ok(report.errors.some((error) => error.includes('scope must be "project" or "user"')));
  });

  it('flags registry-gap tools as warnings, not errors', () => {
    const report = validateConfig({ tools: { tokei: true } });
    assert.equal(report.errors.length, 0);
    assert.ok(report.warnings.some((warning) => warning.includes('tokei')));
  });

  it('warns about an already_installed custom tool with no OS path', () => {
    const report = validateConfig({
      custom_tools: [{ name: 'mytool', description: 'test tool', already_installed: true }],
    });
    assert.ok(report.warnings.some((warning) => warning.includes('mytool')));
  });

  it('rejects a version pin for an unknown tool', () => {
    const report = validateConfig({ tool_versions: { wget: '1.0' } });
    assert.ok(
      report.errors.some((error) => error.includes('tool_versions references unknown tool "wget"')),
    );
  });

  it('rejects an empty version pin', () => {
    const report = validateConfig({ tool_versions: { jq: '' } });
    assert.ok(
      report.errors.some((error) =>
        error.includes('tool_versions.jq must be a non-empty version string'),
      ),
    );
  });
});

describe('configuration diff', () => {
  it('reports tools and agents as added/removed', () => {
    const oldConfig: AgentenvConfig = { tools: { ripgrep: true, fd: true } };
    const newConfig: AgentenvConfig = {
      agents: { codex_cli: true },
      tools: { ripgrep: true, jq: true },
    };

    assert.deepEqual(diffConfigs(oldConfig, newConfig), [
      { kind: 'added', key: 'agents.codex_cli', oldValue: false, newValue: true },
      { kind: 'removed', key: 'tools.fd', oldValue: true, newValue: false },
      { kind: 'added', key: 'tools.jq', oldValue: false, newValue: true },
    ]);
  });

  it('reports scalar settings as changed', () => {
    const oldConfig: AgentenvConfig = { scope: 'project', rtk: { enabled: true } };
    const newConfig: AgentenvConfig = { scope: 'user', rtk: { enabled: false } };

    const diff = diffConfigs(oldConfig, newConfig);
    assert.deepEqual(
      diff.map((entry) => [entry.key, entry.oldValue, entry.newValue]),
      [
        ['scope', 'project', 'user'],
        ['rtk.enabled', true, false],
      ],
    );
  });

  it('reports a changed diff entry when a version pin flips', () => {
    const oldConfig: AgentenvConfig = { tool_versions: { jq: '1.0' } };
    const newConfig: AgentenvConfig = { tool_versions: { jq: '1.1' } };

    assert.deepEqual(diffConfigs(oldConfig, newConfig), [
      { kind: 'changed', key: 'tool_versions.jq', oldValue: '1.0', newValue: '1.1' },
    ]);
  });

  it('reports custom tool additions, removals, and field changes', () => {
    const oldConfig: AgentenvConfig = {
      custom_tools: [
        { name: 'gone', description: 'removed tool' },
        { name: 'mytool', description: 'old description', path_windows: 'C:\\old\\mytool.exe' },
      ],
    };
    const newConfig: AgentenvConfig = {
      custom_tools: [
        { name: 'mytool', description: 'new description', path_windows: 'C:\\new\\mytool.exe' },
        { name: 'fresh', description: 'brand new' },
      ],
    };

    const diff = diffConfigs(oldConfig, newConfig);
    assert.deepEqual(
      diff.map((entry) => [entry.kind, entry.key]),
      [
        ['removed', 'custom_tools.gone'],
        ['added', 'custom_tools.fresh'],
        ['changed', 'custom_tools.mytool.description'],
        ['changed', 'custom_tools.mytool.path_windows'],
      ],
    );
  });

  it('produces an empty diff for identical configs', () => {
    const config: AgentenvConfig = { scope: 'project', tools: { ripgrep: true } };
    assert.deepEqual(diffConfigs(config, config), []);
  });
});

describe('integrations config', () => {
  it('defaults Superpowers to disabled with the documented source/ref', () => {
    const config = loadConfig(undefined);
    assert.equal(config.integrations?.superpowers?.enabled, false);
    assert.equal(config.integrations?.superpowers?.source, 'github:obra/superpowers');
    assert.equal(config.integrations?.superpowers?.ref, 'v6.3.0');
    assert.equal(config.integrations?.superpowers?.allow_hooks, false);
    assert.equal(config.integrations?.superpowers?.allow_external_requests, false);
    assert.deepEqual(config.integrations?.superpowers?.agents, [
      'claude_code',
      'codex_cli',
      'copilot',
      'opencode',
    ]);
  });

  it('round-trips integrations.superpowers through configToToml/loadConfig', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-config-'));
    const configPath = path.join(directory, 'agentenv.toml');
    const content = configToToml({
      integrations: {
        superpowers: {
          enabled: true,
          source: 'github:obra/superpowers',
          ref: 'v7.0.0',
          scope: 'user',
          agents: ['claude_code'],
          allow_hooks: true,
          allow_external_requests: false,
        },
      },
    });
    fs.writeFileSync(configPath, content);

    const loaded = loadConfig(configPath);
    assert.equal(loaded.integrations?.superpowers?.enabled, true);
    assert.equal(loaded.integrations?.superpowers?.ref, 'v7.0.0');
    assert.equal(loaded.integrations?.superpowers?.scope, 'user');
    assert.deepEqual(loaded.integrations?.superpowers?.agents, ['claude_code']);
    assert.equal(loaded.integrations?.superpowers?.allow_hooks, true);
  });

  it('rejects an unknown key under [integrations]', () => {
    const report = validateConfig({
      integrations: {
        not_a_real_integration: { enabled: true },
      } as unknown as AgentenvConfig['integrations'],
    });
    assert.ok(report.errors.some((error) => error.includes('Unknown integration')));
  });

  it('rejects an unknown agent name in integrations.superpowers.agents', () => {
    const report = validateConfig({
      integrations: {
        superpowers: { enabled: true, agents: ['claude_code', 'not_an_agent'] as never },
      },
    });
    assert.ok(report.errors.some((error) => error.includes('unknown agent')));
  });

  it('rejects an invalid integrations.superpowers.scope', () => {
    const report = validateConfig({
      integrations: { superpowers: { enabled: true, scope: 'global' as never } },
    });
    assert.ok(report.errors.some((error) => error.includes('integrations.superpowers.scope')));
  });

  it('rejects an empty ref and warns (not errors) on a floating ref', () => {
    const empty = validateConfig({ integrations: { superpowers: { enabled: true, ref: '' } } });
    assert.ok(empty.errors.some((error) => error.includes('ref')));

    const floating = validateConfig({
      integrations: { superpowers: { enabled: true, ref: 'main' } },
    });
    assert.equal(floating.errors.length, 0);
    assert.ok(floating.warnings.some((warning) => warning.includes('floating')));
  });

  it('reports a diff entry when integrations.superpowers.enabled flips', () => {
    const before: AgentenvConfig = { integrations: { superpowers: { enabled: false } } };
    const after: AgentenvConfig = { integrations: { superpowers: { enabled: true } } };
    const diff = diffConfigs(before, after);
    assert.ok(diff.some((entry) => entry.key === 'integrations.superpowers.enabled'));
  });

  it('resolveIntegrationScope falls back to the top-level scope when unset', () => {
    assert.equal(resolveIntegrationScope({ scope: 'user' }, { enabled: true }), 'user');
    assert.equal(
      resolveIntegrationScope({ scope: 'user' }, { enabled: true, scope: 'project' }),
      'project',
    );
    assert.equal(resolveIntegrationScope({}, undefined), 'project');
  });
});

describe('tool catalog: invariant coverage', () => {
  it('every TOOL_KEYS entry has a tier, binary, description, and default', () => {
    for (const key of TOOL_KEYS) {
      assert.ok(TOOL_TIERS[key] >= 1 && TOOL_TIERS[key] <= 3, `missing/invalid TOOL_TIERS: ${key}`);
      assert.ok(BINARY_MAP[key], `missing BINARY_MAP entry: ${key}`);
      assert.ok(TOOL_DESCRIPTIONS[key], `missing TOOL_DESCRIPTIONS entry: ${key}`);
      assert.equal(
        typeof DEFAULT_CONFIG.tools?.[key],
        'boolean',
        `missing DEFAULT_CONFIG.tools default: ${key}`,
      );
    }
  });

  it('TOOL_TIERS, BINARY_MAP, TOOL_DESCRIPTIONS, and DEFAULT_CONFIG.tools have no stray keys', () => {
    const tables: Record<string, unknown>[] = [TOOL_TIERS, BINARY_MAP, TOOL_DESCRIPTIONS];
    for (const table of tables) {
      for (const key of Object.keys(table)) {
        assert.ok(
          (TOOL_KEYS as readonly string[]).includes(key),
          `catalog table has a key absent from TOOL_KEYS: ${key}`,
        );
      }
    }
    for (const key of Object.keys(DEFAULT_CONFIG.tools ?? {})) {
      assert.ok(
        (TOOL_KEYS as readonly string[]).includes(key),
        `DEFAULT_CONFIG.tools has a key absent from TOOL_KEYS: ${key}`,
      );
    }
  });

  it('defaults enable exactly Tier 1 + the mise-installable Tier 2 tools', () => {
    for (const key of TOOL_KEYS) {
      const enabled = DEFAULT_CONFIG.tools?.[key] === true;
      const expected = TOOL_TIERS[key] <= 2;
      assert.equal(enabled, expected, `default for ${key} is off-spec`);
    }
  });

  it('TOOL_KEYS lists Tier 1, then Tier 2, then Tier 3 contiguously', () => {
    const tiers = TOOL_KEYS.map((key) => TOOL_TIERS[key]);
    const sorted = [...tiers].sort((a, b) => a - b);
    assert.deepEqual(tiers, sorted);
  });

  it('MISE_TOOL_NAMES covers TOOL_KEYS exactly (no missing or stray tool keys)', () => {
    for (const key of TOOL_KEYS) {
      assert.ok(MISE_TOOL_NAMES[key], `missing MISE_TOOL_NAMES entry: ${key}`);
    }
    for (const key of Object.keys(MISE_TOOL_NAMES)) {
      assert.ok(
        (TOOL_KEYS as readonly string[]).includes(key),
        `MISE_TOOL_NAMES has a key absent from TOOL_KEYS: ${key}`,
      );
    }
  });

  it('PINNED_TOOL_VERSIONS only pins known mise names (no dead pins)', () => {
    const knownMiseNames = new Set(Object.values(MISE_TOOL_NAMES));
    for (const key of Object.keys(PINNED_TOOL_VERSIONS)) {
      assert.ok(knownMiseNames.has(key), `PINNED_TOOL_VERSIONS pin has no mise tool: ${key}`);
    }
  });

  it('TOOL_CATEGORIES covers every tool key and has no stray keys', () => {
    for (const key of TOOL_KEYS) {
      assert.ok(TOOL_CATEGORIES[key], `missing TOOL_CATEGORIES entry: ${key}`);
    }
    for (const key of Object.keys(TOOL_CATEGORIES)) {
      assert.ok(
        (TOOL_KEYS as readonly string[]).includes(key),
        `TOOL_CATEGORIES has a key absent from TOOL_KEYS: ${key}`,
      );
    }
  });
});

const NEW_TOOLS: Array<{ key: string; binary: string; description: string }> = [
  {
    key: 'ripgrep_all',
    binary: 'rga',
    description: 'Fast ripgrep-based search across archives, docs, and code',
  },
  {
    key: 'zoxide',
    binary: 'zoxide',
    description: 'Smarter cd with fuzzy matching and learning',
  },
  { key: 'shellcheck', binary: 'shellcheck', description: 'Shell script linter' },
  { key: 'uv', binary: 'uv', description: 'Fast Python package and project manager' },
  { key: 'xh', binary: 'xh', description: 'HTTP client with a curl-like interface' },
  { key: 'actionlint', binary: 'actionlint', description: 'GitHub Actions workflow linter' },
  {
    key: 'gitleaks',
    binary: 'gitleaks',
    description: 'Secrets scan and protection (detect leaked secrets)',
  },
  {
    key: 'gum',
    binary: 'gum',
    description: 'Glow up your shell scripts with styled prompts and spinners',
  },
  { key: 'glow', binary: 'glow', description: 'Markdown renderer for the terminal' },
  { key: 'jless', binary: 'jless', description: 'Interactive JSON pager' },
  { key: 'sd', binary: 'sd', description: 'Intuitive find-and-replace for text files' },
  { key: 'tealdeer', binary: 'tldr', description: 'Fast, community-driven man pages (tldr)' },
  { key: 'duckdb', binary: 'duckdb', description: 'Embeddable analytical SQL database' },
  { key: 'qsv', binary: 'qsv', description: 'Ultra-fast CSV data processing toolkit' },
];

describe('tool catalog: new tier-3 tools', () => {
  it('are registered in TOOL_KEYS, TOOL_TIERS, BINARY_MAP, and TOOL_DESCRIPTIONS', () => {
    for (const { key, binary, description } of NEW_TOOLS) {
      assert.ok(
        TOOL_KEYS.includes(key as keyof NonNullable<AgentenvConfig['tools']>),
        `missing TOOL_KEYS: ${key}`,
      );
      assert.equal(TOOL_TIERS[key], 3, `wrong tier for ${key}`);
      assert.equal(BINARY_MAP[key], binary, `wrong binary for ${key}`);
      assert.equal(TOOL_DESCRIPTIONS[key], description, `wrong description for ${key}`);
    }
  });

  it('defaults all new tools to disabled', () => {
    for (const { key } of NEW_TOOLS) {
      assert.equal(
        DEFAULT_CONFIG.tools?.[key as keyof NonNullable<AgentenvConfig['tools']>],
        false,
        `${key} should default to false`,
      );
    }
  });

  it('are accepted by validateConfig as known tool keys', () => {
    const report = validateConfig({ tools: { ripgrep_all: true, duckdb: true } });
    assert.ok(!report.errors.some((e) => e.includes('Unknown tool')), report.errors.join('; '));
  });

  it('round-trip through configToToml -> loadConfig preserves values', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-catalog-t1-'));
    const configPath = path.join(dir, 'agentenv.toml');
    fs.writeFileSync(
      configPath,
      configToToml({
        scope: 'project',
        tools: { ripgrep_all: true, tealdeer: true, duckdb: false },
      }),
    );
    const loaded = loadConfig(configPath);
    assert.equal(loaded.tools?.ripgrep_all, true);
    assert.equal(loaded.tools?.tealdeer, true);
    assert.equal(loaded.tools?.duckdb, false);
  });

  it('includes the new tools in the generated [tools] TOML block', () => {
    const tomlContent = configToToml({ scope: 'project', tools: { uv: true, zoxide: true } });
    assert.ok(tomlContent.includes('uv = true'));
    assert.ok(tomlContent.includes('zoxide = true'));
  });
});

describe('agent catalog: five new agents', () => {
  it('AGENT_KEYS includes all nine agents', () => {
    for (const key of [
      'claude_code',
      'codex_cli',
      'copilot',
      'opencode',
      'gemini_cli',
      'cursor',
      'windsurf',
      'cline',
      'vibe',
    ] as AgentKey[]) {
      assert.ok(AGENT_KEYS.includes(key), `AGENT_KEYS missing: ${key}`);
    }
  });

  it('configToToml round-trips new agent and rtk.init keys', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-agt-t3-'));
    const configPath = path.join(dir, 'agentenv.toml');
    const config: AgentenvConfig = {
      scope: 'project',
      agents: {
        claude_code: true,
        codex_cli: false,
        copilot: false,
        opencode: false,
        gemini_cli: true,
        cursor: true,
        windsurf: false,
        cline: false,
        vibe: false,
      },
      tools: {},
      rtk: {
        enabled: true,
        init: {
          claude_code: true,
          codex_cli: true,
          copilot: true,
          opencode: true,
          gemini_cli: true,
          cursor: true,
          windsurf: true,
          cline: true,
          vibe: true,
        },
      },
    };
    fs.writeFileSync(configPath, configToToml(config));
    const loaded = loadConfig(configPath);
    assert.equal(loaded.agents?.gemini_cli, true);
    assert.equal(loaded.agents?.cursor, true);
    assert.equal(loaded.agents?.windsurf, false);
    assert.equal(loaded.agents?.cline, false);
    assert.equal(loaded.agents?.vibe, false);
    assert.equal(loaded.rtk?.init?.gemini_cli, true);
    assert.equal(loaded.rtk?.init?.vibe, true);
  });

  it('validateConfig accepts the new agent keys', () => {
    const report = validateConfig({ agents: { gemini_cli: true, vibe: true } });
    assert.ok(!report.errors.some((e) => e.includes('Unknown agent')), report.errors.join('; '));
  });

  it('getEnabledAgents returns only agents set to true', () => {
    const enabled = getEnabledAgents({
      agents: { claude_code: true, gemini_cli: true, vibe: false, codex_cli: false },
    });
    assert.deepEqual(enabled, ['claude_code', 'gemini_cli']);
  });
});

describe('default agent set', () => {
  it('defaults claude_code and codex_cli to enabled', () => {
    assert.equal(DEFAULT_CONFIG.agents?.claude_code, true);
    assert.equal(DEFAULT_CONFIG.agents?.codex_cli, true);
  });

  it('defaults copilot, opencode, and all new agents to disabled', () => {
    for (const key of [
      'copilot',
      'opencode',
      'gemini_cli',
      'cursor',
      'windsurf',
      'cline',
      'vibe',
    ] as const) {
      assert.equal(DEFAULT_CONFIG.agents?.[key], false, `${key} should default to false`);
    }
  });

  it('rtk.init defaults all 9 agents to true', () => {
    for (const key of AGENT_KEYS) {
      assert.equal(DEFAULT_CONFIG.rtk?.init?.[key], true, `rtk.init.${key} should default to true`);
    }
  });
});

describe('loadConfig user-scope resolution', () => {
  it('honors an absolute XDG_CONFIG_HOME like findConfigPath does', () => {
    const originalXdg = process.env.XDG_CONFIG_HOME;
    const originalCwd = process.cwd();
    const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-xdg-'));
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-cwd-'));
    try {
      fs.mkdirSync(path.join(xdg, 'agentenv'), { recursive: true });
      fs.writeFileSync(
        path.join(xdg, 'agentenv', 'agentenv.toml'),
        'scope = "user"\n[tools]\nripgrep = false\nfd = true\n',
      );
      process.env.XDG_CONFIG_HOME = xdg;
      process.chdir(cwd);

      const config = loadConfig(undefined);
      assert.equal(config.scope, 'user');
      assert.equal(config.tools?.fd, true);
    } finally {
      process.chdir(originalCwd);
      if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = originalXdg;
    }
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import toml from 'toml';
import { configToToml, diffConfigs, loadConfig, validateConfig } from './schema.js';
import type { AgentenvConfig, CustomTool } from './schema.js';

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
    const report = validateConfig({ tools: { universal_ctags: true } });
    assert.equal(report.errors.length, 0);
    assert.ok(report.warnings.some((warning) => warning.includes('universal_ctags')));
  });

  it('warns about an already_installed custom tool with no OS path', () => {
    const report = validateConfig({
      custom_tools: [{ name: 'mytool', description: 'test tool', already_installed: true }],
    });
    assert.ok(report.warnings.some((warning) => warning.includes('mytool')));
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

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import toml from 'toml';
import { configToToml, loadConfig } from './schema.js';

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
});

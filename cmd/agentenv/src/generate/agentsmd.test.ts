import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateAgentsMd, updateWithMarkers } from './agentsmd.js';
import type { AgentenvConfig } from '../config/schema.js';

const start = '<!-- agentenv-managed-start -->';
const end = '<!-- agentenv-managed-end -->';

describe('managed instruction blocks', () => {
  it('appends a managed block without replacing user content when markers are absent', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-markers-'));
    const filePath = path.join(directory, 'AGENTS.md');
    fs.writeFileSync(filePath, '# My instructions\n\nKeep this.\n');

    updateWithMarkers(filePath, `${start}\nmanaged\n${end}\n`, start, end);

    assert.equal(
      fs.readFileSync(filePath, 'utf8'),
      '# My instructions\n\nKeep this.\n\n<!-- agentenv-managed-start -->\nmanaged\n<!-- agentenv-managed-end -->\n',
    );
  });

  it('replaces only the existing managed block and preserves surrounding content', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-markers-'));
    const filePath = path.join(directory, 'CLAUDE.md');
    fs.writeFileSync(filePath, `before\n${start}\nold\n${end}\nafter\n`);

    updateWithMarkers(filePath, `${start}\nnew\n${end}\n`, start, end);

    assert.equal(fs.readFileSync(filePath, 'utf8'), `before\n${start}\nnew\n${end}\nafter\n`);
  });

  it('is idempotent: an identical re-apply makes no changes', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-markers-'));
    const filePath = path.join(directory, 'AGENTS.md');
    const content = `${start}\nmanaged\n${end}\n`;
    fs.writeFileSync(filePath, content);

    const result = updateWithMarkers(filePath, content, start, end);

    assert.equal(result.success, true);
    assert.equal(result.updated, false);
    assert.equal(fs.readFileSync(filePath, 'utf8'), content);
  });

  it('fails safely when a file has only one marker (partial write)', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-markers-'));
    const filePath = path.join(directory, 'AGENTS.md');
    fs.writeFileSync(filePath, `user text\n${start}\nome-players\n`);

    const result = updateWithMarkers(filePath, `${start}\nmanaged\n${end}\n`, start, end);

    assert.equal(result.success, false);
    assert.equal(result.updated, false);
    assert.match(result.message, /only one managed marker/);
    assert.equal(fs.readFileSync(filePath, 'utf8'), `user text\n${start}\nome-players\n`);
  });
});

describe('generated AGENTS.md tool listing', () => {
  it('renders rtk only once (in the RTK section, not the categorized tools)', () => {
    const config: AgentenvConfig = {
      scope: 'project',
      tools: { ripgrep: true, rtk: true },
      rtk: { enabled: true },
    };
    const output = generateAgentsMd(config);
    assert.equal((output.match(/### Token Optimization/g) ?? []).length, 1);
    assert.equal((output.match(/\*\*rtk\*\*/g) ?? []).length, 1);
    assert.equal((output.match(/- \*\*ripgrep\*\*/g) ?? []).length, 1);
  });

  it('still lists rtk under the categorized tools when rtk rewriting is disabled', () => {
    const config: AgentenvConfig = {
      scope: 'project',
      tools: { rtk: true },
      rtk: { enabled: false },
    };
    const output = generateAgentsMd(config);
    assert.equal((output.match(/### Token Optimization/g) ?? []).length, 1);
    assert.equal((output.match(/--- RTK Configuration/m) ?? []).length, 0);
  });
});

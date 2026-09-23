import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateAgentsMd, generateInstructionFiles, updateWithMarkers } from './agentsmd.js';
import type { AgentenvConfig } from '../config/schema.js';

const start = '<!-- agentenv-managed-start -->';
const end = '<!-- agentenv-managed-end -->';

describe('managed instruction blocks', () => {
  it('appends a managed block without replacing user content when markers are absent', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-markers-'));
    const filePath = path.join(directory, 'AGENTS.md');
    const originalContent = '# My instructions\n\nKeep this.\n';
    fs.writeFileSync(filePath, originalContent);

    updateWithMarkers(filePath, `${start}\nmanaged\n${end}\n`, start, end);

    assert.equal(
      fs.readFileSync(filePath, 'utf8'),
      '# My instructions\n\nKeep this.\n\n<!-- agentenv-managed-start -->\nmanaged\n<!-- agentenv-managed-end -->\n',
    );
    // SWEEP-06: this file predated agentenv (no markers), so its original
    // content is backed up before the first append.
    assert.equal(fs.readFileSync(`${filePath}.agentenv-backup`, 'utf8'), originalContent);
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

  it('matches a CRLF file when replacing the managed block', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-markers-'));
    const filePath = path.join(directory, 'CLAUDE.md');
    fs.writeFileSync(filePath, `before\r\n${start}\r\nold\r\n${end}\r\nafter\r\n`);

    updateWithMarkers(filePath, `${start}\nnew\n${end}\n`, start, end);

    assert.equal(
      fs.readFileSync(filePath, 'utf8'),
      `before\r\n${start}\r\nnew\r\n${end}\r\nafter\r\n`,
    );
  });

  it('matches a CRLF file when appending a managed block', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-markers-'));
    const filePath = path.join(directory, 'AGENTS.md');
    fs.writeFileSync(filePath, '# My instructions\r\n\r\nKeep this.\r\n');

    updateWithMarkers(filePath, `${start}\nmanaged\n${end}\n`, start, end);

    assert.equal(
      fs.readFileSync(filePath, 'utf8'),
      `# My instructions\r\n\r\nKeep this.\r\n\r\n${start}\r\nmanaged\r\n${end}\r\n`,
    );
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

  it('never calls RTK "Red Teaming Kit"', () => {
    const config: AgentenvConfig = {
      scope: 'project',
      tools: { rtk: true },
      rtk: { enabled: true },
    };
    const output = generateAgentsMd(config);
    assert.doesNotMatch(output, /Red Teaming Kit/);
    assert.match(output, /Rust Token Killer|CLI proxy that reduces LLM token consumption/);
  });

  it('points agents at the `rtk proxy` escape hatch', () => {
    const config: AgentenvConfig = {
      scope: 'project',
      tools: { rtk: true },
      rtk: { enabled: true },
    };
    const output = generateAgentsMd(config);
    assert.match(output, /rtk proxy <cmd>/);
  });

  it('only recommends General Instructions tips for tools that are enabled', () => {
    const withBat = generateAgentsMd({
      scope: 'project',
      tools: { bat: true, eza: true },
    });
    assert.match(withBat, /use `bat --plain --paging=never`/);
    assert.match(withBat, /use `eza` instead of `ls`/);

    const withoutBat = generateAgentsMd({
      scope: 'project',
      tools: { ripgrep: true },
    });
    assert.doesNotMatch(withoutBat, /`bat`/);
    assert.doesNotMatch(withoutBat, /`eza`/);
    assert.match(withoutBat, /use `rg` \(ripgrep\) instead of `grep -r`/);
  });

  it('does not tell agents to pipe diffs through the interactive `delta` pager', () => {
    const output = generateAgentsMd({ scope: 'project', tools: { git_delta: true } });
    assert.doesNotMatch(output, /use `delta` for syntax-highlighted output/);
    assert.match(output, /git --no-pager diff/);
  });

  it('drops the "Supported Agents" section', () => {
    const output = generateAgentsMd({ scope: 'project', agents: { claude_code: true } });
    assert.doesNotMatch(output, /## Supported Agents/);
  });

  it('uses scope-aware wording for a user-scope config instead of "this repository"', () => {
    const projectOutput = generateAgentsMd({ scope: 'project' });
    const userOutput = generateAgentsMd({ scope: 'user' });

    assert.match(projectOutput, /operating in this repository/);
    assert.match(projectOutput, /in the repo root/);
    assert.doesNotMatch(userOutput, /this repository/);
    assert.doesNotMatch(userOutput, /repo root/);
    assert.match(userOutput, /configured globally by agentenv/);
    assert.match(userOutput, /agentenv user config directory/);
  });
});

describe('generateInstructionFiles (config.generate.files)', () => {
  const metaConfig: AgentenvConfig = { scope: 'project', agents: { claude_code: true } };

  it('generates both AGENTS.md and CLAUDE.md by default', () => {
    const files = generateInstructionFiles(metaConfig, '/base');
    assert.deepEqual(
      files.map((file) => file.path),
      [path.join('/base', 'AGENTS.md'), path.join('/base', 'CLAUDE.md')],
    );
  });

  it('honors a requested subset of files', () => {
    const files = generateInstructionFiles(
      { ...metaConfig, generate: { files: ['AGENTS.md'] } },
      '/base',
    );
    assert.deepEqual(
      files.map((file) => file.path),
      [path.join('/base', 'AGENTS.md')],
    );
  });

  it('generates nothing when only unknown file names are requested', () => {
    const files = generateInstructionFiles(
      { ...metaConfig, generate: { files: ['README.md'] } },
      '/base',
    );
    assert.deepEqual(files, []);
  });
});

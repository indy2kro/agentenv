import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { updateWithMarkers } from './agentsmd.js';

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
});

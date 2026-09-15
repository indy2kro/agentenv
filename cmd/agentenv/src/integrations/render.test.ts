import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ghAuthLine, integrationResultLines, integrationStateLine } from './render.js';
import type { IntegrationResult } from './base.js';

describe('integration rendering', () => {
  it('renders an agent state line with glyph, agent, state, and detail', () => {
    assert.equal(
      integrationStateLine({ agent: 'claude_code', state: 'installed', detail: 'ref v6.3.0' }),
      '✓ claude_code: installed (ref v6.3.0)',
    );
    assert.equal(
      integrationStateLine({ agent: 'claude_code', state: 'missing' }),
      '✗ claude_code: missing',
    );
    assert.equal(
      integrationStateLine({ agent: 'codex_cli', state: 'unsupported' }),
      '· codex_cli: unsupported',
    );
    assert.equal(
      integrationStateLine({
        agent: 'claude_code',
        state: 'drifted',
        detail: 'installed at v6.2.0',
      }),
      '! claude_code: drifted (installed at v6.2.0)',
    );
  });

  it('renders agent states, commands, files, and warnings in order', () => {
    const result: IntegrationResult = {
      name: 'Superpowers',
      source: 'github:obra/superpowers',
      ref: 'v6.3.0',
      scope: 'project',
      agents: [
        { agent: 'claude_code', state: 'installed', detail: 'ref v6.3.0' },
        { agent: 'codex_cli', state: 'unsupported' },
      ],
      changedFiles: ['.agentenv-state/integrations/superpowers.json'],
      nativeCommands: ['claude plugin marketplace add obra/superpowers-marketplace#v6.3.0'],
      warnings: [],
      errors: [],
    };

    assert.deepEqual(integrationResultLines(result), [
      '✓ claude_code: installed (ref v6.3.0)',
      '· codex_cli: unsupported',
      'ran: claude plugin marketplace add obra/superpowers-marketplace#v6.3.0',
      'wrote: .agentenv-state/integrations/superpowers.json',
    ]);
  });

  it('renders gh auth statuses', () => {
    assert.equal(ghAuthLine('authenticated'), '✓ github.com: authenticated');
    assert.equal(ghAuthLine('unauthenticated'), '✗ github.com: not authenticated');
    assert.equal(ghAuthLine('not_installed'), '· github.com: gh not installed');
    assert.equal(ghAuthLine('unknown'), '? github.com: unknown');
  });
});

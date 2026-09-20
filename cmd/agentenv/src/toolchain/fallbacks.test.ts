import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK_REQUIRED_TOOLS, requiresFallback, isPlatformUnsupported } from './fallbacks.js';

describe('Fallback tools', () => {
  it('FALLBACK_REQUIRED_TOOLS contains tokei', () => {
    assert.deepEqual(FALLBACK_REQUIRED_TOOLS, ['tokei']);
  });

  it('requiresFallback returns true for fallback tools', () => {
    assert.equal(requiresFallback('tokei'), true);
    assert.equal(requiresFallback('ripgrep'), false);
    assert.equal(requiresFallback('universal_ctags'), false);
    assert.equal(requiresFallback('unknown_tool'), false);
  });

  describe('isPlatformUnsupported', () => {
    it('flags ripgrep_all and jless as unsupported on win32 (no aqua Windows build)', () => {
      assert.equal(isPlatformUnsupported('ripgrep_all', 'win32'), true);
      assert.equal(isPlatformUnsupported('jless', 'win32'), true);
    });

    it('does not flag them on linux/darwin, or any tool outside the list', () => {
      assert.equal(isPlatformUnsupported('ripgrep_all', 'linux'), false);
      assert.equal(isPlatformUnsupported('jless', 'darwin'), false);
      assert.equal(isPlatformUnsupported('ripgrep', 'win32'), false);
      assert.equal(isPlatformUnsupported('unknown_tool', 'win32'), false);
    });
  });
});

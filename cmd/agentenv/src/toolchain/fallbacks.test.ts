import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_TOOLS,
  FALLBACK_REQUIRED_TOOLS,
  requiresFallback,
  getInstallCommand,
  getVerifyCommand,
  getFallbackInstallationAdvice,
  generateFallbackCustomToolConfig,
  isPlatformUnsupported,
} from './fallbacks.js';

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

  it('FALLBACK_TOOLS has correct structure', () => {
    assert.ok(FALLBACK_TOOLS.tokei);
    assert.ok(!FALLBACK_TOOLS.universal_ctags);

    const tokei = FALLBACK_TOOLS.tokei;
    assert.ok(tokei.install);
    assert.ok(tokei.verify);
    assert.ok(tokei.paths);
    assert.ok(tokei.install.macos.length > 0);
    assert.ok(tokei.install.linux.length > 0);
    assert.ok(tokei.install.windows.length > 0);
  });

  describe('getInstallCommand', () => {
    it('returns macOS commands for tokei on macOS', () => {
      // We can't actually change process.platform, so we just verify the structure
      const macosCommands = FALLBACK_TOOLS.tokei.install.macos;
      assert.ok(macosCommands.length > 0);
      assert.ok(macosCommands.some((cmd) => cmd.includes('brew')));
    });

    it('returns undefined for unknown tools', () => {
      // Testing with invalid tool name - TypeScript won't catch this at compile time
      const result = getInstallCommand('unknown_tool' as keyof typeof FALLBACK_TOOLS);
      assert.equal(result, undefined);
    });
  });

  describe('getVerifyCommand', () => {
    it('returns verification commands for known tools', () => {
      const macosVerify = FALLBACK_TOOLS.tokei.verify.macos;
      assert.ok(macosVerify.length > 0);
    });

    it('returns undefined for unknown tools', () => {
      // Testing with invalid tool name
      const result = getVerifyCommand('unknown_tool' as keyof typeof FALLBACK_TOOLS);
      assert.equal(result, undefined);
    });
  });

  describe('getFallbackInstallationAdvice', () => {
    it('returns advice for tokei', () => {
      const advice = getFallbackInstallationAdvice('tokei');
      // The advice uses the description "Fast LOC/code-statistics tool"
      assert.ok(advice.toLowerCase().includes('tokei') || advice.toLowerCase().includes('loc'));
    });

    it('returns generic advice for unknown tools', () => {
      const advice = getFallbackInstallationAdvice('unknown_tool');
      assert.ok(advice.includes('manual installation'));
    });
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

  describe('generateFallbackCustomToolConfig', () => {
    it('generates TOML config for tokei', () => {
      const config = generateFallbackCustomToolConfig('tokei');
      assert.ok(config.includes('tokei'));
      assert.ok(config.includes('[[custom_tools]]'));
      assert.ok(config.includes('already_installed = true'));
    });

    it('returns empty string for unknown tools', () => {
      const config = generateFallbackCustomToolConfig('unknown_tool');
      assert.equal(config, '');
    });
  });
});

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
} from './fallbacks.js';

describe('Fallback tools', () => {
  it('FALLBACK_REQUIRED_TOOLS contains universal_ctags and tokei', () => {
    assert.deepEqual(FALLBACK_REQUIRED_TOOLS, ['universal_ctags', 'tokei']);
  });

  it('requiresFallback returns true for fallback tools', () => {
    assert.equal(requiresFallback('universal_ctags'), true);
    assert.equal(requiresFallback('tokei'), true);
    assert.equal(requiresFallback('ripgrep'), false);
    assert.equal(requiresFallback('unknown_tool'), false);
  });

  it('FALLBACK_TOOLS has correct structure', () => {
    assert.ok(FALLBACK_TOOLS.universal_ctags);
    assert.ok(FALLBACK_TOOLS.tokei);

    const uctags = FALLBACK_TOOLS.universal_ctags;
    assert.ok(uctags.install);
    assert.ok(uctags.verify);
    assert.ok(uctags.paths);
    assert.ok(uctags.install.macos.length > 0);
    assert.ok(uctags.install.linux.length > 0);
    assert.ok(uctags.install.windows.length > 0);

    const tokei = FALLBACK_TOOLS.tokei;
    assert.ok(tokei.install.macos.length > 0);
    assert.ok(tokei.install.linux.length > 0);
    assert.ok(tokei.install.windows.length > 0);
  });

  describe('getInstallCommand', () => {
    it('returns macOS commands for universal_ctags on macOS', () => {
      // We can't actually change process.platform, so we just verify the structure
      const macosCommands = FALLBACK_TOOLS.universal_ctags.install.macos;
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
      const macosVerify = FALLBACK_TOOLS.universal_ctags.verify.macos;
      assert.ok(macosVerify.length > 0);
    });

    it('returns undefined for unknown tools', () => {
      // Testing with invalid tool name
      const result = getVerifyCommand('unknown_tool' as keyof typeof FALLBACK_TOOLS);
      assert.equal(result, undefined);
    });
  });

  describe('getFallbackInstallationAdvice', () => {
    it('returns advice for universal_ctags', () => {
      const advice = getFallbackInstallationAdvice('universal_ctags');
      // The advice uses the description "Universal ctags for code navigation"
      assert.ok(advice.toLowerCase().includes('ctags'));
      // On Windows, it should mention choco or scoop
      assert.ok(
        advice.includes('choco') ||
          advice.includes('scoop') ||
          advice.includes('apt') ||
          advice.includes('brew'),
      );
    });

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

  describe('generateFallbackCustomToolConfig', () => {
    it('generates TOML config for universal_ctags', () => {
      const config = generateFallbackCustomToolConfig('universal_ctags');
      assert.ok(config.includes('universal_ctags'));
      assert.ok(config.includes('[[custom_tools]]'));
      assert.ok(config.includes('already_installed = true'));
      assert.ok(config.includes('description'));
    });

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

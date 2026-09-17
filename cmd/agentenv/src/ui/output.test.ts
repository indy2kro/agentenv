import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isQuiet, setQuietEnabled, shouldPrintBanner } from './output.js';

describe('output quiet mode', () => {
  afterEach(() => setQuietEnabled(false));

  it('prints banners only on a TTY and not in quiet mode', () => {
    assert.equal(shouldPrintBanner(true, false), true);
    assert.equal(shouldPrintBanner(false, false), false);
    assert.equal(shouldPrintBanner(true, true), false);
    assert.equal(shouldPrintBanner(false, true), false);
  });

  it('tracks quiet state', () => {
    assert.equal(isQuiet(), false);
    setQuietEnabled(true);
    assert.equal(isQuiet(), true);
  });
});

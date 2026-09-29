import { describe, expect, it } from 'vitest';

import { NOTICES, RECOVER_SCREENS } from '../src/routes/recover.js';
import { usesShell } from '../src/shell-routes.js';
import { failureCopy } from '../src/run-failure.js';

describe('recovery screens', () => {
  it('has the three screens with the spec titles', () => {
    expect(RECOVER_SCREENS.trashed.title).toBe(
      'Your Bower folder is in the Bin',
    );
    expect(RECOVER_SCREENS.missing.title).toBe('Your Bower folder is gone');
    expect(RECOVER_SCREENS['no-access'].title).toBe(
      "Bower can't open your folder",
    );
  });

  it('lists the buttons in the spec order', () => {
    const labels = (key: keyof typeof RECOVER_SCREENS): string[] =>
      RECOVER_SCREENS[key].buttons.map((b) => b.label);
    expect(labels('trashed')).toEqual([
      'Put it back',
      'Start a new Bower folder',
      'Use another folder',
    ]);
    expect(labels('missing')).toEqual([
      'Start a new Bower folder',
      'Use another folder',
    ]);
    expect(labels('no-access')).toEqual([
      'Try again',
      'Use another folder',
      'Start a new Bower folder',
    ]);
  });

  it('makes the first button the primary one', () => {
    for (const screen of Object.values(RECOVER_SCREENS)) {
      expect(screen.buttons[0]?.kind).toBe('primary');
    }
  });

  it('uses the lead ruling for the Gone foot line', () => {
    expect(RECOVER_SCREENS.missing.foot).toBe(
      'If it was emptied from the Bin, Google Drive support may still be able to get it back: ask them before starting again.',
    );
  });

  it('never says "vault" (R-VAULT-12)', () => {
    const all = JSON.stringify([RECOVER_SCREENS, NOTICES]);
    expect(all.toLowerCase()).not.toContain('vault');
  });

  it('keeps the vault_missing sentence for a failed tidy-up', () => {
    expect(failureCopy('vault_missing').sentence).toBe(
      'Your Bower folder is no longer in your Drive. Nothing was changed.',
    );
  });

  it('draws /recover without the shell', () => {
    expect(usesShell('/recover')).toBe(false);
  });
});

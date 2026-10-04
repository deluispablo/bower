import { describe, expect, it } from 'vitest';
import { usePrefs } from './prefs';

describe('preferences', () => {
  it('Bower does not look things up on the web until you turn it on', () => {
    // Privacy says so: "unless you turn that on in Settings".
    expect(usePrefs.getState().lookUpWeb).toBe(false);
  });
});

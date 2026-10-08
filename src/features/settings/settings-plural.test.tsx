import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

describe('Settings plural', () => {
  it('rules count uses plural function for singular and multiple', () => {
    // Settings.tsx should use the plural() function when displaying rule counts
    // Currently it shows "${rules?.length ?? 0} rules" which gives "1 rules" for singular
    const filename = fileURLToPath(import.meta.url);
    const settingsPath = join(dirname(filename), 'Settings.tsx');
    const source = readFileSync(settingsPath, 'utf-8');

    // Check that it uses plural() function for rules
    // Instead of hardcoding "rules" without pluralization
    const hasProperPluralization = /plural\(.*rule/.test(source);
    expect(hasProperPluralization).toBe(true);
  });
});

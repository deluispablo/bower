/**
 * design8-layout (designer, post-qa-7, P3-11): a disabled Send or "Keep this rule" in the dark theme looks enabled: the
 * teal fill at half opacity still reads as a primary button. A disabled button takes a neutral surface and the muted
 * text colour, whatever its variant (tokens `--surface-strong`, `--text-muted`; GOV.UK and Primer disabled buttons).
 * jsdom does not cascade these, so this reads the stylesheet, as `ui/pill.test.ts` does.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'ui.module.css'), 'utf8');
const tokens = readFileSync(join(__dirname, '../styles/tokens.css'), 'utf8');
/** Every declaration block whose selector list names a disabled `.btn`. */
const disabledRules = (): string[] =>
  [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => /\.btn(:disabled|\[aria-disabled='true'\])/.test(m[1] ?? '')).map((m) => m[2] ?? '');

describe('AC2 a disabled button looks disabled in both themes', () => {
  it('AC2 design8-layout-disabled-control: a disabled button rule and both tokens exist (positive control)', () => {
    expect(disabledRules().length).toBeGreaterThan(0);
    expect(tokens).toMatch(/--surface-strong:/);
    expect(tokens).toMatch(/--text-muted:/);
  });

  it('AC2 design8-layout-disabled-neutral: a disabled button has a neutral surface, muted text, no outline and no fading', () => {
    const body = disabledRules().join(';');
    expect(body).toMatch(/background(-color)?:\s*var\(--surface-strong\)/);
    expect(body).toMatch(/(^|[;\s])color:\s*var\(--text-muted\)/);
    expect(body).toMatch(/box-shadow:\s*none/);
    expect(body).not.toMatch(/opacity:\s*0?\.\d/);
  });
});

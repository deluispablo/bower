import { describe, expect, it } from 'vitest';
import tokens from './tokens.json';

type Rgb = [number, number, number];
type Theme = 'dark' | 'light';

const find = (name: string): { dark: string; light: string } | undefined => {
  const t = tokens.color.tokens.find((x) => x.name === name);
  return t && typeof t.value !== 'string' ? t.value : undefined;
};

/** Parses #rrggbb or rgba(r,g,b,a) into channels and alpha. */
function parse(css: string): { rgb: Rgb; a: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(css);
  if (hex) {
    const n = parseInt(hex[1] ?? '', 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: 1 };
  }
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(css);
  if (!m) throw new Error(`Cannot read colour ${css}`);
  return {
    rgb: [Number(m[1]), Number(m[2]), Number(m[3])],
    a: m[4] === undefined ? 1 : Number(m[4]),
  };
}

const luminance = ([r, g, b]: Rgb): number => {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
};

/** WCAG 1.4.11 asks for 3:1 between a control's edge and what is next to it; the edge is laid over the ground. */
function ratio(edge: string, ground: string): number {
  const e = parse(edge);
  const g = parse(ground);
  const over = e.rgb.map((v, i) => v * e.a + (g.rgb[i] ?? 0) * (1 - e.a)) as Rgb;
  const [hi, lo] = [luminance(over), luminance(g.rgb)].sort((a, b) => b - a);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe('control-line token', () => {
  it('every control edge is at least 3:1 on its ground', () => {
    const edge = find('control-line');
    expect(edge, 'tokens.json has control-line').toBeDefined();
    for (const theme of ['dark', 'light'] as Theme[]) {
      for (const ground of ['bg', 'bg-alt', 'surface']) {
        const g = find(ground)?.[theme];
        expect(g, `${ground} ${theme}`).toBeDefined();
        expect(
          ratio(edge?.[theme] ?? '', g ?? '#000000'),
          `control-line on ${ground}, ${theme}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('control-line uses the signed-off values and usage line', () => {
    const t = tokens.color.tokens.find((x) => x.name === 'control-line');
    expect(t?.value).toEqual({ dark: 'rgba(223,229,238,0.44)', light: '#8a857c' });
    expect(t?.usage).toBe('The edge of a control you type in or toggle. 3:1 on every ground.');
  });
});

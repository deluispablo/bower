import { describe, expect, it } from 'vitest';

// Every component and route source, as text (vite's `?raw`).
const SOURCES: Record<string, string> = import.meta.glob('../src/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const MARK_BELOW = 40;

/** Every `<Bird ... />` that passes a literal `size={n}` under 40. */
function smallBirds(source: string): number[] {
  const sizes: number[] = [];
  for (const tag of source.matchAll(/<Bird\b[\s\S]*?\/>/g)) {
    const size = /\bsize=\{(\d+)\}/.exec(tag[0]);
    if (size?.[1] !== undefined && Number(size[1]) < MARK_BELOW) {
      sizes.push(Number(size[1]));
    }
  }
  return sizes;
}

describe('small birds (spec 6.21 rule 2)', () => {
  it('finds a literal size under 40 passed to Bird', () => {
    expect(smallBirds('<Bird state="idle" size={16} />')).toEqual([16]);
    expect(
      smallBirds(
        '<Bird\n  state="done"\n  size={20}\n  onDone={() => x()}\n/>',
      ),
    ).toEqual([20]);
    expect(smallBirds('<Bird state="idle" size={40} />')).toEqual([]);
    expect(smallBirds('<BowerMark size={16} />')).toEqual([]);
  });

  it('finds none in the app source: under 40 px use BowerMark', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20);
    const offenders = Object.entries(SOURCES)
      .filter(([, source]) => smallBirds(source).length > 0)
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});

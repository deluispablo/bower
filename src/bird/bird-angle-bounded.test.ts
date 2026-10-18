import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BirdEngine } from './engine';
import { seeded } from './pose-reference.fixture';

const ORIGINS = [1000, 1_800_000_000_000];
const INTERVALS = [16.67, 1000 / 60, 33.33, 1000 / 30, 1000];
const PARTS = ['rig', 'head', 'tail', 'wing', 'legs', 'jaw', 'tuft', 'eye', 'iris'] as const;

// Captured before the fix from 460f738dc9c4d90de7d73d8a10d119acf3cb3c6c.
// SHA-256 of JSON: 600 arrays, each [wrapper CSS, ...PARTS SVG, carry CSS].
// Exact strings imply zero numeric difference (stricter than 1e-9).
const BASELINES: Record<string, string> = {
  '1000:16.67': 'edf01e1e66a94a1f2219270b6cc4a085d0feb50fc666d02e13389433916c0b8d',
  [`1000:${1000 / 60}`]: '6c7c0381555d90e99d3ccbbac0d358a03c05ee792a073660cbf24bfed02df836',
  '1800000000000:16.67': '2eecbc86c5119a40cf6122f24258a68356ead3060eb706ea7ae1ebdefa7143e3',
  [`1800000000000:${1000 / 60}`]: 'a7e5e6b3df2c467095a9ef8b1beb5c3bc64127a4cc70ec857f4ad16b13fcb538',
};

describe.each(ORIGINS)('peck transforms at clock origin %s ms', (origin) => {
  it.each(INTERVALS)('keeps every transform finite and exponent-free after a peck at %s ms frames', (interval) => {
    const g = () => document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const rig = { rig: g(), head: g(), tail: g(), wing: g(), legs: g(), jaw: g(), tuft: g(), eye: g(), iris: g() };
    const bird = document.createElement('div');
    const carry = document.createElement('div');
    let frame = (_ts: number): void => { throw new Error('No frame scheduled'); };
    const engine = new BirdEngine({ bird, ...rig, carry }, () => ({ x: 50, y: 92 }), 100, {
      acts: false,
      sleeps: false,
      random: seeded(11),
      frame: (cb) => { frame = cb; return 1; },
      cancelFrame: () => {},
    });
    const trace: string[][] = [];
    engine.start();
    frame(origin);
    engine.peck();
    try {
      for (let i = 1; i <= 600; i++) {
        frame(origin + i * interval);
        const context = `origin=${origin}, interval=${interval} ms, frame=${i}`;
        const transforms = [bird.style.transform, ...PARTS.map((part) => rig[part].getAttribute('transform') ?? ''), carry.style.transform];
        for (const [index, transform] of transforms.entries()) {
          const label = ['wrapper', ...PARTS, 'carry'][index];
          const detail = `${context}, ${label}=${JSON.stringify(transform)}`;
          if (label !== 'carry') expect(transform, detail).not.toBe('');
          expect(transform, detail).not.toMatch(/NaN|Infinity|[\d.][eE][+-]?\d/);
          const args = [...transform.matchAll(/\(([^)]*)\)/g)].flatMap((match) =>
            (match[1] ?? '').split(/[\s,]+/).map((arg) => Number(arg.replace(/(?:px|deg)$/, ''))));
          if (transform) expect(args.length, detail).toBeGreaterThan(0);
          expect(args.every(Number.isFinite), detail).toBe(true);
        }
        const jaw = rig.jaw.getAttribute('transform') ?? '';
        const angle = Number(/^rotate\(([^\s)]+)/.exec(jaw)?.[1]);
        expect(angle, `${context}, jaw=${jaw}`).toBeGreaterThanOrEqual(0);
        expect(angle, `${context}, jaw=${jaw}`).toBeLessThanOrEqual(22);
        trace.push(transforms);
      }
      if (interval < 25) {
        expect(createHash('sha256').update(JSON.stringify(trace)).digest('hex'))
          .toBe(BASELINES[`${origin}:${interval}`]);
      }
    } finally {
      engine.stop();
    }
  });
});

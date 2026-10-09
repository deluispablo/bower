import { expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const features = join(process.cwd(), 'src/features');

it('feature CSS leaves the fresh pill look in ui', () => {
  const copies = readdirSync(features, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.module.css')).flatMap((path) => {
    const css = readFileSync(join(features, path), 'utf8');
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+\{[^{}]*\}/g) ?? [];
    return rules.filter((rule) => rule.includes('var(--fresh)') && rule.includes('var(--brand-line)'))
      .map((rule) => `${path}: ${rule.slice(0, rule.indexOf('{')).trim()}`);
  });
  expect(copies).toEqual([]);
});

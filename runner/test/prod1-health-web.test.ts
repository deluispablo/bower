import { describe, expect, it } from 'vitest';
import type { MaintenanceNote } from '../../src/data/contracts/run-manifest';
import { renderHealth } from '../src/lint';

const FOLDER = 'Resources/Links';
const note = (name: string, links: string[] = []): MaintenanceNote => ({
  path: `${FOLDER}/${name}.md`, version: '1', summary: `Alex keeps details about ${name}.`,
  coverage: { kind: 'prefix', bytes: 100 }, owner: 'bower', lint: { links, tags: 0, summary: true },
});
const health = (notes: MaintenanceNote[], originals: { path: string; after: string | null }[] = []): string =>
  renderHealth(Object.fromEntries(notes.map((n, i) => [String(i), n])),
    [...notes.map((n) => n.path), ...originals.map((original) => original.path)],
    Object.fromEntries(notes.map((n, i) => [String(i), { path: n.path }])), undefined, originals);

describe('prod1-health-web', () => {
  it.each([
    'http://example.com',
    'https://example.com/report.pdf',
    'https://example.com/report.url',
    'https://example.com/?download=report.url',
    'https://example.com?q=x',
    'https://example.com:8443/path',
    'https://example.com#Section',
    '  HTTPS://Example.com/Path?Key=Value#Section  ',
    'http://localhost:8080/path',
    'http://[::1]/path',
    'flat-listing.example',
    'example.com/path',
    'example.com?q=x',
    'example.com#section',
    'example.com/path?q=x#section',
    '  example.com  ',
  ])('web_citations_are_not_missing_notes: %s', (target) => {
    expect(health([note('Sources', [target])])).not.toContain('Broken link');
  });

  it('missing_local_note_and_url_file_still_lint', () => {
    const report = health([note('Sources', ['Missing note', 'flat-listing.example.url', 'saved.example.url'])], [
      { path: `${FOLDER}/saved.example.url`, after: `${FOLDER}/kept.example.url` },
      { path: `${FOLDER}/unlinked.example.url`, after: `${FOLDER}/unlinked.example.url` },
    ]);
    expect(report.split('\n').filter((line) => line.startsWith('- Broken link'))).toEqual([
      `- Broken link in [[${FOLDER}/Sources|Sources]]: no note is called Missing note.`,
      `- Broken link in [[${FOLDER}/Sources|Sources]]: no note is called flat-listing.example.url.`,
    ]);
    expect(report.split('\n').filter((line) => line.startsWith('- Not linked'))).toEqual([
      `- Not linked: no note links to [[${FOLDER}/unlinked.example.url|unlinked.example]].`,
    ]);
  });

  it('local_host_collision_keeps_inbound_edge', () => {
    const source = note('Sources', ['flat-listing.example']);
    const destination = note('flat-listing.example');
    const report = health([source, destination]);
    expect(report).not.toContain('Broken link');
    expect(report).not.toContain(`Nothing links to [[${FOLDER}/flat-listing.example|flat-listing.example]]`);
    expect(report).toContain(`Nothing links to [[${FOLDER}/Sources|Sources]]`);
    expect(health([source])).not.toContain('Broken link');
  });

  it.each(['/example.com', '//example.com', '/example.com#section', '//example.com#section'])(
    'leading_slashes_keep_targets_local: %s', (target) => {
    const source = note('Sources', [target]);
    expect(health([source])).toContain(`no note is called ${target.split('#')[0]}.`);
    const report = health([source, note('example.com')]);
    expect(report).not.toContain('Broken link');
    expect(report).not.toContain(`Nothing links to [[${FOLDER}/example.com|example.com]]`);
  });
});

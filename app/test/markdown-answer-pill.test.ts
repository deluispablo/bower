// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import { renderNote } from '../src/markdown/render.js';
import { buildVaultIndex } from '../src/vault-index.js';

function file(id: string, path: string): DriveFile {
  const name = path.split('/').pop() ?? path;
  return { id, name, mimeType: 'text/markdown', parents: ['PARENT'], path };
}

const index = buildVaultIndex([
  file('check', '3-Resources/Viewing checklist.md'),
]);

describe('a note link alone in an answer paragraph', () => {
  it('renders as a pill with its top folder', () => {
    const html = renderNote('More in [[Viewing checklist]].\n', index, {
      path: 'Answers/Which flat.md',
    }).html;
    expect(html).toContain('class="wikilink-pill"');
    expect(html).toContain('href="/note/check"');
    expect(html).toContain('Viewing checklist · in Resources');
    expect(html).not.toContain('More in');
  });

  it('leaves a link inside a sentence, or outside an answer, alone', () => {
    const sentence = renderNote('See [[Viewing checklist]] first.\n', index, {
      path: 'Answers/Which flat.md',
    }).html;
    expect(sentence).not.toContain('wikilink-pill');
    const elsewhere = renderNote('[[Viewing checklist]]\n', index, {
      path: '1-Projects/Flat hunt/Note.md',
    }).html;
    expect(elsewhere).not.toContain('wikilink-pill');
  });
});

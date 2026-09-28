// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import { conclusionTone, splitOrigin } from '../src/markdown/bower-note.js';
import { renderNote } from '../src/markdown/render.js';
import { buildVaultIndex } from '../src/vault-index.js';

function file(id: string, path: string, mimeType: string): DriveFile {
  const name = path.split('/').pop() ?? path;
  return { id, name, mimeType, parents: ['PARENT'], path };
}

const index = buildVaultIndex([
  file(
    'lease',
    '1-Projects/Flat hunt/Lease agreement 2026.pdf',
    'application/pdf',
  ),
  file('flat', '1-Projects/Flat hunt/Flat hunt.md', 'text/markdown'),
]);

/** The handover's D.4 note, as the agent writes it. */
const D4_NOTE = `---
title: Which flat should I visit first?
type: answer
---
## Bower's note
- ✅ Arlington Road is 10 % under the area average.
- ⚠️ The Kingsland Road listing leaves out the deposit.
- ❌ The Camden lease asks for five weeks' deposit, above the legal cap.

## Why
Arlington Road first: cheapest, and 14 minutes by bike.

## What Bower used
- [[Lease agreement 2026.pdf]] (from the file)
- Camden Town average rent (looked up on the web)
- Bike time to the office (reasoned from your calendar note)
`;

function dom(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('conclusionTone', () => {
  it('reads the three markers', () => {
    expect(conclusionTone('✅ Fine thing')).toEqual({
      tone: 'fine',
      rest: 'Fine thing',
    });
    expect(conclusionTone('⚠️ Look again')).toEqual({
      tone: 'check',
      rest: 'Look again',
    });
    // Without the emoji variation selector too.
    expect(conclusionTone('⚠ Look again').tone).toBe('check');
    expect(conclusionTone('❌ Wrong')).toEqual({
      tone: 'problem',
      rest: 'Wrong',
    });
  });

  it('leaves anything else alone', () => {
    expect(conclusionTone('A plain line')).toEqual({
      tone: undefined,
      rest: 'A plain line',
    });
    expect(conclusionTone('🎉 Party').tone).toBeUndefined();
    expect(conclusionTone('Fine ✅ later').tone).toBeUndefined();
  });
});

describe('splitOrigin', () => {
  it('splits the trailing origin', () => {
    expect(
      splitOrigin('Camden Town average rent (looked up on the web)'),
    ).toEqual({
      source: 'Camden Town average rent',
      origin: 'looked up on the web',
    });
  });

  it('keeps text with no trailing brackets', () => {
    expect(splitOrigin('Rent (monthly) and deposit')).toEqual({
      source: 'Rent (monthly) and deposit',
      origin: undefined,
    });
  });

  // The rulebook (v9, #371) names four origins: "from the file", "looked
  // up on the web", "from what you told me", "reasoned" (#529). The other
  // three are covered above and in the D4_NOTE fixture below; splitOrigin
  // itself has no allowlist — any trailing `(...)` is an origin — so the
  // fourth needs no source change, only this to say so.
  it('splits the fourth origin, "from what you told me", the same way', () => {
    expect(
      splitOrigin('Your budget is £1,800/month (from what you told me)'),
    ).toEqual({
      source: 'Your budget is £1,800/month',
      origin: 'from what you told me',
    });
  });
});

describe('renderNote with a note from Bower (D.4)', () => {
  const root = dom(
    renderNote(D4_NOTE, index, {
      path: 'Answers/Which flat should I visit first.md',
    }).html,
  );

  it("turns `## Bower's note` into the box, with no heading left", () => {
    const box = root.querySelector('.bower-note');
    expect(box).not.toBeNull();
    expect(box?.querySelector('.bower-note-title')?.textContent).toBe(
      "Bower's note",
    );
    expect(root.querySelector('h2[id$="bowers-note"]')).toBeNull();
    expect(root.firstElementChild).toBe(box);
  });

  it('shows each conclusion with its colour and its word, marker gone', () => {
    const rows = [...root.querySelectorAll('.bower-note-row')];
    expect(rows.map((row) => row.className)).toEqual([
      'bower-note-row bower-note-fine',
      'bower-note-row bower-note-check',
      'bower-note-row bower-note-problem',
    ]);
    expect(
      rows.map((row) => row.querySelector('.bower-note-word')?.textContent),
    ).toEqual(['Fine', 'Check', 'Problem']);
    expect(
      rows.map((row) => row.querySelector('.bower-note-text')?.textContent),
    ).toEqual([
      'Arlington Road is 10 % under the area average.',
      'The Kingsland Road listing leaves out the deposit.',
      "The Camden lease asks for five weeks' deposit, above the legal cap.",
    ]);
    expect(root.querySelector('.bower-note')?.textContent).not.toMatch(
      /[✅⚠❌]/u,
    );
  });

  it('renders the rest of the note as before', () => {
    const why = root.querySelector('h2#user-content-why');
    expect(why?.textContent).toBe('Why');
    expect(why?.nextElementSibling?.tagName).toBe('P');
    expect(root.querySelector('.bower-note h2')).toBeNull();
  });

  it('shows What Bower used as the sources list, origins in brackets', () => {
    const heading = root.querySelector('h2#user-content-what-bower-used');
    expect(heading?.textContent).toBe('What Bower used');
    const list = heading?.nextElementSibling;
    expect(list?.className).toBe('bower-sources');
    const items = [...(list?.querySelectorAll('li') ?? [])];
    expect(
      items.map(
        (item) => item.querySelector('.bower-source-origin')?.textContent,
      ),
    ).toEqual([
      '(from the file)',
      '(looked up on the web)',
      '(reasoned from your calendar note)',
    ]);
    expect(items[1]?.textContent).toBe(
      'Camden Town average rent (looked up on the web)',
    );
    // The file link still resolves: files open in Drive.
    const link = items[0]?.querySelector('a');
    expect(link?.textContent).toContain('Lease agreement 2026');
  });
});

describe('renderNote without the two sections', () => {
  it('leaves other headings and emoji bullets as they were', () => {
    const html = renderNote(
      '## Notes\n- ✅ done\n\n## Sources\n- Somewhere (a book)\n',
      index,
    ).html;
    const root = dom(html);
    expect(root.querySelector('.bower-note, .bower-sources')).toBeNull();
    expect(
      root.querySelector('h2#user-content-notes + ul li')?.textContent,
    ).toBe('✅ done');
    expect(
      root.querySelector('h2#user-content-sources + ul li')?.textContent,
    ).toBe('Somewhere (a book)');
  });

  it('keeps a bullet with no marker as a plain row, with no word', () => {
    const root = dom(
      renderNote("## Bower's note\n- Nothing to flag.\n", index).html,
    );
    const row = root.querySelector('.bower-note-row');
    expect(row?.className).toBe('bower-note-row');
    expect(row?.querySelector('.bower-note-word')).toBeNull();
    expect(row?.textContent).toBe('Nothing to flag.');
  });

  it('keeps inline formatting after the marker', () => {
    const root = dom(
      renderNote(
        '## Bower’s note\n- ⚠️ **Deposit** missing, see [[Flat hunt]]\n',
        index,
      ).html,
    );
    const text = root.querySelector('.bower-note-check .bower-note-text');
    expect(text?.querySelector('strong')?.textContent).toBe('Deposit');
    expect(text?.querySelector('a')?.getAttribute('href')).toBe('/note/flat');
  });
});

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import {
  conclusionTone,
  originKind,
  parseBowerLine,
  splitOrigin,
} from '../src/markdown/bower-note.js';
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
  file(
    'offer',
    '2-Areas/Work/Offer letter, Northwind Data.md',
    'text/markdown',
  ),
  file('cycle', '2-Areas/Work/Cycle to Work agreement.md', 'text/markdown'),
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

describe('parseBowerLine and originKind', () => {
  it('names the four origins', () => {
    expect(
      [
        'from the file',
        'from your notes: [[A]]',
        'looked up',
        'looked up on the web',
        'from what you told me',
        'a book',
      ].map(originKind),
    ).toEqual(['file', 'notes', 'web', 'web', 'you', undefined]);
  });

  it('takes a v4 line apart: text, origin, joined notes, Check', () => {
    expect(
      parseBowerLine(
        'Near the office. (from your notes: [[Offer letter]], [[Cycle]]) — Check',
      ),
    ).toEqual({
      tone: 'check',
      text: 'Near the office.',
      origin: 'notes',
      joined: ['[[Offer letter]]', '[[Cycle]]'],
    });
  });

  it('keeps a bracket that names no origin in the text', () => {
    expect(parseBowerLine('Read it (a book)')).toEqual({
      tone: undefined,
      text: 'Read it (a book)',
      origin: undefined,
      joined: [],
    });
  });
});

/** Board `Phone-Note-Bower`, one line per origin. */
const V4_NOTE = `---
tags: [housing]
---
> [!bower] Bower's note
> Rent £2,150 a month, available 1 November. (from the file)
> 14 minutes by bike to your office. (from your notes: [[Offer letter, Northwind Data]], [[Cycle to Work agreement]])
> 10 % under the £2,380 average for the area. (looked up)
> You want two bedrooms. (from what you told me) — Check

# Arlington Road, 2 bed

Bright, south-facing, second floor.
`;

describe('renderNote with a `> [!bower]` callout (R-NOTE-1)', () => {
  const root = dom(renderNote(V4_NOTE, index).html);

  it('draws the box with its title, the legend and one row per line', () => {
    const box = root.querySelector('.bower-note');
    expect(box).not.toBeNull();
    expect(box?.querySelector('.bower-note-title')?.textContent).toBe(
      "Bower's note",
    );
    expect(box?.querySelector('.bower-note-legend')?.textContent).toBe(
      '· from the file, your notes, looked up, you',
    );
    expect(root.querySelector('blockquote, .callout')).toBeNull();
  });

  it('gives each row its origin square, with a name, and no bracket', () => {
    const rows = [...root.querySelectorAll('.bower-note-row')];
    expect(
      rows.map((row) => row.querySelector('.bower-origin')?.className),
    ).toEqual([
      'bower-origin bower-origin-file',
      'bower-origin bower-origin-notes',
      'bower-origin bower-origin-web',
      'bower-origin bower-origin-you',
    ]);
    expect(
      rows.map((row) =>
        row.querySelector('.bower-origin')?.getAttribute('title'),
      ),
    ).toEqual(['The file', 'Your notes', 'Looked up', 'You']);
    expect(
      rows.map((row) => row.querySelector('.bower-note-text')?.textContent),
    ).toEqual([
      'Rent £2,150 a month, available 1 November.',
      '14 minutes by bike to your office.',
      '10 % under the £2,380 average for the area.',
      'You want two bedrooms.',
    ]);
  });

  it('turns "— Check" into the word Check, on that row only', () => {
    const rows = [...root.querySelectorAll('.bower-note-row')];
    expect(
      rows.map((row) => row.querySelector('.bower-note-word')?.textContent),
    ).toEqual([undefined, undefined, undefined, 'Check']);
    expect(rows[3]?.className).toBe('bower-note-row bower-note-check');
    expect(root.querySelector('.bower-note')?.textContent).not.toContain('—');
  });

  it('lists only the origins present in the legend', () => {
    const only = dom(
      renderNote(
        "> [!bower] Bower's note\n> Reply by 10 October. (from the file)\n",
        index,
      ).html,
    );
    expect(only.querySelector('.bower-note-legend')?.textContent).toBe(
      '· from the file',
    );
  });

  it('shows "Joined from" chips linking to the notes named (R-NOTE-3)', () => {
    const joined = root.querySelector('.bower-note + .bower-joined');
    expect(joined?.querySelector('.bower-joined-label')?.textContent).toBe(
      'Joined from:',
    );
    const links = [...(joined?.querySelectorAll('.bower-joined-chip a') ?? [])];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/note/offer',
      '/note/cycle',
    ]);
    expect(links.map((link) => link.textContent)).toEqual([
      'Offer letter, Northwind Data',
      'Cycle to Work agreement',
    ]);
  });

  it('shows no chips when no line comes from your notes', () => {
    const plain = dom(
      renderNote("> [!bower] Bower's note\n> Rent. (from the file)\n", index)
        .html,
    );
    expect(plain.querySelector('.bower-joined')).toBeNull();
  });
});

/** Board `Phone-Note-Long`: section notes and the contents strip. */
const LONG_NOTE = `> [!bower] Bower's note
> Senior data engineer, £78,000. (from the file)

## Pay and benefits

> [!bower]- Bower on this section
> £78,000 base and a 10 % bonus. (from the file)
> The bonus is paid in March. (from the file)

Base salary of £78,000 a year.

## Notice and non-compete

> [!bower]+ Bower on this section
> Twelve months' non-compete. (from the file) — Check

Notice is three months.

## The team

Six engineers.
`;

describe('renderNote with section notes (R-NOTE-6)', () => {
  const root = dom(renderNote(LONG_NOTE, index).html);
  const sections = [...root.querySelectorAll('details.bower-section')];

  it('renders each section box in place, at the start of its section', () => {
    expect(sections).toHaveLength(2);
    expect(
      root.querySelector('#user-content-pay-and-benefits')?.nextElementSibling,
    ).toBe(sections[0]);
    expect(
      root.querySelector('#user-content-notice-and-non-compete')
        ?.nextElementSibling,
    ).toBe(sections[1]);
    expect(sections[0]?.nextElementSibling?.textContent).toBe(
      'Base salary of £78,000 a year.',
    );
  });

  it('folds with "-" and opens with "+", with the rows and origins', () => {
    const [folded, open] = sections;
    expect(folded?.hasAttribute('open')).toBe(false);
    expect(open?.hasAttribute('open')).toBe(true);
    expect(folded?.querySelector('.bower-section-folded')?.textContent).toBe(
      'Bower on “Pay and benefits”: 2 lines',
    );
    expect(open?.querySelector('.bower-section-folded')?.textContent).toBe(
      'Bower on “Notice and non-compete”: 1 line',
    );
    expect(folded?.querySelector('.bower-section-title')?.textContent).toBe(
      'Bower on this section',
    );
    expect(folded?.querySelectorAll('.bower-origin-file')).toHaveLength(2);
    expect(open?.querySelector('.bower-note-word')?.textContent).toBe('Check');
  });

  it('unfolds and folds again', () => {
    const details = dom(renderNote(LONG_NOTE, index).html).querySelector(
      'details.bower-section',
    );
    if (!(details instanceof HTMLDetailsElement)) throw new Error('no box');
    expect(details.open).toBe(false);
    details.open = true;
    expect(details.hasAttribute('open')).toBe(true);
    details.open = false;
    expect(details.hasAttribute('open')).toBe(false);
  });

  it('adds the contents strip under the top box, marking noted sections', () => {
    const strip = root.querySelector('.bower-note + .bower-contents');
    expect(strip).not.toBeNull();
    const links = [...(strip?.querySelectorAll('a') ?? [])];
    expect(links.map((link) => link.textContent)).toEqual([
      'Pay and benefits',
      'Notice and non-compete',
      'The team',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '#user-content-pay-and-benefits',
      '#user-content-notice-and-non-compete',
      '#user-content-the-team',
    ]);
    expect(
      links.map((link) => link.classList.contains('bower-contents-noted')),
    ).toEqual([true, true, false]);
  });

  it('adds no contents strip when no section has a note', () => {
    const plain = dom(renderNote(V4_NOTE, index).html);
    expect(plain.querySelector('.bower-contents')).toBeNull();
  });
});

describe('renderNote with a v3 note (D.4, R-NOTE-2)', () => {
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

  it('shows ✅ with no word, ⚠️ as Check and ❌ as Problem, marker gone', () => {
    const rows = [...root.querySelectorAll('.bower-note-row')];
    expect(rows.map((row) => row.className)).toEqual([
      'bower-note-row bower-note-fine',
      'bower-note-row bower-note-check',
      'bower-note-row bower-note-problem',
    ]);
    expect(
      rows.map((row) => row.querySelector('.bower-note-word')?.textContent),
    ).toEqual([undefined, 'Check', 'Problem']);
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

  it('reads the origin from a v3 bracket', () => {
    const v3 = dom(
      renderNote(
        "## Bower's note\n- ⚠️ Deposit missing (from the file)\n",
        index,
      ).html,
    );
    const row = v3.querySelector('.bower-note-row');
    expect(row?.querySelector('.bower-origin-file')).not.toBeNull();
    expect(row?.querySelector('.bower-note-text')?.textContent).toBe(
      'Deposit missing',
    );
    expect(row?.querySelector('.bower-note-word')?.textContent).toBe('Check');
  });

  it('renders the rest of the note as before', () => {
    const why = root.querySelector('h2#user-content-why');
    expect(why?.textContent).toBe('Why');
    expect(why?.nextElementSibling?.tagName).toBe('P');
    expect(root.querySelector('.bower-note h2')).toBeNull();
  });

  it('shows What Bower used as one "Used:" line', () => {
    expect(root.querySelector('h2#user-content-what-bower-used')).toBeNull();
    const used = root.querySelectorAll('.bower-used');
    expect(used).toHaveLength(1);
    expect(used[0]?.tagName).toBe('P');
    expect(used[0]?.textContent).toMatch(
      /^Used: Lease agreement 2026[^,]*, Camden Town average rent, Bike time to the office\.$/,
    );
    // The file link still resolves: files open in Drive.
    expect(used[0]?.querySelector('a')?.textContent).toContain(
      'Lease agreement 2026',
    );
  });
});

describe('renderNote without the two sections', () => {
  it('leaves other headings and emoji bullets as they were', () => {
    const html = renderNote(
      '## Notes\n- ✅ done\n\n## Sources\n- Somewhere (a book)\n',
      index,
    ).html;
    const root = dom(html);
    expect(root.querySelector('.bower-note, .bower-used')).toBeNull();
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

describe("Bower's note carrying HTML", () => {
  it('renders a callout title with HTML as text, and runs nothing', () => {
    const html = renderNote(
      [
        '> [!bower] <img src=x onerror=alert(1)>',
        '> <img src=x onerror=alert(2)> (from the file)',
        '> <script>alert(3)</script> (from your notes: [[<b>x</b>]])',
        '',
        '## Section',
        '',
        '> [!bower]- <b onclick=alert(4)>Hi</b>',
        '> Fine. (looked up)',
        '',
      ].join('\n'),
      index,
    ).html;
    const root = dom(html);
    expect(root.querySelector('.bower-note-title')?.textContent).toBe(
      '<img src=x onerror=alert(1)>',
    );
    expect(root.querySelector('.bower-note-title *')).toBeNull();
    expect(root.querySelector('.bower-section-title')?.textContent).toBe(
      '<b onclick=alert(4)>Hi</b>',
    );
    expect(root.querySelector('[onerror], [onclick], script')).toBeNull();
  });
});

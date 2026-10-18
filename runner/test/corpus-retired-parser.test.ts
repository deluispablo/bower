import { expect, it } from 'vitest';
import { parseNote } from '../../src/data/contracts/note-format';

const GARDEN = `---
summary: Old garden observations.
by: bower
---

## Current state
- The opening time is unresolved.

## My thoughts
Alex kept both notices.

## Timeline
- 2026-10-02 · [!contradiction] Opening times differ. · [[Amber notice.txt]]
- 2026-10-03 · A quiet visit seems possible ^[inferred] · [[Amber notice.txt]]
- 2026-10-04 · [!future-marker] Keep this text literally. · [[Amber notice.txt]]

## Bower's note
> [!contradiction] The amber notice and blue notice disagree.
A quiet visit seems possible ^[inferred].
`;

it('corpus-delete-b9 AC2: legacy parser compatibility uses a tiny inline specimen', () => {
  for (const raw of [GARDEN, GARDEN.replace(/\n/g, '\r\n')]) {
    expect(parseNote('Garden notes.md', raw).timeline).toMatchObject([
      { date: '2026-10-02', source: 'Amber notice.txt', text: '[!contradiction] Opening times differ.' },
      { date: '2026-10-03', source: 'Amber notice.txt', text: 'A quiet visit seems possible ^[inferred]' },
      { date: '2026-10-04', source: 'Amber notice.txt', text: '[!future-marker] Keep this text literally.' },
    ]);
  }
  const diary = parseNote('Alex diary.md', '# Alex diary\r\n\r\nAlex copied > [!contradiction] literally.\r\n\r\n## Timeline\r\n* 1 Oct: Alex drew the gate.\r\n* A plain entry with [!future-marker].\r\n');
  expect(diary.timeline).toEqual([]);
  expect(diary.body).toContain('* A plain entry with [!future-marker].');
});

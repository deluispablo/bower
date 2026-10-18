/**
 * qa-prod-2-F2: a folder for one kind of document takes only that kind. The rule is one sentence in the placement
 * rules, carried once by both the selection and the execution input; a related line still goes on the note.
 * Made-up folders only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AT } from './corpus-run';
import { paging } from './drive-v3';
import { fileIntent, note, run, select, setup } from './b1-planning-support';

const oldPageSize = paging.size;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = oldPageSize; });

const SENTENCE = 'A folder for one kind of document (its name or its notes\' types say so, such as a month\'s receipts) takes only that kind. '
  + 'A thing about something there but of another kind goes to its own place and links that note; its news still goes on that note as a Timeline line.';
const RECEIPT = 'Areas/Money/Receipts/2026-10/Alder Hardware receipt.md';
const world = () => setup({
  folder: {
    [RECEIPT]: note('Receipt from Alder Hardware, October 2026.', '# Alder Hardware receipt\n\n## Current state\n\n## Timeline\n', true),
    'Resources/Shops/Shops.md': note('Alex keeps shops here.', '# Shops\n'),
  },
  inbox: [{ line: 'Opening hours of a shop.', files: ['Opening hours.url'] }],
  inboxFiles: { 'Opening hours.url': '[InternetShortcut]\nURL=https://alder.example/hours\nComment=Alder Hardware opens 9 to 5 on weekdays.\n' },
});

describe('qa-prod-2-F2 one kind of document', () => {
  it('placement_rule_reaches_both_calls: the rule is carried once, in the fit rules, by selection and execution', async () => {
    const b = await world();
    const r = await run(b, [select(b, [b.id(RECEIPT)], 'Resources/Shops'), fileIntent(b, 'Resources/Shops')]);
    expect(r.frames).toHaveLength(2);
    for (const frame of r.frames) {
      const p = frame.prompt.replace(/\s+/g, ' ');
      expect(p.split(SENTENCE).length - 1, 'the sentence occurs once').toBe(1);
      const at = p.indexOf(SENTENCE);
      expect(at).toBeGreaterThan(p.indexOf('1. Fit:'));
      expect(at).toBeLessThan(p.indexOf('2. Create:'));
      expect(at).toBeLessThan(p.indexOf('__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__'));
    }
  });

  it('related_line_survives_other_place (guard): the link goes to its place and the receipt gets the line', async () => {
    const b = await world();
    const intent = { ...fileIntent(b, 'Resources/Shops'),
      lines: [{ note: RECEIPT, text: 'Alder Hardware opens 9 to 5 on weekdays.', cites: b.sources[0]?.itemId }] };
    const r = await run(b, [select(b, [b.id(RECEIPT)], 'Resources/Shops'), intent]);
    expect(r.errors, 'no error').toBe('');
    expect(r.code).toBe(0);
    const paths = Object.keys(r.after);
    expect(paths.some((p) => p.startsWith('Resources/Shops/') && p.endsWith('Opening hours.url'))).toBe(true);
    expect(paths.filter((p) => p.startsWith('Areas/Money/Receipts/2026-10/')), 'no new path beside the receipt').toEqual([RECEIPT]);
    expect(r.after[RECEIPT]).toContain('Alder Hardware opens 9 to 5 on weekdays.');
  });
});

import { describe, expect, it } from 'vitest';
import { timelineDay } from './dates';

// TL-P2-20 R3-7 m8: the note screen shows YYYY-MM-DD Timeline dates in the app's short form; older dates stay as written.
describe('a Timeline date shows in the short form', () => {
  it('writes a YYYY-MM-DD day as "6 Oct", the calendar day as written, whatever the time zone', () => {
    expect(timelineDay('2026-10-06')).toBe('6 Oct');
    expect(timelineDay('2026-01-31')).toBe('31 Jan');
    expect(timelineDay('2025-12-01')).toBe('1 Dec');
  });

  it('keeps free-form and impossible dates as written', () => {
    for (const date of ['2 Oct', 'Today', '28 Sep', '2026-02-30', '2026-13-01', '2026-10-6', ' 2026-10-06']) expect(timelineDay(date)).toBe(date);
  });
});

import { describe, expect, it } from 'vitest';
import { changeStatusWithHistory, readStatus } from '../src/history.js';

const NOW = new Date(2026, 8, 29, 10, 0, 0);

describe('changeStatusWithHistory', () => {
  it('creates ## History when missing', () => {
    const text = '---\nkind: job-offer\nstatus: new\n---\n# Role\n\nBody.\n';
    const out = changeStatusWithHistory(text, 'applied', NOW);
    expect(out).toBe(
      '---\nkind: job-offer\nstatus: applied\n---\n# Role\n\nBody.\n\n## History\n\n- 29 Sep · Status new → applied, by you\n',
    );
  });

  it('appends after the last line and keeps a later section', () => {
    const text =
      '---\nstatus: new\n---\n# T\n\n## History\n\n- 28 Sep · Filed from your clip\n\n## Notes\n\nx\n';
    const out = changeStatusWithHistory(text, 'done', NOW);
    expect(out).toContain(
      '- 28 Sep · Filed from your clip\n- 29 Sep · Status new → done, by you\n\n## Notes',
    );
    expect(readStatus(out)).toBe('done');
  });

  it('writes nothing when the status is unchanged', () => {
    const text = '---\nstatus: new\n---\n# T\n';
    expect(changeStatusWithHistory(text, 'new', NOW)).toBe(text);
  });

  it('handles a note with no status and CRLF', () => {
    const text = '---\r\nkind: x\r\n---\r\n# T\r\n';
    const out = changeStatusWithHistory(text, 'open', NOW);
    expect(out).toContain('Status none → open, by you');
    expect(out).not.toMatch(/[^\r]\n/);
  });
});

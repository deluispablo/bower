/** A note Drive refuses to give, after the person edited it, is left out and named; the run goes on (found during b11-figures). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEALTH_NAME } from '../src/lint';
import { fileIntent, note, PERSONAL, report, run, seedState, select, setup, type Base } from './b1-planning-support';
import { AT } from './corpus-run';

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const CHANGED = note('Alex records changed remote developer applications.', 'CHANGED_APPLICATIONS\n');
const url = (input: RequestInfo | URL): URL => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
/** The person edits Applications; every read of its metadata or bytes then answers `status`. */
async function edited(b: Base, status: number, reason: string, replies: unknown[] = [select(b), fileIntent(b)]) {
  const f = await b.drive.get(b.id(PERSONAL));
  await b.drive.writeText(f.id, CHANGED, f.modifiedTime);
  let refused = 0;
  const r = await run(b, replies, { around: (next) => async (input, init) => {
    const u = url(input);
    if (u.pathname === `/drive/v3/files/${f.id}` && (u.searchParams.get('alt') === 'media' || u.searchParams.get('fields')?.includes('mimeType'))) {
      refused++;
      return new Response(JSON.stringify({ error: { code: status, message: 'Made-up refused read', errors: [{ reason }] } }), { status });
    }
    return next(input, init);
  } });
  return { r, refused, id: f.id };
}

describe('a refused read of an edited note', () => {
  // Drive's permanent refusals (transport.ts `answerKind`: a 4xx whose reason is not one to ask again).
  it.each([['the first run', false, 'forbidden'], ['a run after the first', true, 'forbidden'], ['a run after the first, a file Drive will not hand out', true, 'cannotDownloadFile']])(
    'AC1 refused-read-edited-note-left-out: in %s, an edited note Drive refuses to give is left out and named; the pile is filed', async (_when, warm, reason) => {
      const b = await setup();
      if (warm) await seedState(b);
      const { r, refused, id } = await edited(b, 403, reason);
      expect(refused, 'Drive refused the edited note').toBeGreaterThan(0);
      expect(r.wire?.statuses.at(-1)?.phase, 'the run is not failed by one refused note').toBe('done');
      expect(report(r).filed, 'the pile is filed').toHaveLength(1);
      expect(r.after[PERSONAL], 'the person\'s edit stays exact').toBe(CHANGED);
      for (const frame of r.frames) expect(JSON.stringify(frame.value), 'the refused note is never shown as read').not.toContain('CHANGED_APPLICATIONS');
      for (const frame of r.frames) {
        const sources = (frame.value.sources ?? []) as Array<{ candidates?: Array<{ id: string }> }>;
        expect(sources.flatMap((s) => s.candidates ?? []).map((c) => c.id), 'it is no candidate').not.toContain(id);
      }
      expect(r.after[HEALTH_NAME] ?? '', 'the health note names it as not checked').toContain('Not checked: Bower could not read [[Applications]]');
    });

  // Answers worth asking again are never refusals, a 403 rate limit included (transport.ts `DRIVE_REASONS`).
  it.each([[503, 'backendError'], [403, 'rateLimitExceeded']] as const)('AC2 refused-read-edited-note-unanswered (guard): a Drive answering %i %s still stops the run, never leaving the note out silently', async (status, reason) => {
    const b = await setup();
    await seedState(b);
    const { r, refused } = await edited(b, status, reason);
    expect(refused, 'the read was retried').toBeGreaterThan(1);
    expect(r.wire?.statuses.at(-1)?.phase, 'a passing outage is not a refused note').not.toBe('done');
    expect(report(r).filed).toHaveLength(0);
  });

  it('AC1 refused-read-edited-note-asked-for: a refused note the model asks for stays left out; a line for it is refused once (lineNote) and the corrected reply files', async () => {
    const b = await setup();
    await seedState(b);
    const lined = { ...fileIntent(b), lines: [{ note: PERSONAL, text: 'Alex has a remote developer offer.', cites: b.sources[0]?.itemId }] };
    const { r, id } = await edited(b, 403, 'forbidden', [select(b, [b.id(PERSONAL)]), lined, fileIntent(b)]);
    expect(r.wire?.statuses.at(-1)?.phase, 'the run is not failed by one refused note').toBe('done');
    const refusals = vi.mocked(console.error).mock.calls.flat().map(String).flatMap((l) => [.../was refused \((\w+)\)/.exec(l) ?? []].slice(1, 2));
    expect(refusals, 'the reply check and the plan agree: a note not shown takes no line').toEqual(['lineNote']);
    for (const frame of r.frames) expect(JSON.stringify(frame.value)).not.toContain('CHANGED_APPLICATIONS');
    for (const frame of r.frames) {
      const sources = (frame.value.sources ?? []) as Array<{ candidates?: Array<{ id: string }> }>;
      expect(sources.flatMap((s) => s.candidates ?? []).map((c) => c.id), 'asking for it does not make it a candidate').not.toContain(id);
    }
    expect(r.after[PERSONAL]).toBe(CHANGED);
    expect(report(r).filed).toHaveLength(1);
  });
});

/**
 * qa-live-claude F3 (plan side), without a model: through `planScripted`, a script that answers every request answers
 * the others only; a request taken back and its withdrawal get no answer, no `requests.json` row and no report row, and
 * are both archived. Made-up words only.
 */
import { expect, it } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { fakeScripted } from '../fake/fake-runner';
import { seedFakeDrive } from '../fake/seed';
import { SYSTEM } from '../vault/layout';
import { planAdmission } from './plan';
import { fakeRead } from './read';
import { modelDecisions, planScripted, runKeys, type RequestPlan } from './scripted';

const AT = Date.UTC(2026, 9, 7, 9);
const RUN = 'run-f3-plan';

it('F3P-7 a request taken back gets no answer, no row and no report line; both lines are archived, counted zero', async () => {
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await seedFakeDrive(drive, 'empty', AT)) ?? '';
  const changes = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === SYSTEM.changes);
  if (!changes) throw new Error('Missing .bower/changes');
  const write = (id: string, at: number, extra: Record<string, unknown>) => drive.createText(changes.id, `${id}.json`, JSON.stringify({ v: 1, id, device: 'device-1', at, kind: 'request', ...extra }));
  await write('keep', AT - 3, { what: 'Asked Bower: "Which flat is closer?"', text: 'Which flat is closer?' });
  await write('out', AT - 2, { what: 'Asked Bower: "Which flat is cheaper?"', text: 'Which flat is cheaper?' });
  await write('back', AT - 1, { what: 'Took back the request "Which flat is cheaper?"', undoes: 'out' });
  const admission = await planAdmission(fakeRead(drive), root, { scope: 'instructions', clock: () => AT, newId: () => 'admission-f3-plan' });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const everyRequest: RequestPlan = { kind: 'answer', uses: [], answer: 'Done: the closer flat is on the list.' };
  const asked: string[] = [];
  const decisions = { ...modelDecisions({ thing: () => null, words: () => null }), request: (_text: string, id: string): RequestPlan => { asked.push(id); return everyRequest; } };
  const taken = admission.manifest;
  const plan = await planScripted(fakeScripted(drive), root, { scope: 'instructions', allowWeb: false, runId: RUN, requestId: taken.id, requestedAt: taken.at, taken, mintKey: await runKeys(RUN), decisions });

  expect(asked, 'the script is asked only about the request kept').not.toContain('out');
  expect(asked).not.toContain('back');
  const rows = plan.manifest.operations.flatMap((op) => {
    const text = (op.effect as { text?: unknown }).text;
    return op.effect.kind === 'write-runner-json' && op.effect.path === SYSTEM.requests && typeof text === 'string' ? (JSON.parse(text) as { done: Array<{ id: string }> }).done : [];
  });
  expect(rows.map((r) => r.id), 'one requests row: the request kept').toEqual(['keep']);
  const captured = plan.manifest.capture.journal.map((l) => l.recordId).sort();
  expect(captured, 'all three lines are archived').toEqual(['back', 'keep', 'out']);
  const values = plan.manifest.reportPlan.map((c) => c.value);
  expect(JSON.stringify(values)).not.toContain('cheaper');
  expect(values.flatMap((v) => v.requests ?? []), 'the report has the request kept only').toEqual(['Which flat is closer?']);
  expect(values.reduce((n, v) => n + (v.yourChanges ?? 0), 0), 'counted zero').toBe(0);
});

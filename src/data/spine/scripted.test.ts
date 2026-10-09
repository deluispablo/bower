import { describe, expect, it } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { fakeScripted, planRun } from '../fake/fake-runner';
import { seedFakeDrive } from '../fake/seed';
import type { AdmissionManifest } from './admission';
import { planAdmission } from './plan';
import { fakeRead } from './read';
import { scriptedProvider } from '../demo/script';
import { runKeys } from './scripted';

const AT = Date.UTC(2026, 9, 7, 9);
const RUN = 'run-scripted';

/** The demo's folder with its inbox, journal and Bower's files, the same every time (fixed clock, fixed ids). */
async function seeded(): Promise<{ drive: FakeDrive; root: string; admitted: AdmissionManifest }> {
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
  const admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'request-scripted' });
  if (admission.kind !== 'manifest') throw new Error(`nothing admitted: ${admission.cause}`);
  return { drive, root, admitted: admission.manifest };
}

describe('the scripted provider', () => {
  it('the scripted provider plans the same run as the fake runner', async () => {
    const { drive, root, admitted } = await seeded();
    // The fake runner plans from everything in the folder; the provider from the admitted set it took, whole.
    const fake = await planRun(drive, root, { scope: 'all', allowWeb: false, runId: RUN, requestId: admitted.id, requestedAt: admitted.at, mintKey: await runKeys(RUN) });
    const provider = scriptedProvider(fakeScripted(drive), { rootId: root, runId: RUN, allowWeb: false });
    const planned = await provider({ taken: admitted, deferred: [] });
    expect(fake.manifest.operations.length).toBeGreaterThan(0);
    expect(planned).toEqual(fake.manifest);
    // Deterministic: the same folder and admitted set give the same plan, create keys included.
    expect(await provider({ taken: admitted, deferred: [] })).toEqual(planned);
  });

  it('plans only the piles it took: a pile that waits is not in the run', async () => {
    const { drive, root, admitted } = await seeded();
    const [waits, ...rest] = admitted.piles;
    expect(waits).toBeDefined();
    if (!waits) return;
    const provider = scriptedProvider(fakeScripted(drive), { rootId: root, runId: RUN, allowWeb: false });
    const planned = await provider({ taken: { ...admitted, piles: rest }, deferred: waits.items.map((i) => ({ fileId: i.fileId, pileId: waits.pileId, why: 'pile' as const })) });
    expect(planned.capture.piles.map((p) => p.pileId)).not.toContain(waits.pileId);
    const moved = new Set(planned.operations.flatMap((o) => (o.effect.kind === 'move' ? [o.effect.before.fileId] : [])));
    expect(waits.items.filter((i) => moved.has(i.fileId))).toEqual([]);
    expect(planned.capture.piles.length).toBe(rest.length);
  });
});

/**
 * Admission keeps to the free plan's subrequest limit (TL-P4-11): a Worker invocation may make 50
 * (https://developers.cloudflare.com/workers/platform/limits/#subrequests), and admission counts every fetch it
 * makes against a budget of 35, so a bigger folder never fails `POST /process` with "Too many subrequests".
 */
import { describe, expect, it } from 'vitest';

import { DriveHttp } from '../../src/data/drive/drive-http.js';
import { planAdmission } from '../../src/data/spine/plan.js';
import { driveRead } from '../../src/data/spine/read.js';
import { SUBREQUEST_BUDGET } from '../../src/data/spine/budget.js';
import { declaredPile, holderOf, press, storedManifest } from './admission-support.js';
import { driveFolder, type DriveFolder } from './drive-v3.js';

/** 300 files in the areas, and 25 piles in the inbox: 5 added in the app (declared), 20 added in Drive (a note and a thing). */
async function bigFolder(): Promise<DriveFolder> {
  const folder = await driveFolder();
  const { drive, root, inbox, bower } = folder;
  const piles = await drive.createFolder(bower, 'piles');
  for (let n = 1; n <= 5; n += 1) await declaredPile(folder, piles.id, n);
  for (let n = 6; n <= 25; n += 1) {
    const made = await drive.createFolder(inbox, `Papers ${n}`, { pile: `pile-${n}` });
    await drive.createText(made.id, 'Pile note.md', `Papers ${n} from Alex`);
    await drive.createText(made.id, `a${n}.pdf`, `%PDF a${n}`);
  }
  const areas = await drive.createFolder(root, 'Areas');
  for (let i = 1; i <= 100; i += 1) {
    const topic = await drive.createFolder(areas.id, `Topic ${i}`);
    for (let j = 1; j <= 3; j += 1) await drive.createText(topic.id, `Note ${i}-${j}.md`, `# Note ${i}-${j}\n`);
  }
  return folder;
}

describe('admission subrequest budget', () => {
  it('admission of 300 files and 25 piles stays within the subrequest budget with the same outcome', async () => {
    const folder = await bigFolder();
    expect((await folder.drive.listAll(folder.root)).length).toBeGreaterThan(300);
    const who = await holderOf(folder);
    // The shared plan over the plain Drive adapter with no budget: the outcome to match.
    const http = new DriveHttp({ token: async () => 'access-cached', fetch: async (input, init) => await folder.fetchImpl(String(input), init) });
    const unbudgeted = await planAdmission(driveRead(http), folder.root, { scope: 'all', clock: () => 0, newId: () => 'same' });
    expect(unbudgeted.kind).toBe('manifest');
    if (unbudgeted.kind !== 'manifest') return;
    // Every fetch the Worker makes during the press, whichever service it goes to.
    let fetches = 0;
    const counted: DriveFolder['fetchImpl'] = async (url, init) => {
      fetches += 1;
      return await folder.fetchImpl(url, init);
    };
    const r = await press(counted, who.headers);
    expect(r.status).toBe(200);
    console.info(`subrequests in /process: ${fetches}`);
    expect(fetches).toBeLessThanOrEqual(SUBREQUEST_BUDGET);
    const after = await storedManifest(who.sub);
    expect(after.piles).toHaveLength(25);
    expect({ ...after, id: 'same', at: 0 }).toEqual(unbudgeted.manifest);
  }, 120_000);
});

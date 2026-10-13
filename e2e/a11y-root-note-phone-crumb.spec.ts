import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectAxeClean } from './axe';
import { resize } from './viewport';

const ROOT_NOTE = 'Crumb root note.md';
const NESTED_NOTE = 'Crumb garden/Crumb nested note.md';
const RAW = '# Crumb note\n\nAlex plants mint.\n';

/** Serves two real notes over a pretend Drive (the next-steps-plain-list fixture): one at the folder root, one nested. */
async function open(page: Page, path: string): Promise<void> {
  await resize(page, { width: 375, height: 800 });
  await page.route('**/src/data/choose.ts*', async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    const renamed = original.replace(/\bbuildSources\b/g, 'crumbOriginalSources');
    expect(renamed).not.toBe(original);
    const body = `${renamed}\n
      export async function buildSources(...args) {
        const result = await crumbOriginalSources(...args);
        const [{ FakeDrive }, { DriveVault }] = await Promise.all([
          import('/src/data/drive/fake-drive.ts'), import('/src/data/vault/drive-vault.ts')
        ]);
        const drive = new FakeDrive({ clock: () => 0 });
        const root = (await drive.createFolder('root', 'Bower')).id;
        const garden = (await drive.createFolder(root, 'Crumb garden')).id;
        await drive.createText(root, ${JSON.stringify(ROOT_NOTE)}, ${JSON.stringify(RAW)});
        await drive.createText(garden, 'Crumb nested note.md', ${JSON.stringify(RAW)});
        const fixture = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
        const base = result.sources;
        const own = new Set([${JSON.stringify(ROOT_NOTE)}, ${JSON.stringify(NESTED_NOTE)}]);
        const methods = {
          tree: async () => [...await base.vault.tree(), ...await fixture.tree()],
          note: (path) => own.has(path) ? fixture.note(path) : base.vault.note(path),
          markSeen: (path) => own.has(path) ? fixture.markSeen(path) : base.vault.markSeen(path),
          subscribe: (callback) => {
            const stopBase = base.vault.subscribe(callback);
            const stopFixture = fixture.subscribe(callback);
            return () => { stopBase(); stopFixture(); };
          }
        };
        const vault = new Proxy(base.vault, { get: (target, key) => key in methods ? methods[key] :
          typeof target[key] === 'function' ? target[key].bind(target) : target[key] });
        return { ...result, sources: { ...base, vault } };
      }`;
    await route.fulfill({ response, body, contentType: 'text/javascript' });
  });
  await page.goto(`/note/${encodeURIComponent(path)}?scenario=empty&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test('AC1 control: a nested note keeps its parent crumb on the phone', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The phone breadcrumb only exists on the phone shell.');
  await open(page, NESTED_NOTE);
  await expect(page.getByRole('link', { name: 'Crumb garden', exact: true })).toBeVisible();
  await expectAxeClean(page, { wcag22: true });
});

test('AC1 a root note has a phone breadcrumb link with a name and a usable target', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The phone breadcrumb only exists on the phone shell.');
  await open(page, ROOT_NOTE);
  const crumb = page.locator('a[class*="phoneCrumb"]');
  await expect(crumb).toBeVisible();
  await expect(crumb).toHaveAccessibleName(/\S/);
  const box = await crumb.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await expectAxeClean(page, { wcag22: true });
  await crumb.click();
  await expect(page).toHaveURL(/\/files(\?|$|\/)/);
});

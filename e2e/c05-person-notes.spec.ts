import type { Locator, Page } from '@playwright/test';
import type { Note, Question, RunReport, TreeNode } from '../src/data/contracts/types';
import { expect, openTidy, test } from './fixtures';
import { expectAxeClean } from './axe';

const PATH = 'Areas/Home/Garden plot.md';
const SECOND = 'Projects/Garden/Garden plot.md';
const CONTROL = 'Areas/Home/Control.md';
const NEWS = 'The replacement water butt has arrived.';
const APPENDED = 'One line added to its Timeline, as you asked.';
const ASK = 'Water butt update also changes the current state of Garden plot. Should Bower write its update there?';
const NEW_STATE = 'The replacement water butt has arrived. The committee asks Alex to return the shared water butt.';
const OTHER = 'Alex grows garlic beside the path.';
const MISSING = "Bower didn't add the line: this note has no Timeline.";
const duplicate = (folder: string) => `In ${folder}. Bower didn't update it: more than one note has this name. Ask again with its folder.`;
type PersonReport = RunReport & { leftAsWritten?: Array<{ name: string; why: string; fileId?: string }> };
type ScreenFixture = { report: PersonReport; questions: Question[]; notes: Note[]; tree: TreeNode[] };

function fixture(row: 1 | 2 | 5 | 6): ScreenFixture {
  const report: PersonReport = { filed: [{ name: 'Water butt update.txt', title: 'Water butt update.txt', kind: 'other', to: 'Areas/Home' }],
    created: [{ path: CONTROL, what: 'Made from 1 thing' }], updated: [], setAside: [], questions: [] };
  const note = (path: string): Note => ({ path, title: path === CONTROL ? 'Control' : 'Garden plot', summary: "Alex's garden.", properties: [], tags: [],
    currentState: ['Alex will keep the shared water butt until the replacement arrives.', OTHER], body: 'Alex keeps a planting diary.',
    timeline: row === 1 || row === 2 ? [{ date: '7 Oct', text: NEWS, source: 'Water butt update.txt' }] : [], links: [], backlinks: [], byBower: false });
  const notes = [note(CONTROL), note(PATH), ...(row === 6 ? [note(SECOND)] : [])];
  const tree: TreeNode[] = ['Areas', 'Projects'].map((root) => ({ path: root, name: root, type: 'folder', modified: 0, created: 0,
    children: [{ path: `${root}/${root === 'Areas' ? 'Home' : 'Garden'}`, name: root === 'Areas' ? 'Home' : 'Garden', type: 'folder', modified: 0, created: 0,
      children: notes.filter((n) => n.path.startsWith(`${root}/`)).map((n) => ({ path: n.path, name: `${n.title}.md`, type: 'file', kind: 'note', modified: 0, created: 0 })) }] }));
  tree[0]?.children?.[0]?.children?.push({ path: 'Areas/Home/Water butt update.txt', name: 'Water butt update.txt', type: 'file', kind: 'other', created: 0, modified: 0 });
  const questions: Question[] = row === 2 ? [{ id: 'q-state-garden-note', text: ASK, yes: 'Write it', no: 'Keep mine', about: PATH,
    shown: { lines: [NEW_STATE, OTHER], md5: '0'.repeat(32) }, askedAt: 0 }] : [];
  report.questions = questions;
  if (row === 1 || row === 2) report.updated = [{ path: PATH, what: APPENDED }];
  if (row === 5) report.leftAsWritten = [{ name: PATH, why: MISSING, fileId: 'garden-note' }];
  if (row === 6) report.leftAsWritten = [
    { name: PATH, why: duplicate('Areas / Home'), fileId: 'garden-note' },
    { name: SECOND, why: duplicate('Projects / Garden'), fileId: 'second-garden-note' },
  ];
  return { report, questions, notes, tree };
}

/**
 * Screen-only fixtures at the existing source ports, over each initialized demo/fake source. Home, TidySheet,
 * RunLinks, routing and NoteScreen are production components. Runner behavior is covered by the corpus reds.
 * Patch the served module only in this browser; no app fixture, extra scenario or deployed test hook is added.
 */
async function openFixture(page: Page, source: 'demo' | 'fake', row: 1 | 2 | 5 | 6): Promise<void> {
  const data = fixture(row);
  await page.route('**/src/data/choose.ts*', async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    const renamed = original.replace(/\bbuildSources\b/g, 'c05OriginalSources');
    expect(renamed).not.toBe(original);
    const body = `${renamed}\n
      export async function buildSources(...args) {
        const result = await c05OriginalSources(...args);
        const data = ${JSON.stringify(data)};
        const listeners = new Set();
        let run = null;
        const base = result.sources;
        const notify = () => { for (const cb of listeners) cb(); };
        window.__c05Finish = () => { run = { ...run, phase: 'done', phaseAt: Date.now(), finishedAt: Date.now(), report: data.report }; notify(); };
        const pile = { id: 'person-note-pile', text: 'Update the garden plot from this committee letter.', createdAt: 0,
          items: [{ id: 'letter', name: 'Water butt update.txt', kind: 'other', origin: 'From this computer' }] };
        const vaultMethods = {
          tree: async () => data.tree,
          note: async (path) => data.notes.find((n) => n.path === path) ?? base.vault.note(path),
          piles: async () => run?.phase === 'done' ? [] : [pile],
          pilesListed: async () => null,
          questions: async () => run?.phase === 'done' ? data.questions : [],
          changes: async () => [], suggestions: async () => [], markSeen: async () => {},
          subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); }
        };
        const vault = new Proxy(base.vault, { get: (target, key) => key in vaultMethods ? vaultMethods[key] :
          typeof target[key] === 'function' ? target[key].bind(target) : target[key] });
        const runs = {
          current: async () => run,
          start: async () => { run = { id: 'person-note-run', scope: 'all', phase: 'reading', requestedAt: Date.now(), phaseAt: Date.now(), seen: false, total: 1 }; notify(); return run; },
          markSeen: async () => {},
          subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); }
        };
        return { ...result, sources: { ...base, vault, runs } };
      }`;
    await route.fulfill({ response, body, contentType: 'text/javascript' });
  });
  await page.goto(`/?source=${source}&scenario=empty&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0);
  // Positive control: each original source boots Home and the existing tidy-up flow and result list.
  await expect(page.getByRole('heading', { level: 1, name: /Hello, Alex/ })).toBeVisible();
  await openTidy(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Tidy up 1 thing', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Reading 1 thing', { exact: true }).first()).toBeVisible();
  await page.evaluate(() => (window as unknown as { __c05Finish: () => void }).__c05Finish());
  await expect(page.getByRole('dialog').getByRole('list', { name: 'New notes' }).getByRole('link', { name: 'Control', exact: true })).toBeVisible();
}

async function assertRows(scope: Locator, row: 1 | 2 | 5 | 6): Promise<void> {
  if (row === 1 || row === 2) {
    const updated = scope.getByRole('list', { name: 'Brought up to date', exact: true });
    await expect(updated.getByRole('link', { name: 'Garden plot', exact: true })).toBeVisible();
    await expect(updated.getByText(APPENDED, { exact: true })).toBeVisible();
    await expect(scope.getByRole('list', { name: 'Left as you wrote them', exact: true })).toHaveCount(0);
  } else {
    const left = scope.getByRole('list', { name: 'Left as you wrote them', exact: true });
    await expect(left.getByRole('listitem')).toHaveCount(row === 5 ? 1 : 2);
    await expect(left.getByRole('link', { name: 'Garden plot', exact: true })).toHaveCount(row === 5 ? 1 : 2);
    for (const why of row === 5 ? [MISSING] : [duplicate('Areas / Home'), duplicate('Projects / Garden')]) await expect(left.getByText(why, { exact: true })).toBeVisible();
    await expect(scope.getByRole('list', { name: 'Brought up to date', exact: true })).toHaveCount(0);
    await expect(scope.getByText(/\d+ notes? brought up to date/)).toHaveCount(0);
  }
}

for (const source of ['demo', 'fake'] as const) {
  for (const row of [1, 2, 5, 6] as const) {
    test(`C05 person notes: designer row ${row} on Home and the result with working links and WCAG 2.2 (${source})`, async ({ page }) => {
      await openFixture(page, source, row);
      const result = page.getByRole('dialog');
      await assertRows(result, row);
      await expectAxeClean(page, { include: '[role="dialog"]', wcag22: true });
      await page.keyboard.press('Escape');
      await expect(result).toHaveCount(0);
      const home = page.getByRole('main');
      await assertRows(home, row);
      if (row === 2) {
        await expect(home.getByText(ASK, { exact: true })).toBeVisible();
        const update = home.getByRole('list', { name: "Bower's update", exact: true });
        await expect(update.getByRole('listitem')).toHaveText([NEW_STATE, OTHER]);
        await expect(home.getByRole('button', { name: 'Write it', exact: true })).toBeVisible();
        await expect(home.getByRole('button', { name: 'Keep mine', exact: true })).toBeVisible();
      } else await expect(home.getByRole('button', { name: 'Write it', exact: true })).toHaveCount(0);
      await expectAxeClean(page, { include: 'main', wcag22: true });
      const list = home.getByRole('list', { name: row < 5 ? 'Brought up to date' : 'Left as you wrote them', exact: true });
      const links = list.getByRole('link', { name: 'Garden plot', exact: true });
      const paths = row === 6 ? [PATH, SECOND] : [PATH];
      for (const [i, path] of paths.entries()) {
        const href = await links.nth(i).getAttribute('href');
        expect(href).toBe(`/note/${path.split('/').map(encodeURIComponent).join('/')}`);
        await links.nth(i).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Garden plot', exact: true })).toBeVisible();
        if (row < 5) await expect(page.getByRole('region', { name: 'Timeline', exact: true })).toContainText(NEWS);
        await page.goBack();
        await expect(home.getByRole('heading', { level: 1, name: /Hello, Alex/ })).toBeVisible();
      }
    });
  }
}

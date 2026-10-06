/**
 * The C06–C10 capability journeys (TL-P2-38, TL-P2-40): one scripted journey
 * each, where the app asks, the pretend runner persists a real effect over the
 * pretend Drive, and the app shows it with links that open. Phone and desktop,
 * on fake only: the demo stays an illustration and runs none of them.
 */
import type { Page } from '@playwright/test';
import { expect, isFake, test } from './fixtures';

const open = async (page: Page, path: string, scenario = 'default', time = 'instant'): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=${scenario}&time=${time}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};
const noteUrl = (path: string): string => `/note/${path.split('/').map(encodeURIComponent).join('/')}`;
const goNote = async (page: Page, path: string): Promise<void> => {
  await page.goto(noteUrl(path));
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};
const timeline = (page: Page) => page.getByRole('region', { name: 'Timeline' });
const lineOf = (page: Page, text: string) => timeline(page).getByRole('listitem').filter({ hasText: text });

/** The open note's links, both ways: the Linked notes section on a phone, the right panel's tab on a desktop. */
async function linkedFrom(page: Page, isMobile: boolean) {
  if (isMobile) return page.getByRole('main').locator('section', { has: page.getByRole('heading', { name: 'Linked notes' }) });
  await page.getByRole('tab', { name: 'Linked notes' }).click();
  return page.getByRole('tabpanel', { name: 'Linked notes' });
}

/** Waits for the open tidy-up sheet to say it is done, then closes it. */
async function closeWhenDone(page: Page): Promise<void> {
  await expect(page.getByRole('dialog').getByText(/^Done\./).last()).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** Tidies up everything waiting, from Home. */
async function tidyUpAll(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Tidy up \d+ things?$/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up \d+ things?$/ }).click();
  await closeWhenDone(page);
}

/** Asks Bower each request from its screen, then lets it do them now. */
async function ask(page: Page, ...requests: string[]): Promise<void> {
  await page.goto('/bower');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await page.getByRole('radio', { name: 'A request' }).click();
  for (const text of requests) {
    await page.getByLabel('Your request').fill(text);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('region', { name: 'What you asked' }).getByText(text, { exact: true }).first()).toBeVisible();
  }
  await page.getByRole('button', { name: 'Let Bower do it now' }).click();
  await closeWhenDone(page);
}

/** A request's bubble on Bower's screen, the newest asked with these words. */
const answerTo = (page: Page, text: string) =>
  page.getByRole('region', { name: 'What you asked' }).locator('div').filter({ has: page.getByText(text, { exact: true }) }).first();

test('C06: a project note cites what it is about', async ({ page, isMobile }) => {
  test.skip(!isFake, 'the scripted journeys run on the pretend Drive and Worker');
  test.setTimeout(60_000);
  await open(page, '/');
  await tidyUpAll(page);

  // The project note's new Timeline line cites the flat this tidy-up filed for it; the link opens it.
  await goNote(page, 'Projects/Flat hunt/Flat hunt.md');
  const flatLine = lineOf(page, 'A fourth flat added; the shortlist compared by commute.');
  await expect(flatLine.getByRole('link', { name: 'Flat 9, Wrenfield Road' })).toBeVisible();
  await flatLine.getByRole('link', { name: 'Flat 9, Wrenfield Road' }).click();
  await expect(page).toHaveURL(new RegExp(`${noteUrl('Projects/Flat hunt/Flat 9, Wrenfield Road.md').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  await expect(page.getByRole('heading', { level: 1, name: 'Flat 9, Wrenfield Road' })).toBeVisible();
  await expect((await linkedFrom(page, isMobile)).getByRole('link', { name: 'Flat hunt Projects / Flat hunt' })).toBeVisible();

  // Across projects: the job hunt's note cites the offer, and the flat that came in the same pile.
  await goNote(page, 'Projects/Job hunt/Job hunt.md');
  await expect(lineOf(page, 'New offer from Ferrowick, scored 7 out of 10 against your CV.').getByRole('link', { name: 'Industrial Designer, Ferrowick' })).toBeVisible();
  const crossLine = lineOf(page, 'A flat from the same pile went to the flat hunt.');
  await crossLine.getByRole('link', { name: 'Flat 9, Wrenfield Road' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Flat 9, Wrenfield Road' })).toBeVisible();
  await expect((await linkedFrom(page, isMobile)).getByRole('link', { name: 'Job hunt Projects / Job hunt' })).toBeVisible();
});

test('C09: a question about your notes is answered', async ({ page }) => {
  test.skip(!isFake, 'the scripted journeys run on the pretend Drive and Worker');
  test.setTimeout(60_000);
  await open(page, '/');
  const tidy = page.getByRole('button', { name: /^Tidy up \d+ things?$/ }).first();
  const waiting = await tidy.textContent();
  expect(waiting).toMatch(/^Tidy up \d+ things?$/);

  const question = 'Which flat is closest to Ferrowick?';
  const chore = 'Put my visa papers together';
  await ask(page, chore, question);

  // The answer names what Bower found, with links to the notes it used; nothing generic.
  const answer = answerTo(page, question);
  await expect(answer).toContainText('has the shortest commute, 18 minutes');
  await expect(answer).not.toContainText('Done. See what changed in your folders.');
  await expect(answer.getByRole('link', { name: 'Industrial Designer, Ferrowick' })).toBeVisible();
  // A request with nothing specific to name keeps the generic line.
  await expect(answerTo(page, chore)).toContainText('Done. See what changed in your folders.');
  await answer.getByRole('link', { name: 'Flat 7, Cobble Row' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Flat 7, Cobble Row' })).toBeVisible();

  // Asking about stored notes adds nothing to the inbox.
  await page.goto('/');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole('button', { name: /^Tidy up \d+ things?$/ }).first()).toHaveText(waiting ?? '');
});

type Kept = { files: Array<{ meta: { name: string; parents: string[]; modifiedTime: string; folder?: boolean }; trashed: boolean }> };
/** Every live file of the pretend Drive this tab keeps, but Bower's own records: its name, place and last change. */
const notesAsKept = (page: Page, scenario = 'default'): Promise<string[]> =>
  page.evaluate((key) => {
    const kept = JSON.parse(sessionStorage.getItem(key) ?? '{"files":[]}') as Kept;
    return kept.files.filter((f) => !f.trashed && !f.meta.folder && !f.meta.name.endsWith('.json')).map((f) => `${f.meta.parents.join('/')}/${f.meta.name}@${f.meta.modifiedTime}`).sort();
  }, `bower:fake:${scenario}`);

test('C10: web lookups say what they did, off and on', async ({ page }) => {
  test.skip(!isFake, 'the scripted journeys run on the pretend Drive and Worker');
  test.setTimeout(60_000);
  const lookup = 'Look up the council tax band for Flat 3';
  const flat3 = 'Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md';
  await open(page, '/');

  // Web off (the default): the answer says honestly that nothing was looked up, and no note changes.
  const before = await notesAsKept(page);
  expect(before.length).toBeGreaterThan(0);
  await ask(page, lookup);
  await expect(answerTo(page, lookup)).toContainText('Bower did not look anything up.');
  await expect(answerTo(page, lookup).getByRole('link')).toHaveCount(0);
  expect(await notesAsKept(page)).toEqual(before);
  await goNote(page, flat3);
  await expect(timeline(page)).not.toContainText('Council tax band');

  // Web on, in Settings: a scripted result goes into the note's Timeline with its web address.
  await page.goto('/settings');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  const web = page.getByRole('switch', { name: 'Look things up on the web' });
  await web.click();
  await expect(web).toBeChecked();
  await ask(page, lookup);
  const answer = answerTo(page, lookup);
  await expect(answer).toContainText('Council tax band C, found on the web.');
  await answer.getByRole('link', { name: 'Flat 3, 12 Larkspur Lane' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Flat 3, 12 Larkspur Lane' })).toBeVisible();
  const found = lineOf(page, 'Council tax band C, looked up on the web.');
  await expect(found.getByRole('link', { name: 'council-tax.example/bands/12-larkspur-lane' })).toHaveAttribute('href', 'https://council-tax.example/bands/12-larkspur-lane');
});

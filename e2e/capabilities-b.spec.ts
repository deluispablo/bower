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

test.beforeEach(async ({ page }) => {
  // Seed once: later loads keep the prefs a journey sets (C10 turns web lookups on).
  await page.addInitScript(() => { if (!localStorage.getItem('bower:prefs')) localStorage.setItem('bower:prefs', JSON.stringify({ rightOpen: true })); });
});

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
  const flatLine = lineOf(page, 'A new listing added to the shortlist.');
  await expect(flatLine.getByRole('link', { name: 'Flat 9, Wrenfield Road' })).toBeVisible();
  await flatLine.getByRole('link', { name: 'Flat 9, Wrenfield Road' }).click();
  await expect(page).toHaveURL(new RegExp(`${noteUrl('Projects/Flat hunt/Flat 9, Wrenfield Road.md').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  await expect(page.getByRole('heading', { level: 1, name: 'Flat 9, Wrenfield Road' })).toBeVisible();
  await expect((await linkedFrom(page, isMobile)).getByRole('link', { name: 'Flat hunt Projects / Flat hunt' })).toBeVisible();

  // Across projects: the job hunt's note cites the offer, and the flat that came in the same pile.
  await goNote(page, 'Projects/Job hunt/Job hunt.md');
  await expect(lineOf(page, 'New offer from Ferrowick: fully remote, 42,000 a year, start 2 November.').getByRole('link', { name: 'Industrial Designer, Ferrowick' })).toBeVisible();
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
  // qa7-refused-words: a request the run did nothing for says so, not the generic done line.
  await expect(answerTo(page, chore)).toContainText("Bower didn't change anything for this request.");
  await answer.getByRole('link', { name: 'Flat 7, Cobble Row' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Flat 7, Cobble Row' })).toBeVisible();

  // Asking about stored notes adds nothing to the inbox.
  await page.goto('/');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole('button', { name: /^Tidy up \d+ things?$/ }).first()).toHaveText(waiting ?? '');
});

type Kept = { files: Array<{ meta: { name: string; parents: string[]; folder?: boolean }; trashed: boolean; content: unknown }> };
/**
 * Every live file of the pretend Drive this tab keeps, but Bower's own records: its place, name and content. A
 * tidy-up clearing last run's "new" marks changes no content, so it is not counted.
 */
const filesAsKept = (page: Page, scenario = 'default'): Promise<string[]> =>
  page.evaluate((key) => {
    const kept = JSON.parse(sessionStorage.getItem(key) ?? '{"files":[]}') as Kept;
    return kept.files.filter((f) => !f.trashed && !f.meta.folder && !f.meta.name.endsWith('.json')).map((f) => `${f.meta.parents.join('/')}/${f.meta.name}: ${JSON.stringify(f.content)}`).sort();
  }, `bower:fake:${scenario}`);

test('C10: web lookups say what they did, off and on', async ({ page }) => {
  test.skip(!isFake, 'the scripted journeys run on the pretend Drive and Worker');
  test.setTimeout(60_000);
  const lookup = 'Look up the council tax band for Flat 3';
  const flat3 = 'Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md';
  await open(page, '/');

  // Web off (the default): the answer says honestly that nothing was looked up, and no note changes.
  const before = await filesAsKept(page);
  expect(before.length).toBeGreaterThan(0);
  await ask(page, lookup);
  await expect(answerTo(page, lookup)).toContainText('Bower did not look anything up.');
  await expect(answerTo(page, lookup).getByRole('link')).toHaveCount(0);
  expect(await filesAsKept(page)).toEqual(before);
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

test('C08: a comparison request makes a note with a table and its sources', async ({ page }) => {
  test.skip(!isFake, 'the scripted journeys run on the pretend Drive and Worker');
  test.setTimeout(60_000);
  const compare = 'Compare the flats on the shortlist';
  await open(page, '/');
  await ask(page, compare);

  // The request's done line links the new note.
  const answer = answerTo(page, compare);
  await expect(answer).toContainText('Compared the three flats on the shortlist in Flats on the shortlist, compared.');
  await answer.getByRole('link', { name: 'Flats on the shortlist, compared' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Flats on the shortlist, compared' })).toBeVisible();

  // The note shows a table, one row per flat, and links to its sources.
  const table = page.getByRole('main').getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText(['Flat', 'Rent', 'Commute', 'Status']);
  await expect(table.getByRole('row')).toHaveCount(4);
  await expect(table.getByRole('row').filter({ hasText: 'Flat 7, Cobble Row' })).toContainText('18 min');
  await expect(page.getByRole('main').getByRole('heading', { name: 'Sources' })).toBeVisible();
  const sources = page.getByRole('main').locator('h2#h-sources + ul');
  await expect(sources.getByRole('link')).toHaveText(['Flat 3, 12 Larkspur Lane', 'Flat 7, Cobble Row', 'Flat 2, 40 Tanners Walk']);
  await sources.getByRole('link', { name: 'Flat 2, 40 Tanners Walk' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Flat 2, 40 Tanners Walk' })).toBeVisible();
});

test('C07: a contradiction asks a question linking both sources', async ({ page }) => {
  test.skip(!isFake, 'the scripted journeys run on the pretend Drive and Worker');
  test.setTimeout(60_000);
  const words = 'Flat 3 rent is now £1,550';
  await open(page, '/add', 'empty');
  await page.locator('textarea').first().fill(words);
  await page.getByRole('button', { name: 'Add to the inbox' }).click();
  await expect(page.getByRole('status').getByText(/in the inbox/)).toBeVisible();
  await expect(page).toHaveURL(/\/(?:\?|$)/);
  await tidyUpAll(page);

  // Home asks about it, linking the note just written and the note it disagrees with.
  const question = page.getByRole('region', { name: /questions? for you/ }).getByRole('listitem').filter({ hasText: 'says the rent is £1,550' });
  await expect(question).toContainText('Flat 3 rent is now £1,550 says the rent is £1,550, but Flat 3, 12 Larkspur Lane says £1,450. Is £1,550 right?');
  await question.getByRole('link', { name: words }).click();
  await expect(page.getByRole('heading', { level: 1, name: words })).toBeVisible();
  await page.goBack();
  // The question's own words link the stored note; Home also names the note it is about (TL-P2-40), the same note.
  await expect(question.getByRole('link', { name: 'Flat 3, 12 Larkspur Lane' })).toHaveCount(2);
  await question.getByRole('link', { name: 'Flat 3, 12 Larkspur Lane' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Flat 3, 12 Larkspur Lane' })).toBeVisible();
  await page.goBack();

  // Answering it takes it off Home; the next tidy-up drops it from Bower's list for good.
  await question.getByRole('button', { name: 'Yes, £1,550' }).click();
  await expect(question).toHaveCount(0);
  await page.getByRole('button', { name: /Let Bower read (it|them) now/ }).click();
  await closeWhenDone(page);
  const asked = (): Promise<string> => page.evaluate(() => {
    const kept = JSON.parse(sessionStorage.getItem('bower:fake:empty') ?? '{"files":[]}') as { files: Array<{ meta: { name: string }; trashed: boolean; content: unknown }> };
    return kept.files.filter((f) => !f.trashed && f.meta.name === 'questions.json').map((f) => JSON.stringify(f.content)).join('');
  });
  await expect.poll(asked).not.toContain('says the rent is');
  expect(await asked()).toContain('questions');
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByText('says the rent is £1,550')).toHaveCount(0);

  // The answer is recorded on the stored note's Timeline (TL-P2-40); its Current state is unchanged.
  await goNote(page, 'Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md');
  await expect(lineOf(page, 'You said the rent is now £1,550.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Current state' })).not.toContainText('£1,550');
});

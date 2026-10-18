/**
 * One scripted journey per capability (TL-P2-38, TL-P2-40): the app asks,
 * the tidy-up changes real notes, and the app shows the result with links to
 * them. `run-result-links` runs on demo and fake; the C04, C05 and C11
 * journeys run on the pretend Drive, where the effects are files.
 */
import { expectAxeClean } from './axe';
import type { Locator, Page } from '@playwright/test';
import { expect, isFake, test } from './fixtures';

const NOTE_WORDS = 'Ask the landlord about the heating';
const HUB_LINE = 'A new listing added to the shortlist.';
const MERGE_LINE = 'The Wrenfield Road listing is the same building; kept here, as you asked.';
const MERGED_INTO = 'Flat 3, 12 Larkspur Lane';

const open = async (page: Page, path: string, scenario = 'empty', time = 'instant'): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=${scenario}&time=${time}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};
const inbox = (page: Page) => page.getByRole('region', { name: 'Inbox' });
const home = (page: Page) => page.getByRole('link', { name: /^Home/ }).first().click();
const timeline = (page: Page) => page.getByRole('region', { name: 'Timeline' }).getByRole('listitem');
/** The answered rows' own label (TL-P4-19 addendum 11). */
const ANSWERED_LABEL = 'Answers Bower could not act on';
/** The answered rows sit in their own labelled list, never under "Brought up to date", and pass axe (WCAG 2.2, target size). */
async function answeredListed(page: Page, within: Locator, selector: string, rows: readonly string[]): Promise<void> {
  const list = within.getByRole('list', { name: ANSWERED_LABEL });
  for (const row of rows) await expect(list.getByText(row, { exact: true })).toBeVisible();
  const updated = within.getByRole('list', { name: 'Brought up to date' });
  for (const row of rows) await expect(updated.getByText(row, { exact: true })).toHaveCount(0);
  await expectAxeClean(page, { include: selector, wcag22: true });
}
const FAKE_ONLY = 'the journey checks what the tidy-up wrote into the pretend Drive (TL-P2-40)';

/** Puts a note with no things in the inbox, from Add. */
async function addNote(page: Page, words: string): Promise<void> {
  await open(page, '/add');
  await page.getByRole('textbox', { name: 'What is this?' }).fill(words);
  await page.getByRole('button', { name: 'Add to the inbox' }).click();
  await expect(inbox(page).getByRole('link', { name: new RegExp(words) })).toBeVisible();
}

/** Tidies up from Home and waits, with the sheet open, for the result. */
async function tidyUp(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Tidy up \d+ things?$/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up \d+ things?$/ }).click();
  await expect(page.getByRole('dialog').getByText(/^Done\./).last()).toBeVisible({ timeout: 20_000 });
}

test('the result links what it made', async ({ page }) => {
  test.setTimeout(60_000);
  await addNote(page, NOTE_WORDS);
  await tidyUp(page);
  const sheet = page.getByRole('dialog');
  const made = sheet.getByRole('list', { name: 'New notes' });
  const updated = sheet.getByRole('list', { name: 'Brought up to date' });
  await expect(made.getByRole('link', { name: NOTE_WORDS, exact: true })).toBeVisible();
  await expect(updated.getByRole('link')).toHaveText(['Flat hunt', 'Job hunt']);
  // A link opens its note and closes the sheet.
  await updated.getByRole('link', { name: 'Flat hunt', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Flat hunt' })).toBeVisible();
  // Home's result card lists the same links until it is put away.
  await page.getByRole('link', { name: /^Home/ }).first().click();
  const card = page.getByRole('region', { name: /filed/ });
  await expect(card.getByRole('list', { name: 'New notes' }).getByRole('link')).toHaveText([NOTE_WORDS]);
  await expect(card.getByRole('list', { name: 'Brought up to date' }).getByRole('link')).toHaveText(['Flat hunt', 'Job hunt']);
  await card.getByRole('link', { name: NOTE_WORDS, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: NOTE_WORDS })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Written from a note you added.');
});

test('the result links what it made, once: a second tidy-up lists only the note it changed', async ({ page }) => {
  test.setTimeout(90_000);
  await addNote(page, NOTE_WORDS);
  await tidyUp(page);
  await expect(page.getByRole('dialog').getByRole('list', { name: 'Brought up to date' }).getByRole('link')).toHaveText(['Flat hunt', 'Job hunt']);
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // A second tidy-up: the thing a question is about arrives, and the answer is Yes.
  await addLink(page, 'listing-88213.example');
  const question = page.getByRole('region', { name: /questions? for you/ }).getByRole('listitem').filter({ hasText: 'Keep one note for both?' });
  await question.getByRole('button', { name: 'Yes, merge' }).click();
  await expect(question).toHaveCount(0);
  await tidyUp(page);
  // Only the note this run changed is listed: the project notes already hold their lines, and get none again.
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('list', { name: 'Brought up to date' }).getByRole('link')).toHaveText([MERGED_INTO]);
  await expect(sheet.getByRole('list', { name: 'New notes' })).toHaveCount(0);
  await sheet.getByRole('link', { name: MERGED_INTO, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: MERGED_INTO })).toBeVisible();
  await expect(timeline(page).filter({ hasText: MERGE_LINE })).toHaveCount(1);
  // Its project note, reached through its folder (a new address would start the demo afresh).
  await page.getByRole('main').getByRole('link', { name: 'Projects / Flat hunt', exact: true }).click();
  // The folder's own note, shown at the top of its folder by its summary.
  await page.getByRole('main').locator('a[href="/note/Projects/Flat%20hunt/Flat%20hunt.md"]').first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Flat hunt' })).toBeVisible();
  await expect(timeline(page).filter({ hasText: HUB_LINE })).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Timeline' }).getByText('New', { exact: true })).toHaveCount(0);
});

/** Puts a pasted link in the inbox, from Add, reached inside the app so nothing waiting is cut short by a reload. */
async function addLink(page: Page, address: string): Promise<void> {
  await home(page);
  await inbox(page).getByRole('button', { name: 'Add a pile' }).click();
  await page.getByRole('textbox', { name: 'Paste a link' }).fill(address);
  await page.getByRole('button', { name: 'Add link' }).click();
  await page.getByRole('button', { name: 'Add 1 thing to the inbox' }).click();
  await expect(inbox(page).getByRole('link', { name: new RegExp(address.replace(/\./g, '\\.')) })).toBeVisible();
}

test('C04: a note added to the inbox becomes a note reached by a link', async ({ page, context }) => {
  test.skip(!isFake, FAKE_ONLY);
  test.setTimeout(60_000);
  // The saved page is never fetched: the web is answered here, so following the link stays offline.
  await context.route('https://curry-clipping.example/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>A saved page</title>' }));
  await addNote(page, NOTE_WORDS);
  await addLink(page, 'curry-clipping.example');
  await tidyUp(page);
  // The result links the note written from your words; it holds them, and says where they came from.
  await page.getByRole('dialog').getByRole('list', { name: 'New notes' }).getByRole('link', { name: NOTE_WORDS, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: NOTE_WORDS })).toBeVisible();
  await expect(page.getByRole('main').getByText(NOTE_WORDS, { exact: true }).first()).toBeVisible();
  await expect(timeline(page)).toHaveCount(1);
  await expect(timeline(page).first()).toContainText('Written from a note you added.');
  // The saved link got its own note, filed where it belongs and listed with the new notes; its Source opens the saved page.
  await home(page);
  const linkNote = page.getByRole('region', { name: /filed/ }).getByRole('list', { name: 'New notes' }).getByRole('link', { name: 'Weeknight curry, clipping', exact: true });
  await expect(linkNote).toBeVisible();
  await linkNote.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Weeknight curry, clipping' })).toBeVisible();
  const saved = timeline(page).filter({ hasText: 'Saved by you, filed by Bower.' });
  const source = saved.getByRole('link', { name: 'curry-clipping.example', exact: true });
  await expect(source).toHaveAttribute('href', 'https://curry-clipping.example');
  const [opened] = await Promise.all([page.waitForEvent('popup'), source.click()]);
  await expect(opened).toHaveURL('https://curry-clipping.example/');
});

test('C05: a tidy-up brings a project note up to date', async ({ page }) => {
  test.skip(!isFake, FAKE_ONLY);
  test.setTimeout(60_000);
  const LINE = HUB_LINE;
  // The project note as it is before the tidy-up: its words and its timeline.
  await open(page, '/note/Projects/Flat%20hunt/Flat%20hunt.md');
  await expect(page.getByRole('heading', { level: 1, name: 'Flat hunt' })).toBeVisible();
  const before = { words: await page.locator('article [class*="_body_"]').innerText(), lines: await timeline(page).allInnerTexts() };
  expect(before.lines.length).toBeGreaterThan(0);
  expect(before.lines.join('\n')).not.toContain(LINE);
  await home(page);
  await addNote(page, NOTE_WORDS);
  await tidyUp(page);
  await page.getByRole('dialog').getByRole('list', { name: 'Brought up to date' }).getByRole('link', { name: 'Flat hunt', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Flat hunt' })).toBeVisible();
  // One new line, marked New, after the earlier ones, which are as they were; so are the note's own words.
  await expect(timeline(page)).toHaveCount(before.lines.length + 1);
  const added = timeline(page).last();
  await expect(added).toContainText(LINE);
  await expect(added.getByText('New', { exact: true })).toBeVisible();
  expect((await timeline(page).allInnerTexts()).slice(0, before.lines.length)).toEqual(before.lines);
  await expect(page.getByRole('region', { name: 'Timeline' }).getByText('New', { exact: true })).toHaveCount(1);
  expect(await page.locator('article [class*="_body_"]').innerText()).toBe(before.words);
});

test('C11: a kept rule and a merge answer are applied', async ({ page }) => {
  test.skip(!isFake, FAKE_ONLY);
  test.setTimeout(90_000);
  const RULE = 'anything from the dentist goes in health';
  const WORDED = 'Letters, reminders and invoices from the dentist go to Areas / Health; add the appointment date to Health.';
  const NOTE = MERGED_INTO;
  await open(page, '/');
  // The question links the note it is about.
  const question = page.getByRole('region', { name: /questions? for you/ }).getByRole('listitem').filter({ hasText: 'Keep one note for both?' });
  const about = question.getByRole('link', { name: NOTE, exact: true });
  await expect(about).toBeVisible();
  await about.click();
  await expect(page.getByRole('heading', { level: 1, name: NOTE })).toBeVisible();
  await expect(timeline(page).filter({ hasText: MERGE_LINE })).toHaveCount(0);
  // A rule, kept: it waits for the next tidy-up at once, in your words.
  await page.getByRole('link', { name: /^Ask$/ }).first().click();
  await page.getByRole('radio', { name: 'A rule' }).click();
  await page.getByRole('button', { name: RULE }).click();
  await page.getByRole('button', { name: 'Keep this rule' }).click();
  const rules = page.getByRole('main').getByRole('listitem').filter({ hasText: RULE });
  await expect(rules.getByText('Waiting for the next tidy-up, where Bower words it clearly.')).toBeVisible();
  // The thing the question is about arrives, and the answer is Yes: it waits for the next tidy-up at once.
  await addLink(page, 'listing-88213.example');
  await question.getByRole('button', { name: 'Yes, merge' }).click();
  await expect(page.getByRole('status').getByText('You chose "Yes, merge". Bower does it in the next tidy-up.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Since the last tidy-up' })).toContainText('Answered "Yes, merge" to a question');
  await expect(question).toHaveCount(0);
  await tidyUp(page);
  // The result links the note the thing joined; it holds the merge line once, marked New.
  const joined = page.getByRole('dialog').getByRole('list', { name: 'Brought up to date' }).getByRole('link', { name: NOTE, exact: true });
  await expect(joined).toBeVisible();
  await joined.click();
  await expect(page.getByRole('heading', { level: 1, name: NOTE })).toBeVisible();
  const merged = timeline(page).filter({ hasText: MERGE_LINE });
  await expect(merged).toHaveCount(1);
  await expect(merged.getByText('New', { exact: true })).toBeVisible();
  // The question stays gone; the rule is in Bower's words with yours kept.
  await home(page);
  await expect(page.getByRole('heading', { level: 1, name: /G'day/ })).toBeVisible();
  await expect(page.getByText('Keep one note for both?')).toHaveCount(0);
  await page.getByRole('link', { name: /^Ask$/ }).first().click();
  const worded = page.getByRole('main').getByRole('listitem').filter({ hasText: WORDED });
  await expect(worded).toContainText(`: '${RULE}'`);
  await expect(worded).toContainText('From what you wrote on ');
  await expect(page.getByText('Waiting for the next tidy-up, where Bower words it clearly.')).toHaveCount(0);
});

test('write it shows the state written, re-asks on a clash and settles as an answered row', async ({ page }) => {
  test.skip(!isFake, FAKE_ONLY);
  test.setTimeout(120_000);
  // The write-it situation: Money's and Car's Current states were changed by hand since Bower wrote them, and the
  // scripted tidy-up has an update for each (TL-P4-19 addendum 13).
  const MONEY_UPDATE = 'October is on budget so far.';
  const CAR = 'Areas/Car/Car.md';
  const CAR_NOW = '- Insurance runs until 30 June.\n- MOT due in January.';
  const CAR_UPDATE = '- Insurance runs until 30 June.\n- MOT booked for 14 January.';
  const REASK = 'The current state of Car changed after Bower showed you its update, so nothing was written. Should Bower write its update there now?';
  const NOTHING = 'Nothing to write: Car already said what Bower would have written.';
  const editElsewhere = (from: string, to: string): Promise<void> => page.evaluate(async ([path, a, b]) => {
    await (window as unknown as { __editElsewhere: (p: string, x: string, y: string) => Promise<void> }).__editElsewhere(path, a, b);
  }, [CAR, from, to] as const);
  await open(page, '/', 'write-it');
  await tidyUp(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const questions = page.getByRole('region', { name: /questions? for you/ });
  const asked = (text: string): Locator => questions.getByRole('listitem').filter({ hasText: text });
  // Write it: the update Bower showed is written into Money's Current state.
  const money = asked('You changed the current state of Money.');
  // The card shows Bower's update, every line, under its own label, and passes axe (TL-P4-19 addendum 17).
  const update = money.getByRole('list', { name: "Bower's update" });
  await expect(update.getByRole('listitem')).toHaveText([MONEY_UPDATE, 'Receipts are filed by month, as your rule says.']);
  const questionsHeading = await questions.getAttribute('aria-labelledby');
  expect(questionsHeading).toBeTruthy();
  await expectAxeClean(page, { include: `section[aria-labelledby="${questionsHeading}"]`, wcag22: true });
  await money.getByRole('button', { name: 'Write it' }).click();
  await expect(money).toHaveCount(0);
  await page.getByRole('region', { name: 'Recent' }).getByRole('link', { name: /^Money/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Money' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Current state' })).toContainText(MONEY_UPDATE, { timeout: 20_000 });
  await home(page);
  // Car changes on another device after Bower showed its update: Write it writes nothing and asks again, saying why.
  await editElsewhere('- [ ] Check the tyres before winter', '- [x] Check the tyres before winter');
  const car = asked('You changed the current state of Car.');
  await car.getByRole('button', { name: 'Write it' }).click();
  await expect(car).toHaveCount(0);
  const again = asked(REASK);
  await expect(again).toBeVisible({ timeout: 20_000 });
  // The person types Bower's update into Car themselves, then says Write it: nothing to write. It settles as one
  // answered row on the note, in its own labelled list, and is not counted as set aside.
  await editElsewhere(CAR_NOW, CAR_UPDATE);
  await again.getByRole('button', { name: 'Write it' }).click();
  await expect(again).toHaveCount(0);
  await page.getByRole('region', { name: 'Recent' }).getByRole('link', { name: /^Car/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Car' })).toBeVisible();
  const main = page.getByRole('main');
  await expect(main.getByText(NOTHING, { exact: true })).toBeVisible({ timeout: 20_000 });
  await answeredListed(page, main, 'main', [NOTHING]);
  await expect(main).not.toContainText('set aside');
  await expect(page.getByRole('region', { name: 'Current state' })).toContainText('MOT booked for 14 January.');
});

test('a clash at write time leads to the re-ask with the new sentence and no extra press', async ({ page, allowConsole }) => {
  test.skip(!isFake, FAKE_ONLY);
  test.setTimeout(120_000);
  // The write's own fence refuses it, and says so in the log: that is the clash this test makes.
  allowConsole(/Refused a write to target \w+: modified/, 'the write-time clash this test makes');
  allowConsole(/This changed somewhere else while Bower was tidying/, 'the write-time clash this test makes');
  // TL-P4-19 addendum 15: Money changes on another device right before Bower's write is sent. Nothing is written, and
  // the question comes back in the one re-ask wording with no other press.
  const MONEY = 'Areas/Money/Money.md';
  const REASK = 'The current state of Money changed after Bower showed you its update, so nothing was written. Should Bower write its update there now?';
  await open(page, '/', 'write-it');
  await tidyUp(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const questions = page.getByRole('region', { name: /questions? for you/ });
  const asked = (text: string): Locator => questions.getByRole('listitem').filter({ hasText: text });
  await page.evaluate(async ([path, a, b]) => {
    (window as unknown as { __editAtWrite: (p: string, x: string, y: string) => void }).__editAtWrite(path, a, b);
  }, [MONEY, 'for the monthly plan.', 'for the yearly plan.'] as const);
  const money = asked('You changed the current state of Money.');
  await money.getByRole('button', { name: 'Write it' }).click();
  await expect(money).toHaveCount(0);
  await expect(asked(REASK)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('region', { name: 'Recent' }).getByRole('link', { name: /^Money/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Money' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('for the yearly plan.');
  await expect(page.getByRole('region', { name: 'Current state' })).not.toContainText('October is on budget so far.');
});

test('a refused merge shows as an answered row on the note that stays and under the Home result, and is not counted as set aside', async ({ page }) => {
  test.skip(!isFake, FAKE_ONLY);
  test.setTimeout(90_000);
  // The gone-answers situation: three yes answers wait whose subjects went to the Bin since (TL-P4-19 addendum 10).
  const PAIR = 'Not merged: Flat 2, 40 Tanners Walk was already in the Bin.';
  const ASKED = 'Not done: Kitchen photo had moved or gone to the Bin before Bower got to it.';
  const STATE = 'Not written: Weeknight curry had moved or gone to the Bin before Bower got to it.';
  const STAYS = 'Flat 7, Cobble Row';
  await open(page, '/', 'gone-answers');
  // A question whose subject is gone is not shown.
  await expect(page.getByRole('heading', { level: 1, name: /G'day/ })).toBeVisible();
  await expect(page.getByText('look like one flat')).toHaveCount(0);
  await tidyUp(page);
  const sheet = page.getByRole('dialog');
  for (const row of [PAIR, ASKED, STATE]) await expect(sheet.getByText(row, { exact: true })).toBeVisible();
  await answeredListed(page, sheet, 'dialog, [role="dialog"]', [PAIR, ASKED, STATE]);
  await expect(sheet).not.toContainText('set aside');
  // The note that stays says so too.
  await sheet.getByRole('list', { name: 'Brought up to date' }).getByRole('link', { name: 'Flat hunt', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Flat hunt' })).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Projects / Flat hunt', exact: true }).click();
  await page.getByRole('main').getByRole('link', { name: new RegExp(`^${STAYS} Changed`) }).click();
  await expect(page.getByRole('heading', { level: 1, name: STAYS })).toBeVisible();
  await expect(page.getByRole('main').getByText(PAIR, { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByText(ASKED, { exact: true })).toHaveCount(0);
  // Home's result lists all three, in one list, and counts none of them as set aside.
  await home(page);
  const card = page.getByRole('region', { name: /things? filed/ });
  for (const row of [PAIR, ASKED, STATE]) await expect(card.getByText(row, { exact: true })).toBeVisible();
  await answeredListed(page, card, 'main', [PAIR, ASKED, STATE]);
  await expect(card).not.toContainText('set aside');
});

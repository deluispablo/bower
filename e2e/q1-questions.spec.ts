import type { Locator, Page } from '@playwright/test';
import type { Pile, Question, RunReport, RunState } from '../src/data/contracts/types';
import type { QuestionAnswer } from '../src/data/contracts/questions';
import { expect, test } from './fixtures';
import { animationsEnd, expectAxeClean } from './axe';
import { resize } from './viewport';

const AT = 1_800_000_000_000;
const ASK = 'Where should these papers go?';
const OPTIONS = [{ id: 'home-folder', label: 'Areas / Home' }, { id: 'garden-folder', label: 'Projects / Garden' }];
const EXHAUSTED = "Bower couldn't place this. Tell it more in the pile's words, or move it yourself.";
const WAITS = 'You chose "Areas / Home". Bower will do this as soon as the current tidy-up ends.';
const question = (extra: Partial<Question> = {}): Question => ({ id: 'q-ask-paper', subject: 'paper', text: ASK,
  yes: 'File them', no: 'Leave them', askedAt: AT, options: OPTIONS, ...extra });
const paper: Pile = { id: 'paper', path: 'Inbox/Papers', text: 'Papers from Alex', createdAt: AT,
  items: [{ id: 'letter', name: 'letter.pdf', kind: 'pdf', origin: 'From this computer' }] };
type AnswerRecord = { id: string; value: QuestionAnswer };
type BrowserFixture = { answers: () => AnswerRecord[]; failNext: () => void; finish: () => void };

/** Existing served-module fixture pattern (c05-person-notes/request-report-hidden), layered over each real boot. */
async function openFixture(page: Page, source: 'demo' | 'fake', qs: Question[] = [question()], tall = false): Promise<void> {
  const report: RunReport = { filed: [], created: tall ? Array.from({ length: 28 }, (_, i) => ({
    path: `Areas/Home/Papers ${i + 1}.md`, what: `Made from the papers Alex added, group ${i + 1}`,
  })) : [], updated: [{ path: 'Areas/Home/Papers.md', what: 'Papers received' }], setAside: [], questions: [] };
  const run: RunState = { id: 'q1-run', scope: 'all', phase: 'reading', requestedAt: AT, phaseAt: AT + 100, total: 1, seen: false };
  await page.route('**/src/data/choose.ts*', async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    const renamed = original.replace(/\bbuildSources\b/g, 'q1OriginalSources');
    expect(renamed).not.toBe(original);
    const body = `${renamed}\n
      import { BowerError as Q1FixtureError } from '/src/data/types.ts';
      export async function buildSources(...args) {
        const result = await q1OriginalSources(...args);
        const base = result.sources;
        const listeners = new Set();
        const notify = () => { for (const cb of listeners) cb(); };
        let open = ${JSON.stringify(qs)};
        let piles = [${JSON.stringify(paper)}, { ...${JSON.stringify(paper)}, id: 'exhausted-paper', text: 'Unplaced papers', question: 'exhausted' }];
        let run = null;
        let fail = false;
        const answers = [];
        window.__q1Fixture = {
          answers: () => structuredClone(answers), failNext: () => { fail = true; },
          finish: () => { run = { ...run, phase: 'done', phaseAt: ${AT + 5000}, finishedAt: ${AT + 5000},
            report: { ...${JSON.stringify(report)}, questions: [...open] } }; notify(); }
        };
        const methods = {
          tree: async () => [], piles: async () => piles.map((p) => p.id === 'paper' ? { ...p, question: open.some((q) => q.subject === 'paper') ? 'waiting' : undefined } : p), pilesListed: async () => null,
          questions: async () => open, changes: async () => [], suggestions: async () => [], uploadNotice: async () => null,
          answer: async (id, value) => {
            if (fail) { fail = false; throw new Q1FixtureError('offline', 'That answer did not save. Try again.'); }
            answers.push({ id, value }); open = open.filter((q) => q.id !== id); notify();
          },
          updatePile: async (id, text) => { piles = piles.map((p) => p.id === id ? { ...p, text: text.trim(), question: undefined } : p); notify(); },
          subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); }
        };
        const vault = new Proxy(base.vault, { get: (target, key) => key in methods ? methods[key] :
          typeof target[key] === 'function' ? target[key].bind(target) : target[key] });
        const runs = { ...base.runs, current: async () => run,
          start: async (_scope, opts) => {
            if (opts?.answer && run && !['done', 'failed'].includes(run.phase)) return { ...run, waits: true };
            run = ${JSON.stringify(run)}; notify(); return run;
          },
          markSeen: async () => { run = { ...run, seen: true }; notify(); },
          subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); }
        };
        return { ...result, sources: { ...base, vault, runs } };
      }`;
    await route.fulfill({ response, body, contentType: 'text/javascript' });
  });
  await page.goto(`/?source=${source}&scenario=empty&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0);
  // Positive control in every e2e: the original demo/fake initialized and Home's existing Inbox loaded.
  await expect(page.getByRole('heading', { level: 1, name: /G'day, Alex/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Inbox', exact: true }).getByRole('link', { name: /Papers from Alex/ })).toBeVisible();
  await expect(page.getByRole('main').getByText(ASK, { exact: true })).toBeVisible();
}
const homeCard = (page: Page): Locator => page.getByRole('main').getByRole('listitem').filter({ has: page.getByText(ASK, { exact: true }) });
const sheetCard = (page: Page): Locator => page.getByRole('dialog').getByRole('listitem').filter({ has: page.getByText(ASK, { exact: true }) });
async function start(page: Page): Promise<Locator> {
  await page.getByRole('main').getByRole('button', { name: /^Tidy up \d+ things?$/, exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: /^Tidy up \d+ things?$/, exact: true }).click();
  await expect(sheet).toHaveAccessibleName('Reading 1 thing');
  await expect(sheet.getByText('Writing your notes', { exact: true })).toBeVisible();
  await expect(sheet.getByText(/^Started /)).toBeVisible();
  return sheet;
}
async function answerRecords(page: Page): Promise<AnswerRecord[]> {
  return page.evaluate(() => (window as unknown as { __q1Fixture: BrowserFixture }).__q1Fixture.answers());
}
async function uniqueLabels(page: Page): Promise<void> {
  const ids = await page.locator('[id]').evaluateAll((els) => els.map((el) => el.id));
  expect(new Set(ids).size).toBe(ids.length);
  const fields = await page.locator('textarea').evaluateAll((els) => els.map((el) => ({
    id: el.id, labels: [...(el as HTMLTextAreaElement).labels ?? []].map((label) => label.textContent),
    described: (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id)?.textContent),
  })));
  expect(fields.length).toBeGreaterThan(0);
  for (const field of fields) {
    expect(field.id).not.toBe(''); expect(field.labels).toEqual(['In your own words']);
    for (const description of field.described) expect(description).toBe('Use 1,000 characters at most.');
  }
}
async function stack(card: Locator): Promise<void> {
  const buttons = card.getByRole('button');
  await expect(buttons).toHaveText([...OPTIONS.map((o) => o.label), 'Something else…']);
  const measured = await buttons.evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect(); const style = getComputedStyle(el);
    return { x: r.x, y: r.y, width: r.width, bottom: r.bottom, align: style.textAlign, cls: el.className,
      tag: el.tagName, height: r.height, coarse: matchMedia('(pointer: coarse)').matches };
  }));
  expect(measured).toHaveLength(3);
  for (const item of measured) {
    expect(item.tag).toBe('BUTTON'); expect(item.cls).toContain('ghost'); expect(item.cls).toContain('small'); expect(item.cls).not.toContain('primary');
    expect(item.align).toBe('left'); expect(item.x).toBeCloseTo(measured[0].x, 0);
    expect(item.width).toBeCloseTo(measured[0].width, 0);
    if (item.coarse) expect(item.height).toBeGreaterThanOrEqual(44);
  }
  expect(measured[1].y - measured[0].bottom).toBeCloseTo(8, 0);
  expect(measured[2].y - measured[1].bottom).toBeCloseTo(8, 0);
  const innerWidth = await card.evaluate((el) => {
    const style = getComputedStyle(el);
    return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  });
  expect(measured[0].width).toBeCloseTo(innerWidth, 0);
  const paragraph = await card.locator('p').first().boundingBox();
  expect(paragraph).not.toBeNull();
  expect(measured[0].y - ((paragraph?.y ?? 0) + (paragraph?.height ?? 0))).toBeCloseTo(10, 0);
  await tokenColor(buttons.last(), '--brand-line');
}


async function tokenColor(element: Locator, token: string, property: 'color' | 'backgroundColor' = 'color'): Promise<void> {
  const colors = await element.evaluate((el, args) => {
    const style = getComputedStyle(el);
    const probe = document.createElement('span');
    probe.style.color = style.getPropertyValue(args.token).trim(); el.append(probe);
    const expected = getComputedStyle(probe).color; probe.remove();
    return { actual: style[args.property], expected };
  }, { token, property });
  expect(colors.actual).toBe(colors.expected);
}
async function nativeTargets(card: Locator): Promise<void> {
  const controls = await card.getByRole('button').evaluateAll((els) => els.map((el) => ({
    tag: el.tagName, height: el.getBoundingClientRect().height, coarse: matchMedia('(pointer: coarse)').matches,
  })));
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) {
    expect(control.tag).toBe('BUTTON');
    if (control.coarse) expect(control.height).toBeGreaterThanOrEqual(44);
  }
}

for (const source of ['demo', 'fake'] as const) {
  for (const width of [375, 1440]) {
    test(`Q1b Home options, keyboard text, Cancel, limit and WCAG 2.2 (${source}, ${width})`, async ({ page }) => {
      await resize(page, { width, height: 900 });
      await openFixture(page, source);
      const card = homeCard(page);
      await stack(card);
      const waiting = page.getByRole('region', { name: 'Inbox', exact: true }).getByRole('link', { name: /Papers from Alex/ }).getByText('Waiting for your answer', { exact: true });
      await expect(waiting).toBeVisible(); await tokenColor(waiting, '--accent-line');
      await expectAxeClean(page, { include: 'main', wcag22: true });
      const other = card.getByRole('button', { name: 'Something else…', exact: true });
      await other.focus(); await page.keyboard.press('Enter');
      const field = card.getByRole('textbox', { name: 'In your own words', exact: true });
      await expect(field).toBeFocused();
      await expect(card.getByRole('button', { name: 'Tell Bower' })).toBeDisabled();
      await expect(card.getByRole('button', { name: OPTIONS[0].label })).toHaveCount(0);
      await field.fill('  \n '); await expect(card.getByRole('button', { name: 'Tell Bower' })).toBeDisabled();
      await field.fill(`  ${'x'.repeat(1000)}  `); await expect(card.getByRole('button', { name: 'Tell Bower' })).toBeEnabled();
      await expect(field).not.toHaveAttribute('maxlength');
      await field.fill('x'.repeat(1001)); await expect(field).toHaveValue('x'.repeat(1001));
      await expect(card.getByRole('button', { name: 'Tell Bower' })).toBeDisabled();
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(card.getByText('Use 1,000 characters at most.', { exact: true })).toBeVisible();
      await uniqueLabels(page); await nativeTargets(card);
      await expectAxeClean(page, { include: 'main', wcag22: true });
      await card.getByRole('button', { name: 'Cancel' }).focus(); await page.keyboard.press('Enter');
      await expect(other).toBeFocused(); await stack(card);
      await other.press('Enter'); await expect(field).toBeFocused();
      await field.fill('  Papers for the garden  ');
      await page.keyboard.press('Tab'); await expect(card.getByRole('button', { name: 'Tell Bower' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(card).toHaveCount(0);
      expect(await answerRecords(page)).toEqual([{ id: 'q-ask-paper', value: { text: 'Papers for the garden' } }]);
      await expect(page.getByText('You chose "your words". Bower is doing it now.', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    });

    test(`Q1b Yes/no keeps its row with Something else below (${source}, ${width})`, async ({ page }) => {
      await resize(page, { width, height: 900 });
      await openFixture(page, source, [question({ options: undefined })]);
      const card = homeCard(page);
      const yes = card.getByRole('button', { name: 'File them', exact: true });
      const no = card.getByRole('button', { name: 'Leave them', exact: true });
      const other = card.getByRole('button', { name: 'Something else…', exact: true });
      await expect(yes).toHaveClass(/primary/); await expect(no).toHaveClass(/ghost/);
      await expect(other).toHaveClass(/ghost/); await nativeTargets(card);
      const y = await yes.boundingBox(); const n = await no.boundingBox(); const o = await other.boundingBox();
      expect(y).not.toBeNull(); expect(n).not.toBeNull(); expect(o).not.toBeNull();
      expect(y?.y).toBeCloseTo(n?.y ?? 0, 0);
      expect((o?.y ?? 0) - Math.max((y?.y ?? 0) + (y?.height ?? 0), (n?.y ?? 0) + (n?.height ?? 0))).toBeCloseTo(8, 0);
      const fullWidth = await card.evaluate((el) => { const style = getComputedStyle(el); return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight); });
      expect(o?.width).toBeCloseTo(fullWidth, 0);
      await other.press('Enter'); await expect(card.getByRole('textbox', { name: 'In your own words' })).toBeFocused();
      await card.getByRole('button', { name: 'Cancel' }).click(); await expect(other).toBeFocused();
      await expect(yes).toBeVisible(); await expect(no).toBeVisible();
      await expectAxeClean(page, { include: 'main', wcag22: true });
    });

    test(`Q1b Run window, more link, shared cards, next focus and waits message (${source}, ${width})`, async ({ page }) => {
      await resize(page, { width, height: 900 });
      await openFixture(page, source, [question({ id: 'q-ask-later', subject: 'later', text: 'Later asking', askedAt: AT + 1 }),
        question({ id: 'q-ask-old', subject: 'old', text: 'Old asking', askedAt: AT - 1 }), question()]);
      const sheet = await start(page);
      await expect(sheet.getByText('Bower has a question', { exact: true })).toBeVisible();
      await expect(sheet.getByText('Bower has a question', { exact: true })).toHaveClass(/linksLabel/);
      await expect(sheet.getByText('Old asking', { exact: true })).toHaveCount(0);
      await expect(sheet.getByText('Later asking', { exact: true })).toHaveCount(0);
      const more = sheet.getByRole('link', { name: '1 more question on Home', exact: true });
      await expect(more).toBeVisible();
      const card = sheetCard(page); await stack(card); await tokenColor(card, '--bg', 'backgroundColor');
      const ordering = await card.evaluate((el) => {
        const steps = el.closest('[role="dialog"]')?.querySelector('ol');
        return !!steps && !!(el.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      expect(ordering).toBe(true);
      await expectAxeClean(page, { include: '[role="dialog"]', wcag22: true });
      await card.getByRole('button', { name: OPTIONS[0].label }).press('Enter');
      await expect(card).toHaveCount(0);
      await expect(sheet.getByRole('button', { name: OPTIONS[0].label })).toBeFocused();
      await expect(more).toHaveCount(0);
      await expect(page.getByText(WAITS, { exact: true })).toHaveCount(0);
      await sheet.getByRole('button', { name: OPTIONS[1].label }).press('Enter');
      await expect(sheet.getByText('Later asking', { exact: true })).toHaveCount(0);
      await expect(sheet.getByRole('heading', { name: 'Reading 1 thing', exact: true })).toBeFocused();
      await expect(sheet.getByRole('heading', { name: 'Reading 1 thing', exact: true })).toHaveAttribute('tabindex', '-1');
      await expect(page.getByText(WAITS, { exact: true })).toHaveCount(0);
      await page.keyboard.press('Escape'); await expect(sheet).toHaveCount(0);
      await expect(page.getByText(WAITS, { exact: true })).toHaveCount(1);
      await expect(page.getByText('You chose "Projects / Garden". Bower will do this as soon as the current tidy-up ends.', { exact: true })).toHaveCount(1);
      await expect(page.getByRole('main').getByText(ASK, { exact: true })).toHaveCount(0);
      await expect(page.getByRole('main').getByText('Later asking', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('main').getByText('Old asking', { exact: true })).toBeVisible();
      expect(await answerRecords(page)).toEqual([{ id: 'q-ask-paper', value: { option: 'home-folder' } },
        { id: 'q-ask-later', value: { option: 'garden-folder' } }]);
      await expectAxeClean(page, { include: 'main', wcag22: true });
    });

    test(`Q1b More questions navigates from a pile to Home and closes (${source}, ${width})`, async ({ page }) => {
      await resize(page, { width, height: 900 });
      await openFixture(page, source, [question(), question({ id: 'q-ask-next', subject: 'next', text: 'Next asking', askedAt: AT + 1 })]);
      await start(page); await page.keyboard.press('Escape');
      await page.getByRole('main').getByRole('link', { name: /Papers from Alex/ }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Papers from Alex', exact: true })).toBeVisible();
      // The existing run chip opens the same sheet on this screen at either width.
      await page.getByRole('button', { name: /Reading 1 thing/ }).first().click();
      const sheet = page.getByRole('dialog');
      await expect(sheet.getByText(ASK, { exact: true })).toBeVisible();
      await sheet.getByRole('link', { name: '1 more question on Home', exact: true }).click();
      await expect(sheet).toHaveCount(0);
      expect(new URL(page.url()).pathname).toBe('/');
      await expect(page.getByRole('heading', { level: 1, name: /G'day, Alex/ })).toBeVisible();
      await expect(homeCard(page)).toBeVisible();
    });

    test(`Q1b Sheet text failure retains draft, unique ids across cards and WCAG 2.2 (${source}, ${width})`, async ({ page, allowConsole }) => {
      allowConsole(/That answer did not save/, 'the fixture refuses one answer save');
      await resize(page, { width, height: 900 });
      await openFixture(page, source, [question({ shown: { lines: ['Papers arrived.'], md5: '0'.repeat(32) } })]);
      const home = homeCard(page);
      await home.getByRole('button', { name: 'Something else…' }).click();
      await home.getByRole('textbox', { name: 'In your own words' }).fill('x'.repeat(1001));
      const sheet = await start(page);
      await expect(sheetCard(page).getByRole('list', { name: "Bower's update" })).toHaveText('Papers arrived.');
      await sheetCard(page).getByRole('button', { name: 'Something else…' }).press('Enter');
      const field = sheet.getByRole('textbox', { name: 'In your own words' });
      await expect(field).toBeFocused(); await field.fill('x'.repeat(1001));
      await expect(sheet.getByRole('button', { name: 'Tell Bower' })).toBeDisabled();
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(field).not.toHaveAttribute('maxlength');
      await expect(page.locator('textarea')).toHaveCount(2);
      await uniqueLabels(page);
      await expectAxeClean(page, { include: '[role="dialog"]', wcag22: true });
      await field.fill('Garden papers draft');
      await page.evaluate(() => (window as unknown as { __q1Fixture: BrowserFixture }).__q1Fixture.failNext());
      await sheet.getByRole('button', { name: 'Tell Bower' }).click();
      await expect(field).toHaveValue('Garden papers draft');
      await expect(sheetCard(page)).toBeVisible();
      await expect(sheet.getByRole('button', { name: 'Tell Bower' })).toBeEnabled();
      expect(await answerRecords(page)).toEqual([]);
      await sheet.getByRole('button', { name: 'Tell Bower' }).click();
      await expect(sheetCard(page)).toHaveCount(0);
      expect(await answerRecords(page)).toEqual([{ id: 'q-ask-paper', value: { text: 'Garden papers draft' } }]);
      await expect(sheet.getByRole('heading', { name: 'Reading 1 thing' })).toBeFocused();
    });

    test(`Q1b Done retains its question above RunLinks and the pile exhaustion line resets (${source}, ${width})`, async ({ page }) => {
      await resize(page, { width, height: 900 });
      await openFixture(page, source);
      const row = page.getByRole('region', { name: 'Inbox', exact: true }).getByRole('link', { name: /Unplaced papers/ });
      await expect(row.getByText("Bower couldn't place this", { exact: true })).toBeVisible();
      await tokenColor(row.getByText("Bower couldn't place this", { exact: true }), '--text-muted');
      const sheet = await start(page);
      await page.evaluate(() => (window as unknown as { __q1Fixture: BrowserFixture }).__q1Fixture.finish());
      await expect(sheet).toHaveAccessibleName('Done. 0 things filed.');
      await expect(sheet.getByRole('status')).toHaveText('1 note brought up to date and 1 new question for you.');
      const links = sheet.getByRole('list', { name: 'Brought up to date', exact: true });
      await expect(links.getByRole('link', { name: 'Papers' })).toHaveAttribute('href', '/note/Areas/Home/Papers.md');
      expect(await sheetCard(page).evaluate((el) => {
        const link = el.closest('[role="dialog"]')?.querySelector('a[href="/note/Areas/Home/Papers.md"]');
        return !!link && !!(el.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING);
      })).toBe(true);
      await expectAxeClean(page, { include: '[role="dialog"]', wcag22: true });
      await page.keyboard.press('Escape'); await expect(homeCard(page)).toBeVisible();
      await row.click();
      const line = page.getByRole('main').getByText(EXHAUSTED, { exact: true });
      await expect(line).toBeVisible();
      expect(await line.evaluate((el) => ({ tag: el.tagName, size: getComputedStyle(el).fontSize }))).toEqual({ tag: 'P', size: '17px' });
      await tokenColor(line, '--text');
      await expect(page.getByRole('button', { name: 'Remove this pile', exact: true })).toBeVisible();
      await page.getByRole('textbox', { name: 'What is this?', exact: true }).fill('Papers about the garden lease');
      await page.getByRole('button', { name: 'Save the note', exact: true }).click();
      await expect(line).toHaveCount(0);
      await expect(page.getByRole('textbox', { name: 'What is this?', exact: true })).toHaveValue('Papers about the garden lease');
      await expectAxeClean(page, { include: 'main', wcag22: true });
    });
  }

  test(`Q1b A tall sheet on a 1280×720 desktop (${source})`, async ({ page }) => {
    await resize(page, { width: 1280, height: 720 });
    await openFixture(page, source, [question({ text: ASK, options: [...OPTIONS, { id: 'papers-folder', label: 'Areas / Papers' },
      { id: 'letters-folder', label: 'Projects / Letters' }] })], true);
    const sheet = await start(page);
    await page.evaluate(() => (window as unknown as { __q1Fixture: BrowserFixture }).__q1Fixture.finish());
    await expect(sheet.getByRole('list', { name: 'New notes' }).getByRole('link')).toHaveCount(28);
    await sheetCard(page).getByRole('button', { name: 'Something else…' }).click();
    const field = sheet.getByRole('textbox', { name: 'In your own words' });
    await expect(field).toBeFocused(); await field.fill(Array.from({ length: 25 }, () => 'Garden papers').join('\n'));
    await animationsEnd(page);
    const bounds = await sheet.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds?.y).toBeGreaterThanOrEqual(0);
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(696);
    const scroll = await sheet.evaluate((el) => ({ overflow: getComputedStyle(el).overflowY, full: el.scrollHeight, visible: el.clientHeight }));
    expect(scroll.overflow).toBe('auto'); expect(scroll.full).toBeGreaterThan(scroll.visible);
    await sheet.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    expect(await sheet.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expect(sheet.getByRole('button', { name: 'Done', exact: true })).toBeInViewport();
    await expectAxeClean(page, { include: '[role="dialog"]', wcag22: true });
  });
}

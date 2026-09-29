/**
 * The note screen as the boards draw it (#609): the Arlington Road note with
 * its props line, box, key facts and folded Details (`Phone-Note-Details`,
 * `Flow-06-Dots`); an answer with its question, lists, checklist link and
 * "Used:" line (`Flow-07-Answer`); the About panel at 1280 px
 * (`Desktop-Note-Details`).
 */

import type { Page } from '@playwright/test';

import { expect, openHome, shot, test, visible } from './demo.js';

async function openNote(
  page: Page,
  query: string,
  option: RegExp,
): Promise<void> {
  await openHome(page);
  await visible(
    page.getByRole('button', { name: /^Search( folders, notes and files)?$/ }),
  ).click();
  const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
  await switcher.getByRole('combobox').fill(query);
  await switcher
    .getByRole('option', { name: option })
    .filter({ hasNotText: /pdf/i })
    .first()
    .click();
}

test('the Arlington Road note shows its props line, key facts and folded Details', async ({
  page,
}, testInfo) => {
  await openNote(page, 'Arlington Road, 2 bed', /Arlington Road, 2 bed/);

  const view = page.locator('.note-view');
  // The title is shown once on the page (the bar's copy is not in the view).
  await expect(view.getByRole('heading', { level: 1 })).toHaveCount(1);

  const kindRow = view.locator('.note-kind-row');
  await expect(kindRow).toContainText('Rental listing');
  await expect(kindRow).toContainText('Bower');
  await expect(
    view.locator('.made-from').getByRole('link', { name: /\.pdf/ }),
  ).toHaveAttribute('href', /^\/file\//);
  const metaLine = view.locator('.note-meta-line');
  await expect(metaLine.getByRole('link', { name: /Flat hunt/ })).toBeVisible();
  await expect(metaLine).toContainText('Filed');

  await expect(view.locator('.bower-note-box')).toBeVisible();
  await expect(view.locator('.bower-joined')).toContainText('Joined from:');
  await expect(view.locator('.note-keyfacts-caption')).toHaveCount(0);
  await expect(view.locator('.key-fact')).not.toHaveCount(0);

  // Details are part of the open box: no second fold.
  await expect(view.locator('.details-toggle')).toHaveCount(0);
  await expect(view.locator('.details')).toContainText(
    '14 min, from your offer letter and Cycle to Work agreement',
  );
  await expect(view.locator('.details')).toContainText(
    '72 of 100: cheap, close, one bedroom short of a study',
  );
  await shot(page, testInfo, 'v4-note-arlington');
});

test('an answer shows the question, the lists, the checklist link and Used', async ({
  page,
}, testInfo) => {
  await openNote(
    page,
    'Which flat should we view first',
    /Which flat should we view first/,
  );

  const view = page.locator('.note-view');
  await expect(view.locator('.note-asked-label')).toHaveText(
    'You asked, 28 Sep',
  );
  await expect(view.locator('.note-asked-text')).toHaveText(
    'Which two should we view first?',
  );
  await expect(view.locator('.bower-note-box')).toBeVisible();
  await expect(view.getByText('At the viewing, check')).toBeVisible();
  await expect(view.getByText('Ask the agent')).toBeVisible();
  await expect(
    view.getByRole('link', { name: 'Viewing checklist · in Resources' }),
  ).toBeVisible();
  await expect(
    view.locator('.bower-used, p:has-text("Used:")').first(),
  ).toContainText('Used:');
  await expect(view.getByRole('heading', { level: 1 })).toHaveCount(1);
  await shot(page, testInfo, 'v4-note-answer');
});

test('the About panel holds key facts, Details, Original, the folder and the outline', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'the panel is a desktop column',
  );
  await openNote(page, 'Arlington Road, 2 bed', /Arlington Road, 2 bed/);

  const panel = page.locator('.about-section').first();
  await expect(panel).toBeVisible();
  const headings = page.locator('.about-heading');
  await expect(
    headings.filter({ hasText: 'Key facts · rental listing' }),
  ).toBeVisible();
  await expect(headings.filter({ hasText: /^Details$/ })).toBeVisible();
  await expect(headings.filter({ hasText: /^Original$/ })).toBeVisible();
  await expect(headings.filter({ hasText: /^In this folder$/ })).toBeVisible();
  await expect(page.locator('.about-original')).toContainText('PDF');
  await expect(page.locator('.about-not-stated')).toContainText('Not in the');
  await shot(page, testInfo, 'v4-note-desktop');
});

test('the phone bar of a note has Back to the folder and no item title (#704)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the phone top bar only');
  await openNote(page, 'Arlington Road, 2 bed', /Arlington Road, 2 bed/);
  const bar = page.locator('header.topbar');
  await expect(
    bar.getByRole('link', { name: /^Back to Flat hunt/ }),
  ).toBeVisible();
  await expect(bar.locator('.topbar-title')).toHaveCount(0);
});

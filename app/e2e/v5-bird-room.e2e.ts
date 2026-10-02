/**
 * The room rule's gate (R-BIRD-6, spec §6.21 rule 3, §7c items 1 and 3,
 * §7b T16): no ancestor clips the room around any bird, on every route and
 * in the states where he shows himself. Reduced motion keeps the boxes
 * still; the `phone` project is 375 px wide, the `desktop` one 1280.
 *
 * The first test is the gate's own: the helper must fail on a page built to
 * clip, or a green walk would prove nothing.
 */

import type { Page } from '@playwright/test';

import { birdRoomFindings, describeFindings } from './bird-room.js';
import { SCREEN_ROUTES } from './bird-screens.js';
import { expect, openHome, test, visible } from './demo.js';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

const FLAT = '/folder/4-Archives/Flat%20hunt';
const EMPTY_FOLDER = '/folder/3-Resources/Car';

async function expectRoom(
  page: Page,
  where: string,
  { birds = true }: { birds?: boolean } = {},
): Promise<void> {
  // The screens draw in a beat; the bird's box must be the settled one.
  await page.waitForLoadState('networkidle');
  // A walk that meets no bird proves nothing about where he shows himself.
  if (birds) {
    expect(
      await page.locator('svg.b').count(),
      `${where}: a bird`,
    ).toBeGreaterThan(0);
  }
  const findings = await birdRoomFindings(page);
  expect(findings, `${where}\n${describeFindings(findings)}`).toEqual([]);
}

async function holdRun(page: Page, state: string): Promise<void> {
  await page.addInitScript((held) => {
    sessionStorage.setItem('bower:demo:run', held);
  }, state);
}

test.describe('the room walk itself', () => {
  const CLIPPING_PAGE = (clip: string): string =>
    '<body style="margin:0">' +
    `<div style="${clip};width:100px;height:100px;margin:40px">` +
    '<svg class="b p-look" viewBox="0 0 100 100" width="80" height="80">' +
    '<rect width="100" height="100"/></svg></div></body>';

  test('fails on a bird whose room an ancestor clips', async ({ page }) => {
    for (const clip of [
      'overflow:hidden',
      'overflow:clip',
      'overflow:auto',
      'clip-path:inset(0)',
      'contain:paint',
    ]) {
      await page.setContent(CLIPPING_PAGE(clip));
      const findings = await birdRoomFindings(page);
      expect(findings, clip).toHaveLength(1);
      expect(findings[0]?.sides.length, clip).toBeGreaterThan(0);
    }
  });

  test('passes when the room is there, and asks 50% for the scene poses', async ({
    page,
  }) => {
    const box = (pose: string, size: number, pad: number): string =>
      `<div style="overflow:hidden;padding:${pad}px;width:${size + 2 * pad}px">` +
      `<svg class="b ${pose}" viewBox="0 0 100 100" width="${size}" height="${size}">` +
      '<rect width="100" height="100"/></svg></div>';
    // 12% of 100 is 12 px, a scene pose needs 50 px.
    await page.setContent(box('p-look', 100, 12));
    expect(await birdRoomFindings(page)).toEqual([]);
    await page.setContent(box('p-tidy', 100, 12));
    expect(await birdRoomFindings(page)).toHaveLength(1);
    await page.setContent(box('p-tidy', 100, 50));
    expect(await birdRoomFindings(page)).toEqual([]);
  });

  test('lets through only the intro sort strip exit', async ({ page }) => {
    const strip = (cls: string): string =>
      `<div class="${cls}" style="overflow:hidden;width:100px;height:100px">` +
      '<div class="intro-strip-carrier">' +
      '<svg class="b p-look" viewBox="0 0 100 100" width="80" height="80">' +
      '<rect width="100" height="100"/></svg></div></div>';
    await page.setContent(strip('intro-strip'));
    expect(await birdRoomFindings(page)).toEqual([]);
    await page.setContent(strip('other-strip'));
    expect(await birdRoomFindings(page)).toHaveLength(1);
  });
});

test.describe('nothing clips Bower on any route', () => {
  test('every route of the router', async ({ page }) => {
    test.setTimeout(120_000);
    // The first note and file the demo lists stand in for `:id`.
    await page.goto('/notes');
    await page.waitForLoadState('networkidle');
    const hrefs = await page
      .locator('a[href^="/note/"], a[href^="/file/"]')
      .evaluateAll((links) =>
        links.map((link) => link.getAttribute('href') ?? ''),
      );
    const note = hrefs.find((h) => h.startsWith('/note/')) ?? '/note/none';
    const file = hrefs.find((h) => h.startsWith('/file/')) ?? note;
    for (const route of SCREEN_ROUTES) {
      for (const url of route.urls) {
        const target = url.startsWith('/note/:id')
          ? note
          : url.startsWith('/file/:id')
            ? file
            : url;
        await page.goto(target);
        await expectRoom(page, target, { birds: false });
      }
    }
  });
});

test.describe('nothing clips Bower in the states he shows himself', () => {
  test('the tidy-up sheet, going', async ({ page }) => {
    await holdRun(page, 'running');
    await page.goto(FLAT);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectRoom(page, 'the tidy-up sheet, going');
    await page.getByRole('dialog').press('Escape');
  });

  test('the tidy-up sheet, partly done', async ({ page }) => {
    await holdRun(page, 'partial');
    await page.goto(FLAT);
    await page.locator('.run-chip-button').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectRoom(page, 'the tidy-up sheet, partly done');
  });

  test('the tour', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('dialog', { name: 'Home' }).getByText('Tour · 1 of 4'),
    ).toBeVisible();
    await expectRoom(page, 'the tour');
  });

  // §6.21 rule 4 (#1004): on every step Bower stands clear of the card's
  // text and buttons.
  test('the tour, every step, clear of the card', async ({ page }) => {
    await page.goto('/');
    const dialog = page.getByRole('dialog', { name: 'Home' });
    for (let step = 1; step <= 4; step += 1) {
      await expect(page.getByText(`Tour · ${step} of 4`)).toBeVisible();
      await page.waitForTimeout(100);
      const card = await page.locator('.tour-card').boundingBox();
      const bird = page.locator('.tour-bird');
      if ((await bird.count()) > 0 && card !== null) {
        const box = await bird.boundingBox();
        if (box !== null) {
          const apart =
            box.x + box.width <= card.x ||
            card.x + card.width <= box.x ||
            box.y + box.height <= card.y ||
            card.y + card.height <= box.y;
          expect(apart, `step ${step}: the bird is over the card`).toBe(true);
        }
      }
      if (step < 4) {
        await page
          .locator('.tour-card')
          .getByRole('button', { name: /^Next/ })
          .click();
      }
    }
    await expect(dialog.or(page.locator('.tour-card'))).toBeVisible();
  });

  // The start-up hand-over (#1004): "Opening Bower…" goes at once.
  test('the boot line hides as soon as the boot screen leaves', async ({
    page,
  }) => {
    await page.goto('/');
    const hidden = await page.evaluate(() => {
      const boot =
        document.getElementById('boot') ??
        Object.assign(document.createElement('div'), { id: 'boot' });
      if (!boot.isConnected) {
        boot.innerHTML = '<p class="boot-line">Opening Bower…</p>';
        document.body.append(boot);
      }
      boot.setAttribute('data-leaving', '');
      const line = boot.querySelector('.boot-line');
      return line === null ? null : getComputedStyle(line).visibility;
    });
    expect(hidden).toBe('hidden');
  });

  test('an empty folder', async ({ page }) => {
    await page.goto(EMPTY_FOLDER);
    await expect(page.locator('.empty-folder svg.b')).toBeVisible();
    await expectRoom(page, 'an empty folder');
  });

  test('offline', async ({ page, context }) => {
    await openHome(page);
    await context.setOffline(true);
    // Home itself says it is offline; desktop Home has no "All in Folders"
    // link to leave by any more (#913, R-HM-5).
    await expect(page.getByText(/offline/i).first()).toBeVisible();
    await expectRoom(page, 'offline');
    await context.setOffline(false);
  });

  test('404', async ({ page }) => {
    await page.goto('/no/such/page');
    // The page's own bird: wait for one on screen.
    await expect(
      page.locator('svg.b').filter({ visible: true }).first(),
    ).toBeVisible();
    await expectRoom(page, '404');
  });

  test('the sign-in the demo shows in place of signing in', async ({
    page,
  }) => {
    // The demo is always signed in as Alex; `/login` is its stand-in.
    await page.goto('/login');
    await expectRoom(page, 'sign-in');
  });

  test('dictation, listening', async ({ page }) => {
    await page.addInitScript(() => {
      class FakeRecognition {
        continuous = false;
        interimResults = false;
        lang = '';
        onstart: (() => void) | null = null;
        onresult: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onend: (() => void) | null = null;
        start(): void {
          setTimeout(() => this.onstart?.(), 0);
        }
        stop(): void {}
        abort(): void {}
      }
      Object.assign(window, { SpeechRecognition: FakeRecognition });
    });
    await openHome(page);
    await page.goto('/bower');
    // The Bower box's own mic; desktop's sidebar search has one too (#910).
    const box = page.locator('.bower-box');
    await box.getByRole('button', { name: 'Dictate' }).click();
    await expect(
      box.getByRole('button', { name: 'Stop dictating' }),
    ).toBeVisible();
    await expectRoom(page, 'dictation');
  });

  test('Reading', async ({ page }) => {
    await openHome(page);
    await visible(page.locator('a[href="/bower"]')).click();
    await page
      .getByRole('textbox', {
        name: 'Tell Bower what to do, or ask it something',
      })
      .fill('Tidy up [[Arlington Road, 2 bed]]');
    const send = page.getByRole('button', { name: 'Send' });
    await expect(send).toBeEnabled();
    await send.click();
    // Sent: the box empties and its round button is the mic again (#910).
    await expect(
      page.getByRole('textbox', {
        name: 'Tell Bower what to do, or ask it something',
      }),
    ).toHaveValue('');
    // The tidy-up starts with the request waiting: it is being read.
    await visible(page.locator('a[href="/"]')).click();
    await visible(
      page.getByRole('button', { name: 'Tidy up', exact: true }),
    ).click();
    await page
      .getByRole('dialog', { name: 'Is that everything?' })
      .getByRole('button', { name: 'Yes, tidy up' })
      .click();
    const sheet = page.getByRole('dialog', { name: 'Tidying up' });
    await expect(sheet).toBeVisible();
    await sheet.press('Escape');
    await expect(sheet).toHaveCount(0);
    await visible(
      page.getByRole('button', {
        name: /^Search( folders, notes and files)?$/,
      }),
    ).click();
    const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
    await switcher.getByRole('combobox').fill('Arlington Road, 2 bed');
    await switcher
      .getByRole('option', { name: /Arlington Road, 2 bed/ })
      .filter({ hasNotText: /pdf/i })
      .first()
      .click();
    await expect(page.locator('.bower-note-box.is-reading')).toBeVisible();
    await expectRoom(page, 'Reading');
  });
});

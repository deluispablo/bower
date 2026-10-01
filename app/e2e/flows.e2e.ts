/**
 * The six main flows (#196, spec §5) against the demo build: Alex's sample
 * notes, three items waiting in the inbox and a scripted Tidy up run
 * (`src/demo/`). Each flow skips the first-run tour first, except "Open
 * Home", which walks it (four sheets, one per tab) from the "What is Bower"
 * intro to the end.
 * Assertions are on the text a person reads; the screenshots are a
 * by-product for the README and the CI artifacts, never compared.
 */

import {
  bowerPart,
  expect,
  navigate,
  openHome,
  openSettings,
  showBowerPart,
  shot,
  test,
  visible,
} from './demo.js';
import type { Locator, Page } from '@playwright/test';

/** The tidy-up sheet, whichever of its states it is in (#752). */
const SHEET_NAME = /^(Tidying up|Tidy-up (done|partly done|did not finish))$/;

/**
 * The one-time push prompt (#39) is a modal overlay (#773): it comes up once
 * a finished run's result has been seen, and it makes the page inert, so a
 * flow dismisses it before the next click. Only some builds can ask for push
 * at all, so a short wait, then on.
 */
async function dismissPushPrompt(page: Page): Promise<void> {
  const later = page
    .getByRole('dialog')
    .getByRole('button', { name: /Not now|Got it/ });
  await later.waitFor({ state: 'visible', timeout: 2_000 }).then(
    () => later.click(),
    () => undefined,
  );
}

test.describe('open Home', () => {
  test.use({ introSeen: false });

  test('a first visit walks the intro and the tour, then lands on Home', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/welcome\?page=1$/);
    await expect(
      page.getByRole('heading', { name: /Bower files it/ }),
    ).toBeInViewport();
    // The demo's intro is the app's, with the banner on top (#361).
    await expect(page.locator('.intro-bar + .demo-banner')).toBeVisible();
    // Five pages, one shared "Next" for the first four.
    const headings = [
      /Bower's note/,
      /the dots/,
      /own words/,
      'Only your Drive',
    ];
    const next = page.getByRole('button', { name: 'Next', exact: true });
    await expect(next).toHaveCount(1);
    // Each page's resting frame, for the PR and the CI artifact (not the
    // README, so not through `shot`).
    const intro = async (n: number): Promise<void> => {
      const { testDir, name: project } = testInfo.project;
      await page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        path: `${testDir}/screenshots/${project}/intro-${n}.png`,
      });
    };
    await intro(1);
    for (const [index, name] of headings.entries()) {
      await next.click();
      await expect(page.getByRole('heading', { name })).toBeInViewport();
      await intro(index + 2);
    }
    // "Try the demo" where the app says Sign in with Google (#361).
    await expect(
      page.getByRole('link', { name: 'Sign in with Google' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Try the demo' }).click();
    await expect(page).toHaveURL(/\/$/);

    // The tour: four sheets, one per tab, each over its highlighted tab.
    const tour = page.getByRole('dialog');
    const sheets = [
      ['Home', 'Next: Folders', 'home'],
      ['Folders', 'Next: Add', 'notes'],
      ['Add', 'Next: Bower', 'add'],
      ['Bower', "Let's go", 'bower'],
    ] as const;
    for (const [index, [title, next, id]] of sheets.entries()) {
      await expect(tour.getByText(`Tour · ${index + 1} of 4`)).toBeVisible();
      await expect(tour.getByRole('heading', { name: title })).toBeVisible();
      await expect(tour.getByRole('button', { name: 'Skip' })).toBeVisible();
      await expect(visible(page.locator(`[data-tour="${id}"]`))).toHaveClass(
        /help-tab-on/,
      );
      if (index === 0) {
        await expect(
          tour.getByText('Where Bower tells you what is going on.'),
        ).toBeVisible();
      }
      if (testInfo.project.name === 'phone') {
        await shot(page, testInfo, `tour-${index + 1}`);
      }
      await tour.getByRole('button', { name: next }).click();
    }
    await expect(tour).toBeHidden();
    // "Let's go" opens the Bower tab (R-TR-5); back to Home.
    await expect(page).toHaveURL(/\/bower$/);
    await visible(page.locator('[data-tour="home"]')).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(visible(page.locator('.home-bubble'))).toBeVisible();
    // #906 removed the top bar's "?" (R-TOPBAR-1): Help moves into each
    // screen's ⋯ menu (#907, #919), where these steps come back.

    // Run your own Bower is the demo's sign-in.
    await page.goto('/login');
    await expect(
      page.getByRole('heading', { name: 'Run your own Bower', level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Read the runbook on GitHub' }),
    ).toBeVisible();
    await shot(page, testInfo, 'login');

    // Back on Home from a reload: `tourSeenAt` survives it (#494, kept in
    // `sessionStorage`), so the tour does not replay.
    await page.goto('/');
    await expect(visible(page.locator('.home-bubble'))).toBeVisible();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(
      page.getByText('This is a demo, not the real thing'),
    ).toBeVisible();
    await expect(
      visible(page.locator('.stat-tile', { hasText: 'Last tidy-up' })),
    ).not.toContainText('No tidy-up yet');
    // #754 (R-HOME-3): the demo's history has runs, so the card shows the
    // newest one instead of "No tidy-up yet".
    await expect(
      visible(page.locator('.stat-tile', { hasText: 'Last tidy-up' })),
    ).toContainText('filed');
    await shot(page, testInfo, 'home');

    // #906 removed the top bar's "?" (R-TOPBAR-1): Help moves into each
    // screen's ⋯ menu (#907, #919), where these steps come back.
  });
});

test.describe('first visit, Skip', () => {
  test.use({ introSeen: false });

  test('Skip on the intro lands on the sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/welcome\?page=1$/);
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole('heading', { name: 'Run your own Bower', level: 1 }),
    ).toBeVisible();
  });
});

test('the demo banner carries Run your own on Home, Add and Settings (#362)', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const banner = page
    .getByRole('status')
    .filter({ hasText: 'This is a demo, not the real thing' });
  const runYourOwn = page.getByRole('link', {
    name: 'Run your own',
    exact: true,
  });
  // While the tour is on screen the banner steps aside: one card at a time.
  const tour = page.getByRole('dialog', { name: 'Home' });
  await expect(tour.getByText('Tour · 1 of 4')).toBeVisible();
  await expect(banner).toHaveCount(0);
  await tour.getByRole('button', { name: 'Skip' }).click();

  await expect(banner).toHaveText(
    'This is a demo, not the real thing: sample notes, nothing saved.Run your own',
  );
  await expect(runYourOwn).toHaveAttribute('href', '/login');
  await shot(page, testInfo, 'demo-banner-home');

  await navigate(page, /^Add$/);
  await expect(page).toHaveURL(/\/add$/);
  await expect(runYourOwn).toBeVisible();

  await openSettings(page);
  await expect(page).toHaveURL(/\/settings$/);
  await expect(runYourOwn).toBeVisible();

  // The link is the demo's sign-in: Run your own Bower.
  await runYourOwn.click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole('link', { name: 'Read the runbook on GitHub' }),
  ).toBeVisible();
});

test('Run your own Bower: the rows, the runbook, and the five screens with Skip on pages 1 to 4 and Close on page 5 (#366)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await visible(
    page.getByRole('link', { name: 'Run your own', exact: true }),
  ).click();
  await expect(page).toHaveURL(/\/login$/);
  const heading = page.getByRole('heading', {
    name: 'Run your own Bower',
    level: 1,
  });
  await expect(heading).toBeVisible();
  for (const row of [
    'One folder in your Drive',
    'Your own keys',
    'About an hour',
  ]) {
    await expect(page.getByText(row, { exact: true })).toBeVisible();
  }
  // The runbook opens on GitHub in a new tab; never followed here.
  const runbook = page.getByRole('link', {
    name: 'Read the runbook on GitHub',
  });
  await expect(runbook).toHaveAttribute(
    'href',
    'https://github.com/deluispablo/bower/blob/main/docs/runbook.md',
  );
  await expect(runbook).toHaveAttribute('target', '_blank');
  // Inside the shell, as the board draws it: the tabs are the way back.
  await expect(
    visible(page.getByRole('link', { name: /^Home$/ })),
  ).toBeVisible();
  await shot(page, testInfo, 'run-your-own');

  // "What is Bower, in five screens": the intro with Close, back here.
  await page
    .getByRole('link', { name: 'What is Bower, in five screens' })
    .click();
  await expect(page).toHaveURL(/\/welcome\?from=run-your-own&page=1$/);
  await expect(
    page.getByRole('heading', { name: /Bower files it/ }),
  ).toBeInViewport();
  // Skip on pages 1 to 4 (boards IN-P1..P4) goes back to Run your own.
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(heading).toBeVisible();
});

test('the quick switcher opens a note', async ({ page }, testInfo) => {
  await openHome(page);
  await visible(
    page.getByRole('button', { name: /^Search( folders, notes and files)?$/ }),
  ).click();
  const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
  await switcher.getByRole('combobox').fill('Lisbon');
  await switcher
    .getByRole('option', { name: /Lisbon Trip/ })
    // The folder of the same name is listed first (#593): open the note.
    .filter({ has: page.locator('[data-kind="note"]') })
    .first()
    .click();

  await expect(page).toHaveURL(/\/note\//);
  await expect(
    page.getByRole('heading', { name: 'Lisbon Trip', level: 1 }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('A week in Lisbon, 14 to 21 October.'),
  ).toBeVisible();
  await shot(page, testInfo, 'note');
});

test('/search?q= lands on Home with the switcher open and prefilled (#495)', async ({
  page,
}) => {
  await page.goto('/search?q=laundry');

  await expect(page).toHaveURL(/\/$/);
  // The demo's tour is a modal (#776) and makes the page, switcher included,
  // inert until it ends; whether it or the switcher opens first is a race.
  await page
    .getByRole('dialog', { name: 'Home' })
    .getByRole('button', { name: 'Skip' })
    .click({ timeout: 3_000 })
    .catch(() => undefined);
  const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
  await expect(switcher).toBeVisible();
  await expect(switcher.getByRole('combobox')).toHaveValue('laundry');
  // A note found by its text still lists; #917 (SE-Query): the row is the
  // name and the meta line only, no body snippet (so no raw Markdown).
  const option = switcher
    .getByRole('option', { name: /10-43 Buckley St, Moonee Ponds/ })
    .first();
  await expect(option).toBeVisible();
  const meta = (await option.locator('.list-row-meta').textContent()) ?? '';
  expect(meta).not.toContain('“');
  expect(meta).not.toContain('---');
});

test("a note Bower wrote opens with Bower's note and the Used line (#351, #602)", async ({
  page,
}, testInfo) => {
  await openHome(page);
  await visible(
    page.getByRole('button', { name: /^Search( folders, notes and files)?$/ }),
  ).click();
  const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
  await switcher.getByRole('combobox').fill('subscriptions renew');
  await switcher
    .getByRole('option', { name: /subscriptions renew/ })
    .first()
    .click();

  const box = page.locator('.bower-note-box');
  await expect(box).toBeVisible();
  await expect(box.locator('.bower-note-box-name')).toHaveText("Bower's note");
  // v3 markers (#602): ✅ shows no word, ⚠️ "Check", ❌ "Problem".
  await expect(box.locator('.bower-note-row')).toHaveCount(3);
  await expect(box.locator('.bower-note-word')).toHaveText([
    'Check',
    'Problem',
  ]);
  // `## What Bower used` is one compact "Used:" line, origins dropped.
  await expect(
    page.getByRole('heading', { name: 'What Bower used' }),
  ).toHaveCount(0);
  await expect(page.locator('.bower-used')).toHaveText(
    'Used: Bills and renewals.',
  );
  await shot(page, testInfo, 'note-from-bower');
});

test("previous/next under a note hides Bower's own files and uses titles (#423)", async ({
  page,
}) => {
  // Answers has two real notes ("Which subscriptions renew this autumn?"
  // and, from the v4 sample folder, "Which flat should we view first")
  // alongside Bower's own "Bower - Proposals.md" (#420's demo fixture
  // already has it, matching the issue's own repro).
  await page.goto('/folder/Answers');
  await page
    .getByRole('link', { name: /Which subscriptions renew this autumn/ })
    .press('Enter');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Which subscriptions renew this autumn?',
    }),
  ).toBeVisible();

  // The sibling nav offers the other real answer by its title, and never
  // Bower's own file, hidden unless "Show Bower's own files" is on.
  const siblings = page.locator('.pager');
  await expect(
    siblings.locator('[aria-label*="Which flat should we view first"]'),
  ).toHaveCount(1);
  await expect(siblings.locator('[aria-label*="Proposals"]')).toHaveCount(0);
  await expect(siblings).not.toContainText('Proposals');
});

test('a missing note shows Not found (#504)', async ({ page }, testInfo) => {
  await openHome(page);
  await page.goto('/note/does-not-exist');

  await expect(
    page.getByRole('heading', { name: /can.t find that/ }),
  ).toBeVisible();
  await expect(
    page.getByText("isn't in your Bower folder any more"),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Search for it' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go home' })).toBeVisible();
  await shot(page, testInfo, 'note-not-found');
});

test('an unknown folder and an unknown URL each show Not found with their own sentence (#504)', async ({
  page,
}) => {
  await openHome(page);

  await page.goto('/folder/nope');
  await expect(
    page.getByRole('heading', { name: /can.t find that/ }),
  ).toBeVisible();
  await expect(
    page.getByText("This folder isn't in your Bower folder any more"),
  ).toBeVisible();

  await page.goto('/whatever/deep');
  await expect(
    page.getByRole('heading', { name: /can.t find that/ }),
  ).toBeVisible();
  await expect(page.getByText("That page doesn't exist")).toBeVisible();
});

test('a missing file shows Not found with its own sentence, not the generic page one (#529)', async ({
  page,
}) => {
  await openHome(page);
  await page.goto('/file/does-not-exist');
  await expect(
    page.getByRole('heading', { name: /can.t find that/ }),
  ).toBeVisible();
  await expect(
    page.getByText("isn't in your Bower folder any more"),
  ).toBeVisible();
});

/** Waits for what was just attached to Add to be in the inbox: every file
 * starts uploading at once (R-ADD-1), so there is nothing to press. */
async function addPileToInbox(page: Page): Promise<void> {
  await expect(page.locator('.pile-row-done').first()).toBeVisible({
    timeout: 15_000,
  });
}

/** Opens the Link door's field and saves `url` into the pile. */
async function saveLink(page: Page, url: string): Promise<void> {
  await page
    .locator('.add-doors')
    .getByRole('button', { name: 'Paste a link' })
    .click();
  await page.locator('#add-link').fill(url);
  await page
    .getByRole('button', { name: 'Save the link', exact: true })
    .click();
}

test('Add: four doors in one row, and the drop line on desktop (#333, #770)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await navigate(page, /^Add$/);
  await expect(
    page.getByRole('heading', { name: 'Add', exact: true }),
  ).toBeVisible();

  const doors = page.locator('.add-doors');
  await expect(doors).toBeVisible();
  await expect(
    doors.getByRole('button', { name: /^Choose files/ }),
  ).toBeVisible();
  await expect(doors.getByText('Files', { exact: true })).toBeVisible();
  await expect(doors.getByText('Link', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Or share to Bower from any app: it lands here too.'),
  ).toHaveCount(0);

  if (testInfo.project.name === 'desktop') {
    await expect(
      page.getByText(
        'Drop files anywhere on this page: they join the pile you are making.',
      ),
    ).toBeVisible();
    return;
  }

  await expect(
    doors.getByRole('button', { name: /^Take a photo/ }),
  ).toBeVisible();
  await expect(doors.getByText('Photo', { exact: true })).toBeVisible();
  await shot(page, testInfo, 'add-doors');
});

test('Add: the camera door opens a capture input (#339)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await navigate(page, /^Add$/);

  // The fake webcam (`playwright.config.ts`'s `--use-fake-device-for-
  // media-stream`) is what makes the door show up here at all, on the
  // phone project and every machine alike (issue 21.7's actual rule is
  // unit-tested in `add-camera.test.ts`).
  if (testInfo.project.name === 'desktop') {
    await expect(page.locator('.add-doors')).toBeVisible();
    return;
  }

  const door = page
    .locator('.add-doors')
    .getByRole('button', { name: /^Take a photo/ });
  await expect(door).toBeVisible();
  await expect(page.locator('input[type="file"][capture]')).toHaveCount(1);
});

test('Add puts a file in the inbox and stays on Add (#421)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await navigate(page, /^Add$/);
  await expect(
    page.getByRole('heading', { name: 'Add', exact: true }),
  ).toBeVisible();

  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(
      `${testInfo.project.testDir}/files/Garden centre receipt.txt`,
    );
  await expect(
    page.locator('.pile-row .list-row-title', {
      hasText: 'Garden centre receipt',
    }),
  ).toBeVisible();
  await addPileToInbox(page);
  await shot(page, testInfo, 'add');

  // Adding is meant to take the whole pile before a tidy-up (#421): no
  // navigation away, and no leftover "Add to Bower" once nothing is
  // waiting any more.
  await expect(page).toHaveURL('/add');

  // The vault index refreshed in place (#289): Home already reads the new
  // total once we go there ourselves, not after the next background
  // refresh.
  await navigate(page, /^Home$/);
  await expect(
    visible(page.locator('.stat-tile', { hasText: 'Inbox' })).locator(
      '.stat-tile-value',
    ),
  ).toHaveText('4');
});

test('Add: the pile waits under "Waiting for the tidy-up" after leaving the tab (#334, #770)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await navigate(page, /^Add$/);

  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(
      `${testInfo.project.testDir}/files/Garden centre receipt.txt`,
    );
  await expect(
    page.locator('.pile-row .list-row-title', {
      hasText: 'Garden centre receipt',
    }),
  ).toBeVisible();
  await addPileToInbox(page);

  // Leaving Add closes the pile; coming back within the session lists it as
  // waiting for the next tidy-up, with its count.
  await navigate(page, /^Home$/);
  await navigate(page, /^Add$/);
  await expect(page.getByText('Waiting for the tidy-up')).toBeVisible();
  await expect(page.locator('.pile-card-waiting')).toHaveCount(1);
  await expect(page.locator('.pile-card-waiting')).toContainText('1 thing');
});

test('a fast double-tap on Tidy up leaves the confirmation open, not opened-and-closed (#510)', async ({
  page,
}) => {
  await openHome(page);
  const tidyBtn = visible(page.getByRole('button', { name: 'Tidy up' }));
  await expect(tidyBtn).toBeVisible();
  const box = await tidyBtn.boundingBox();
  if (box === null) throw new Error('Tidy up button has no box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  // Two taps at the same spot, back to back: the first opens the sheet: (its
  // backdrop now covers that spot); the second, landing on the backdrop
  // during the slide-up, must not immediately dismiss what it just opened.
  await page.mouse.click(x, y);
  await page.mouse.click(x, y);
  await expect(
    page.getByRole('dialog', { name: 'Is that everything?' }),
  ).toBeVisible();

  // A tap on the scrim still dismisses once the guard window has passed. The
  // guard moved onto Overlay's scrimGuardMs (#812, #830 dropped the old one).
  await page.waitForTimeout(400);
  await page.locator('.overlay-scrim').click({ position: { x: 5, y: 5 } });
  await expect(
    page.getByRole('dialog', { name: 'Is that everything?' }),
  ).toBeHidden();
});

test('Add: the one button counts what is waiting, and asks first (#336)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await navigate(page, /^Add$/);

  // The demo starts with three things in the inbox; the one button
  // carries the count (R-ADD-5), and there is no separate hint.
  const tidy = page.locator('.add-tidy-button');
  await expect(tidy).toHaveText('Tidy up 3 things');
  await expect(page.locator('.add-hint')).toHaveCount(0);
  await shot(page, testInfo, 'add-hint');

  // The Tidy up button opens the "Is that everything?" confirmation (#337).
  await tidy.click();
  const confirm = page.getByRole('dialog', { name: 'Is that everything?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Add more first' }).click();
  await expect(confirm).toBeHidden();

  // "From your Drive" (#364, `Demo-Add` board, handover C.10/D.6): shown,
  // greyed, with its own sentence — no Picker key is configured for the
  // demo build, so outside the demo this door would be hidden entirely.
  // The sentence sits inside the phone door's own row but as a separate
  // paragraph next to the desktop dropzone's button, so it is checked on
  // the page rather than inside the (possibly CSS-hidden) button itself.
  const drive = visible(page.getByRole('button', { name: /From your Drive/ }));
  await expect(drive).toBeVisible();
  await expect(drive).toBeDisabled();
  await expect(
    visible(page.getByText('Not in the demo. Run your own Bower to use it.')),
  ).toBeVisible();

  // After an add the count is the new total (#300), not the old one.
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(
      `${testInfo.project.testDir}/files/Garden centre receipt.txt`,
    );
  await addPileToInbox(page);
  // Stays on Add (#421): the new total shows in place, no round trip
  // through Home needed to see it.
  await expect(page).toHaveURL('/add');
  await expect(tidy).toHaveText('Tidy up 4 things');
});

test('Add: the rows clear once a tidy-up finishes (#493)', async ({ page }) => {
  await openHome(page);
  await navigate(page, /^Add$/);

  await saveLink(page, 'https://example.com/page');
  await addPileToInbox(page);

  await page.locator('.add-tidy-button').click();
  const confirm = page.getByRole('dialog', { name: 'Is that everything?' });
  await confirm.getByRole('button', { name: 'Yes, tidy up' }).click();
  await expect(confirm).toBeHidden();

  const sheet = page.getByRole('dialog', { name: SHEET_NAME });
  await expect(sheet.getByRole('heading', { name: 'Done' })).toBeVisible({
    timeout: 20_000,
  });
  await sheet.getByRole('button', { name: 'Close' }).first().click();
  await expect(sheet).toBeHidden();

  // Home already says "All tidy" by now (#321); back on Add nothing
  // should still say the link is queued or freshly added.
  await expect(page.locator('.pile-row')).toHaveCount(0);
});

test('Add: What is this? becomes one context note in the inbox (#335)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await navigate(page, /^Add$/);

  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(
      `${testInfo.project.testDir}/files/Garden centre receipt.txt`,
    );
  const box = page.getByRole('textbox', { name: 'What is this pile?' });
  await expect(box).toHaveAttribute(
    'placeholder',
    /^For example: five job offers\./,
  );
  // The rule sentence is kept in your rules too (#435).
  await box.fill(
    'Receipts: add them to a table with the shop and the total. From now on, file garden receipts under Garden.',
  );
  await shot(page, testInfo, 'add-context');
  await addPileToInbox(page);

  // The context note is written on leaving Add (#421: no longer automatic
  // once a batch finishes), so leave for Home ourselves: the three things,
  // the receipt. The note itself is not one of them (#506): it is Add's
  // own scratch note for the batch, the same rule the working sheet's own
  // count already followed.
  await navigate(page, /^Home$/);
  await expect(
    visible(page.locator('.stat-tile', { hasText: 'Inbox' })).locator(
      '.stat-tile-value',
    ),
  ).toHaveText('4');
  // The rule sentence is already in Rules, under its own topic. The pile note
  // itself waits in the inbox with its file (it is not a request).
  await navigate(page, /^Bower$/);
  await expect(
    bowerPart(page, 'Rules').getByRole('button', { name: 'Garden, 1 rule' }),
  ).toBeVisible();
});

test('rules from a What is this? box drop "From now on," and sort before Everything else (#558)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await navigate(page, /^Add$/);

  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(
      `${testInfo.project.testDir}/files/Garden centre receipt.txt`,
    );
  const box = page.getByRole('textbox', { name: 'What is this pile?' });
  await box.fill(
    'From now on, job offers go to Job hunt. From now on, add the salary to every job offer.',
  );
  await addPileToInbox(page);
  await navigate(page, /^Home$/);
  await navigate(page, /^Bower$/);

  // guessTopic's own rule (rules.ts): a new topic is one capitalised word
  // from the sentence ("Job hunt" as typed still guesses "Job").
  const rules = bowerPart(page, 'Rules');
  const jobHunt = rules.getByRole('button', { name: 'Job, 2 rules' });
  await expect(jobHunt).toBeVisible();
  await jobHunt.click();
  await expect(rules.getByText('Job offers go to Job hunt')).toBeVisible();
  await expect(
    rules.getByText('Add the salary to every job offer'),
  ).toBeVisible();
  // Not verbatim, and no full stop either.
  await expect(rules.getByText(/^From now on,/)).toHaveCount(0);
  const ruleTexts = await rules.locator('.rules-rule-text').allTextContents();
  expect(ruleTexts.some((text) => text.endsWith('.'))).toBe(false);

  // The demo's own fixture already ends in Everything else (1 rule); the
  // new topic reads before it, not after.
  const groupNames = await rules.locator('.rules-group-name').allTextContents();
  expect(groupNames.at(-1)).toBe('Everything else');
  expect(groupNames.indexOf('Job')).toBeLessThan(
    groupNames.indexOf('Everything else'),
  );
});

test('Add: a link row shows the URL, and the What is this? placeholder fits its box (#508)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await navigate(page, /^Add$/);

  // C.11: titles, not file names — the row must never say
  // "Link - example.com <date> <time>.md", the note's own saved name.
  await saveLink(page, 'https://www.example.com/a/page');
  await expect(page.getByText('example.com/a/page')).toBeVisible();
  await expect(page.getByText(/^Link - /)).toHaveCount(0);

  const box = page.getByRole('textbox', { name: 'What is this pile?' });
  await expect(box).toBeVisible();
  await shot(page, testInfo, 'add-context-placeholder');

  // The placeholder must not overflow the box (it used to run to four
  // lines in this three-line box at 375 px, cut off mid-sentence).
  const overflow = await box.evaluate(
    (el: HTMLTextAreaElement) => el.scrollHeight - el.clientHeight,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('Home through the scripted run: waiting, running, done (#321)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  const bubble = visible(page.locator('.home-bubble'));
  const inbox = visible(page.locator('.stat-tile', { hasText: 'Inbox' }));

  // Waiting: the count, and Tidy up in the bubble and on the card.
  await expect(bubble).toHaveText(
    '3 things in your inbox. Tidy up when you have added everything.',
  );
  await expect(inbox).toContainText('waiting to be filed');
  await inbox.getByRole('button', { name: 'Tidy up', exact: true }).click();

  // The "Is that everything?" confirmation (#337) opens first; nothing
  // starts until it is confirmed.
  const confirm = page.getByRole('dialog', { name: 'Is that everything?' });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('3 things');
  // One confirm copy for the demo and the real build (#825, #829): the
  // count line and what a tidy-up costs; the demo-only sentence of #489 is gone.
  await expect(confirm).toContainText('3 things in your inbox');
  await expect(confirm).toContainText(
    'A tidy-up takes a few minutes and uses one run of your Claude plan.',
  );
  // The demo's amber line (#363, `Demo-Tidy-Confirm` board, handover
  // C.10): tidy up here never runs the model.
  await expect(confirm).toContainText(
    'Demo: what follows is a recording. Nothing is sent to Claude, nothing is saved.',
  );
  await shot(page, testInfo, 'tidy-confirm');
  await confirm.getByRole('button', { name: 'Yes, tidy up' }).click();
  await expect(confirm).toBeHidden();

  // Running: the bubble says so; the card has no button, only its line.
  const sheet = page.getByRole('dialog', { name: SHEET_NAME });
  // R-AD-8: the sheet and the bubble read the confirmed count (3).
  await expect(
    sheet.getByRole('heading', { name: 'Tidying up 3 things', exact: true }),
  ).toBeVisible();
  await expect(bubble).toHaveText(
    'Tidying up 3 things. It takes a few minutes; you can keep adding.',
  );
  await expect(
    inbox.getByRole('button', { name: 'Being tidied up' }),
  ).toBeVisible();
  await expect(inbox.getByRole('button', { name: 'Tidy up' })).toHaveCount(0);

  // The demo's own copy under the bar (#363, `Demo-Working` board): the
  // scripted run is a recording, not a real one, and the progress row's
  // right-hand badge says so too, instead of "Started n min ago".
  await expect(sheet).toContainText('A recording.');
  await expect(sheet).toContainText(
    'In the demo the bird plays back a real run in twenty seconds',
  );
  await expect(sheet).toContainText('it takes a few minutes');

  // Done: the scripted run files the three items over eight seconds
  // (`src/demo/server.ts`) and the app polls every five. Two were filed
  // and one was a question Bower answered.
  await expect(sheet.getByRole('heading', { name: 'Done' })).toBeVisible({
    timeout: 20_000,
  });
  // R-HOME-0/1: the greeting carries the run (`runSentence`, then what Bower
  // added as a second sentence), the card only the time and the counts.
  await expect(bubble).toContainText(/^Done just now: 2 filed/);
  await expect(bubble).not.toContainText('bike times');
  await expect(bubble).not.toContainText('..');
  await expect(inbox).toContainText('Nothing waiting. Add something.');
  await expect(
    visible(page.locator('.stat-tile', { hasText: 'Last tidy-up' })),
  ).toContainText('2 filed');
  await shot(page, testInfo, 'tidy-up');

  // #506: Done no longer closes itself on a timer — it used to, within 8 s
  // — so the rows and where things went stay readable until Close/Escape.
  await page.waitForTimeout(9_000);
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).first().click();
  await expect(sheet).toBeHidden();
});

test('a filed link reads by its host and path, on the Done sheet and in Recent, not its generated file name (#557)', async ({
  page,
}) => {
  await openHome(page);
  await navigate(page, /^Add$/);
  await saveLink(page, 'https://example.org/offers/job-one');
  await expect(page.getByText('example.org/offers/job-one')).toBeVisible();
  await expect(page.getByText(/^Link - /)).toHaveCount(0);

  await navigate(page, /^Home$/);
  await visible(
    page.getByRole('button', { name: 'Tidy up', exact: true }),
  ).click();
  const confirm = page.getByRole('dialog', { name: 'Is that everything?' });
  await confirm.getByRole('button', { name: 'Yes, tidy up' }).click();
  const sheet = page.getByRole('dialog', { name: SHEET_NAME });
  await expect(sheet.getByRole('heading', { name: 'Done' })).toBeVisible({
    timeout: 20_000,
  });

  // The working sheet only ever has the file name (no cached text, #557):
  // the host it can read back out of the generated name, not the full
  // path Add's own row and Recent (below) can read from the URL itself —
  // still a title, never "Link - example.org 2026-09-28 1414".
  const row = sheet.locator('.working-sheet-row', {
    hasText: 'example.org',
  });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Resources');
  await expect(sheet.getByText(/^Link - /)).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Close' }).first().click();

  // Home's Recent (#306: titles, never file names) reads it the same way.
  await expect(
    page.locator('.list-row-title', { hasText: 'example.org/offers/job-one' }),
  ).toBeVisible();
  await expect(
    page.locator('.list-row-title', { hasText: /^Link - / }),
  ).toHaveCount(0);
});

test('the Last tidy-up card keeps the previous line while the next run goes (#498)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await visible(
    page.getByRole('button', { name: 'Tidy up', exact: true }),
  ).click();
  const confirm = page.getByRole('dialog', { name: 'Is that everything?' });
  await confirm.getByRole('button', { name: 'Yes, tidy up' }).click();
  const sheet = page.getByRole('dialog', { name: SHEET_NAME });
  await expect(sheet.getByRole('heading', { name: 'Done' })).toBeVisible({
    timeout: 20_000,
  });
  await sheet.getByRole('button', { name: 'Close' }).first().click();
  await dismissPushPrompt(page);

  const lastCard = visible(
    page.locator('.stat-tile', { hasText: 'Last tidy-up' }),
  );
  await expect(lastCard).toContainText('2 filed');

  // A second batch, then a second tidy-up: while it goes, the card reads
  // "Tidy-up / Running · n min" (Home-Running board), never "No tidy-up yet".
  await navigate(page, /^Add$/);
  await saveLink(page, 'https://example.com/second');
  await addPileToInbox(page);
  await navigate(page, /^Home$/);
  await visible(
    page.getByRole('button', { name: 'Tidy up', exact: true }),
  ).click();
  await confirm.getByRole('button', { name: 'Yes, tidy up' }).click();
  await expect(sheet).toBeVisible();
  const runningCard = visible(
    page.locator('.stat-tile', { hasText: 'Running ·' }),
  );
  await expect(runningCard).toContainText('Tidy-up');
  await expect(runningCard).not.toContainText('No tidy-up yet');
  await shot(page, testInfo, 'last-tidy-up-during-next-run');
});

test('the working sheet: the bird between Inbox and the folders, the rows as they land (#338)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await visible(
    page.getByRole('button', { name: 'Tidy up', exact: true }),
  ).click();
  const confirm = page.getByRole('dialog', { name: 'Is that everything?' });
  await confirm.getByRole('button', { name: 'Yes, tidy up' }).click();
  await expect(confirm).toBeHidden();

  // Running: the scene, the count against the three things waiting, the
  // demo's own copy in place of "Started just now" and the reassurance
  // line (#363), and the item being read.
  const sheet = page.getByRole('dialog', { name: SHEET_NAME });
  await expect(sheet.locator('.working-sheet-stage')).toContainText('Inbox');
  await expect(sheet.getByText(/it takes a few minutes/)).toBeVisible();
  await expect(sheet.getByText('A recording.')).toBeVisible();
  await expect(
    sheet.getByText(
      'In the demo the bird plays back a real run in twenty seconds',
      { exact: false },
    ),
  ).toBeVisible();
  const rows = sheet.locator('.working-sheet-row');
  await expect(rows.filter({ hasText: 'Reading…' })).toHaveCount(1);

  // The scripted run files one item after another (`src/demo/server.ts`);
  // the app polls every five seconds, so some land before the run ends.
  await expect(rows.filter({ hasText: 'Filed' }).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    rows.filter({ hasText: 'Boiler service invoice' }),
  ).toContainText('Resources › Home');
  await shot(page, testInfo, 'run-working-rows');

  // Done: the listing is read again and the rows name where things went;
  // a request is answered, not filed, so it has no row here.
  await expect(sheet.getByRole('heading', { name: 'Done' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    rows.filter({ hasText: 'Boiler service invoice' }),
  ).toContainText('Resources › Home');
  await expect(rows.filter({ hasText: 'Tomato seedlings' })).toContainText(
    'Resources › Garden',
  );
  await expect(rows.filter({ hasText: 'Reading…' })).toHaveCount(0);
});

// The v6 demo (#903) starts on yesterday's tidy-up, and Home shows the last
// run before the index loads (`homeState`): no first-day loading state to see.
test.fixme('Home loading state: dimmed cards and skeleton rows, never Empty (#322)', async ({
  page,
}, testInfo) => {
  // Holds the demo's folder listing back a few seconds (`src/demo/drive.ts`)
  // so the loading window is long enough to assert against.
  const DELAY_MS = 3000;
  await page.addInitScript((ms: number) => {
    window.__bowerDemoListDelayMs = ms;
  }, DELAY_MS);
  await openHome(page);

  const home = page.locator('.home');
  const bubble = visible(page.locator('.home-bubble'));
  const inbox = visible(page.locator('.stat-tile', { hasText: 'Inbox' }));

  await expect(home).toHaveAttribute('data-state', 'loading');
  await expect(bubble).toHaveText('Looking for what is waiting for you.');
  await expect(page.getByText("Hi, I'm Bower. Add a few things")).toHaveCount(
    0,
  );
  await expect(inbox).toHaveClass(/home-tile-loading/);
  await expect(inbox.locator('.stat-tile-value')).toHaveCount(0);
  await expect(page.locator('.home-recent-skeleton-row')).toHaveCount(5);
  await shot(page, testInfo, 'home-loading');

  // Once the delayed listing resolves, the real numbers replace the
  // skeleton and the state moves on (Waiting, in the demo fixture).
  await expect(home).not.toHaveAttribute('data-state', 'loading', {
    timeout: DELAY_MS + 5_000,
  });
  await expect(inbox.locator('.stat-tile-value')).toBeVisible();
  await expect(page.locator('.home-recent-skeleton-row')).toHaveCount(0);
});

test('the working sheet opens once per run, and the run ends back at Tidy up', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await visible(
    page.getByRole('button', { name: 'Tidy up', exact: true }),
  ).click();
  const confirm = page.getByRole('dialog', { name: 'Is that everything?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Yes, tidy up' }).click();
  await expect(confirm).toBeHidden();

  const sheet = page.getByRole('dialog', { name: SHEET_NAME });
  await expect(sheet).toBeVisible();
  await shot(page, testInfo, 'run-working');
  await sheet.getByRole('button', { name: 'Close' }).first().click();
  await expect(sheet).toBeHidden();

  // Home → Add → Home while the scripted run is still going: no screen
  // mounting again brings the sheet back (#304).
  await navigate(page, /^Add$/);
  await expect(
    page.getByRole('heading', { name: 'Add', exact: true }),
  ).toBeVisible();
  await expect(sheet).toBeHidden();
  await navigate(page, /^Home$/);
  await expect(page).toHaveURL('/');
  await expect(
    visible(page.getByRole('button', { name: 'Being tidied up' })),
  ).toBeVisible();
  await expect(sheet).toBeHidden();
  // The bar shows nothing while the run goes; Home's Inbox card does (#320).
  await expect(page.locator('header.topbar')).not.toContainText('Tidy');

  // Done is not announced by a toast any more (R-HOME-4): the greeting says
  // so, the sheet stays closed and the Inbox card, now empty, points at Add.
  await expect(
    visible(
      page.getByRole('link', { name: /Nothing waiting\. Add something\./ }),
    ),
  ).toBeVisible({ timeout: 25_000 });
  await expect(
    page.getByRole('status').filter({ hasText: 'processed' }),
  ).toHaveCount(0);
  await expect(sheet).toBeHidden();
  await shot(page, testInfo, 'run-done');
});

test('the Bower tab sends a request that waits for the next tidy-up', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await navigate(page, /^Bower$/);
  await expect(page).toHaveURL(/\/bower$/);
  await expect(
    page.getByText('Tell me what you want, in your words.'),
  ).toBeVisible();
  // One box, no Rule/Task/Question selector (#340).
  for (const label of ['A rule', 'A task', 'A question']) {
    await expect(page.getByRole('button', { name: label })).toHaveCount(0);
  }
  // Tabs under 1200 px, three headed columns from there (#357).
  await expect(
    page.getByRole('tab').or(page.locator('.bower-column-head')),
  ).toHaveText(['Rules', 'Requests', 'Activity']);
  await shot(page, testInfo, 'bower');

  // The demo already has a question waiting, so the tip starts closed.
  await page.getByRole('button', { name: 'Things you can ask' }).click();
  await page
    .getByRole('button', {
      name: 'How much did I spend on the kitchen this year?',
    })
    .click();
  const box = page.getByRole('textbox', {
    name: 'Tell Bower what to do, or ask it something',
  });
  await expect(box).toHaveValue(
    'How much did I spend on the kitchen this year?',
  );
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(box).toHaveValue('');
  const requests = bowerPart(page, 'Requests');
  const row = requests
    .getByRole('listitem')
    .filter({ hasText: 'How much did I spend on the kitchen this year?' });
  await expect(row).toBeVisible();
  await expect(row.getByText('Waiting', { exact: true })).toBeVisible();
  await row.scrollIntoViewIfNeeded();
  await shot(page, testInfo, 'tell');

  // No run started: no working sheet, and the note waits in the inbox
  // with the other three (the Inbox card reads the refreshed listing).
  await expect(page.getByRole('dialog', { name: SHEET_NAME })).toHaveCount(0);
  await navigate(page, /^Home$/);
  await expect(
    visible(page.locator('.stat-tile', { hasText: 'Inbox' })).locator(
      '.stat-tile-value',
    ),
  ).toHaveText('4');
});

test('the working sheet dismissed with Escape stays closed after sending a request (#497)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await visible(
    page.getByRole('button', { name: 'Tidy up', exact: true }),
  ).click();
  const confirm = page.getByRole('dialog', { name: 'Is that everything?' });
  await confirm.getByRole('button', { name: 'Yes, tidy up' }).click();
  await expect(confirm).toBeHidden();

  const sheet = page.getByRole('dialog', { name: SHEET_NAME });
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // The run is still going, on the Inbox card's own line, not the sheet.
  await expect(
    visible(page.locator('.stat-tile', { hasText: 'Inbox' })).getByRole(
      'button',
      { name: 'Being tidied up' },
    ),
  ).toBeVisible();

  // Sending a request while that run is still in progress (#497): the
  // sheet used to come back at this point; it must not.
  await navigate(page, /^Bower$/);
  const box = page.getByRole('textbox', {
    name: 'Tell Bower what to do, or ask it something',
  });
  await box.fill('What do I still need for the trip?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(box).toHaveValue('');
  await expect(sheet).toBeHidden();

  await navigate(page, /^Home$/);
  await expect(sheet).toBeHidden();
  await shot(page, testInfo, 'sheet-stays-closed');
});

test('Rules: the explanation on top, groups with counts, pause a rule and see the chip (#342)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await navigate(page, /^Bower$/);
  const rules = bowerPart(page, 'Rules');
  await expect(
    rules.getByText('Rules are yours and start at once.'),
  ).toBeVisible();
  // Alex's groups, each with its count, the name and the count now named
  // apart (#511: "Money4" read as one glued word); only the first is open.
  const money = rules.getByRole('button', { name: 'Money, 4 rules' });
  await expect(money).toHaveAttribute('aria-expanded', 'true');
  await expect(
    rules.getByRole('button', { name: 'Travel, 1 rule' }),
  ).toHaveAttribute('aria-expanded', 'false');
  // Bower's three open suggestions sit on top, with Accept and Dismiss.
  await expect(
    rules.getByRole('region', { name: /^Suggested/ }).getByRole('button', {
      name: 'Accept',
    }),
  ).toHaveCount(3);
  await shot(page, testInfo, 'bower-rules');

  const rule = rules.getByRole('button', { name: /Never archive Money/ });
  await expect(rule.getByText('Paused', { exact: true })).toHaveCount(0);
  await rule.click();
  // A phone action sheet (role menu) or a desktop side panel (#915).
  const sheet = page.locator(
    '.overlay-panel[aria-label="Never archive Money"]',
  );
  await expect(sheet).toBeVisible();
  await shot(page, testInfo, 'bower-rule-menu');
  await sheet.getByText('Pause it', { exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(rule.getByText('Paused', { exact: true })).toBeVisible();
});

test('the Bower box confirmation is a live region that exists before Send (#553)', async ({
  page,
}) => {
  await openHome(page);
  await navigate(page, /^Bower$/);
  const confirm = page.locator('.bower-send-confirm');
  // Present and wired for announcement before anything was ever sent —
  // an element only mounted once there is text is too late for a screen
  // reader to pick up.
  await expect(confirm).toHaveAttribute('aria-live', 'polite');
  await expect(confirm).toHaveText('');

  const box = page.getByRole('textbox', {
    name: 'Tell Bower what to do, or ask it something',
  });
  await box.fill('From now on, file every ticket under Travel');
  await page.getByRole('button', { name: 'Send' }).click();

  // Same node, now holding the confirmation text.
  await expect(confirm).toHaveText('Kept as a rule');
});

test('a "from now on" sentence is kept at once as a rule, no run (#343)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await navigate(page, /^Bower$/);
  const box = page.getByRole('textbox', {
    name: 'Tell Bower what to do, or ask it something',
  });
  await box.fill('From now on, receipts go under Finance');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(box).toHaveValue('');
  const requests = bowerPart(page, 'Requests');
  const row = requests
    .getByRole('listitem')
    .filter({ hasText: 'From now on, receipts go under Finance' });
  await expect(row.getByText('Rule kept', { exact: true })).toBeVisible();
  await shot(page, testInfo, 'bower-rule-kept');
  await expect(page.getByRole('dialog', { name: SHEET_NAME })).toHaveCount(0);
  await row.getByRole('button', { name: 'In your rules' }).click();
  // Under 1200 px it switches to the Rules tab; from 1200 the Rules
  // column is already on screen (#357).
  const rulesTab = page.getByRole('tab', { name: 'Rules' });
  if ((await rulesTab.count()) > 0) {
    await expect(rulesTab).toHaveAttribute('aria-selected', 'true');
  }
  await expect(bowerPart(page, 'Rules')).toBeVisible();
});

/** Opens a request's More menu. A desktop menu hangs under its button, so the
 * row goes to the middle of the window first. */
async function openMore(row: Locator): Promise<void> {
  await row.evaluate((el) => {
    el.scrollIntoView({ block: 'center' });
  });
  await row.getByRole('button', { name: 'More for this request' }).click();
}

test('Requests: every state, Edit, Remove, and Just this, now for the requests only (#344)', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000); // #754: no toast wait, the row itself waits for the run.
  await openHome(page);
  await navigate(page, /^Bower$/);
  await showBowerPart(page, 'Requests');
  const requests = bowerPart(page, 'Requests');
  const rowWith = (text: string) =>
    requests.getByRole('listitem').filter({ hasText: text });

  // The demo's folder: a question waiting in the inbox, an answer, and
  // Alex's own rules.
  const lisbon = rowWith('What do I still need to sort out for the visa?');
  await expect(lisbon.getByText('Waiting', { exact: true })).toBeVisible();
  await expect(lisbon).toContainText('Bower does it at the next tidy-up');
  // The full sentence sent, not the file name's own short title (#465).
  const answered = rowWith('Which subscriptions renew this autumn?');
  await expect(answered.getByText('Answered', { exact: true })).toBeVisible();
  await expect(
    answered.getByRole('link', { name: 'Read the answer' }),
  ).toBeVisible();
  const rule = rowWith('Never archive Money');
  await expect(rule.getByText('Rule kept', { exact: true })).toBeVisible();
  await expect(
    rule.getByRole('button', { name: 'In your rules' }),
  ).toBeVisible();
  await lisbon.scrollIntoViewIfNeeded();
  await shot(page, testInfo, 'bower-requests');

  // Edit: the words in the box, Send rewrites the same note.
  const chooseFrom = async (
    row: ReturnType<typeof rowWith>,
    item: string,
  ): Promise<void> => {
    await openMore(row);
    await page.getByRole('menuitem', { name: item }).click();
  };
  await openMore(lisbon);
  await expect(
    page.getByRole('menu', { name: 'Request actions' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await chooseFrom(lisbon, 'Edit');
  const box = page.getByRole('textbox', {
    name: 'Tell Bower what to do, or ask it something',
  });
  await expect(box).toHaveValue(
    'What do I still need to sort out for the visa?',
  );
  await box.fill('What do I still need to book for the visa?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(box).toHaveValue('');
  const edited = rowWith('What do I still need to book for the visa?');
  await expect(edited.getByText('Waiting', { exact: true })).toBeVisible();
  await expect(lisbon).toHaveCount(0);

  // Remove: a job sent now goes to the Trash and leaves the list.
  await box.fill('Make a packing list for my next trip');
  await page.getByRole('button', { name: 'Send' }).click();
  const job = rowWith('Make a packing list for my next trip');
  await expect(job.getByText('Waiting', { exact: true })).toBeVisible();
  await chooseFrom(job, 'Remove from the inbox');
  await expect(job).toHaveCount(0);

  // Just this, now: no confirmation, the shared helper starts an
  // instructions-only run, and the rest of the inbox stays for the next
  // tidy-up.
  await openMore(edited);
  await expect(
    page.getByRole('menuitem', { name: /Just this, now/ }),
  ).toContainText('uses one run of your Claude plan');
  await shot(page, testInfo, 'bower-requests-do-it-now');
  await page.getByRole('menuitem', { name: /Just this, now/ }).click();
  const sheet = page.getByRole('dialog', { name: SHEET_NAME });
  await sheet.getByRole('button', { name: 'Close' }).first().click();
  await expect(sheet).toBeHidden();
  await expect(
    edited.getByText('Being done now', { exact: true }),
  ).toBeVisible();
  // One file: the request, not the two other things in the inbox.
  // The row keeps the exact sentence sent (the edit) once answered too --
  // not "What do I still need for the visa", the file name's own short title
  // (#465). Same text as `edited` matched while it was still waiting, now
  // in the one row this file becomes (no separate waiting row left).
  await expect(edited).toHaveCount(1);
  await expect(edited.getByText('Answered', { exact: true })).toBeVisible({
    timeout: 25_000,
  });
});

test('a request sent while a run is in flight says it goes with the next tidy-up (#552)', async ({
  page,
}) => {
  await openHome(page);
  await navigate(page, /^Bower$/);
  await showBowerPart(page, 'Requests');
  const requests = bowerPart(page, 'Requests');
  const rowWith = (text: string) =>
    requests.getByRole('listitem').filter({ hasText: text });
  const box = page.getByRole('textbox', {
    name: 'Tell Bower what to do, or ask it something',
  });

  // Start a run on one request (#344's own steps), then send a second one
  // while it is still in flight.
  await box.fill('Draft an itinerary for the weekend');
  await page.getByRole('button', { name: 'Send' }).click();
  const first = rowWith('Draft an itinerary for the weekend');
  await openMore(first);
  await page.getByRole('menuitem', { name: /Just this, now/ }).click();
  const sheet = page.getByRole('dialog', { name: SHEET_NAME });
  await sheet.getByRole('button', { name: 'Close' }).first().click();
  await expect(sheet).toBeHidden();

  await box.fill('Summarise the lease in Flat hunt');
  await page.getByRole('button', { name: 'Send' }).click();

  // The confirmation under the box and the new row must promise the same
  // thing: since #491 a request sent mid-run waits for the *next* one, not
  // this one.
  await expect(page.locator('.bower-send-confirm')).toHaveText(
    'Will go with the next tidy-up',
  );
  const second = rowWith('Summarise the lease in Flat hunt');
  await expect(second).toContainText('Bower does it at the next tidy-up');
});

test('Ideas: grouped examples, Copy fills the Bower box and navigates there (#332)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await navigate(page, /^Bower$/);
  await page.getByRole('button', { name: 'Things you can ask' }).click();
  await page.getByRole('link', { name: 'More ideas' }).click();
  await expect(page).toHaveURL(/\/ideas$/);
  if (testInfo.project.name === 'desktop') {
    // `.screen-title` is phone-hidden (the crumb slot has the title there).
    await expect(
      page.getByRole('heading', { name: 'Ideas', level: 1 }),
    ).toBeVisible();
  }
  for (const group of [
    'Home and money',
    'Health',
    'Trips and projects',
    'Reading',
    'Rules that save time',
  ]) {
    await expect(page.getByRole('heading', { name: group })).toBeVisible();
  }
  await shot(page, testInfo, 'ideas');

  const row = page
    .getByRole('listitem')
    .filter({ hasText: 'How much did I spend on groceries this month?' });
  await row.getByRole('link', { name: 'Copy' }).click();
  await expect(page).toHaveURL(/\/bower\?text=/);
  await expect(
    page.getByRole('textbox', {
      name: 'Tell Bower what to do, or ask it something',
    }),
  ).toHaveValue('How much did I spend on groceries this month?');

  await page.goto('/ideas');

  // Back in the bar is phone-only (#318): the desktop shell has no Back
  // link, so this only applies there.
  if (testInfo.project.name === 'phone') {
    await page.getByRole('link', { name: 'Back to Bower' }).click();
    await expect(page).toHaveURL(/\/bower$/);
  }
});

test('Health points to the Suggested group on the Bower tab, where Accept works (#346)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await page.evaluate(() => {
    history.pushState(null, '', '/health');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  const pointer = page.getByRole('link', {
    name: '3 suggested rules on the Bower tab',
  });
  await expect(pointer).toBeVisible();
  // The cards themselves live on the Bower tab now.
  await expect(page.getByRole('button', { name: 'Accept' })).toHaveCount(0);
  await shot(page, testInfo, 'health');

  await pointer.click();
  await expect(page).toHaveURL(/\/bower$/);
  const suggested = page.getByRole('region', { name: /^Suggested/ });
  await expect(suggested).toBeVisible();
  const card = suggested
    .getByRole('listitem')
    .filter({ hasText: 'Recipes go to Cooking' });
  await expect(suggested.getByRole('listitem')).toHaveCount(3);
  await shot(page, testInfo, 'bower-suggested');

  await card.getByRole('button', { name: 'Accept' }).click();
  await expect(
    suggested.getByText('Added to your rules: Recipes go to Cooking.'),
  ).toBeVisible();
  await expect(suggested.getByRole('listitem')).toHaveCount(2);
});

test('Settings switches the theme to dark, and it sticks', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await openSettings(page);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await page.getByRole('radio', { name: 'Dark' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await shot(page, testInfo, 'settings');
});

test('Settings footer carries the build commit next to the version (#512)', async ({
  page,
}) => {
  await openHome(page);
  await openSettings(page);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  // The demo build runs from this same git checkout, so a real commit is
  // always available: no dangling "Bower 0.1.0 ·" with nothing after it.
  // #917: one footer line, "Bower <version> · <sha> · Source code · …".
  await expect(page.locator('.settings-footer')).toHaveText(
    /^Bower \d+\.\d+\.\d+ · [0-9a-f]{7,12} · Source code · Privacy · Terms$/,
  );
});

test('What is Bower from Settings: Skip goes back to Settings, and the last page ends on Back to Bower (#329, #918)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await openSettings(page);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Learn Bower', level: 2 }),
  ).toBeVisible();

  // Settings > Learn Bower group > Examples and use cases > the intro card.
  const openIntro = async (): Promise<void> => {
    await page.getByRole('button', { name: /Examples and use cases/ }).click();
    await expect(page).toHaveURL(/\/learn$/);
    await page.getByRole('link', { name: /The intro/ }).click();
  };
  await openIntro();
  await expect(page).toHaveURL(/\/welcome\?from=settings&page=1$/);
  await expect(
    page.getByRole('heading', { name: /Bower files it/ }),
  ).toBeInViewport();

  // Skip on pages 1 to 4, as everywhere (boards IN-P1..P4).
  const skip = page.getByRole('button', { name: 'Skip', exact: true });
  await expect(skip).toBeVisible();
  await shot(page, testInfo, 'intro-from-settings');

  // Skipping on page 1 goes straight back to Settings, not the sign-in.
  await skip.click();
  await expect(page).toHaveURL(/\/settings$/);

  // Walking all five pages ends on Back to Bower, not Sign in with Google.
  await openIntro();
  const next = page.getByRole('button', { name: 'Next', exact: true });
  for (let index = 0; index < 4; index += 1) {
    await next.click();
  }
  await expect(
    page.getByRole('heading', { name: 'Only your Drive' }),
  ).toBeInViewport();
  await expect(
    page.getByRole('link', { name: 'Sign in with Google' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to Bower' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('Settings runs the v3 section order, sign-in-way at the bottom (#309)', async ({
  page,
}) => {
  await openHome(page);
  await openSettings(page);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  // Account · Tidying up · Look · Bower · Learn Bower · Advanced, in that order (scoped
  // to the settings section: the desktop sidebar has its own h2s).
  const headings = await page
    .locator('.settings')
    .getByRole('heading', { level: 2 })
    .allTextContents();
  expect(headings).toEqual([
    'Tidying up',
    'Look',
    'Bower',
    'Learn Bower',
    'Advanced',
  ]);

  // The web-lookup switch (#374): off by default, and it turns on.
  const webLookup = page
    .locator('.settings')
    .getByRole('switch', { name: 'Let Bower look things up on the web' });
  await expect(webLookup).toBeVisible();
  await expect(webLookup).toBeEnabled();
  await expect(webLookup).not.toBeChecked();
  await webLookup.click();
  await expect(webLookup).toBeChecked();
  await webLookup.click();
  await expect(webLookup).not.toBeChecked();

  // Sign out is a plain button, apart from Sign out everywhere. In the
  // demo build (#917, spec §4.14 states) the account controls stay on
  // screen as drawn, disabled, each with "Not in the demo. Run your own
  // Bower to use it.": the push toggle, the key box, Sign out and Delete. Scoped to
  // the settings section: the desktop sidebar has its own Sign out button.
  const settings = page.locator('.settings');
  await expect(
    settings.getByRole('button', { name: 'Sign out', exact: true }),
  ).toBeDisabled();
  await expect(
    settings.getByRole('button', { name: 'Sign out everywhere' }),
  ).toBeDisabled();
  await expect(
    settings.getByText('Not in the demo. Run your own Bower to use it.'),
  ).toHaveCount(4);

  const pushToggle = settings.getByRole('switch', {
    name: 'Ping me when it is done',
  });
  await expect(pushToggle).toBeDisabled();
});

test.describe('/login never redirects to the intro (#313)', () => {
  test.use({ introSeen: false });

  test('a first-time visitor who goes straight to /login sees sign-in, not the intro', async ({
    page,
  }) => {
    // In the demo build a signed-in-as-Alex visitor at /login sees "Run
    // your own Bower" (app.tsx), never the sign-in form — but either way
    // it must never bounce to /welcome just because the intro is unseen.
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole('heading', { name: 'Run your own Bower', level: 1 }),
    ).toBeVisible();
  });
});

test('Terms and Privacy Back go to /login when signed out, back through history otherwise (#313)', async ({
  page,
}) => {
  await openHome(page);
  await openSettings(page);
  await visible(page.getByRole('link', { name: 'Terms' })).click();
  await expect(page).toHaveURL(/\/terms$/);

  // Signed in (the demo is always signed in as Alex): Back steps through
  // history to Settings, not to /login.
  await visible(page.getByRole('button', { name: 'Back' })).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test('four tabs on the phone, the sidebar instead on desktop', async ({
  page,
}, testInfo) => {
  await openHome(page);
  const tabs = page.locator('nav.bottom-nav');
  if (testInfo.project.name === 'desktop') {
    await expect(tabs).toBeHidden();

    // The sidebar (#422, #909, C.9): the three tools on YOUR FOLDERS (#909
    // replaced the Expand/Collapse all toggle). No board draws a count
    // bubble on a nav item (#950 D-1).
    const sidebar = page.getByRole('navigation', { name: 'Your folders' });
    for (const name of [
      'Show the open item',
      'Sort your folders',
      'Collapse all folders',
    ]) {
      await expect(sidebar.getByRole('button', { name })).toBeVisible();
    }
    await expect(sidebar.locator('.nav-badge')).toHaveCount(0);
    await expect(page.locator('.shell-ledge')).toHaveCount(0);
    await shot(page, testInfo, 'desktop-sidebar');
    return;
  }
  await expect(tabs).toBeVisible();
  const links = tabs.getByRole('link');
  // The labels; the Bower tab is the speech bubble the boards draw (#950 D-2).
  await expect(links.locator(':scope > span')).toHaveText([
    'Home',
    'Folders',
    'Add',
    'Bower',
  ]);
  await expect(links.last().locator('svg.b')).toHaveCount(0);
  await expect(links.last().locator('svg.icon')).toHaveCount(1);
  await expect(links.first()).toHaveAttribute('aria-current', 'page');

  await tabs.getByRole('link', { name: 'Folders' }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(links.nth(1)).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('button', { name: 'Search folders, notes and files' }),
  ).toBeVisible();
  await expect(page.getByRole('tree').first()).toBeVisible();
  await shot(page, testInfo, 'tabs-notes');
});

// #909: the Folders tab is the drawer's tree at full width. It has no meaning
// lines, no bar button, no hidden-files line and no Health subtitle; the
// tools sit on YOUR FOLDERS and Answers, Clippings, Health check come after
// the tree.
test('the Notes tab: the tree, its tools, then Answers, Clippings and Health check (#353, #909)', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'desktop',
    'the Notes tab is phone-only; desktop keeps the sidebar',
  );
  await openHome(page);
  // Scoped to the bottom nav (#367 added a note titled "Notes from the
  // viewing", otherwise an ambiguous substring match on Home's own list).
  await page
    .locator('nav.bottom-nav')
    .getByRole('link', { name: 'Folders' })
    .click();
  await expect(page).toHaveURL(/\/notes$/);

  const bar = page.locator('header.topbar');
  await expect(bar.getByRole('button', { name: /all folders$/ })).toHaveCount(
    0,
  );
  const screen = page.locator('.explorer-page');
  for (const name of [
    'Show the open item',
    'Sort your folders',
    'Collapse all folders',
  ]) {
    await expect(screen.getByRole('button', { name })).toBeVisible();
  }

  const tree = page.getByRole('tree').first();
  const inbox = tree.locator('a[href="/folder/0-Inbox"]');
  await expect(inbox).toBeVisible();
  await expect(inbox).not.toContainText('Waiting for the next tidy-up');
  await expect(tree.locator('a[href="/folder/Answers"]')).toHaveCount(0);
  const answers = screen.locator('.explorer-below a[href="/folder/Answers"]');
  await expect(answers).toHaveText('Answers');

  const health = screen.locator('.explorer-below a[href="/health"]');
  await expect(health).toContainText('Health check');
  await expect(health).not.toContainText('small things to fix');
  await expect(screen.locator('.explorer-hidden')).toHaveCount(0);
  // Answers, Clippings and Health check sit after the tree.
  const belowBox = await screen.locator('.explorer-below').boundingBox();
  const treeBox = await tree.boundingBox();
  expect((belowBox?.y ?? 0) >= (treeBox?.y ?? 0)).toBe(true);

  await shot(page, testInfo, 'notes-tab');

  // The search row opens the quick switcher (#433, Phone-Notes board), and
  // closing it lands back on the Notes tab.
  await page
    .getByRole('button', { name: 'Search folders, notes and files' })
    .click();
  const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
  // Focus moves into the switcher once it is open: wait for that first.
  await expect(switcher.getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(switcher).toBeHidden();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(tree).toBeVisible();
});

test('an old /tell link opens the Bower tab with its text', async ({
  page,
}) => {
  await openHome(page);
  await page.evaluate(() => {
    history.pushState(null, '', '/tell?text=Hello%20Bower');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL(/\/bower\?text=Hello(\+|%20)Bower$/);
  await expect(
    page.getByRole('textbox', {
      name: 'Tell Bower what to do, or ask it something',
    }),
  ).toHaveValue('Hello Bower');
});

// #906: the "?" left the bar; Help comes back in the ⋯ menu (#907, #919).
test.fixme('the top bar: title, "?", avatar, no folder menu; Back on a note', async ({
  page,
}, testInfo) => {
  await openHome(page);
  const bar = page.locator('header.topbar');
  const help = bar.getByRole('button', { name: 'About this screen' });
  await expect(help).toBeVisible();
  if (testInfo.project.name === 'phone') {
    await expect(bar.getByRole('button', { name: 'Your folders' })).toHaveCount(
      0,
    );
    await expect(bar.getByText('Home', { exact: true })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Settings' })).toHaveText('A');
    await shot(page, testInfo, 'bar-home');
  }

  // "?" opens the Help template for this tab (#907), no counter.
  await help.click();
  const sheet = page.getByRole('dialog', { name: 'Home' });
  await expect(sheet.getByText('Help and about this')).toBeVisible();
  await expect(sheet.getByText('Tour ·')).toHaveCount(0);
  await expect(sheet.getByRole('link', { name: 'Learn Bower' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Close Help' }).click();
  await expect(sheet).toBeHidden();

  await visible(page.getByRole('link', { name: /^Bower$/ })).click();
  await help.click();
  const bower = page.getByRole('dialog', { name: 'Bower' });
  await expect(bower.getByText('Help and about this')).toBeVisible();
  if (testInfo.project.name === 'phone') {
    await shot(page, testInfo, 'help-bower');
  }
  // "Show me around" goes Home and runs the tour from its first sheet.
  await bower.getByRole('button', { name: 'Show me around' }).click();
  await expect(page).toHaveURL(/\/$/);
  const tour = page.getByRole('dialog', { name: 'Home' });
  await expect(tour.getByText('Tour · 1 of 4')).toBeVisible();
  await tour.getByRole('button', { name: 'Skip' }).click();
  await expect(tour).toBeHidden();

  if (testInfo.project.name !== 'phone') return;
  // A reload: `tourSeenAt` already persisted above (#494), so Home opens
  // with no tour to skip.
  await page.goto('/');
  await visible(
    page.getByRole('button', { name: /^Search( folders, notes and files)?$/ }),
  ).click();
  const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
  await switcher.getByRole('combobox').fill('Lisbon');
  await switcher
    .getByRole('option', { name: /Lisbon Trip/ })
    // The folder of the same name is listed first (#593): open the note.
    .filter({ has: page.locator('[data-kind="note"]') })
    .first()
    .click();
  await expect(page).toHaveURL(/\/note\//);
  await expect(bar.getByRole('button', { name: 'Your folders' })).toHaveCount(
    0,
  );
  await expect(bar.getByRole('link', { name: /^Back to / })).toBeVisible();
  // The title is on the page, not in the bar (#704).
  await expect(bar.locator('.topbar-title')).toHaveCount(0);
  await shot(page, testInfo, 'bar-note');
});

test("a note's top bar: the title keeps a readable floor, Back gives way first, and one More menu (#426)", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the phone top bar only');
  await openHome(page);
  const bar = page.locator('header.topbar');

  // Lisbon Trip is its own folder's hub note, so Back points to a name as
  // long as the title itself -- the exact shape that used to leave both
  // cut to a few letters (#426).
  await visible(
    page.getByRole('button', { name: /^Search( folders, notes and files)?$/ }),
  ).click();
  const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
  await switcher.getByRole('combobox').fill('Lisbon');
  await switcher
    .getByRole('option', { name: /Lisbon Trip/ })
    // The folder of the same name is listed first (#593): open the note.
    .filter({ has: page.locator('[data-kind="note"]') })
    .first()
    .click();
  await expect(page).toHaveURL(/\/note\//);

  // The bar has Back only (#704), and never grows past the viewport.
  await expect
    .poll(async () => page.evaluate(() => document.body.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  // Back still works, and its full destination is there for a screen
  // reader even while its visible label is short (or gone).
  const back = bar.getByRole('link', { name: 'Back to Lisbon Trip' });
  await expect(back).toBeVisible();

  // One More menu, not two (#439): since #912 it is the page header's ⋯,
  // named for the note, and the bar has none (G-10).
  await expect(bar.getByRole('button', { name: 'More' })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'More for Lisbon Trip' }),
  ).toHaveCount(1);

  // A title far longer than Back's own label still fits the bar with no
  // horizontal overflow, the same guarantee from the other direction.
  // A reload, not `openHome`: `tourSeenAt` already persisted (#494), so
  // Home opens with no tour to skip.
  await page.goto('/');
  await visible(
    page.getByRole('button', { name: /^Search( folders, notes and files)?$/ }),
  ).click();
  await switcher.getByRole('combobox').fill('subscriptions renew');
  await switcher
    .getByRole('option', { name: /subscriptions renew/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/note\//);
  await expect
    .poll(async () => page.evaluate(() => document.body.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test('The bar and the bottom nav align with the content column at 768 (#311)', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await openHome(page);

  // Same centred, 640 px box: the bar, the content column and the bottom
  // nav all share the same left edge and width instead of the bar sitting
  // at a fixed 24 px, the content starting at 64 px and the nav spanning
  // the full viewport.
  const topbar = page.locator('.topbar');
  const content = page.locator('.content').first();
  const bottomNav = page.locator('.bottom-nav');

  const [topbarBox, contentBox, navBox] = await Promise.all([
    topbar.boundingBox(),
    content.boundingBox(),
    bottomNav.boundingBox(),
  ]);

  expect(topbarBox).not.toBeNull();
  expect(contentBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  expect(topbarBox?.x).toBeCloseTo(contentBox?.x ?? NaN, 0);
  expect(topbarBox?.width).toBeCloseTo(contentBox?.width ?? NaN, 0);
  expect(navBox?.x).toBeCloseTo(contentBox?.x ?? NaN, 0);
  expect(navBox?.width).toBeCloseTo(contentBox?.width ?? NaN, 0);

  await shot(page, testInfo, 'tablet-768');
});

/**
 * Every rendered element whose right edge comes within 40 px of the
 * viewport's (#355, the Desktop-Responsive board's rule: at 1920 nothing
 * touches the right edge). The page's own full-width wrappers are skipped:
 * they span the window by design, and what counts is what sits inside them.
 */
async function rightEdgeHuggers(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth - 40;
    const wrappers = ['#app', '.shell', '.shell-main'];
    const found: string[] = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (wrappers.some((selector) => el.matches(selector))) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      if (!el.checkVisibility({ visibilityProperty: true })) continue;
      if (box.right > limit) {
        const name = el.className === '' ? el.tagName : String(el.className);
        found.push(`${name} ends at ${String(Math.round(box.right))}`);
      }
    }
    return found;
  });
}

test('At 1920 the content stays in one centred container, away from the right edge (#355)', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'The container is the desktop layout; the phone has its own column.',
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openHome(page);

  const container = page.locator('.shell-container');
  const content = page.locator('main.content');
  const width = async (): Promise<number> =>
    (await container.boundingBox())?.width ?? NaN;

  // Home: 1000 px, centred right of the sidebar; the header row inside.
  // #909: the sidebar's Inbox row is a treeitem, and #934's demo Home has no
  // visible Inbox link; the page is ready once the tree shows Inbox.
  await expect(
    page.getByRole('treeitem', { name: /Inbox/ }).first(),
  ).toBeVisible();
  expect(await width()).toBeCloseTo(1000, 0);
  const [box, main, bar] = await Promise.all([
    container.boundingBox(),
    page.locator('.shell-main').boundingBox(),
    page.locator('.topbar').boundingBox(),
  ]);
  const left = (box?.x ?? NaN) - (main?.x ?? NaN);
  const right =
    (main?.x ?? NaN) +
    (main?.width ?? NaN) -
    (box?.x ?? NaN) -
    (box?.width ?? NaN);
  expect(left).toBeCloseTo(right, 0);
  // #920 DA-17: Home's desktop bar holds nothing, so it takes no row.
  expect(bar).toBeNull();
  expect(await rightEdgeHuggers(page)).toEqual([]);
  await shot(page, testInfo, 'container-1920-home');

  // A note, with its About panel: the container grows to 1200, still centred.
  await visible(
    page.getByRole('button', { name: /^Search( folders, notes and files)?$/ }),
  ).click();
  const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
  await switcher.getByRole('combobox').fill('subscriptions renew');
  await switcher
    .getByRole('option', { name: /subscriptions renew/ })
    .first()
    .click();
  await expect(page.locator('.bower-note-box')).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'About this note' }),
  ).toBeVisible();
  expect(await width()).toBeCloseTo(1200, 0);
  expect(await rightEdgeHuggers(page)).toEqual([]);
  await shot(page, testInfo, 'container-1920-note');

  await navigate(page, /^Add$/);
  await expect(page).toHaveURL(/\/add$/);
  await expect(content).toBeVisible();
  expect(await width()).toBeCloseTo(1000, 0);
  expect(await rightEdgeHuggers(page)).toEqual([]);
  await shot(page, testInfo, 'container-1920-add');

  await navigate(page, /^Bower$/);
  await expect(bowerPart(page, 'Rules')).toBeVisible();
  expect(await rightEdgeHuggers(page)).toEqual([]);
  await shot(page, testInfo, 'container-1920-bower');

  await openSettings(page);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  expect(await rightEdgeHuggers(page)).toEqual([]);
  await shot(page, testInfo, 'container-1920-settings');
});

test('Home on desktop: three equal stat tiles (E-8), Pinned tiles on the same grid, Recent in two columns (#356)', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'The desktop grid; the phone keeps its own Home.',
  );
  const cards = page.locator('.home-tiles > *');
  const boxes = async (
    locator: typeof cards,
  ): Promise<{ x: number; y: number; width: number }[]> =>
    await locator.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width };
      }),
    );
  // Nothing inside Home ends past Home's own right edge (6.1.1: at 1024
  // the send button was clipped by the viewport).
  const clipped = async (): Promise<string[]> =>
    page.locator('.home').evaluate((home) => {
      const edge = home.getBoundingClientRect().right + 0.5;
      const found: string[] = [];
      for (const el of home.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > edge) found.push(String(el.className));
      }
      return found;
    });

  // 1024: the content column is narrow, so the cards are 2 x 2.
  await page.setViewportSize({ width: 1024, height: 900 });
  await openHome(page);
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(2)).toBeVisible();
  let grid = await boxes(cards);
  expect(new Set(grid.map((b) => Math.round(b.width))).size).toBe(1);
  expect(new Set(grid.map((b) => Math.round(b.y))).size).toBe(2);
  expect(await clipped()).toEqual([]);
  // No Tell column on Home (#347).
  await expect(page.getByRole('textbox', { name: /Tell Bower/ })).toHaveCount(
    0,
  );
  await shot(page, testInfo, 'home-desktop-1024');

  // 1280: three equal tiles in one row; the Pinned tiles on the same
  // columns; Recent in two columns.
  await page.setViewportSize({ width: 1280, height: 900 });
  grid = await boxes(cards);
  expect(new Set(grid.map((b) => Math.round(b.width))).size).toBe(1);
  expect(new Set(grid.map((b) => Math.round(b.y))).size).toBe(1);
  const tiles = await boxes(page.locator('.home-pinned-grid > *'));
  expect(tiles.length).toBeGreaterThan(0);
  // The fixture's pin, on this first (cold-cache) load: Housing Search
  // Australia (#903, HM-Main board).
  await expect(
    page
      .locator('.home-pinned-grid')
      .getByText('Housing Search Australia', { exact: true }),
  ).toBeVisible();
  tiles.forEach((tile, i) => {
    expect(tile.x).toBeCloseTo(grid[i % 3]?.x ?? NaN, 0);
    expect(tile.width).toBeCloseTo(grid[i % 3]?.width ?? NaN, 0);
  });
  const recent = await boxes(page.locator('.home-notes > li'));
  expect(recent.length).toBeGreaterThan(1);
  expect(new Set(recent.map((b) => Math.round(b.x))).size).toBe(2);
  expect(await clipped()).toEqual([]);
  await shot(page, testInfo, 'home-desktop-1280');
});

test('The Bower tab in three aligned columns from 1200, segments below (#357)', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'The columns are desktop-only; the phone keeps the segments.',
  );
  const heads = page.locator('.bower-column-head');
  const box = page.locator('.bower-box');
  const columns = page.locator('.bower-columns');

  for (const width of [1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 1280) {
      await openHome(page);
      await navigate(page, /^Bower$/);
    }
    await expect(heads).toHaveText(['Rules', 'Requests', 'Activity']);
    await expect(page.getByRole('tablist')).toHaveCount(0);
    // One header height and one top line for the three columns.
    const rects = await heads.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, height: r.height, width: r.width };
      }),
    );
    expect(new Set(rects.map((r) => Math.round(r.top))).size).toBe(1);
    expect(new Set(rects.map((r) => Math.round(r.height))).size).toBe(1);
    expect(new Set(rects.map((r) => Math.round(r.width))).size).toBe(1);
    // The box spans the three columns above them.
    const [boxRect, columnsRect] = await Promise.all([
      box.boundingBox(),
      columns.boundingBox(),
    ]);
    expect(boxRect?.x).toBeCloseTo(columnsRect?.x ?? NaN, 0);
    expect(boxRect?.width).toBeCloseTo(columnsRect?.width ?? NaN, 0);
    expect((boxRect?.y ?? NaN) < (columnsRect?.y ?? NaN)).toBe(true);
    await shot(page, testInfo, `bower-columns-${String(width)}`);
  }

  // Under 1200: the segments, as on the phone.
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(page.getByRole('tab')).toHaveText([
    'Rules',
    'Requests',
    'Activity',
  ]);
  await expect(columns).toHaveCount(0);
});

test('At 1920 a note and its About panel are one row next to the measure, centred (#358)', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'The About panel beside the note is desktop-only.',
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openHome(page);
  await visible(
    page.getByRole('button', { name: /^Search( folders, notes and files)?$/ }),
  ).click();
  const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
  await switcher.getByRole('combobox').fill('subscriptions renew');
  await switcher
    .getByRole('option', { name: /subscriptions renew/ })
    .first()
    .click();
  const panel = page.getByRole('complementary', { name: 'About this note' });
  await expect(panel).toBeVisible();

  const [text, aside, body] = await Promise.all([
    page.locator('.note-view').boundingBox(),
    panel.boundingBox(),
    page.locator('.shell-body').boundingBox(),
  ]);
  const textRight = (text?.x ?? NaN) + (text?.width ?? NaN);
  // The panel starts right after the text column's 32 px padding (#950
  // F-9), not on the far side of the container (6.1.5: 900 px away at 1920).
  expect((aside?.x ?? NaN) - textRight).toBeLessThanOrEqual(33);
  expect((aside?.x ?? NaN) - textRight).toBeGreaterThanOrEqual(0);
  // The row (text column and panel) is centred in the container.
  const left = (text?.x ?? NaN) - 32 - (body?.x ?? NaN);
  const right =
    (body?.x ?? NaN) +
    (body?.width ?? NaN) -
    (aside?.x ?? NaN) -
    (aside?.width ?? NaN);
  expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  await shot(page, testInfo, 'note-measure-1920');
});

/** The desktop widths every wide screen is drawn and checked at (#359,
 * Desktop-Responsive board; `docs/testing.md`). */
const DESKTOP_WIDTHS = [1024, 1280, 1440, 1920] as const;

test('Home, a note, Add, the Bower tab and Settings at 1024, 1280, 1440 and 1920; nothing changes above 1200 (#359)', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'The four desktop widths; the phone project has its own.',
  );
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openHome(page);

  // Each screen, reached the way a person would, then read back at every
  // width (resizing keeps the page and its state).
  const screens: [string, () => Promise<void>][] = [
    ['home', () => navigate(page, /^Home$/)],
    [
      'note',
      async () => {
        await visible(
          page.getByRole('button', {
            name: /^Search( folders, notes and files)?$/,
          }),
        ).click();
        const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
        await switcher.getByRole('combobox').fill('subscriptions renew');
        await switcher
          .getByRole('option', { name: /subscriptions renew/ })
          .first()
          .click();
        await expect(page.locator('.bower-note-box')).toBeVisible();
      },
    ],
    ['add', () => navigate(page, /^Add$/)],
    ['bower', () => navigate(page, /^Bower$/)],
    ['settings', () => openSettings(page)],
  ];
  const container = page.locator('.shell-container');
  for (const [name, open] of screens) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open();
    await expect(page.locator('main.content')).toBeVisible();
    const widths: number[] = [];
    for (const width of DESKTOP_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      widths.push((await container.boundingBox())?.width ?? NaN);
      await shot(page, testInfo, `widths-${String(width)}-${name}`);
    }
    // No breakpoint above 1200: past the container's own cap, a wider
    // window only adds margin.
    if (name !== 'note') expect(widths[3]).toBeCloseTo(widths[2] ?? NaN, 0);
  }
});

test('Settings, Health, Ideas, Terms, Privacy and Not found share one centred column (#360)', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'The shared column is checked on desktop, where it is narrower than the content.',
  );
  await openHome(page);
  const pages: [string, string, RegExp][] = [
    ['settings', '/settings', /^Settings$/],
    ['health', '/health', /Health check/],
    ['ideas', '/ideas', /Ideas/],
    ['terms', '/terms', /Terms/],
    ['privacy', '/privacy', /Privacy/],
    ['not-found', '/note/does-not-exist', /can.t find that/],
  ];
  const widths: number[] = [];
  for (const [name, path, heading] of pages) {
    await page.goto(path);
    await expect(
      page.getByRole('heading', { name: heading, level: 1 }).first(),
    ).toBeVisible();
    const column = page.locator('.page-column');
    await expect(column).toHaveCount(1);
    // Measured against the box it sits in: the shell's content column,
    // or the bare page for Terms and Privacy when they open outside it.
    const [box, content] = await Promise.all([
      column.boundingBox(),
      column.evaluate((el) => {
        const parent = el.parentElement ?? el;
        const r = parent.getBoundingClientRect();
        const style = getComputedStyle(parent);
        return {
          left: r.left + parseFloat(style.paddingLeft),
          right: r.right - parseFloat(style.paddingRight),
        };
      }),
    ]);
    widths.push(box?.width ?? NaN);
    // Centred in the content column: the same margin on both sides.
    const left = (box?.x ?? NaN) - content.left;
    const right = content.right - (box?.x ?? NaN) - (box?.width ?? NaN);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    await shot(page, testInfo, `single-column-${name}`);
  }
  // One width for all six: the Settings column, 640 px on the board.
  expect(new Set(widths.map((w) => Math.round(w)))).toEqual(new Set([640]));
});

test('A folder with notes only in a subfolder says so, not "Nothing here yet" (#310)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  // Projects (the demo fixture) has no notes of its own — Housing Search
  // Australia and Job Search Australia hold all of them — a real
  // instance of 1.9: the header's count is the whole subtree, the empty
  // state used to say "Nothing here yet" regardless.
  await page.goto('/folder/1-Projects');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Projects', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Nothing here yet.')).toBeHidden();
  // #911: a folder of folders shows its subfolders as cards (AR-Main), and
  // its meta line counts them.
  await expect(page.locator('.folder-card').first()).toBeVisible();
  await expect(page.locator('.page-header-meta')).toHaveText(
    /^Projects · \d+ folders? · updated /,
  );
  await shot(page, testInfo, 'folder-notes-elsewhere');
});

test('A root folder explained: the meaning line, then its subfolders (#348)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await page.goto('/folder/1-Projects');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Projects', exact: true }),
  ).toBeVisible();
  // #911: the purpose line sits in the page header, under the meta line;
  // there is no chip row any more.
  await expect(page.locator('.page-header-purpose')).toHaveText(
    'Things with an end date',
  );
  await expect(page.locator('.header-action')).toHaveCount(0);
  // The Phone-Folder board's details (#431): the heading without the
  // numeric prefix, "N projects · N things", a second line on each
  // subfolder row.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Projects', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.page-header-meta')).toHaveText(
    /^Projects · \d+ folders? · updated /,
  );
  await expect(
    page
      .locator(
        'a.folder-card[href="/folder/1-Projects/Housing%20Search%20Australia"]',
      )
      .locator('.folder-card-meta'),
  ).toHaveText(/^\d+ things?( · updated [^·]+)?/);
  await shot(page, testInfo, 'folder-root-explained');

  // A non-root folder (a project) has no meaning line to show.
  await page.goto('/folder/4-Archives/Lisbon%20Trip');
  // The h1 only: once the project note loads, its front card adds an h2 with
  // the same name, which made the role query ambiguous whenever the note
  // arrived before the check ran.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Lisbon Trip', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.page-header-purpose')).toHaveCount(0);
});

test('The folder header has the title and ⋯, no chip row (#911), and the tree hides zero counts (#310)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await page.goto('/folder/4-Archives/Lisbon%20Trip');
  // The page's own heading (the preview may show the hub note's h1 too).
  await expect(
    page.locator('h1.page-header-title', { hasText: 'Lisbon Trip' }),
  ).toBeVisible();
  // #911 (R-PF-1): Pin, Ask and Drive live in ⋯ beside the title.
  await expect(page.locator('.header-action')).toHaveCount(0);
  await expect(page.locator('.page-header-more')).toBeVisible();
  await shot(page, testInfo, 'folder-chips');

  // #909: the tree shows no counts at all (K-1), so none reads "0".
  if (testInfo.project.name === 'phone') await navigate(page, /^Folders$/);
  await expect(page.locator('.tree-count')).toHaveCount(0);
});

test('folder counts add files and notes together, the same total the folder screen itself lists (#425)', async ({
  page,
}, testInfo) => {
  await openHome(page);

  // #909: the tree no longer shows counts (K-1); the folder screen's own
  // header keeps the total of files and notes together.
  if (testInfo.project.name === 'phone') await navigate(page, /^Folders$/);
  await expect(page.locator('.tree-count')).toHaveCount(0);

  // 0-Inbox: 1 file (the boiler invoice) + 1 note (Tomato seedlings) — the
  // folder screen's own header already says "1 file · 1 note".
  await page.goto('/folder/0-Inbox');
  // #911 (K-31): one count, the sum of the segments.
  await expect(page.locator('.page-header-meta')).toHaveText(
    /^Inbox · 2 things · updated /,
  );
});

test('a project folder lists its files and notes together, newest first, with who put each there', async ({
  page,
}, testInfo) => {
  await page.goto('/folder/4-Archives/Kitchen%20Refresh');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Kitchen Refresh' }),
  ).toBeVisible();
  await expect(page.locator('.page-header-meta')).toHaveText(
    /^Archives · (Active · )?\d+ things · updated /,
  );

  const rows = page.locator('.folder-item');
  await expect(rows.first()).toBeVisible();
  // The board's row lines (#611): the kind word and size for a file, "Note
  // · written by you" for the person's own notes.
  await expect(rows.nth(0)).toContainText('Sage green test patch');
  await expect(rows.nth(0).locator('.list-row-meta')).toHaveText('Photo');
  await expect(rows.nth(1)).toContainText('Shelves and tap quote');
  await expect(rows.nth(1).locator('.list-row-meta')).toHaveText('PDF');
  await expect(rows.nth(2).locator('.list-row-meta')).toHaveText('Note');

  // A file opens on its own screen; a note opens in the app.
  await expect(rows.nth(1)).toHaveAttribute('href', /^\/file\//);
  await expect(rows.nth(2)).toHaveAttribute('href', /^\/note\//);
  await shot(page, testInfo, 'folder-project');

  // #911: no "Try asking" card (E-6) and no header actions: Pin, Ask and
  // Open in Drive live in ⋯.
  await expect(page.getByText('Try asking')).toHaveCount(0);
  await expect(page.locator('.header-action')).toHaveCount(0);
});

test('a file opens on its own screen: the photo inline, the PDF without a preview says so', async ({
  page,
}, testInfo) => {
  await page.goto('/folder/4-Archives/Kitchen%20Refresh');
  await page
    .locator('.folder-item', { hasText: 'Sage green test patch' })
    .press('Enter');
  await expect(page).toHaveURL(/\/file\//);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Sage green test patch' }),
  ).toBeVisible();
  const props = page.locator('.page-header-meta');
  await expect(props).toContainText('Photo ·');
  await expect(props).toContainText('filed by Bower');
  // The photo viewer (#605, #606): the photo fitted, tap to see it whole.
  await expect(
    page.getByRole('button', { name: /Sage green test patch\. Tap to see/ }),
  ).toBeVisible();
  await expect(page.locator('.photo-viewer-fit')).toHaveAttribute(
    'src',
    /^blob:/,
  );
  await shot(page, testInfo, 'file-photo');

  await page.goto('/folder/4-Archives/Kitchen%20Refresh');
  await page
    .locator('.folder-item', { hasText: 'Shelves and tap quote' })
    .press('Enter');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Shelves and tap quote' }),
  ).toBeVisible();
  await expect(props).toContainText('PDF ·');
  // The demo has no Drive thumbnails, and no real Drive page behind its
  // fixture ids either (#555): one sentence, no link to a broken page.
  const none = page.getByText('There is no preview for this file');
  await expect(none).toBeVisible();
  await expect(
    none.getByText('Not in the demo. Run your own Bower to use it.'),
  ).toBeVisible();
  await expect(
    none.getByRole('link', { name: 'open it in Drive' }),
  ).toHaveCount(0);
  // #777: the suggestion is a chip that opens the send sheet, prefilled.
  await page.getByRole('button', { name: /Summarise this/ }).click();
  await expect(
    page.getByRole('textbox', { name: 'Your question' }),
  ).toHaveValue(/^Summarise this/);
  await page.getByRole('button', { name: 'Close Ask Bower' }).click();

  // The More menu, in its file version: Open in Drive greyed (#555), Pin to
  // Home present (#688). The page's own ⋯, never a stale Home one.
  await visible(
    page.getByRole('button', { name: /^More for (?!Home$)/ }),
  ).click();
  const menu = page.getByRole('menu', { name: 'File actions' });
  const openInDrive = menu.getByRole('menuitem', { name: /Open in Drive/ });
  await expect(openInDrive).toBeVisible();
  await expect(openInDrive).toBeDisabled();
  await expect(
    menu.getByText('Not in the demo. Run your own Bower to use it.'),
  ).toBeVisible();
  await expect(
    menu.getByRole('menuitem', { name: /Pin to Home/ }),
  ).toBeVisible();
  // The one ⋯ menu (#352, #907): no header (boards FI-More), Ask Bower
  // first, Help and about this last.
  await expect(menu.locator('.note-menu-meta')).toHaveCount(0);
  await expect(
    menu.getByRole('menuitem', { name: 'Help and about this' }),
  ).toBeVisible();
  await expect(menu.getByRole('menuitem').first()).toContainText(
    'Ask Bower about this',
  );
  await shot(page, testInfo, 'file-pdf-menu');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  // The same menu on a folder: Pin to Home, no note-only rows.
  await page.goto('/folder/4-Archives/Kitchen%20Refresh');
  await visible(
    // A folder's ⋯ is "More" until #920 DA-6 names it; never Home's.
    page.getByRole('button', { name: /^More( for Kitchen Refresh)?$/ }),
  ).click();
  const folderMenu = page.getByRole('menu', { name: 'Folder actions' });
  await expect(
    folderMenu.getByRole('menuitem', { name: /Pin to Home/ }),
  ).toBeVisible();
  await expect(
    folderMenu.getByRole('menuitem', { name: /Edit the text/ }),
  ).toHaveCount(0);
  await shot(page, testInfo, 'folder-more-menu');
  // Ask Bower about this opens the Ask sheet over the folder (#910).
  await folderMenu
    .getByRole('menuitem', { name: /Ask Bower about this/ })
    .click();
  const ask = page.getByRole('dialog', { name: 'Ask Bower' });
  await expect(ask).toBeVisible();
  await expect(ask.getByText('About Kitchen Refresh')).toBeVisible();
  await expect(
    ask.getByText(
      'Bower answers at the next tidy-up and puts the answer in Kitchen Refresh.',
    ),
  ).toBeVisible();
});

test('Activity: one card per tidy-up, what went where, set aside, and Last tidy-up lands on it (#345)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await navigate(page, /^Bower$/);
  await showBowerPart(page, 'Activity');
  const activity = bowerPart(page, 'Activity');
  const cards = activity.locator('.activity-card');
  const rowWith = (card: number, text: string) =>
    cards.nth(card).getByRole('listitem').filter({ hasText: text });

  // The demo's earlier tidy-ups (`DEMO_RUNS`, #903), newest first:
  // yesterday's ten, then the four from the London folders.
  await expect(cards).toHaveCount(14);
  await expect(cards.nth(0)).toContainText('Yesterday, 15:03');
  await expect(cards.nth(0)).toContainText('Done');
  // No relative times in Activity (K-16, #915).
  await expect(activity).not.toContainText(' ago');
  await shot(page, testInfo, 'bower-activity');

  // A tidy-up from Home: its card comes first, the question with "read it".
  await navigate(page, /^Home$/);
  await visible(
    page.getByRole('button', { name: 'Tidy up', exact: true }),
  ).click();
  await page
    .getByRole('dialog', { name: 'Is that everything?' })
    .getByRole('button', { name: 'Yes, tidy up' })
    .click();
  const sheet = page.getByRole('dialog', { name: SHEET_NAME });
  await expect(sheet.getByRole('heading', { name: 'Done' })).toBeVisible({
    timeout: 20_000,
  });
  await sheet.getByRole('button', { name: 'Close' }).first().click();
  await dismissPushPrompt(page);

  // Home's Last tidy-up card opens Just filed (#617); Activity in the Bower
  // tab stays the full history, with that run's card first.
  await visible(
    page.locator('.stat-tile', { hasText: 'Last tidy-up' }),
  ).click();
  await expect(page).toHaveURL(/\/just-filed$/);
  // #920: the answer reads its title, as Home does, never its dated name.
  await expect(
    page.getByText('What do I still need to sort out for the visa?').first(),
  ).toBeVisible();
  // The push prompt a finished run raises covers the phone's tab bar.
  const prompt = page.locator('.push-prompt');
  if (await prompt.isVisible()) {
    await prompt.getByRole('button', { name: /Not now|Got it/ }).click();
  }
  await navigate(page, /^Bower$/);
  await showBowerPart(page, 'Activity');
  await expect(bowerPart(page, 'Activity')).toBeVisible();
  await expect(cards).toHaveCount(15);
  await expect(cards.nth(0)).toContainText('Today, 12:10 · 1 min');
  // Files are ListRows, "<kind> · ● <parent>"; past two, "and N more"
  // (#915, BW-Activity-375).
  const more = cards.nth(0).getByRole('button', { name: /^and \d+ more$/ });
  if (await more.isVisible()) await more.click();
  await expect(rowWith(0, 'Boiler service invoice')).toContainText(
    'PDF · Home',
  );
  await expect(rowWith(0, 'Tomato seedlings')).toContainText('Garden');
  const question = rowWith(0, 'What do I still need for the visa?');
  await expect(question).toContainText('→ Answers, read it');
  await expect(question.getByRole('link', { name: 'read it' })).toBeVisible();
  // The phone's notifications prompt follows a first tidy-up; out of the
  // way for the screenshot.
  const gotIt = page.getByRole('button', { name: 'Got it' });
  if (await gotIt.isVisible()) await gotIt.click();
  await cards.nth(0).scrollIntoViewIfNeeded();
  await shot(page, testInfo, 'bower-activity-after-tidy-up');
});

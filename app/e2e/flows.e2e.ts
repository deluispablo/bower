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
  expect,
  navigate,
  openHome,
  openSettings,
  shot,
  test,
  visible,
} from './demo.js';

test.describe('open Home', () => {
  test.use({ introSeen: false });

  test('a first visit walks the intro and the tour, then lands on Home', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(
      page.getByRole('heading', { name: /Bower files it/ }),
    ).toBeInViewport();
    // Nine pages, one "Next" on each of the first eight; the desktop's side
    // arrows are extra.
    const headings = [
      'Where does it go?',
      'Ask, and it does more',
      'A window onto your own Drive',
      'A project: flat hunting',
      'An area: your health',
      'A resource: what you read',
      'The archive: finished, kept',
      'What will you start with?',
    ];
    const next = page.getByRole('button', { name: 'Next', exact: true });
    await expect(next).toHaveCount(8);
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
      await next.nth(index).click();
      await expect(page.getByRole('heading', { name })).toBeInViewport();
      await intro(index + 2);
    }
    await page.getByRole('button', { name: 'Explore the demo' }).click();

    // The tour: four sheets, one per tab, each over its highlighted tab.
    const tour = page.getByRole('dialog');
    const sheets = [
      ['Home', 'Next: Notes'],
      ['Notes', 'Next: Add'],
      ['Add', 'Next: Bower'],
      ['Bower', "Let's go"],
    ] as const;
    for (const [index, [title, next]] of sheets.entries()) {
      await expect(tour.getByText(`Tour · ${index + 1} of 4`)).toBeVisible();
      await expect(tour.getByRole('heading', { name: title })).toBeVisible();
      await expect(tour.getByRole('button', { name: 'Skip' })).toBeVisible();
      await expect(
        visible(page.locator(`[data-tour="${title.toLowerCase()}"]`)),
      ).toHaveClass(/help-tab-on/);
      if (index === 0) {
        await expect(
          tour.getByText("These are Alex's things, a sample."),
        ).toBeVisible();
      }
      if (testInfo.project.name === 'phone') {
        await shot(page, testInfo, `tour-${index + 1}`);
      }
      await tour.getByRole('button', { name: next }).click();
    }
    await expect(tour).toBeHidden();
    await expect(page).toHaveURL(/\/$/);

    // Run your own Bower is the demo's sign-in.
    await page.goto('/login');
    await expect(
      page.getByRole('heading', { name: 'Bower', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('This is a demo: sample notes')).toBeVisible();
    await shot(page, testInfo, 'login');

    // Back on Home from a fresh load: the demo forgets everything on reload,
    // so the tour is offered again.
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Good morning, Alex' }),
    ).toBeVisible();
    await expect(page.getByText('These are sample notes.')).toBeVisible();
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(
      visible(page.locator('.home-card', { hasText: 'Last tidy-up' })),
    ).toContainText('No tidy-up yet');
    await shot(page, testInfo, 'home');
  });
});

test.describe('first visit, Skip', () => {
  test.use({ introSeen: false });

  test('Skip on the intro lands on the sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/welcome$/);
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole('heading', { name: 'Bower', level: 1 }),
    ).toBeVisible();
  });
});

test('the quick switcher opens a note', async ({ page }, testInfo) => {
  await openHome(page);
  await visible(
    page.getByRole('button', { name: /Search or jump to a note/ }),
  ).click();
  const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
  await switcher.getByRole('combobox').fill('Lisbon');
  await switcher
    .getByRole('option', { name: /Lisbon Trip/ })
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

test("a note Bower wrote opens with Bower's note and What Bower used (#351)", async ({
  page,
}, testInfo) => {
  await openHome(page);
  await visible(
    page.getByRole('button', { name: /Search or jump to a note/ }),
  ).click();
  const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
  await switcher.getByRole('combobox').fill('subscriptions renew');
  await switcher
    .getByRole('option', { name: /subscriptions renew/ })
    .first()
    .click();

  const box = page.locator('.bower-note');
  await expect(box).toBeVisible();
  await expect(box.locator('.bower-note-title')).toHaveText("Bower's note");
  // The word is always shown with the colour.
  await expect(box.locator('.bower-note-word')).toHaveText([
    'Fine',
    'Check',
    'Problem',
  ]);
  await expect(
    page.getByRole('heading', { name: 'What Bower used', level: 2 }),
  ).toBeVisible();
  await expect(page.locator('.bower-sources li')).toHaveText([
    'Bills and renewals (from your notes)',
  ]);
  await shot(page, testInfo, 'note-from-bower');
});

test('a missing note shows Not found', async ({ page }, testInfo) => {
  await openHome(page);
  await page.goto('/note/does-not-exist');

  await expect(
    page.getByRole('heading', { name: /can.t find that note/ }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Search for it' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go home' })).toBeVisible();
  await shot(page, testInfo, 'note-not-found');
});

test('Add: three doors on the phone, the drop zone on desktop (#333)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await navigate(page, /^Add$/);
  await expect(page.getByRole('heading', { name: 'Add' })).toBeVisible();

  const doors = page.locator('.add-doors');
  const dropzone = page.locator('.add-dropzone');

  if (testInfo.project.name === 'desktop') {
    await expect(doors).toBeHidden();
    await expect(dropzone).toBeVisible();
    await expect(page.getByText('Drop anything here')).toBeVisible();
    await expect(
      page.getByText('Or share to Bower from any app: it lands here too.'),
    ).toBeHidden();
    return;
  }

  await expect(dropzone).toBeHidden();
  await expect(doors).toBeVisible();
  await expect(
    doors.getByRole('button', { name: /^Choose files/ }),
  ).toBeVisible();
  await expect(
    doors.getByRole('button', { name: /^Take a photo/ }),
  ).toBeVisible();
  await expect(
    page.getByText('Or share to Bower from any app: it lands here too.'),
  ).toBeVisible();
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
    await expect(page.locator('.add-doors')).toBeHidden();
    return;
  }

  const door = page
    .locator('.add-doors')
    .getByRole('button', { name: /^Take a photo/ });
  await expect(door).toBeVisible();
  await expect(page.locator('input[type="file"][capture]')).toHaveCount(1);
});

test('Add puts a file in the inbox', async ({ page }, testInfo) => {
  await openHome(page);
  await navigate(page, /^Add$/);
  await expect(page.getByRole('heading', { name: 'Add' })).toBeVisible();

  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(
      `${testInfo.project.testDir}/files/Garden centre receipt.txt`,
    );
  await expect(page.getByText('Garden centre receipt.txt')).toBeVisible();
  await page.getByRole('button', { name: 'Add to Bower' }).click();

  await expect(page.getByText('Added to your inbox.')).toBeVisible();
  await shot(page, testInfo, 'add');

  // Back on Home once the upload finishes: the Inbox card reads the new
  // total right away (#289), not after the next background refresh.
  await expect(page).toHaveURL('/');
  await expect(
    visible(page.locator('.home-card', { hasText: 'Inbox' })).locator(
      '.home-card-count',
    ),
  ).toHaveText('4');
});

test('Add: "Added · n", "In your inbox", and the row survives leaving the tab (#334)', async ({
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
  await expect(page.getByRole('heading', { name: 'Added · 1' })).toBeVisible();

  await page.getByRole('button', { name: 'Add to Bower' }).click();
  await expect(page.getByText('In your inbox')).toBeVisible();

  // Back on Home once the upload finishes, then Add again within the
  // same session: the row is still there (#334), not an empty screen.
  await expect(page).toHaveURL('/');
  await navigate(page, /^Add$/);
  await expect(page.getByRole('heading', { name: 'Added · 1' })).toBeVisible();
  await expect(page.getByText('Garden centre receipt.txt')).toBeVisible();
});

test('Add: the hint counts what is waiting, and its Tidy up asks first (#336)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await navigate(page, /^Add$/);

  // The demo starts with three things in the inbox.
  const hint = page.locator('.add-hint');
  await expect(hint).toContainText(
    '3 things waiting. Add the whole pile first: a tidy-up takes a few minutes and uses one run of your plan, so once is better than five times.',
  );
  await shot(page, testInfo, 'add-hint');

  // The Tidy up button opens the "Is that everything?" confirmation (#337).
  await hint.getByRole('button', { name: 'Tidy up', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Is that everything?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Add more first' }).click();
  await expect(confirm).toBeHidden();

  // After an add the count is the new total (#300), not the old one.
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(
      `${testInfo.project.testDir}/files/Garden centre receipt.txt`,
    );
  await page.getByRole('button', { name: 'Add to Bower' }).click();
  await expect(page).toHaveURL('/');
  await navigate(page, /^Add$/);
  await expect(hint).toContainText('4 things waiting.');
});

test('Home through the scripted run: waiting, running, done (#321)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  const bubble = visible(page.locator('.home-bubble'));
  const inbox = visible(page.locator('.home-card', { hasText: 'Inbox' }));

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
  await shot(page, testInfo, 'tidy-confirm');
  await confirm.getByRole('button', { name: 'Yes, tidy up' }).click();
  await expect(confirm).toBeHidden();

  // Running: the bubble says so; the card has no button, only its line.
  const sheet = page.getByRole('dialog', { name: 'Tidying up status' });
  await expect(
    sheet.getByRole('heading', { name: 'Tidying up' }),
  ).toBeVisible();
  await expect(bubble).toHaveText(
    "Tidying up 3 things. Takes a few minutes; I'll say when I'm done. You can keep adding.",
  );
  await expect(
    inbox.getByRole('button', { name: /^Tidying up… started/ }),
  ).toBeVisible();
  await expect(inbox.getByRole('button', { name: 'Tidy up' })).toHaveCount(0);

  // Done: the scripted run files the three items over eight seconds
  // (`src/demo/server.ts`) and the app polls every five. Two were filed
  // and one was a question Bower answered.
  await expect(sheet.getByText('3 files processed')).toBeVisible({
    timeout: 20_000,
  });
  await expect(bubble).toHaveText(
    'All tidy. 2 things filed and 1 question answered. See what I did.',
  );
  await expect(inbox).toContainText('Nothing waiting. Add something.');
  await expect(
    visible(page.locator('.home-card', { hasText: 'Last tidy-up' })),
  ).toContainText('2 filed · 1 answered');
  await shot(page, testInfo, 'tidy-up');
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

  // Running: the scene, the count against the three things waiting, when
  // it started, the sentence, and the item being read.
  const sheet = page.getByRole('dialog', { name: 'Tidying up status' });
  await expect(sheet.locator('.working-sheet-stage')).toContainText('Inbox');
  await expect(sheet.getByText(/^[0-3] of 3 filed$/)).toBeVisible();
  await expect(sheet.getByText('Started just now')).toBeVisible();
  await expect(
    sheet.getByText(
      'Usually three to five minutes. Close this and keep going; Home will say when it is done.',
    ),
  ).toBeVisible();
  const rows = sheet.locator('.working-sheet-row');
  await expect(rows.filter({ hasText: 'reading…' })).toHaveCount(1);

  // The scripted run files one item after another (`src/demo/server.ts`);
  // the app polls every five seconds, so some land before the run ends.
  await expect(sheet.getByText(/^[12] of 3 filed$/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    rows.filter({ hasText: 'Boiler service invoice' }),
  ).toContainText('filed');
  await shot(page, testInfo, 'run-working-rows');

  // Done: the listing is read again and the rows name where things went;
  // the request went to the processed folder, so it only says filed.
  await expect(sheet.getByText('3 files processed')).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    rows.filter({ hasText: 'Boiler service invoice' }),
  ).toContainText('→ Home');
  await expect(rows.filter({ hasText: 'Tomato seedlings' })).toContainText(
    '→ Garden',
  );
  await expect(
    rows.filter({ hasText: 'What do I still need for Lisbon' }),
  ).toContainText('filed');
  await expect(rows.filter({ hasText: 'reading…' })).toHaveCount(0);
});

test('Home loading state: dimmed cards and skeleton rows, never Empty (#322)', async ({
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
  const inbox = visible(page.locator('.home-card', { hasText: 'Inbox' }));

  await expect(home).toHaveAttribute('data-state', 'loading');
  await expect(bubble).toHaveText('Looking for what is waiting for you.');
  await expect(page.getByText('Welcome. Add a few things')).toHaveCount(0);
  await expect(inbox).toHaveClass(/home-card-loading/);
  await expect(inbox.locator('.home-card-count')).toHaveCount(0);
  await expect(page.locator('.home-recent-skeleton-row')).toHaveCount(5);
  await shot(page, testInfo, 'home-loading');

  // Once the delayed listing resolves, the real numbers replace the
  // skeleton and the state moves on (Waiting, in the demo fixture).
  await expect(home).not.toHaveAttribute('data-state', 'loading', {
    timeout: DELAY_MS + 5_000,
  });
  await expect(inbox.locator('.home-card-count')).toBeVisible();
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

  const sheet = page.getByRole('dialog', { name: 'Tidying up status' });
  await expect(sheet).toBeVisible();
  await shot(page, testInfo, 'run-working');
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();

  // Home → Add → Home while the scripted run is still going: no screen
  // mounting again brings the sheet back (#304).
  await navigate(page, /^Add$/);
  await expect(page.getByRole('heading', { name: 'Add' })).toBeVisible();
  await expect(sheet).toBeHidden();
  await navigate(page, /^Home$/);
  await expect(page).toHaveURL('/');
  await expect(
    visible(page.getByRole('button', { name: /^Tidying up… started/ })),
  ).toBeVisible();
  await expect(sheet).toBeHidden();
  // The bar shows nothing while the run goes; Home's Inbox card does (#320).
  await expect(page.locator('header.topbar')).not.toContainText('Tidy');

  // Done is announced once, in a toast that closes; the sheet stays closed
  // and the Inbox card, now empty, points at Add.
  const toast = page.getByRole('status').filter({
    hasText: '3 files processed',
  });
  await expect(toast).toBeVisible({ timeout: 20_000 });
  await expect(sheet).toBeHidden();
  await shot(page, testInfo, 'run-done');
  // By keyboard: on the phone the one-time notifications prompt slides up
  // over the bottom of the screen at the same moment.
  await toast.getByRole('button', { name: 'Close' }).focus();
  await page.keyboard.press('Enter');
  await expect(toast).toBeHidden();
  await expect(
    visible(
      page.getByRole('link', { name: /Nothing waiting\. Add something\./ }),
    ),
  ).toBeVisible({ timeout: 10_000 });
  await expect(sheet).toBeHidden();
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
  await expect(page.getByRole('tab')).toHaveText([
    'Rules',
    'Requests',
    'Activity',
  ]);
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
  const requests = page.getByRole('tabpanel', { name: 'Requests' });
  const row = requests
    .getByRole('listitem')
    .filter({ hasText: 'How much did I spend on the kitchen this year?' });
  await expect(row).toBeVisible();
  await expect(row.getByText('Waiting', { exact: true })).toBeVisible();
  await row.scrollIntoViewIfNeeded();
  await shot(page, testInfo, 'tell');

  // No run started: no working sheet, and the note waits in the inbox
  // with the other three (the Inbox card reads the refreshed listing).
  await expect(
    page.getByRole('dialog', { name: 'Tidying up status' }),
  ).toHaveCount(0);
  await navigate(page, /^Home$/);
  await expect(
    visible(page.locator('.home-card', { hasText: 'Inbox' })).locator(
      '.home-card-count',
    ),
  ).toHaveText('4');
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

  // Also reachable from the "?" tip: the Ideas button on a help sheet.
  await page.getByRole('button', { name: 'About this screen' }).click();
  await visible(page.getByRole('link', { name: 'Ideas' })).click();
  await expect(page).toHaveURL(/\/ideas$/);

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
    name: '2 suggested rules on the Bower tab',
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
  await expect(suggested.getByRole('listitem')).toHaveCount(2);
  await shot(page, testInfo, 'bower-suggested');

  await card.getByRole('button', { name: 'Accept' }).click();
  await expect(
    suggested.getByText('Added to your rules: Recipes go to Cooking.'),
  ).toBeVisible();
  await expect(suggested.getByRole('listitem')).toHaveCount(1);
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

test('What is Bower from Settings opens with Close and Done (#329)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await openSettings(page);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(
    page.getByText('The whole story, in nine screens'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'What is Bower' }).click();
  await expect(page).toHaveURL(/\/welcome\?from=settings$/);
  await expect(
    page.getByRole('heading', { name: /Bower files it/ }),
  ).toBeInViewport();

  // Close (X), not Skip, when opened from Settings.
  await expect(
    page.getByRole('button', { name: 'Skip', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
  await shot(page, testInfo, 'intro-from-settings');

  // Closing on page 1 goes straight back to Settings, not the sign-in.
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page).toHaveURL(/\/settings$/);

  // Walking all nine pages ends on Done, not Sign in with Google.
  await page.getByRole('button', { name: 'What is Bower' }).click();
  const next = page.getByRole('button', { name: 'Next', exact: true });
  await expect(next).toHaveCount(8);
  for (let index = 0; index < 8; index += 1) {
    await next.nth(index).click();
  }
  await expect(
    page.getByRole('heading', { name: 'What will you start with?' }),
  ).toBeInViewport();
  await expect(
    page.getByRole('link', { name: 'Sign in with Google' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test('Settings runs the v3 section order, sign-in-way at the bottom (#309)', async ({
  page,
}) => {
  await openHome(page);
  await openSettings(page);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  // Account · Tidying up · Look · Bower · Advanced, in that order (scoped
  // to the settings section: the desktop sidebar has its own h2s).
  const headings = await page
    .locator('.settings')
    .getByRole('heading', { level: 2 })
    .allTextContents();
  expect(headings).toEqual(['Tidying up', 'Look', 'Bower', 'Advanced']);

  // The web-lookup row is present but disabled until #374 lands.
  const webLookup = page
    .locator('.settings')
    .getByRole('switch', { name: 'Let Bower look things up on the web' });
  await expect(webLookup).toBeVisible();
  await expect(webLookup).toBeDisabled();
  await expect(
    page.locator('.settings').getByText('Coming soon.'),
  ).toBeVisible();

  // Sign out is a plain button, apart from Sign out everywhere; in the
  // demo build, Sign out everywhere, the own API key and Delete each show
  // the not-in-the-demo sentence instead of a working control. Scoped to
  // the settings section: the desktop sidebar has its own Sign out button.
  const settings = page.locator('.settings');
  await expect(
    settings.getByRole('button', { name: 'Sign out', exact: true }),
  ).toBeVisible();
  await expect(
    settings.getByText('Not in the demo: run your own Bower to use this.'),
  ).toHaveCount(3);
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
      page.getByRole('heading', { name: 'Bower', level: 1 }),
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

    // The sidebar (#326, C.9): one Expand/Collapse all tool, no sort menu,
    // and the waiting-count bubble on Home's row, not Add's (the boards
    // disagree with the issue's own title and C.9's text, which say Add).
    const sidebar = page.getByRole('navigation', { name: 'Your notes' });
    await expect(sidebar.locator('[aria-label^="Sort by"]')).toHaveCount(0);
    await expect(
      sidebar.getByRole('button', { name: 'Expand all' }),
    ).toBeVisible();
    await expect(sidebar.locator('a[href="/"] .nav-badge')).toHaveText('3');
    await expect(sidebar.locator('a[href="/add"] .nav-badge')).toHaveCount(0);
    await shot(page, testInfo, 'desktop-sidebar');
    return;
  }
  await expect(tabs).toBeVisible();
  const links = tabs.getByRole('link');
  await expect(links).toHaveText(['Home', 'Notes', 'Add', 'Bower']);
  await expect(links.first()).toHaveAttribute('aria-current', 'page');

  await tabs.getByRole('link', { name: 'Notes' }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(links.nth(1)).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('textbox', { name: 'Filter your notes' }),
  ).toBeVisible();
  await expect(page.getByRole('tree').first()).toBeVisible();
  await shot(page, testInfo, 'tabs-notes');
});

test('the Notes tab: root meanings, Health and hidden-files at the bottom, one Expand/Collapse button (#353)', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'desktop',
    'the Notes tab is phone-only; desktop keeps the sidebar',
  );
  await openHome(page);
  await page.getByRole('link', { name: 'Notes' }).click();
  await expect(page).toHaveURL(/\/notes$/);

  const bar = page.locator('header.topbar');
  await expect(bar.getByRole('button', { name: 'Expand all' })).toBeVisible();
  await expect(bar.getByRole('button', { name: /^Sort by/ })).toHaveCount(0);
  // Scoped to the Notes screen itself: the desktop sidebar (always mounted,
  // just CSS-hidden below 900px) keeps its own sort button until #326.
  await expect(
    page.locator('.explorer-page [aria-label^="Sort by"]'),
  ).toHaveCount(0);

  const tree = page.getByRole('tree').first();
  const inbox = tree.locator('a[href="/folder/0-Inbox"]');
  await expect(inbox).toContainText('What you added, waiting for a tidy-up');
  const answers = tree.locator('a[href="/folder/Answers"]');
  await expect(answers).toContainText('What Bower wrote back to you');

  const health = page.locator('.explorer-health-row');
  await expect(health).toContainText('Health check');
  await expect(health).toContainText('Sunday · 3 small things to fix');
  // Scoped to `.explorer-foot`: the sidebar has its own hidden-files
  // button too (always mounted, CSS-hidden below 900px).
  const hidden = page.locator('.explorer-foot .explorer-hidden');
  await expect(health).toBeVisible();
  await expect(hidden).toBeVisible();
  // Health and the hidden-files line sit together, after the tree.
  const footBox = await page.locator('.explorer-foot').boundingBox();
  const treeBox = await tree.boundingBox();
  expect((footBox?.y ?? 0) >= (treeBox?.y ?? 0)).toBe(true);

  await shot(page, testInfo, 'notes-tab');
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

test('the top bar: folder menu, title, "?", avatar; Back on a note', async ({
  page,
}, testInfo) => {
  await openHome(page);
  const bar = page.locator('header.topbar');
  const help = bar.getByRole('button', { name: 'About this screen' });
  await expect(help).toBeVisible();
  if (testInfo.project.name === 'phone') {
    await expect(
      bar.getByRole('button', { name: 'Your folders' }),
    ).toBeVisible();
    await expect(bar.getByText('Bower', { exact: true })).toBeVisible();
    await expect(bar.getByRole('link', { name: 'Settings' })).toHaveText('A');
    await shot(page, testInfo, 'bar-home');
  }

  // "?" opens the help sheet for this tab: About this screen, no counter.
  await help.click();
  const sheet = page.getByRole('dialog', { name: 'Home' });
  await expect(sheet.getByText('About this screen')).toBeVisible();
  await expect(sheet.getByText('Tour ·')).toHaveCount(0);
  await expect(
    sheet.getByRole('link', { name: 'What is Bower, from the start' }),
  ).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();

  await visible(page.getByRole('link', { name: /^Bower$/ })).click();
  await help.click();
  const bower = page.getByRole('dialog', { name: 'Bower' });
  await expect(bower.getByText('About this screen')).toBeVisible();
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
  await page.goto('/');
  await page.getByRole('dialog').getByRole('button', { name: 'Skip' }).click();
  await visible(
    page.getByRole('button', { name: /Search or jump to a note/ }),
  ).click();
  const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
  await switcher.getByRole('combobox').fill('Lisbon');
  await switcher
    .getByRole('option', { name: /Lisbon Trip/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/note\//);
  await expect(bar.getByRole('button', { name: 'Your folders' })).toBeHidden();
  await expect(bar.getByRole('link', { name: /^Back to / })).toBeVisible();
  await expect(bar.locator('.topbar-title')).toHaveText('Lisbon Trip');
  await shot(page, testInfo, 'bar-note');
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

test('A folder with notes only in a subfolder says so, not "Nothing here yet" (#310)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  // Projects (the demo fixture) has no notes of its own — Lisbon Trip,
  // Kitchen Refresh and Half Marathon hold all of them — a real instance
  // of 1.9: the header's count is the whole subtree, the empty state used
  // to say "Nothing here yet" regardless.
  await page.goto('/folder/1-Projects');
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await expect(page.getByText('Nothing here yet.')).toBeHidden();
  await expect(page.getByText(/notes in /)).toBeVisible();
  await shot(page, testInfo, 'folder-notes-elsewhere');
});

test('A root folder explained: the meaning line, then its subfolders (#348)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await page.goto('/folder/1-Projects');
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  const explainer = page.locator('.folder-explainer');
  await expect(explainer).toHaveText('Things with an end date');
  // The meaning line sits between the header and the chip row, above the
  // subfolders — same words as the folder menu and the intro (#319).
  const chips = page.locator('.folder-chips');
  const explainerBox = await explainer.boundingBox();
  const chipsBox = await chips.boundingBox();
  expect((explainerBox?.y ?? 0) < (chipsBox?.y ?? 0)).toBe(true);
  await shot(page, testInfo, 'folder-root-explained');

  // A non-root folder (a project) has no meaning line to show.
  await page.goto('/folder/1-Projects/Lisbon%20Trip');
  await expect(
    page.getByRole('heading', { name: 'Lisbon Trip' }),
  ).toBeVisible();
  await expect(page.locator('.folder-explainer')).toHaveCount(0);
});

test('Folder chips fit one row at 375 px, and the tree hides zero counts (#310)', async ({
  page,
}, testInfo) => {
  await openHome(page);

  // Chips: Pin to Home / Ask Bower about it / Open in Drive, at 13 px,
  // fit the phone's 343 px content width in one row (2.14) instead of
  // wrapping to two.
  await page.goto('/folder/1-Projects/Lisbon%20Trip');
  await expect(
    page.getByRole('heading', { name: 'Lisbon Trip' }),
  ).toBeVisible();
  const chips = page.locator('.folder-chips .chip');
  const ys = await chips.evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().y),
  );
  expect(new Set(ys).size).toBe(1);
  await shot(page, testInfo, 'folder-chips');

  // The tree shows a count only above zero (3.6): no folder row reads "0".
  // On the phone the tree lives on the Notes tab (the folder menu lists
  // only the top-level folders, #319); on desktop it is the sidebar.
  if (testInfo.project.name === 'phone') await navigate(page, /^Notes$/);
  const counts = await page.locator('.tree-count').allTextContents();
  expect(counts.length).toBeGreaterThan(0);
  expect(counts).not.toContain('0');
});

test('the folder menu: open it, tap a folder, land on it (#319)', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'phone',
    'The folder menu is on the phone bar; desktop keeps the sidebar.',
  );
  await openHome(page);
  const bar = page.locator('header.topbar');
  const opener = bar.getByRole('button', { name: 'Your folders' });
  await opener.click();
  const menu = page.getByRole('dialog', { name: 'Your folders' });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole('link', { name: /^1-Projects Things with an end date/ }),
  ).toBeVisible();
  // 1-Projects opens with its projects showing, as on the board.
  await expect(
    menu.getByRole('link', { name: /^Lisbon Trip \d+$/ }),
  ).toBeVisible();
  await expect(
    menu.getByText('The full tree with search lives on the Notes tab.', {
      exact: false,
    }),
  ).toBeVisible();
  await shot(page, testInfo, 'folder-menu');

  // Holding a row (here its context menu, what a long press also opens)
  // offers the pin; Escape closes that sheet alone.
  await menu
    .getByRole('link', { name: /^2-Areas Parts of life/ })
    .click({ button: 'right' });
  const sheet = page.getByRole('dialog', { name: '2-Areas' });
  // Focus moves into the sheet once it is open: wait for that before Escape.
  await expect(
    sheet.getByRole('menuitem', { name: 'Pin to Home' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(menu).toBeVisible();

  // Escape closes it and gives focus back to the menu button.
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(opener).toBeFocused();

  await opener.click();
  await menu.getByRole('link', { name: /^3-Resources Things to keep/ }).click();
  await expect(page).toHaveURL(/\/folder\/3-Resources$/);
  await expect(menu).toBeHidden();
  await expect(bar.locator('.topbar-title')).toHaveText('3-Resources');
});

test('a project folder lists its files and notes together, newest first, with who put each there', async ({
  page,
}, testInfo) => {
  await page.goto('/folder/1-Projects/Kitchen%20Refresh');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Kitchen Refresh' }),
  ).toBeVisible();
  await expect(page.locator('.folder-meta')).toHaveText(
    '1-Projects · 2 files · 3 notes',
  );

  const rows = page.locator('.folder-item');
  await expect(rows).toHaveCount(5);
  // The photo's origin comes from its row in `index.md`, the PDF's from
  // its Drive app property.
  await expect(rows.nth(0)).toContainText('Sage green test patch');
  await expect(rows.nth(0)).toContainText('Photo · filed by Bower');
  await expect(rows.nth(1)).toContainText('Shelves and tap quote');
  await expect(rows.nth(1)).toContainText('PDF · filed by Bower');
  await expect(rows.nth(2)).toContainText('Note · in this folder');

  // A file opens on its own screen; a note opens in the app.
  await expect(rows.nth(1)).toHaveAttribute('href', /^\/file\//);
  await expect(rows.nth(2)).toHaveAttribute('href', /^\/note\//);
  await shot(page, testInfo, 'folder-project');
});

test('a file opens on its own screen: the photo inline, the PDF without a preview says so', async ({
  page,
}, testInfo) => {
  await page.goto('/folder/1-Projects/Kitchen%20Refresh');
  await page
    .locator('.folder-item', { hasText: 'Sage green test patch' })
    .click();
  await expect(page).toHaveURL(/\/file\//);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Sage green test patch' }),
  ).toBeVisible();
  const props = page.locator('.file-props');
  await expect(props).toContainText('Photo ·');
  await expect(
    props.getByRole('link', { name: '1-Projects / Kitchen Refresh' }),
  ).toBeVisible();
  await expect(props).toContainText('Filed by Bower ·');
  const photo = page.getByRole('img', { name: 'Sage green test patch' });
  await expect(photo).toBeVisible();
  await expect(photo).toHaveAttribute('src', /^blob:/);
  await shot(page, testInfo, 'file-photo');

  await page.goto('/folder/1-Projects/Kitchen%20Refresh');
  await page
    .locator('.folder-item', { hasText: 'Shelves and tap quote' })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Shelves and tap quote' }),
  ).toBeVisible();
  await expect(props).toContainText('PDF ·');
  // The demo has no Drive thumbnails: one sentence, with the way to Drive.
  const none = page.getByText('There is no preview for this file');
  await expect(none).toBeVisible();
  await expect(
    none.getByRole('link', { name: 'open it in Drive' }),
  ).toHaveAttribute('href', /^https:\/\/drive\.google\.com\/file\/d\//);
  await expect(
    page.getByRole('link', { name: /Summarise this/ }),
  ).toHaveAttribute('href', /^\/bower\?text=Summarise/);

  // The More menu, in its file version: Open in Drive, no Pin.
  await visible(page.getByRole('button', { name: 'More' })).click();
  const menu = page.getByRole('menu', { name: 'File actions' });
  await expect(
    menu.getByRole('menuitem', { name: /Open in Drive/ }),
  ).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Pin to Home/ })).toHaveCount(
    0,
  );
  // The one More menu (#352): the board's header, then Ask Bower first.
  await expect(menu).toContainText('PDF · 1-Projects / Kitchen Refresh');
  await expect(menu.getByRole('menuitem').first()).toContainText(
    'Ask Bower about this',
  );
  await shot(page, testInfo, 'file-pdf-menu');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  // The same menu on a folder: Pin to Home, no note-only rows.
  await page.goto('/folder/1-Projects/Kitchen%20Refresh');
  await visible(page.getByRole('button', { name: 'More' })).click();
  const folderMenu = page.getByRole('menu', { name: 'Folder actions' });
  await expect(
    folderMenu.getByRole('menuitem', { name: /Pin to Home/ }),
  ).toBeVisible();
  await expect(
    folderMenu.getByRole('menuitem', { name: /Ask Bower about this/ }),
  ).toHaveAttribute('href', /^\/bower\?text=Kitchen%20Refresh/);
  await expect(
    folderMenu.getByRole('menuitem', { name: /Edit the text/ }),
  ).toHaveCount(0);
  await shot(page, testInfo, 'folder-more-menu');
});

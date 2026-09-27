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
      visible(
        page.getByRole('link', { name: /Answers\s+1\s+things Bower answered/ }),
      ),
    ).toBeVisible();
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

test('Tidy up files the inbox and says so', async ({ page }, testInfo) => {
  await openHome(page);
  await expect(page.getByText('waiting to be tidied')).toBeVisible();
  await visible(
    page.getByRole('button', { name: 'Tidy up', exact: true }),
  ).click();

  const sheet = page.getByRole('dialog', { name: 'Tidying up status' });
  await expect(
    sheet.getByRole('heading', { name: 'Tidying up' }),
  ).toBeVisible();
  await expect(
    visible(page.getByRole('button', { name: 'Tidying up…' })),
  ).toBeVisible();
  // The scripted run files the three items over eight seconds
  // (`src/demo/server.ts`) and the app polls every five.
  await expect(sheet.getByText('3 files processed')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('nothing waiting')).toBeVisible();
  await shot(page, testInfo, 'tidy-up');
});

test('the working sheet opens once per run, and the run ends back at Tidy up', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await visible(
    page.getByRole('button', { name: 'Tidy up', exact: true }),
  ).click();

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
    visible(page.getByRole('button', { name: 'Tidying up…' })),
  ).toBeVisible();
  await expect(sheet).toBeHidden();
  // The bar shows nothing while the run goes; Home's Inbox card does (#320).
  await expect(page.locator('header.topbar')).not.toContainText('Tidy');

  // Done is announced once, in a toast that closes; the sheet stays closed
  // and the Inbox card's button reads Tidy up again within seconds.
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
    visible(page.getByRole('button', { name: 'Tidy up', exact: true })),
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
  await shot(page, testInfo, 'tell');

  // No run started: no working sheet, and the note waits in the inbox
  // with the other three.
  await expect(
    page.getByRole('dialog', { name: 'Tidying up status' }),
  ).toHaveCount(0);
  await navigate(page, /^Home$/);
  await expect(
    visible(page.getByRole('button', { name: 'Tidy up (4)' })),
  ).toBeVisible();
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

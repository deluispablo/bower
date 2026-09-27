/**
 * The six main flows (#196, spec §5) against the demo build: Alex's sample
 * notes, three items waiting in the inbox and a scripted Tidy up run
 * (`src/demo/`). Each flow skips the first-run tour first, except "Open
 * Home", which walks it from the "What is Bower" intro to the end.
 * Assertions are on the text a person reads; the screenshots are a
 * by-product for the README and the CI artifacts, never compared.
 */

import { expect, navigate, openHome, shot, test, visible } from './demo.js';

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
    // One "Next" per page; the desktop's side arrows are extra.
    const next = page.getByRole('button', { name: 'Next', exact: true });
    for (let i = 0; i < 3; i += 1) {
      await next.nth(i).click();
    }
    await expect(
      page.getByRole('heading', { name: 'What people use it for' }),
    ).toBeInViewport();
    await page.getByRole('button', { name: 'Explore the demo' }).click();

    const tour = page.getByRole('dialog');
    const steps = [
      ['1 of 4 · Add', 'Drop anything here.'],
      ['2 of 4 · Tidy up', "When you're ready, tap Tidy up."],
      ['3 of 4 · Tell Bower', 'Talk to me like a person.'],
      ['4 of 4 · This is a demo', 'This is a demo; run your own.'],
    ] as const;
    for (const [index, [label, title]] of steps.entries()) {
      await expect(tour.getByText(label)).toBeVisible();
      await expect(tour.getByRole('heading', { name: title })).toBeVisible();
      if (index < steps.length - 1) {
        await tour.getByRole('button', { name: 'Next' }).click();
      }
    }
    await tour.getByRole('link', { name: 'Run your own Bower' }).click();
    await expect(tour).toBeHidden();
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole('heading', { name: 'Bower', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('This is a demo: sample notes')).toBeVisible();

    // Back on Home from a fresh load: the demo forgets everything on reload,
    // so the tour is offered again.
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Good morning, Alex' }),
    ).toBeVisible();
    await expect(page.getByText('These are sample notes.')).toBeVisible();
    await page.getByRole('button', { name: 'Skip tour' }).click();
    await expect(
      visible(
        page.getByRole('link', { name: /Answers\s+1\s+things Bower answered/ }),
      ),
    ).toBeVisible();
    await shot(page, testInfo, 'home');
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

  // Back on Home once the upload finishes: the Tidy up count and the Inbox
  // card read the new total right away (#289), not after the next
  // background refresh.
  await expect(page).toHaveURL('/');
  await expect(
    visible(page.getByRole('button', { name: 'Tidy up (4)' })),
  ).toBeVisible();
});

test('Tidy up files the inbox and says so', async ({ page }, testInfo) => {
  await openHome(page);
  await expect(page.getByText('waiting to be tidied')).toBeVisible();
  await visible(page.getByRole('button', { name: 'Tidy up (3)' })).click();

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
  await visible(page.getByRole('button', { name: 'Tidy up (3)' })).click();

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

  // Done is announced once, in a toast that closes; the sheet stays closed
  // and the pill reads Tidy up again within seconds, not "Done ✓" for good.
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
    visible(page.getByRole('button', { name: /^Tidy up/ })),
  ).toBeVisible({ timeout: 10_000 });
  await expect(sheet).toBeHidden();
});

test('Tell Bower sends a question to the inbox', async ({ page }, testInfo) => {
  await openHome(page);
  await navigate(page, /^Tell( Bower)?$/);
  await expect(
    page.getByText("A rule, a task or a question. I'll put it in your inbox"),
  ).toBeVisible();

  await page.getByRole('button', { name: 'A question' }).click();
  const message = page.getByRole('textbox', { name: 'Message' });
  await expect(message).toHaveValue(
    'What did I save about trip planning last month?',
  );
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(message).toHaveValue('');
  await expect(
    page.getByText('What did I save about trip planning last month?'),
  ).toBeVisible();
  await shot(page, testInfo, 'tell');
});

test('Settings switches the theme to dark, and it sticks', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await navigate(page, /^Settings$/);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await page.getByRole('radio', { name: 'Dark' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await shot(page, testInfo, 'settings');
});

test('Settings runs the v3 section order, sign-in-way at the bottom (#309)', async ({
  page,
}) => {
  await openHome(page);
  await navigate(page, /^Settings$/);
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
  await navigate(page, /^Settings$/);
  await visible(page.getByRole('link', { name: 'Terms' })).click();
  await expect(page).toHaveURL(/\/terms$/);

  // Signed in (the demo is always signed in as Alex): Back steps through
  // history to Settings, not to /login.
  await visible(page.getByRole('button', { name: 'Back' })).click();
  await expect(page).toHaveURL(/\/settings$/);
});

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
import type { Page } from '@playwright/test';

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
    // The demo's intro is the app's, with the banner on top (#361).
    await expect(page.locator('.intro-bar + .demo-banner')).toBeVisible();
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
    // "Try the demo" where the app says Sign in with Google (#361).
    await expect(
      page.getByRole('link', { name: 'Sign in with Google' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Try the demo' }).click();
    await expect(page).toHaveURL(/\/$/);

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
    await expect(
      page.getByRole('heading', { name: 'Good morning, Alex' }),
    ).toBeVisible();
    // "?" opens the same sheet afterwards, without the step counter.
    await visible(
      page.getByRole('button', { name: 'About this screen' }),
    ).click();
    const help = page.getByRole('dialog', { name: 'Home' });
    await expect(
      help.getByRole('button', { name: 'Show me around' }),
    ).toBeVisible();
    await expect(help.getByText('Tour · 1 of 4')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();

    // Run your own Bower is the demo's sign-in.
    await page.goto('/login');
    await expect(
      page.getByRole('heading', { name: 'Run your own Bower', level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Read the runbook on GitHub' }),
    ).toBeVisible();
    await shot(page, testInfo, 'login');

    // Back on Home from a fresh load: the demo forgets everything on reload,
    // so the tour is offered again.
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Good morning, Alex' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(
      page.getByText('This is a demo, not the real thing'),
    ).toBeVisible();
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

test('Run your own Bower: the rows, the runbook, and the nine screens with Close (#366)', async ({
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

  // "What is Bower, in nine screens": the intro with Close, back here.
  await page
    .getByRole('link', { name: 'What is Bower, in nine screens' })
    .click();
  await expect(page).toHaveURL(/\/welcome\?from=run-your-own$/);
  await expect(
    page.getByRole('heading', { name: /Bower files it/ }),
  ).toBeInViewport();
  await expect(
    page.getByRole('button', { name: 'Skip', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(heading).toBeVisible();
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

test("previous/next under a note hides Bower's own files and uses titles (#423)", async ({
  page,
}) => {
  // Answers has exactly one real note ("Which subscriptions renew this
  // autumn?") alongside Bower's own "Bower - Proposals.md" (#420's demo
  // fixture already has both, matching the issue's own repro).
  await page.goto('/folder/Answers');
  await page
    .getByRole('link', { name: /Which subscriptions renew this autumn/ })
    .click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Which subscriptions renew this autumn?',
    }),
  ).toBeVisible();

  // No sibling nav at all: the only other file in the folder is Bower's
  // own, hidden unless "Show Bower's own files" is on.
  await expect(page.locator('.note-siblings')).toHaveCount(0);
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

test('Add puts a file in the inbox and stays on Add (#421)', async ({
  page,
}, testInfo) => {
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

  // Adding is meant to take the whole pile before a tidy-up (#421): no
  // navigation away, and no leftover "Add to Bower" once nothing is
  // waiting any more.
  await expect(page).toHaveURL('/add');
  await expect(page.getByRole('button', { name: 'Add to Bower' })).toBeHidden();

  // The vault index refreshed in place (#289): Home already reads the new
  // total once we go there ourselves, not after the next background
  // refresh.
  await navigate(page, /^Home$/);
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

  // Leave for Home ourselves, then Add again within the same session: the
  // row is still there (#334), not an empty screen, and no leftover
  // "Add to Bower" reappears now that nothing is waiting (#421).
  await navigate(page, /^Home$/);
  await navigate(page, /^Add$/);
  await expect(page.getByRole('heading', { name: 'Added · 1' })).toBeVisible();
  await expect(page.getByText('Garden centre receipt.txt')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to Bower' })).toBeHidden();
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
  await page.getByRole('button', { name: 'Add to Bower' }).click();
  // Stays on Add (#421): the new total shows in place, no round trip
  // through Home needed to see it.
  await expect(page).toHaveURL('/add');
  await expect(hint).toContainText('4 things waiting.');
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
  const box = page.getByRole('textbox', { name: 'What is this?' });
  await expect(box).toHaveAttribute('placeholder', /^Just filing is fine\./);
  // The rule sentence is kept in your rules too (#435).
  await box.fill(
    'Receipts: add them to a table with the shop and the total. From now on, file garden receipts under Garden.',
  );
  await shot(page, testInfo, 'add-context');
  await page.getByRole('button', { name: 'Add to Bower' }).click();
  await expect(page.getByText('In your inbox')).toBeVisible();

  // The context note is written on leaving Add (#421: no longer automatic
  // once a batch finishes), so leave for Home ourselves: the three
  // things, the receipt, the note.
  await navigate(page, /^Home$/);
  await expect(
    visible(page.locator('.home-card', { hasText: 'Inbox' })).locator(
      '.home-card-count',
    ),
  ).toHaveText('5');
  // It waits in the inbox with the other instruction notes, under the
  // Bower tab's Requests (the demo resets on a reload, so no `goto`); the
  // rule sentence is already in Rules, under its own topic.
  await navigate(page, /^Bower$/);
  await expect(
    bowerPart(page, 'Rules').getByRole('button', { name: /^Garden\s*1$/ }),
  ).toBeVisible();
  await showBowerPart(page, 'Requests');
  await expect(
    bowerPart(page, 'Requests')
      .getByRole('listitem')
      .filter({ hasText: 'About the files you added' }),
  ).toHaveCount(1);
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
  // The demo's amber line (#363, `Demo-Tidy-Confirm` board, handover
  // C.10): tidy up here never runs the model.
  await expect(confirm).toContainText(
    'Demo: what follows is a recording. Nothing is sent to Claude, nothing is saved.',
  );
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

  // The demo's own copy under the bar (#363, `Demo-Working` board): the
  // scripted run is a recording, not a real one, and the progress row's
  // right-hand badge says so too, instead of "Started n min ago".
  await expect(sheet).toContainText('A recording.');
  await expect(sheet).toContainText(
    'In the demo the bird plays back a real run in twenty seconds',
  );
  await expect(sheet).toContainText('Playing back');

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

  // Running: the scene, the count against the three things waiting, the
  // demo's own copy in place of "Started just now" and the reassurance
  // line (#363), and the item being read.
  const sheet = page.getByRole('dialog', { name: 'Tidying up status' });
  await expect(sheet.locator('.working-sheet-stage')).toContainText('Inbox');
  await expect(sheet.getByText(/^[0-3] of 3 filed$/)).toBeVisible();
  await expect(sheet.getByText('Playing back')).toBeVisible();
  await expect(sheet.getByText('A recording.')).toBeVisible();
  await expect(
    sheet.getByText(
      'In the demo the bird plays back a real run in twenty seconds',
      { exact: false },
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
  await expect(
    row.getByText('Waiting · question', { exact: true }),
  ).toBeVisible();
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

test('Rules: the explanation on top, groups with counts, pause a rule and see the chip (#342)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await navigate(page, /^Bower$/);
  const rules = bowerPart(page, 'Rules');
  await expect(
    rules.getByText('Rules are yours and start at once.'),
  ).toBeVisible();
  // Alex's groups, each with its count; only the first is open.
  const money = rules.getByRole('button', { name: /^Money\s*4$/ });
  await expect(money).toHaveAttribute('aria-expanded', 'true');
  await expect(
    rules.getByRole('button', { name: /^Travel\s*1$/ }),
  ).toHaveAttribute('aria-expanded', 'false');
  // Bower's two open suggestions sit on top, with Accept and Dismiss.
  await expect(
    rules.getByRole('region', { name: /^Suggested/ }).getByRole('button', {
      name: 'Accept',
    }),
  ).toHaveCount(2);
  await shot(page, testInfo, 'bower-rules');

  const rule = rules.getByRole('button', { name: /Never archive Money/ });
  await expect(rule.getByText('Paused', { exact: true })).toHaveCount(0);
  await rule.click();
  const sheet = page.getByRole('dialog', { name: 'Never archive Money' });
  await expect(sheet).toBeVisible();
  await shot(page, testInfo, 'bower-rule-menu');
  await sheet.getByRole('button', { name: /Pause it/ }).click();
  await expect(sheet).toBeHidden();
  await expect(rule.getByText('Paused', { exact: true })).toBeVisible();
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
  await expect(
    page.getByRole('dialog', { name: 'Tidying up status' }),
  ).toHaveCount(0);
  await row.getByRole('button', { name: 'In your rules' }).click();
  // Under 1200 px it switches to the Rules tab; from 1200 the Rules
  // column is already on screen (#357).
  const rulesTab = page.getByRole('tab', { name: 'Rules' });
  if ((await rulesTab.count()) > 0) {
    await expect(rulesTab).toHaveAttribute('aria-selected', 'true');
  }
  await expect(bowerPart(page, 'Rules')).toBeVisible();
});

test('Requests: every state, Edit, Remove, and Do it now for the requests only (#344)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await navigate(page, /^Bower$/);
  await showBowerPart(page, 'Requests');
  const requests = bowerPart(page, 'Requests');
  const rowWith = (text: string) =>
    requests.getByRole('listitem').filter({ hasText: text });

  // The demo's folder: a question waiting in the inbox, an answer, and
  // Alex's own rules.
  const lisbon = rowWith(
    'What do I still need to sort out for the Lisbon trip?',
  );
  await expect(
    lisbon.getByText('Waiting · question', { exact: true }),
  ).toBeVisible();
  await expect(lisbon).toContainText('goes with the next tidy-up');
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
  await lisbon.getByRole('button', { name: 'Edit' }).click();
  const box = page.getByRole('textbox', {
    name: 'Tell Bower what to do, or ask it something',
  });
  await expect(box).toHaveValue(
    'What do I still need to sort out for the Lisbon trip?',
  );
  await box.fill('What do I still need to book for the Lisbon trip?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(box).toHaveValue('');
  const edited = rowWith('What do I still need to book for the Lisbon trip?');
  await expect(
    edited.getByText('Waiting · question', { exact: true }),
  ).toBeVisible();
  await expect(lisbon).toHaveCount(0);

  // Remove: a job sent now goes to the Trash and leaves the list.
  await box.fill('Make a packing list for my next trip');
  await page.getByRole('button', { name: 'Send' }).click();
  const job = rowWith('Make a packing list for my next trip');
  await expect(job.getByText('Waiting · job', { exact: true })).toBeVisible();
  await job.getByRole('button', { name: 'Remove' }).click();
  await expect(job).toHaveCount(0);

  // Do it now: the confirmation counts the requests, and the run files
  // only them; the rest of the inbox stays for the next tidy-up.
  await edited.getByRole('button', { name: 'Do it now' }).click();
  const confirm = page.getByRole('dialog', { name: 'Is that everything?' });
  await expect(confirm).toContainText('1 thing is waiting.');
  await shot(page, testInfo, 'bower-requests-do-it-now');
  await confirm.getByRole('button', { name: 'Yes, tidy up' }).click();
  const sheet = page.getByRole('dialog', { name: 'Tidying up status' });
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();
  await expect(
    edited.getByText('Tidying up · question', { exact: true }),
  ).toBeVisible();
  // One file: the request, not the two other things in the inbox.
  const toast = page.getByRole('status').filter({
    hasText: '1 file processed',
  });
  await expect(toast).toBeVisible({ timeout: 20_000 });
  // The row keeps the exact sentence sent (the edit) once answered too --
  // not "What do I still need for Lisbon", the file name's own short title
  // (#465). Same text as `edited` matched while it was still waiting, now
  // in the one row this file becomes (no separate waiting row left).
  await expect(edited).toHaveCount(1);
  await expect(edited.getByText('Answered', { exact: true })).toBeVisible({
    timeout: 10_000,
  });
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

  // Sign out is a plain button, apart from Sign out everywhere; in the
  // demo build, Sign out everywhere and the own API key render nothing of
  // their own — one sentence covers the whole Advanced section instead of
  // repeating per control (#364) — and Delete (its own section) keeps its
  // own sentence: twice total, not three times. Scoped to the settings
  // section: the desktop sidebar has its own Sign out button.
  const settings = page.locator('.settings');
  await expect(
    settings.getByRole('button', { name: 'Sign out', exact: true }),
  ).toBeVisible();
  await expect(
    settings.getByText('Not in the demo: run your own Bower to use this.'),
  ).toHaveCount(2);

  // The push toggle is greyed with its own sentence (#364, handover
  // C.10/D.6), word for word what "From your Drive" gets in Add.
  const pushToggle = settings.getByRole('switch', {
    name: "Ping me when it's done",
  });
  await expect(pushToggle).toBeDisabled();
  await expect(
    settings.getByText('Not in the demo. Run your own Bower to use it.'),
  ).toBeVisible();
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

    // The sidebar (#422, #326, C.9): one Expand/Collapse all tool, no sort
    // menu, and the waiting-count bubble on Add's row, where the pile gets
    // filled, not Home's.
    const sidebar = page.getByRole('navigation', { name: 'Your notes' });
    await expect(sidebar.locator('[aria-label^="Sort by"]')).toHaveCount(0);
    await expect(
      sidebar.getByRole('button', { name: 'Expand all' }),
    ).toBeVisible();
    await expect(sidebar.locator('a[href="/add"] .nav-badge')).toHaveText('3');
    await expect(sidebar.locator('a[href="/"] .nav-badge')).toHaveCount(0);
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
    page.getByRole('button', { name: 'Search or jump to anything' }),
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
  // Scoped to the bottom nav (#367 added a note titled "Notes from the
  // viewing", otherwise an ambiguous substring match on Home's own list).
  await page
    .locator('nav.bottom-nav')
    .getByRole('link', { name: 'Notes' })
    .click();
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

  // The search row opens the quick switcher (#433, Phone-Notes board), and
  // closing it lands back on the Notes tab.
  await page
    .getByRole('button', { name: 'Search or jump to anything' })
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
    page.getByRole('button', { name: /Search or jump to a note/ }),
  ).click();
  const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
  await switcher.getByRole('combobox').fill('Lisbon');
  await switcher
    .getByRole('option', { name: /Lisbon Trip/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/note\//);

  // The title keeps its 130px floor: Back gives way to it, not the other
  // way round, and the bar itself never grows past the viewport.
  const crumbBox = await bar.locator('.topbar-crumb').boundingBox();
  expect(crumbBox?.width ?? 0).toBeGreaterThanOrEqual(130);
  await expect
    .poll(async () => page.evaluate(() => document.body.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  // Back still works, and its full destination is there for a screen
  // reader even while its visible label is short (or gone).
  const back = bar.getByRole('link', { name: 'Back to Lisbon Trip' });
  await expect(back).toBeVisible();

  // One More menu, not two (#439 already fixed the leftover desktop
  // trigger; this just guards against it coming back).
  await expect(bar.getByRole('button', { name: 'More' })).toHaveCount(1);

  // A title far longer than Back's own label still fits the bar with no
  // horizontal overflow, the same guarantee from the other direction.
  await openHome(page);
  await visible(
    page.getByRole('button', { name: /Search or jump to a note/ }),
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

  // Home: 980 px, centred right of the sidebar; the header row inside.
  await expect(page.getByRole('link', { name: /Inbox/ }).first()).toBeVisible();
  expect(await width()).toBeCloseTo(980, 0);
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
  expect(bar?.x).toBeCloseTo(box?.x ?? NaN, 0);
  expect(bar?.width).toBeCloseTo(box?.width ?? NaN, 0);
  expect(await rightEdgeHuggers(page)).toEqual([]);
  await shot(page, testInfo, 'container-1920-home');

  // A note, with its About panel: the container grows to 1200, still centred.
  await visible(
    page.getByRole('button', { name: /Search or jump to a note/ }),
  ).click();
  const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
  await switcher.getByRole('combobox').fill('subscriptions renew');
  await switcher
    .getByRole('option', { name: /subscriptions renew/ })
    .first()
    .click();
  await expect(page.locator('.bower-note')).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'About this note' }),
  ).toBeVisible();
  expect(await width()).toBeCloseTo(1200, 0);
  expect(await rightEdgeHuggers(page)).toEqual([]);
  await shot(page, testInfo, 'container-1920-note');

  await navigate(page, /^Add$/);
  await expect(page).toHaveURL(/\/add$/);
  await expect(content).toBeVisible();
  expect(await width()).toBeCloseTo(980, 0);
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

test('Home on desktop: four equal cards, Pinned tiles on the same grid, Recent in two columns (#356)', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'The desktop grid; the phone keeps its own Home.',
  );
  const cards = page.locator('.home-cards > .home-card');
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
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(3)).toBeVisible();
  let grid = await boxes(cards);
  expect(new Set(grid.map((b) => Math.round(b.width))).size).toBe(1);
  expect(new Set(grid.map((b) => Math.round(b.y))).size).toBe(2);
  expect(await clipped()).toEqual([]);
  // No Tell column on Home (#347).
  await expect(page.getByRole('textbox', { name: /Tell Bower/ })).toHaveCount(
    0,
  );
  await shot(page, testInfo, 'home-desktop-1024');

  // 1280: four equal cards in one row; the Pinned tiles on the same
  // columns; Recent in two columns.
  await page.setViewportSize({ width: 1280, height: 900 });
  grid = await boxes(cards);
  expect(new Set(grid.map((b) => Math.round(b.width))).size).toBe(1);
  expect(new Set(grid.map((b) => Math.round(b.y))).size).toBe(1);
  const tiles = await boxes(page.locator('.home-pinned-grid > *'));
  expect(tiles.length).toBeGreaterThan(0);
  tiles.forEach((tile, i) => {
    expect(tile.x).toBeCloseTo(grid[i % 4]?.x ?? NaN, 0);
    expect(tile.width).toBeCloseTo(grid[i % 4]?.width ?? NaN, 0);
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
    page.getByRole('button', { name: /Search or jump to a note/ }),
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
  // The panel starts right after the text column's padding, not on the
  // far side of the container (6.1.5: 900 px away at 1920).
  expect((aside?.x ?? NaN) - textRight).toBeLessThanOrEqual(25);
  expect((aside?.x ?? NaN) - textRight).toBeGreaterThanOrEqual(0);
  // The row (text column and panel) is centred in the container.
  const left = (text?.x ?? NaN) - 24 - (body?.x ?? NaN);
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
          page.getByRole('button', { name: /Search or jump to a note/ }),
        ).click();
        const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
        await switcher.getByRole('combobox').fill('subscriptions renew');
        await switcher
          .getByRole('option', { name: /subscriptions renew/ })
          .first()
          .click();
        await expect(page.locator('.bower-note')).toBeVisible();
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
    ['not-found', '/note/does-not-exist', /can.t find that note/],
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
  // Projects (the demo fixture) has no notes of its own — Lisbon Trip,
  // Kitchen Refresh, Half Marathon and Flat hunt hold all of them — a real
  // instance of 1.9: the header's count is the whole subtree, the empty
  // state used to say "Nothing here yet" regardless.
  await page.goto('/folder/1-Projects');
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await expect(page.getByText('Nothing here yet.')).toBeHidden();
  // #424: the total is real (2 + 3 + 4 + 2 across four subfolders, #367
  // added Flat hunt), but no single one of them holds all eleven, so none
  // is named.
  await expect(page.getByText('11 notes in its folders')).toBeVisible();
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
  // The Phone-Folder board's details (#431): the heading without the
  // numeric prefix, "N projects · N things", a second line on each
  // subfolder row.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Projects', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.folder-meta')).toHaveText(
    /^\d+ projects? · \d+ things?$/,
  );
  await expect(
    page
      .locator('a.folder-row[href="/folder/1-Projects/Lisbon%20Trip"]')
      .locator('.folder-row-detail'),
  ).toHaveText(/^\d+ things? · (updated today|\d+ (d|w|mo|y))$/);
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

test('folder counts add files and notes together, the same total the folder screen itself lists (#425)', async ({
  page,
}, testInfo) => {
  await openHome(page);

  if (testInfo.project.name === 'phone') {
    // The folder menu button only sits on an outer screen's bar (C.2); open
    // it from Home before navigating into a folder.
    const bar = page.locator('header.topbar');
    await bar.getByRole('button', { name: 'Your folders' }).click();
    const menu = page.getByRole('dialog', { name: 'Your folders' });
    await expect(
      menu.getByRole('link', { name: /^0-Inbox.*added\D*2$/ }),
    ).toBeVisible();
    await expect(
      menu.getByRole('link', { name: /^1-Projects.*end date\D*15$/ }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
  } else {
    const sidebar = page.getByRole('navigation', { name: 'Your notes' });
    await expect(
      sidebar.locator('a[href="/folder/0-Inbox"] .tree-count'),
    ).toHaveText('2');
    await expect(
      sidebar.locator('a[href="/folder/1-Projects"] .tree-count'),
    ).toHaveText('15');
  }

  // 0-Inbox: 1 file (the boiler invoice) + 1 note (Tomato seedlings) — the
  // folder screen's own header already says "1 file · 1 note".
  await page.goto('/folder/0-Inbox');
  await expect(page.locator('.folder-meta')).toHaveText('1 file · 1 note');
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

  // The end-of-folder tip is generic (#464): it used to name "the flats I
  // saved" and "rent and size" on every project folder, Kitchen Refresh
  // included, hard-coding the board's own Flat hunt example.
  await expect(page.locator('.folder-tip')).toHaveText(
    'Want more from this folder? Ask Bower: “Compare what I saved here” or “From now on, pull the dates out of everything in this folder”.',
  );

  // The Ask Bower chip opens the Bower tab's box with the folder named,
  // and nothing else from the folder (#354).
  await page.getByRole('link', { name: 'Ask Bower about it' }).click();
  await expect(page).toHaveURL(/\/bower\?text=/);
  await expect(
    page.getByRole('textbox', {
      name: 'Tell Bower what to do, or ask it something',
    }),
  ).toHaveValue('About Kitchen Refresh: ');
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
  ).toHaveAttribute('href', '/bower?text=About%20Kitchen%20Refresh%3A%20');
  await expect(
    folderMenu.getByRole('menuitem', { name: /Edit the text/ }),
  ).toHaveCount(0);
  await shot(page, testInfo, 'folder-more-menu');
});

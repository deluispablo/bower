/**
 * Add, v4 (#618, spec R-ADD-1 to R-ADD-6, boards `Flow-03-Add` and
 * `Desktop-Add`): three doors in one row, one primary button carrying the
 * count, the desktop drop zone still feeding the same queue.
 */

import { expect, navigate, openHome, test } from './demo.js';

test('the four doors fit one row at 375 px with 44 px targets (R-ADD-1, #770)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the doors are a phone row');
  await page.setViewportSize({ width: 375, height: 812 });
  await openHome(page);
  await navigate(page, /^Add$/);

  const doors = page.locator('.add-doors > button.door-button');
  // Photo (the fake webcam gives the phone a camera), Files, Drive, Link.
  await expect(doors).toHaveCount(4);
  const boxes = await doors.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, height: r.height, right: r.right, left: r.left };
    }),
  );
  for (const box of boxes) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.top).toBeCloseTo(boxes[0]?.top ?? 0, 0);
    expect(box.right).toBeLessThanOrEqual(375);
  }
  // No two doors overlap: one row, left to right.
  for (let i = 1; i < boxes.length; i += 1) {
    expect(boxes[i]?.left ?? 0).toBeGreaterThanOrEqual(
      boxes[i - 1]?.right ?? 0,
    );
  }
  await expect(
    page.getByText('Or share to Bower from any app: it lands here too.'),
  ).toHaveCount(0);
});

test('the button reads "Tidy up 5 things" with five items and opens the confirmation (R-ADD-5)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await navigate(page, /^Add$/);

  // The demo inbox already holds three things; two more make five.
  await page
    .locator('input[type="file"]')
    .first()

    .setInputFiles(
      Array<string>(2).fill(
        `${testInfo.project.testDir}/files/Garden centre receipt.txt`,
      ),
    );
  await expect(page.locator('.pile-row-done')).toHaveCount(2, {
    timeout: 15_000,
  });
  // #914 (R-AD-5): kinds in words in the row meta, no badges.
  await expect(page.locator('.pile-row .list-row-meta')).toHaveCount(2);
  await expect(page.locator('.pile-row .kind-badge')).toHaveCount(0);

  const tidy = page.locator('.add-tidy-button');
  await expect(tidy).toHaveText('Tidy up 5 things');
  await tidy.click();

  const confirm = page.getByRole('dialog', { name: 'Is that everything?' });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('5');
  await confirm.getByRole('button', { name: 'Add more first' }).click();
  await expect(confirm).toBeHidden();
});

test('the desktop drop line, and a dropped file joins the new pile (R-ADD-6, #770)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the drop line is desktop');
  await page.setViewportSize({ width: 1280, height: 800 });
  await openHome(page);
  await navigate(page, /^Add$/);

  await expect(page.locator('.add-doors')).toBeVisible();
  await expect(
    page.getByText(
      'Drop files anywhere on this page: they join the pile you are making.',
    ),
  ).toBeVisible();

  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(
      new File(['x'], 'Dropped flat.pdf', { type: 'application/pdf' }),
    );
    const target = document.querySelector('.add-screen');
    target?.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: data,
      }),
    );
  });

  await expect(page.locator('.pile-row')).toHaveCount(1);
  await expect(page.locator('.pile-row .list-row-meta')).toHaveText(/^PDF · /);
  await expect(
    page.getByRole('textbox', { name: 'What is this pile?' }),
  ).toBeVisible();
  await expect(page.locator('.add-tidy-button')).toHaveText(
    'Tidy up 4 things',
    { timeout: 15_000 },
  );
});

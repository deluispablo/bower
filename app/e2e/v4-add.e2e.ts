/**
 * Add, v4 (#618, spec R-ADD-1 to R-ADD-6, boards `Flow-03-Add` and
 * `Desktop-Add`): three doors in one row, one primary button carrying the
 * count, the desktop drop zone still feeding the same queue.
 */

import { expect, navigate, openHome, test } from './demo.js';

function textFile(name: string): {
  name: string;
  mimeType: string;
  buffer: Uint8Array;
} {
  return {
    name,
    mimeType: 'text/plain',
    buffer: new TextEncoder().encode(name),
  };
}

test('the three doors fit one row at 375 px with 48 px targets (R-ADD-1)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the doors are a phone row');
  await page.setViewportSize({ width: 375, height: 812 });
  await openHome(page);
  await navigate(page, /^Add$/);

  const doors = page.locator('.add-doors > button.add-door');
  // Photo (the fake webcam gives the phone a camera), Files, Drive.
  await expect(doors).toHaveCount(3);
  const boxes = await doors.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, height: r.height, right: r.right, left: r.left };
    }),
  );
  for (const box of boxes) {
    expect(box.height).toBeGreaterThanOrEqual(48);
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
}) => {
  await openHome(page);
  await navigate(page, /^Add$/);

  // The demo inbox already holds three things; two more make five.
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles([textFile('Flat one.txt'), textFile('Flat two.txt')]);
  await expect(page.locator('.add-queue-kept')).toHaveCount(0);
  await expect(page.locator('.add-queue-card .kind-badge')).toHaveCount(2);

  const tidy = page.locator('.add-tidy-button');
  await expect(tidy).toHaveText('Tidy up 5 things');
  await tidy.click();

  const confirm = page.getByRole('dialog', { name: 'Is that everything?' });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('5');
  await confirm.getByRole('button', { name: 'Add more first' }).click();
  await expect(confirm).toBeHidden();
});

test('the desktop drop zone keeps working with the new queue (R-ADD-6)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the drop zone is desktop');
  await page.setViewportSize({ width: 1280, height: 800 });
  await openHome(page);
  await navigate(page, /^Add$/);

  await expect(page.locator('.add-doors')).toBeHidden();
  const zone = page.locator('.add-dropzone');
  await expect(zone).toBeVisible();
  await expect(zone).toContainText('Drop files here');
  await expect(
    zone.getByRole('button', { name: 'Choose files' }),
  ).toBeVisible();

  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(
      new File(['x'], 'Dropped flat.pdf', { type: 'application/pdf' }),
    );
    const target = document.querySelector('.add-dropzone');
    target?.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: data,
      }),
    );
  });

  await expect(page.locator('.add-queue-head')).toHaveText('In your inbox · 1');
  await expect(page.locator('.add-sources-desktop')).toHaveText('From drop');
  await expect(page.locator('.add-queue-card .kind-badge')).toHaveText('PDF');
  await expect(
    page.getByRole('textbox', { name: 'What is this?' }),
  ).toBeVisible();
  await expect(page.locator('.add-tidy-button')).toHaveText('Tidy up 4 things');
});

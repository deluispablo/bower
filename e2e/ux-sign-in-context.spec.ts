import { expect, source, test } from './fixtures';
import { resize } from './viewport';

for (const width of [390, 1440]) for (const colorScheme of ['light', 'dark'] as const) {
  test(`AC3: sign-in and landing round trip at ${width} in ${colorScheme}`, async ({ page }) => {
    await resize(page, { width, height: width === 390 ? 844 : 900 });
    await page.emulateMedia({ colorScheme });
    await page.goto('/sign-in?scenario=signed-out&time=instant');
    const selection = () => page.evaluate(() => ['source', 'scenario', 'scale'].map((key) => sessionStorage.getItem(`bower:demo:${key}`)));
    const kept = [source || null, 'signed-out', 'instant'];
    const landing = page.getByRole('link', { name: 'See how Bower works', exact: true });
    await expect(landing).toBeVisible();
    expect(await selection()).toEqual(kept);
    await landing.click();
    await expect(page).toHaveURL(/\/landing\/$/);
    await expect(page.locator('#root')).toHaveCount(0);
    const signIn = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Sign in', exact: true });
    await expect(signIn).toBeVisible();
    expect(await selection()).toEqual(kept);
    await signIn.click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    expect(await selection()).toEqual(kept);
    await expect(page.getByText('Google will ask to let Bower see and change your Drive. Bower keeps to its own folder. Only people invited to this Bower can sign in.', { exact: true })).toBeVisible();
  });
}

for (const [reason, sentence] of [
  ['cancelled', 'Sign-in was cancelled.'],
  ['failed', "Bower couldn't sign you in. Try again."],
]) {
  test(`AC3: ${reason} remains distinct and clears its callback parameter`, async ({ page }) => {
    await page.goto(`/sign-in?scenario=signed-out&time=instant&signin=${reason}`);
    await expect(page.getByRole('alert')).toHaveText(sentence);
    await expect.poll(() => new URL(page.url()).searchParams.has('signin')).toBe(false);
    await expect(page.getByRole('alert')).toHaveText(sentence);
    await expect(page.getByRole('button', { name: 'Use another account' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

test('AC2: another account preserves an encoded destination and consumes it once', async ({ page }) => {
  const destination = '/files/Projects/Flat%20hunt?view=list&tag=a%2Bb';
  await page.goto(`/sign-in?scenario=signed-out&time=instant&from=${encodeURIComponent(destination)}`);
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await page.goto('/sign-in?signin=not-invited');
  await expect.poll(() => new URL(page.url()).searchParams.has('signin')).toBe(false);
  expect(await page.evaluate(() => sessionStorage.getItem('bower:sign-in-from'))).toBe(destination);
  await page.getByRole('alert').getByRole('button', { name: 'Use another account' }).click();
  await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(destination);
  await expect(page.getByRole('heading', { name: /^Flat hunt/, level: 1 })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('bower:sign-in-from'))).toBeNull();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Hello, Alex/ })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
});

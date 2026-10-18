import { expect, test } from '@playwright/test';

for (const path of ['/landing/', '/landing/index.html']) test(`the landing works with its CSP and no runtime eval at ${path}`, async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const marker = document.createElement('meta');
      marker.setAttribute('data-csp-violation', `${event.effectiveDirective}: ${event.blockedURI}`);
      document.head.appendChild(marker);
    });
  });
  const response = await page.goto(path);
  const csp = response?.headers()['content-security-policy'];
  expect(csp).toContain("script-src 'self';");
  expect(csp).not.toContain("'unsafe-eval'");
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your Drive, tidied by a bowerbird.');
  await expect(page.getByRole('link', { name: 'GitHub', exact: true })).toHaveAttribute('href', 'https://github.com/deluispablo/bower');
  await expect(page.getByRole('link', { name: 'github.com/deluispablo', exact: true })).toHaveAttribute('href', 'https://github.com/deluispablo');
  await expect(page.getByRole('link', { name: 'github.com/deluispablo/bower', exact: true })).toHaveAttribute('href', 'https://github.com/deluispablo/bower');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/sign-in');
  // The SVG placeholders have become actual drawings through the page logic.
  await expect.poll(() => page.locator('path[d]').count()).toBeGreaterThan(5);
  await expect(page.locator('[data-csp-violation]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

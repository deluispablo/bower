import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Sheet } from './Sheet';
import s from './ui.module.css';

vi.mock('./back', () => ({ useBackCloses: () => undefined }));
// Reproduce the old primitive's preference read without importing the app into the UI test.
vi.mock('@/app/prefs', () => ({ usePrefs: () => false }));

afterEach(() => {
  cleanup();
});

test('a Sheet without placement keeps its animation when Bower moves is off', () => {
  render(<Sheet open onOpenChange={() => undefined} title="Details" still>Details</Sheet>);
  const dialog = screen.getByRole('dialog', { name: 'Details' });
  if (!s.sheet) throw new Error('Missing Sheet class');
  expect(dialog).toHaveClass(s.sheet);
  expect(dialog.style.animation).toBe('');
  expect(document.querySelector<HTMLElement>(`.${s.scrim}`)?.style.animation).toBe('');
});

test.each(['left', 'right'] as const)('an edge Sheet at %s uses only the supplied still prop', (placement) => {
  // The shell owns the preference; the UI primitive must use its supplied prop.
  const view = render(<Sheet open onOpenChange={() => undefined} title="Panel" placement={placement} still={false}>Panel</Sheet>);
  const dialog = screen.getByRole('dialog', { name: 'Panel' });
  expect(dialog.style.animation).toBe('');
  expect(document.querySelector<HTMLElement>(`.${s.scrim}`)?.style.animation).toBe('');
  view.rerender(<Sheet open onOpenChange={() => undefined} title="Panel" placement={placement} still>Panel</Sheet>);
  expect(dialog.style.animation).toBe('none');
  expect(document.querySelector<HTMLElement>(`.${s.scrim}`)?.style.animation).toBe('none');
});

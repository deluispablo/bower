import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { NEVER_WHY } from '@/data/spine/scripted';
import { RunLinks } from './RunLinks';

afterEach(cleanup);

it('AC3 the declined row shows its request words above why', () => {
  const words = 'Delete my old receipts for good';
  render(<MemoryRouter><RunLinks report={{ created: [], updated: [], leftAsWritten: [{ name: words, why: NEVER_WHY }] }} /></MemoryRouter>);
  const list = screen.getByRole('list', { name: 'Left as you wrote them' });
  const item = within(list).getByRole('listitem');
  const name = within(item).getByText(words, { exact: true });
  const why = within(item).getByText(NEVER_WHY, { exact: true });
  expect(name).toBeVisible();
  expect(name.nextElementSibling).toBe(why);
  expect(why).toHaveClass('muted');
  expect(within(item).queryByRole('link')).toBeNull();
});

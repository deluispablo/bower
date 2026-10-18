import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { noteRoute } from '@/app/paths';
import { UNREAD_WHY } from '@/data/spine/scripted';
import { RunLinks } from './RunLinks';

afterEach(cleanup);

it('U-9: an unread row links to the filed path and shows the file display name', () => {
  const path = 'Resources/Gardening/Filed Photo.heic';
  render(<MemoryRouter><RunLinks report={{ created: [], updated: [],
    leftAsWritten: [{ name: path, fileId: 'PHOTO_ID', why: UNREAD_WHY }],
  }} /></MemoryRouter>);
  const list = screen.getByRole('list', { name: 'Left as you wrote them' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  const link = within(list).getByRole('link', { name: 'Filed Photo.heic' });
  expect(link).toHaveAttribute('href', noteRoute(path));
  expect(link).toHaveTextContent('Filed Photo.heic');
  expect(within(list).getByText(UNREAD_WHY, { exact: true })).toBeVisible();
});

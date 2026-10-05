import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BowerError } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { openDrive } from './report';
import { toast } from './toast';

vi.mock('./toast', () => ({ toast: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());
const source = (enabled: boolean, read: () => Promise<string | null>) => new Proxy(loadingSources().vault, {
  get: (target, key) => key === 'driveLinks' ? enabled : key === 'driveLink' ? read : Reflect.get(target, key),
});

it('a pretend Drive explains why it cannot open a tab', () => {
  const open = vi.spyOn(window, 'open');
  const read = vi.fn();
  openDrive(source(false, read));
  expect(open).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
  expect(toast).toHaveBeenCalledWith('This demo has no folder in Google Drive.');
});

it('a Drive tab is reserved during the click and detached before the async read', async () => {
  const replace = vi.fn();
  const tab = { opener: window, location: { replace }, close: vi.fn() };
  const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
  let resolve: (url: string) => void = () => undefined;
  const read = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
  openDrive(source(true, read), 'Areas');
  expect(open).toHaveBeenCalledWith('about:blank', '_blank');
  expect(tab.opener).toBeNull();
  expect(read).not.toHaveBeenCalled();
  await waitFor(() => expect(read).toHaveBeenCalledWith('Areas'));
  resolve('https://drive.google.com/drive/folders/FOLDER_ID');
  await waitFor(() => expect(replace).toHaveBeenCalledWith('https://drive.google.com/drive/folders/FOLDER_ID'));
});

it('a failed Drive lookup closes its reserved tab and explains the error', async () => {
  const close = vi.fn();
  const replace = vi.fn();
  vi.spyOn(window, 'open').mockReturnValue({ opener: window, close, location: { replace } } as unknown as Window);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  openDrive(source(true, async () => { throw new BowerError('offline', 'You are offline. Try again when you are back.'); }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(replace).not.toHaveBeenCalled();
  expect(toast).toHaveBeenCalledWith('You are offline. Try again when you are back.');
});

it('a blocked Drive tab offers an explicit same-tab action', async () => {
  vi.spyOn(window, 'open').mockReturnValue(null);
  openDrive(source(true, async () => 'https://drive.google.com/drive/folders/FOLDER_ID'));
  await waitFor(() => expect(toast).toHaveBeenCalledWith('Your browser blocked the new tab.', { label: 'Open in this tab', run: expect.any(Function) }));
});

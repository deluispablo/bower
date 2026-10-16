/**
 * audit-ui-guards AC3 (audit 2026-10-16, finding 8): on Add, a file that refills a draft row after a reload and a
 * new file, added together, get their own duplicate warnings; the warning and Leave it out stay on the matching row.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { loadingSources } from '@/testing/loading-sources';
import { Add } from './Add';
import { forget, get } from './draft-files';

vi.mock('@/ui/toast', () => ({ toast: vi.fn() }));
const scanKey = 'G3-scan';
beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup(); sessionStorage.clear(); forget(scanKey); vi.restoreAllMocks(); });

it('AC3 audit-ui-guards-dup-row: a refill and a new file added together each get their own duplicate warning', async () => {
  // After a reload: one draft row whose bytes are gone (scan.pdf).
  sessionStorage.setItem('bower:add-items', JSON.stringify([{ key: scanKey, name: 'scan.pdf', kind: 'pdf', origin: 'From this device' }]));
  const duplicates = vi.fn(async (files: Array<{ name: string }>) => files.map((f) => (f.name === 'scan.pdf' ? 'Resources' : null)));
  const base = loadingSources();
  const view = render(<MemoryRouter initialEntries={['/add']}><DataProvider sources={{ ...base, vault: { ...base.vault, duplicates } }}><Add /></DataProvider></MemoryRouter>);
  const input = view.container.querySelector('input[type="file"]');
  if (!input) throw new Error('The file picker is missing.');
  const scan = new File(['SYNTHETIC_SCAN'], 'scan.pdf', { type: 'application/pdf' });
  const fresh = new File(['SYNTHETIC_OUTLINE'], 'outline.txt', { type: 'text/plain' });
  await act(async () => { fireEvent.change(input, { target: { files: [scan, fresh] } }); });
  await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
  // Positive control: the refill filled the old row, the new file has its own, and the check ran for both.
  expect(get(scanKey)).toBe(scan);
  expect(duplicates).toHaveBeenCalledTimes(1);
  const rows = within(screen.getByRole('list', { name: 'In this pile' })).getAllByRole('listitem');
  expect(rows).toHaveLength(2);
  const row = (name: string) => rows.find((r) => within(r).queryByText(name)) ?? null;
  expect(row('scan.pdf')).toHaveTextContent('You already have this in');
  expect(row('outline.txt')).not.toHaveTextContent('You already have this in');
  // Leave it out takes out the duplicate, not the new file.
  fireEvent.click(within(row('scan.pdf') as HTMLElement).getByRole('button', { name: 'Leave it out' }));
  const left = within(screen.getByRole('list', { name: 'In this pile' })).getAllByRole('listitem');
  expect(left.map((r) => r.textContent ?? '')).toEqual([expect.stringContaining('outline.txt')]);
});

it('AC3 audit-ui-guards-dup-row-reverse: the new file is the duplicate, picked before the refill; the check gets each file once with its own bytes', async () => {
  sessionStorage.setItem('bower:add-items', JSON.stringify([{ key: scanKey, name: 'scan.pdf', kind: 'pdf', origin: 'From this device' }]));
  const duplicates = vi.fn(async (files: Array<{ name: string }>) => files.map((f) => (f.name === 'outline.txt' ? 'Resources' : null)));
  const base = loadingSources();
  const view = render(<MemoryRouter initialEntries={['/add']}><DataProvider sources={{ ...base, vault: { ...base.vault, duplicates } }}><Add /></DataProvider></MemoryRouter>);
  const input = view.container.querySelector('input[type="file"]');
  if (!input) throw new Error('The file picker is missing.');
  const scan = new File(['SYNTHETIC_SCAN'], 'scan.pdf', { type: 'application/pdf' });
  const fresh = new File(['SYNTHETIC_OUTLINE'], 'outline.txt', { type: 'text/plain' });
  await act(async () => { fireEvent.change(input, { target: { files: [fresh, scan] } }); });
  await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
  expect(get(scanKey)).toBe(scan);
  expect(duplicates).toHaveBeenCalledTimes(1);
  expect(duplicates).toHaveBeenCalledWith([{ name: 'outline.txt', body: fresh }, { name: 'scan.pdf', body: scan }]);
  const rows = within(screen.getByRole('list', { name: 'In this pile' })).getAllByRole('listitem');
  expect(rows).toHaveLength(2);
  const row = (name: string) => rows.find((r) => within(r).queryByText(name)) ?? null;
  expect(row('outline.txt')).toHaveTextContent('You already have this in');
  expect(row('scan.pdf')).not.toHaveTextContent('You already have this in');
  fireEvent.click(within(row('outline.txt') as HTMLElement).getByRole('button', { name: 'Leave it out' }));
  const left = within(screen.getByRole('list', { name: 'In this pile' })).getAllByRole('listitem');
  expect(left.map((r) => r.textContent ?? '')).toEqual([expect.stringContaining('scan.pdf')]);
  expect(get(scanKey), 'the refilled row keeps its bytes').toBe(scan);
});

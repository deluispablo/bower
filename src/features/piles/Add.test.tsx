import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { NewPile, Pile, FileKind } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { Add } from './Add';
import { forget, get, keep } from './draft-files';

vi.mock('@/ui/toast', () => ({ toast: vi.fn() }));
const context = 'Synthetic papers for review';
const missingKey = 'S01-unavailable';
const readyKey = 'S01-ready';
const keys = [missingKey, readyKey];
interface DraftFixture { key: string; name: string; kind: FileKind; origin: string; url?: string }
const missingMember: DraftFixture = { key: missingKey, name: 'scan.pdf', kind: 'pdf', origin: 'From this device' };
const readyMember: DraftFixture = { key: readyKey, name: 'outline.txt', kind: 'other', origin: 'From this device' };
const linkMember: DraftFixture = { key: 'S01-link', name: 'source.example', kind: 'link', origin: 'A link you pasted', url: 'https://source.example/' };
beforeEach(() => { sessionStorage.clear(); keys.forEach(forget); });
afterEach(() => { cleanup(); sessionStorage.clear(); keys.forEach(forget); vi.restoreAllMocks(); vi.clearAllMocks(); });
function CurrentRoute() { return <output aria-label="Current route">{useLocation().pathname}</output>; }

it.each([
  { case: 'context and one unavailable file', mixed: false, disappearsAfterRender: false },
  { case: 'context, ready file and link beside unavailable file', mixed: true, disappearsAfterRender: false },
  { case: 'bytes disappear after render before the enabled save is clicked', mixed: true, disappearsAfterRender: true },
])('an Add draft with unavailable bytes keeps every member before saving ($case)', async ({ mixed, disappearsAfterRender }) => {
  const members = mixed ? [missingMember, readyMember, linkMember] : [missingMember];
  const storedMembers = JSON.stringify(members);
  sessionStorage.setItem('bower:add-draft', context);
  sessionStorage.setItem('bower:add-items', storedMembers);
  const readyBody = new Blob(['SYNTHETIC_READY_BYTES'], { type: 'text/plain' });
  if (mixed) keep(readyKey, readyBody);
  if (disappearsAfterRender) keep(missingKey, new Blob(['SYNTHETIC_SCAN_BYTES'], { type: 'application/pdf' }));
  const accepted: NewPile[] = [];
  const addPile = vi.fn(async (input: NewPile): Promise<Pile> => {
    accepted.push(input);
    return { id: 'SYNTHETIC_ADMITTED_PILE', text: input.text, createdAt: 1, items: input.items.map((item, index) => ({ id: `SYNTHETIC_ITEM_${index}`, name: item.name, kind: item.kind, origin: item.origin })) };
  });
  const base = loadingSources();
  render(<MemoryRouter initialEntries={['/add']}><DataProvider sources={{ ...base, vault: { ...base.vault, addPile, duplicates: async () => [] } }}><CurrentRoute /><Routes><Route path="/add" element={<Add />} /><Route path="/" element={<p>Saved inbox page</p>} /></Routes></DataProvider></MemoryRouter>);
  const save = screen.getByRole('button', { name: /^Add .*to the inbox$/ });
  expect(within(screen.getByRole('list', { name: 'In this pile' })).getAllByRole('listitem')).toHaveLength(members.length);
  if (disappearsAfterRender) {
    // Public byte-store operation, after the screen has rendered its enabled save.
    // Do not mutate DOM disabled, invoke a private handler or force a React rerender.
    expect(save).toBeEnabled();
    forget(missingKey);
  } else {
    expect.soft(save).toBeDisabled();
  }
  await act(async () => { fireEvent.click(save); });
  const observations = {
    case: mixed ? (disappearsAfterRender ? 'late byte loss' : 'mixed unavailable') : 'context unavailable',
    dispatched: accepted.map((input) => ({ text: input.text, items: input.items.map((item) => ({ name: item.name, bodyPresent: item.body !== undefined, urlPresent: item.url !== undefined })) })),
    storedText: sessionStorage.getItem('bower:add-draft'),
    storedItems: sessionStorage.getItem('bower:add-items'),
    route: screen.getByLabelText('Current route').textContent,
    readyBytesKept: get(readyKey) === readyBody,
    visibleMembers: screen.queryByRole('list', { name: 'In this pile' })?.querySelectorAll('li').length ?? 0,
  };
  console.info('S01_PUBLIC_RENDER_OBSERVATION', JSON.stringify(observations));
  expect.soft(addPile).not.toHaveBeenCalled();
  expect.soft(sessionStorage.getItem('bower:add-draft')).toBe(context);
  expect.soft(sessionStorage.getItem('bower:add-items')).toBe(storedMembers);
  expect.soft(screen.getByLabelText('Current route')).toHaveTextContent('/add');
  expect.soft(screen.queryByRole('textbox', { name: 'What is this?' })).toHaveValue(context);
  const list = screen.queryByRole('list', { name: 'In this pile' });
  expect.soft(list).not.toBeNull();
  expect.soft(list?.querySelectorAll('li').length ?? 0).toBe(members.length);
  for (const member of members) expect.soft(list).toHaveTextContent(member.name);
  if (mixed) expect.soft(get(readyKey)).toBe(readyBody);
});

function renderDraft(members: DraftFixture[], addPile: (input: NewPile) => Promise<Pile>) {
  sessionStorage.setItem('bower:add-draft', context);
  sessionStorage.setItem('bower:add-items', JSON.stringify(members));
  const base = loadingSources();
  return render(<MemoryRouter initialEntries={['/add']}><DataProvider sources={{ ...base, vault: { ...base.vault, addPile, duplicates: async () => [] } }}><CurrentRoute /><Routes><Route path="/add" element={<Add />} /><Route path="/" element={<p>Saved inbox page</p>} /></Routes></DataProvider></MemoryRouter>);
}
const admitted = (input: NewPile): Pile => ({ id: 'SYNTHETIC_ADMITTED_PILE', text: input.text, createdAt: 1, items: input.items.map((item, index) => ({ id: `SYNTHETIC_ITEM_${index}`, name: item.name, kind: item.kind, origin: item.origin })) });

it('explicitly removing an unavailable draft member saves the entire remaining set once', async () => {
  const body = new Blob(['SYNTHETIC_READY_BYTES']); keep(readyKey, body);
  const addPile = vi.fn(async (input: NewPile) => admitted(input));
  renderDraft([missingMember, readyMember, linkMember], addPile);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Take scan.pdf out' })); });
  expect(screen.getByRole('list', { name: 'In this pile' })).not.toHaveTextContent('scan.pdf');
  expect(get(readyKey)).toBe(body);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add 2 things to the inbox' })); });
  expect(addPile).toHaveBeenCalledExactlyOnceWith({ text: context, items: [{ name: readyMember.name, kind: readyMember.kind, origin: readyMember.origin, body }, { name: linkMember.name, kind: linkMember.kind, origin: linkMember.origin, url: linkMember.url }] });
  expect(sessionStorage.getItem('bower:add-items')).toBeNull();
  expect(sessionStorage.getItem('bower:add-draft')).toBeNull();
  expect(get(readyKey)).toBeUndefined();
  expect(screen.getByLabelText('Current route')).toHaveTextContent('/');
});
it('reselecting an unavailable draft member keeps one row and saves all members after confirmed admission', async () => {
  const readyBody = new Blob(['SYNTHETIC_READY_BYTES']); keep(readyKey, readyBody);
  const restored = new File(['SYNTHETIC_SCAN_BYTES'], 'scan.pdf', { type: 'application/pdf' });
  let resolve: (value: Pile) => void = () => { throw new Error('The admission has not started.'); };
  const addPile = vi.fn((_input: NewPile) => new Promise<Pile>((done) => { resolve = done; }));
  const view = renderDraft([missingMember, readyMember, linkMember], addPile);
  const input = view.container.querySelector('input[type="file"]');
  if (!input) throw new Error('The file picker is missing.');
  await act(async () => { fireEvent.change(input, { target: { files: [restored] } }); });
  expect(within(screen.getByRole('list', { name: 'In this pile' })).getAllByRole('listitem')).toHaveLength(3);
  expect(screen.getByRole('list', { name: 'In this pile' })).not.toHaveTextContent('Add this file again');
  expect(get(missingKey)).toBe(restored);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add 3 things to the inbox' })); });
  const request: NewPile = { text: context, items: [{ name: missingMember.name, kind: missingMember.kind, origin: missingMember.origin, body: restored }, { name: readyMember.name, kind: readyMember.kind, origin: readyMember.origin, body: readyBody }, { name: linkMember.name, kind: linkMember.kind, origin: linkMember.origin, url: linkMember.url }] };
  expect(addPile).toHaveBeenCalledExactlyOnceWith(request);
  expect(sessionStorage.getItem('bower:add-draft')).toBe(context);
  expect(JSON.parse(sessionStorage.getItem('bower:add-items') ?? '[]')).toHaveLength(3);
  expect(get(missingKey)).toBe(restored); expect(get(readyKey)).toBe(readyBody);
  const saving = screen.getByRole('button', { name: 'Saving…' }); expect(saving).toBeDisabled();
  await act(async () => { fireEvent.click(saving); }); expect(addPile).toHaveBeenCalledOnce();
  await act(async () => { resolve(admitted(request)); });
  expect(sessionStorage.getItem('bower:add-draft')).toBeNull(); expect(sessionStorage.getItem('bower:add-items')).toBeNull();
  expect(get(missingKey)).toBeUndefined(); expect(get(readyKey)).toBeUndefined();
  expect(screen.getByLabelText('Current route')).toHaveTextContent('/');
});
it.each([
  { case: 'note only', members: [] as DraftFixture[], zeroByte: false },
  { case: 'ready link', members: [linkMember], zeroByte: false },
  { case: 'zero-byte file', members: [readyMember], zeroByte: true },
])('a complete Add draft remains admissible ($case)', async ({ members, zeroByte }) => {
  const emptyBody = new Blob([]); if (zeroByte) keep(readyKey, emptyBody);
  const addPile = vi.fn(async (input: NewPile) => admitted(input));
  renderDraft(members, addPile);
  const save = screen.getByRole('button', { name: /^Add .*to the inbox$/ }); expect(save).toBeEnabled();
  await act(async () => { fireEvent.click(save); });
  expect(addPile).toHaveBeenCalledExactlyOnceWith({ text: context, items: members.map(({ name, kind, origin, url }) => ({ name, kind, origin, ...(url ? { url } : {}), ...(zeroByte ? { body: emptyBody } : {}) })) });
  expect(screen.getByLabelText('Current route')).toHaveTextContent('/');
});
it('a rejected Add admission retains context, all rows and complete bytes for retry', async () => {
  const body = new Blob(['SYNTHETIC_READY_BYTES']); keep(readyKey, body);
  const failure = new Error('Synthetic admission refused.');
  const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const addPile = vi.fn<(input: NewPile) => Promise<Pile>>().mockRejectedValueOnce(failure).mockImplementation(async (input) => admitted(input));
  renderDraft([readyMember, linkMember], addPile);
  const storedItems = sessionStorage.getItem('bower:add-items');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add 2 things to the inbox' })); });
  expect(diagnostic).toHaveBeenCalledExactlyOnceWith(failure);
  expect(sessionStorage.getItem('bower:add-items')).toBe(storedItems); expect(sessionStorage.getItem('bower:add-draft')).toBe(context);
  expect(get(readyKey)).toBe(body); expect(screen.getByLabelText('Current route')).toHaveTextContent('/add');
  expect(within(screen.getByRole('list', { name: 'In this pile' })).getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByRole('textbox', { name: 'What is this?' })).toHaveValue(context);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add 2 things to the inbox' })); });
  expect(addPile).toHaveBeenCalledTimes(2); expect(addPile.mock.calls[1]).toEqual(addPile.mock.calls[0]);
  expect(get(readyKey)).toBeUndefined(); expect(screen.getByLabelText('Current route')).toHaveTextContent('/');
});

it('an Add draft with unavailable bytes keeps every member before saving (pending admission freezes edits and ignores later drops)', async () => {
  const body = new Blob(['SYNTHETIC_READY_BYTES']); keep(readyKey, body);
  const laterFile = new File(['SYNTHETIC_LATER_BYTES'], 'later.txt', { type: 'text/plain' });
  let resolve: (value: Pile) => void = () => { throw new Error('The admission has not started.'); };
  const addPile = vi.fn((input: NewPile) => new Promise<Pile>((done) => { resolve = done; void input; }));
  const view = renderDraft([readyMember, linkMember], addPile);
  const before = sessionStorage.getItem('bower:add-items');
  const zone = screen.getByText('Drop files here').parentElement; if (!zone) throw new Error('The drop surface is missing.');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add 2 things to the inbox' })); });
  expect.soft(zone).toHaveAttribute('aria-disabled', 'true');
  expect.soft(zone).toHaveTextContent('Saving this pile…');
  expect(addPile).toHaveBeenCalledOnce();
  const request = addPile.mock.calls[0]?.[0]; if (!request) throw new Error('The admission request is missing.');
  expect.soft(screen.getByRole('textbox', { name: 'What is this?' })).toBeDisabled();
  expect.soft(screen.getByRole('textbox', { name: 'Paste a link' })).toBeDisabled();
  for (const name of ['Choose files', 'Take a photo', 'Add link', 'Take outline.txt out', 'Take source.example out']) expect.soft(screen.getByRole('button', { name })).toBeDisabled();
  for (const input of view.container.querySelectorAll('input[type="file"]')) expect.soft(input).toBeDisabled();
  // Model edits only where the actual rendered native control is enabled; never force a disabled change.
  const contextInput = screen.getByRole('textbox', { name: 'What is this?' });
  if (contextInput instanceof HTMLTextAreaElement && !contextInput.disabled) await act(async () => { fireEvent.change(contextInput, { target: { value: 'Synthetic later context' } }); });
  const linkInput = screen.getByRole('textbox', { name: 'Paste a link' });
  if (linkInput instanceof HTMLInputElement && !linkInput.disabled) {
    await act(async () => { fireEvent.change(linkInput, { target: { value: 'https://later.example/' } }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add link' })); });
  }
  const remove = screen.getByRole('button', { name: 'Take outline.txt out' });
  if (remove instanceof HTMLButtonElement && !remove.disabled) await act(async () => { fireEvent.click(remove); });
  expect.soft(sessionStorage.getItem('bower:add-draft')).toBe(context);
  expect.soft(get(readyKey)).toBe(body);
  // A drag/drop surface has no native disabled attribute: an actual public drop must be guarded.
  await act(async () => { fireEvent.drop(zone, { dataTransfer: { files: [laterFile] } }); });
  expect.soft(sessionStorage.getItem('bower:add-items')).toBe(before);
  expect.soft(screen.getByRole('list', { name: 'In this pile' })).not.toHaveTextContent('later.txt');
  const during = JSON.parse(sessionStorage.getItem('bower:add-items') ?? '[]') as DraftFixture[];
  const laterKey = during.find((item) => item.name === 'later.txt')?.key;
  const duringObservation = { dispatchedMembers: request.items.map((item) => item.name), duringMembers: during.map((item) => item.name), duringText: sessionStorage.getItem('bower:add-draft'), laterBlobAccepted: laterKey !== undefined && get(laterKey) === laterFile };
  await act(async () => { resolve(admitted(request)); });
  console.info('S01_PENDING_ADMISSION_OBSERVATION', JSON.stringify({ ...duringObservation, textAfterSuccess: sessionStorage.getItem('bower:add-draft'), membersAfterSuccess: sessionStorage.getItem('bower:add-items'), unsubmittedBlobStranded: laterKey !== undefined && get(laterKey) === laterFile }));
  if (laterKey) { expect.soft(get(laterKey)).toBeUndefined(); forget(laterKey); }
  expect(addPile).toHaveBeenCalledOnce();
});

it('an Add draft with unavailable bytes keeps every member before saving (failed pending admission re-enables editing and complete retry)', async () => {
  const body = new Blob(['SYNTHETIC_READY_BYTES']); keep(readyKey, body);
  const later = new File(['SYNTHETIC_RECOVERY_BYTES'], 'recovered.txt', { type: 'text/plain' });
  const failure = new Error('Synthetic pending admission refused.');
  const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  let reject: (reason: Error) => void = () => { throw new Error('The pending admission has not started.'); };
  const addPile = vi.fn<(input: NewPile) => Promise<Pile>>().mockImplementationOnce(() => new Promise<Pile>((_resolve, refuse) => { reject = refuse; })).mockImplementation(async (input) => admitted(input));
  const view = renderDraft([readyMember, linkMember], addPile);
  const before = sessionStorage.getItem('bower:add-items');
  const zone = screen.getByText('Drop files here').parentElement; if (!zone) throw new Error('The drop surface is missing.');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add 2 things to the inbox' })); });
  expect.soft(zone).toHaveAttribute('aria-disabled', 'true');
  expect.soft(zone).toHaveTextContent('Saving this pile…');
  expect(screen.getByRole('textbox', { name: 'What is this?' })).toBeDisabled();
  expect(screen.getByRole('textbox', { name: 'Paste a link' })).toBeDisabled();
  await act(async () => { fireEvent.drop(zone, { dataTransfer: { files: [later] } }); });
  expect(sessionStorage.getItem('bower:add-items')).toBe(before);
  expect(get(readyKey)).toBe(body);
  await act(async () => { reject(failure); });
  expect(diagnostic).toHaveBeenCalledExactlyOnceWith(failure);
  expect(sessionStorage.getItem('bower:add-items')).toBe(before); expect(sessionStorage.getItem('bower:add-draft')).toBe(context);
  expect(screen.getByLabelText('Current route')).toHaveTextContent('/add');
  expect(screen.getByRole('textbox', { name: 'What is this?' })).toBeEnabled();
  expect(screen.getByRole('textbox', { name: 'Paste a link' })).toBeEnabled();
  expect(zone).not.toHaveAttribute('aria-disabled');
  expect(zone).toHaveTextContent('Drop files here');
  for (const name of ['Choose files', 'Take a photo', 'Take outline.txt out', 'Take source.example out']) expect(screen.getByRole('button', { name })).toBeEnabled();
  for (const input of view.container.querySelectorAll('input[type="file"]')) expect(input).toBeEnabled();
  await act(async () => { fireEvent.change(screen.getByRole('textbox', { name: 'What is this?' }), { target: { value: 'Synthetic retry context' } }); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Take source.example out' })); fireEvent.drop(zone, { dataTransfer: { files: [later] } }); });
  const rows = JSON.parse(sessionStorage.getItem('bower:add-items') ?? '[]') as DraftFixture[];
  const laterKey = rows.find((item) => item.name === later.name)?.key; if (!laterKey) throw new Error('The recovered member is missing.');
  expect(get(laterKey)).toBe(later);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add 2 things to the inbox' })); });
  expect(addPile).toHaveBeenCalledTimes(2);
  expect(addPile.mock.calls[1]?.[0].text).toBe('Synthetic retry context');
  expect(addPile.mock.calls[1]?.[0].items.map(({ name, body: bytes }) => ({ name, bytes }))).toEqual([{ name: readyMember.name, bytes: body }, { name: later.name, bytes: later }]);
  expect(get(laterKey)).toBeUndefined(); expect(get(readyKey)).toBeUndefined();
  expect(sessionStorage.getItem('bower:add-items')).toBeNull(); expect(sessionStorage.getItem('bower:add-draft')).toBeNull();
  expect(screen.getByLabelText('Current route')).toHaveTextContent('/');
});

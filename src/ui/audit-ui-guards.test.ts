/** audit-ui-guards AC1 (audit 2026-10-16, finding 5): a toast's action pressed again while it runs does not run twice. */
import { afterEach, expect, it, vi } from 'vitest';
import { useToasts } from './toast';

afterEach(() => useToasts.setState({ list: [] }));

it('AC1 audit-ui-guards-press-once: a second press while the action runs runs nothing', async () => {
  let finish = (): void => undefined;
  const run = vi.fn(() => new Promise<void>((done) => { finish = done; }));
  const { show, press } = useToasts.getState();
  const id = show('Pile moved', { label: 'Undo', run });
  press(id);
  press(id);
  expect(run).toHaveBeenCalledTimes(1);
  finish();
  await Promise.resolve();
  await Promise.resolve();
  expect(useToasts.getState().list).toHaveLength(0);
});

it('R1 audit-ui-guards-retry-after-replace: once the action replaced the toast with Try again, pressing runs the new action', async () => {
  const again = vi.fn(() => undefined);
  const { show, press, replace } = useToasts.getState();
  let id = 0;
  const run = vi.fn(async () => { await Promise.resolve(); replace(id, 'Not undone yet.', { label: 'Try again', run: again }); });
  id = show('Pile moved', { label: 'Undo', run });
  press(id);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  press(id);
  expect(run).toHaveBeenCalledTimes(1);
  expect(again).toHaveBeenCalledTimes(1);
});

import type { VaultSource } from '@/data/sources';
import { BowerError } from '@/data/types';
import { toast, useToasts } from './toast';

/** Something the person asked for went wrong: one sentence for them, the details for the console. */
export function report(e: unknown, sentence: string): void {
  console.error(e);
  toast(e instanceof BowerError ? e.message : sentence);
}

/**
 * The dock's Undo (TL-P4-24 addendum 1). Refused because Drive did not answer whether the change's create landed
 * (`unreached`, write-once's `withdraw`), the same message says so in place, with Try again running the same Undo;
 * any other failure is reported as ever. `done` runs once it is undone.
 */
export function undoToast(text: string, undo: () => Promise<unknown>, done?: () => void): void {
  const attempt = (): Promise<void> =>
    undo().then(
      () => done?.(),
      (e: unknown) => {
        if (!(e instanceof BowerError && e.code === 'unreached')) return report(e, 'That did not work. Try again.');
        console.error(e);
        useToasts.getState().replace(id, `Not undone yet: ${e.message}`, { label: 'Try again', run: attempt });
      },
    );
  const id = toast(text, { label: 'Undo', run: attempt });
}

/** Reserve the new tab inside the person's click, before reading a Drive id. */
export function openDrive(vault: VaultSource, path = ''): void {
  if (!vault.driveLinks) {
    toast('This demo has no folder in Google Drive.');
    return;
  }
  let tab: Window | null;
  try {
    tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
  } catch (e) {
    report(e, 'Google Drive could not open. Try again.');
    return;
  }
  void Promise.resolve().then(() => vault.driveLink(path)).then((url) => {
    if (!url) throw new BowerError('not-found', 'Bower could not find that in Google Drive.');
    if (tab) tab.location.replace(url);
    else toast('Your browser blocked the new tab.', { label: 'Open in this tab', run: () => location.assign(url) });
  }).catch((e: unknown) => {
    tab?.close();
    report(e, 'Google Drive could not open. Try again.');
  });
}

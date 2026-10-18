import type { VaultSource } from '@/data/sources';
import { BowerError } from '@/data/types';
import { toast, useToasts } from './toast';

/** A new message, or the words of message `at` (a pending "Moving to Bin…") replaced; the id that carries them. */
const say = (at: number | undefined, ...message: Parameters<typeof toast>): number =>
  at === undefined ? toast(...message) : useToasts.getState().replace(at, ...message);

/** Something the person asked for went wrong: one sentence for them, the details for the console. `at`: see `say`. */
export function report(e: unknown, sentence: string, at?: number): void {
  console.error(e);
  say(at, e instanceof BowerError ? e.message : sentence);
}

/** An Undo that found no network (a Bin restore offline, TL-P4-27 addenda 4 (4) and 5): a restore checks nothing. */
export const NOT_UNDONE_OFFLINE = 'Not undone yet: Bower could not reach Drive. Try again when you are back online.';

/**
 * The dock's Undo (TL-P4-24 addendum 1, TL-P4-27 addenda 4 (4) and 5). Refused because Drive did not answer, offline
 * or a check of a create that may have landed (`unreached`, write-once's `withdraw`), the same message says so in
 * place, with Try again running the same Undo; any other failure is reported as ever. `done` runs once it is undone and may return the confirmation words for the same box.
 * `at`: see `say`. Each replacement keeps the id that now carries the message, so a message put away meanwhile is said once.
 */
export function undoToast<T>(text: string, undo: () => Promise<T>, done?: ((result: T) => string) | ((result: T) => void), at?: number): void {
  const attempt = (): Promise<void> =>
    undo().then(
      (result) => {
        const confirmation = done?.(result);
        if (typeof confirmation === 'string') id = useToasts.getState().replace(id, confirmation);
      },
      (e: unknown) => {
        if (!(e instanceof BowerError && (e.code === 'unreached' || e.code === 'offline'))) return report(e, 'That did not work. Try again.');
        console.error(e);
        const said = e.code === 'offline' ? NOT_UNDONE_OFFLINE : `Not undone yet: ${e.message}`;
        id = useToasts.getState().replace(id, said, { label: 'Try again', run: attempt });
      },
    );
  let id = say(at, text, { label: 'Undo', run: attempt });
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

import type { VaultSource } from '@/data/sources';
import { BowerError } from '@/data/types';
import { toast } from './toast';

/** Something the person asked for went wrong: one sentence for them, the details for the console. */
export function report(e: unknown, sentence: string): void {
  console.error(e);
  toast(e instanceof BowerError ? e.message : sentence);
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

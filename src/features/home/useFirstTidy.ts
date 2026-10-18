import { create } from 'zustand';
import { FIRST_TIDY_SAVE_FAILED, type FirstTidyStep } from '@/data/contracts/first-tidy';
import { useLoad } from '@/data/provider';
import type { VaultSource } from '@/data/sources';
import { BowerError } from '@/data/types';

/** The progress of the first tidy-up, from the folder; null when the source cannot say (a stub without the method). */
export const useFirstTidy = () => useLoad(async (s) => (await s.vault.firstTidy?.()) ?? null, (s, cb) => { return s.vault.subscribe(cb); });

/** The one mark that could not be saved, shown by the checklist with its retry. */
export const useFirstTidyFailure = create<{ failure: { step: FirstTidyStep; message: string } | null }>(() => ({ failure: null }));

/** Marks a step in the folder; a failure is kept for the checklist to say, and cleared by the next success. */
export function keepFirstTidyStep(vault: VaultSource, step: FirstTidyStep): Promise<void> {
  return Promise.resolve(vault.markFirstTidy?.(step)).then(
    () => useFirstTidyFailure.setState({ failure: null }),
    (e: unknown) => {
      if (!(e instanceof BowerError)) console.error(e);
      useFirstTidyFailure.setState({ failure: { step, message: e instanceof BowerError ? e.message : FIRST_TIDY_SAVE_FAILED } });
    },
  );
}

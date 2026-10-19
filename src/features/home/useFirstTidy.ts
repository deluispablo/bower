import { create } from 'zustand';
import { FIRST_TIDY_SAVE_FAILED, FIRST_TIDY_STEPS, firstTidyFrom, type FirstTidyStep } from '@/data/contracts/first-tidy';
import { useLoad, useRun } from '@/data/provider';
import type { VaultSource } from '@/data/sources';
import { BowerError } from '@/data/types';

/**
 * The progress of the first tidy-up, from the folder; null when the source cannot say (a stub without the method).
 * A run the Worker admitted is step 2 done: Drive keeps a run's record only once it reports, so the run itself counts here.
 */
export function useFirstTidy() {
  const progress = useLoad(async (s) => (await s.vault.firstTidy?.()) ?? null, (s, cb) => s.vault.subscribe(cb));
  const { data: run } = useRun();
  const p = progress.data;
  return p && run ? { ...progress, data: firstTidyFrom(new Set(FIRST_TIDY_STEPS.filter((k) => p[k])), { piles: false, ran: true }) } : progress;
}

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

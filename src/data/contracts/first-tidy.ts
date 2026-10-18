/** The first tidy-up's three steps, kept with the folder (on Drive, on the Bower root; in the demo, in memory). */
export const FIRST_TIDY_STEPS = ['added', 'started', 'reviewed'] as const;
export type FirstTidyStep = (typeof FIRST_TIDY_STEPS)[number];
export type FirstTidy = Record<FirstTidyStep, boolean>;

export const FIRST_TIDY_SAVE_FAILED = 'Your first tidy-up progress could not be saved. Try again.';

/**
 * The one reading of the progress: the steps marked, or what the folder already shows (piles, a run the Worker
 * admitted). A run's record never ticks step 3: only opening its report does. A later step implies the earlier ones.
 */
export function firstTidyFrom(marks: ReadonlySet<FirstTidyStep>, seen: { piles: boolean; ran: boolean }): FirstTidy {
  const reviewed = marks.has('reviewed');
  const started = reviewed || marks.has('started') || seen.ran;
  const added = started || marks.has('added') || seen.piles;
  return { added, started, reviewed };
}

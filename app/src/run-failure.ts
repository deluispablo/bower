/**
 * What a failed run says to people (#375, spec D.5 failure copy): the
 * runner classifies its own failure into one of a handful of reasons, the
 * Worker keeps it on the run (`Run.reason`), and the app shows one sentence
 * for it, never a step name. A failed run without a reason (an older
 * runner, a run that never reported) and any value this app does not know
 * read as `unknown`.
 */

/** Mirrors `RUN_FAILURE_REASONS` in `api/src/types.ts`. */
export const RUN_FAILURE_REASONS = [
  'drive_unavailable',
  'timeout',
  'model_unavailable',
  'vault_changed',
  'vault_missing',
  'unknown',
] as const;
export type RunFailureReason = (typeof RUN_FAILURE_REASONS)[number];

export interface FailureCopy {
  /** What happened, in one sentence (the failure sheet's first line). */
  sentence: string;
  /** What to do if it happens again (the sheet's hint). */
  hint: string;
  /** A few words for a card: "Failed · Drive did not answer". */
  short: string;
}

const COPY: Record<RunFailureReason, FailureCopy> = {
  drive_unavailable: {
    sentence:
      'Google Drive stopped answering half way through copying things back.',
    hint: 'If it happens again, sign out and back in from Settings; that renews the connection to Drive.',
    short: 'Drive did not answer',
  },
  timeout: {
    sentence: 'The tidy-up took too long and was stopped.',
    hint: 'If it happens again, tidy up fewer things at a time.',
    short: 'Took too long',
  },
  model_unavailable: {
    sentence: 'Claude was not available, so nothing could be read.',
    hint: 'This usually passes on its own; try again in a few minutes.',
    short: 'Claude was not available',
  },
  vault_changed: {
    sentence: 'Your Bower folder changed while Bower was working in it.',
    hint: 'If it happens again, check that your Bower folder is still where it was in Drive.',
    short: 'Your folder changed',
  },
  vault_missing: {
    sentence:
      'Your Bower folder is no longer in your Drive. Nothing was changed.',
    hint: 'Open Bower to put it back from the Bin or start a new Bower folder.',
    short: 'Your folder is missing',
  },
  unknown: {
    sentence: 'Something went wrong before Bower could finish.',
    hint: 'If it happens again, tell whoever runs your Bower.',
    short: 'Did not finish',
  },
};

/** The reason as a known value: anything missing or unknown is `unknown`. */
export function failureReason(reason: unknown): RunFailureReason {
  return RUN_FAILURE_REASONS.find((known) => known === reason) ?? 'unknown';
}

/** The words for a failed run with `reason` (see `FailureCopy`). */
export function failureCopy(reason: unknown): FailureCopy {
  return COPY[failureReason(reason)];
}

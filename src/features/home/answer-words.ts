import type { AnswerOutcome } from '@/data/answer-loop';
import { BowerError } from '@/data/types';

/** The toast after answering a question: the choice in its own words, whichever button it was. */
export const answered = (label: string): string => `You chose "${label}". Bower does it in the next tidy-up.`;

/** The toast after an answer that starts a small tidy-up at once (TL-P4-08 addendum 8). */
export const answeredNow = (label: string): string => `You chose "${label}". Bower is doing it now.`;

/** When that tidy-up could not start: the answer is kept, and waits (the reason, when Bower has one sentence for it). */
export const answerWaits = (reason: string | null): string => `Your answer is saved for the next tidy-up.${reason ? ` ${reason}` : ''}`;

/** The one toast after an answer, once its run has answered (`answer-loop.ts`). */
export function answerToast(outcome: AnswerOutcome, label: string): string {
  switch (outcome.kind) {
    case 'now':
      return answeredNow(label);
    case 'waits':
      return `You chose "${label}". Bower will do this as soon as the current tidy-up ends.`;
    case 'not-yet':
      return `You chose "${label}". Bower cannot write over your own summary yet, so it stays as you wrote it.`;
    case 'failed':
      return answerWaits(outcome.error instanceof BowerError ? outcome.error.message : null);
    default:
      return answered(label);
  }
}

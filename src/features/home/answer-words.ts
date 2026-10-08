/** The toast after answering a question: the choice in its own words, whichever button it was. */
export const answered = (label: string): string => `You chose "${label}". Bower does it in the next tidy-up.`;

/** The toast after an answer that starts a small tidy-up at once (TL-P4-08 addendum 8). */
export const answeredNow = (label: string): string => `You chose "${label}". Bower is doing it now.`;

/** When that tidy-up could not start: the answer is kept, and waits (the reason, when Bower has one sentence for it). */
export const answerWaits = (reason: string | null): string => `Your answer is saved for the next tidy-up.${reason ? ` ${reason}` : ''}`;

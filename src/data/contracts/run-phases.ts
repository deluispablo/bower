/** The phases of a run (TL-P4-14 c1-shared-contracts): written once, used by the app, the Worker, the runner and the fakes. */

export const RUN_PHASES = ['queued', 'reading', 'writing', 'saving', 'done', 'failed'] as const;
export type RunPhase = (typeof RUN_PHASES)[number];

/** The phases a run is going through, in order: the steps a person sees. */
export const RUN_STEPS = ['queued', 'reading', 'writing', 'saving'] as const satisfies readonly RunPhase[];
/** The phases of a run that is not over. */
export const ACTIVE_PHASES: readonly RunPhase[] = RUN_STEPS;

/** How far along a phase is: a report never moves a run to a lower rank (`done` and `failed` are both last). */
export const PHASE_RANK: Readonly<Record<RunPhase, number>> = { queued: 0, reading: 1, writing: 2, saving: 3, done: 4, failed: 4 };

export const isRunPhase = (value: unknown): value is RunPhase => typeof value === 'string' && (RUN_PHASES as readonly string[]).includes(value);

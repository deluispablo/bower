/**
 * The session lease cases both machines must pass alike: the Worker's person object (`api/test/lease-alike.test.ts`)
 * and the pretend Worker's lease (`shared-contracts.test.ts`). A case is a run of calls on a fresh lease; `at` is
 * milliseconds after the first moment, and each call says the reply it must get. Pure data, no runtime code.
 */
export interface LeaseStep {
  at: number;
  place: string;
  action: 'check' | 'take' | 'leave';
  /** Left out, it counts as 0 (a place with any recorded leave then has its check discarded). */
  gen?: number;
  active: boolean;
  epoch: number;
  /** After the call, whether this place holds the lease at this epoch (the Worker's fence). */
  holds?: { place: string; epoch: number; yes: boolean };
}

export interface LeaseCase {
  name: string;
  steps: readonly LeaseStep[];
}

const MIN = 60_000;
const TTL = 3 * MIN;
const DAY = 24 * 60 * MIN;

export const LEASE_CASES: readonly LeaseCase[] = [
  {
    name: 'a first check is granted with epoch 1; a second place is refused while it is live',
    steps: [
      { at: 0, place: 'a', action: 'check', active: true, epoch: 1, holds: { place: 'a', epoch: 1, yes: true } },
      { at: MIN, place: 'b', action: 'check', active: false, epoch: 1, holds: { place: 'b', epoch: 1, yes: false } },
      { at: MIN, place: 'a', action: 'check', active: true, epoch: 1 },
    ],
  },
  {
    name: 'a take always moves the lease, with epoch + 1, and the old epoch is fenced',
    steps: [
      { at: 0, place: 'a', action: 'check', active: true, epoch: 1 },
      { at: MIN, place: 'b', action: 'take', active: true, epoch: 2, holds: { place: 'a', epoch: 1, yes: false } },
      { at: 2 * MIN, place: 'a', action: 'check', active: false, epoch: 2 },
    ],
  },
  {
    name: 'the holder checking after the TTL, with nobody in between, keeps its epoch',
    steps: [
      { at: 0, place: 'a', action: 'check', active: true, epoch: 1 },
      { at: TTL + MIN, place: 'a', action: 'check', active: true, epoch: 1, holds: { place: 'a', epoch: 1, yes: true } },
    ],
  },
  {
    name: 'an expired lease goes to whoever checks, with epoch + 1',
    steps: [
      { at: 0, place: 'a', action: 'check', active: true, epoch: 1 },
      { at: TTL + MIN, place: 'b', action: 'check', active: true, epoch: 2, holds: { place: 'a', epoch: 1, yes: false } },
    ],
  },
  {
    name: 'the place that left takes it back with the same epoch; another place raises it',
    steps: [
      { at: 0, place: 'a', action: 'check', active: true, epoch: 1 },
      { at: MIN, place: 'a', action: 'leave', gen: 1, active: false, epoch: 1, holds: { place: 'a', epoch: 1, yes: false } },
      { at: 2 * MIN, place: 'a', action: 'check', gen: 1, active: true, epoch: 1 },
      { at: 3 * MIN, place: 'a', action: 'leave', gen: 2, active: false, epoch: 1 },
      { at: 4 * MIN, place: 'b', action: 'check', active: true, epoch: 2 },
      { at: 5 * MIN, place: 'a', action: 'check', gen: 2, active: false, epoch: 2 },
    ],
  },
  {
    name: 'a leave by a place that does not hold the lease changes nothing for the holder',
    steps: [
      { at: 0, place: 'a', action: 'check', active: true, epoch: 1 },
      { at: MIN, place: 'b', action: 'leave', gen: 1, active: false, epoch: 1, holds: { place: 'a', epoch: 1, yes: true } },
      { at: 2 * MIN, place: 'a', action: 'check', active: true, epoch: 1 },
    ],
  },
  {
    name: 'a check begun before the latest leave grants and renews nothing',
    steps: [
      { at: 0, place: 'a', action: 'check', active: true, epoch: 1 },
      { at: MIN, place: 'a', action: 'leave', gen: 3, active: false, epoch: 1 },
      { at: 2 * MIN, place: 'a', action: 'check', gen: 2, active: false, epoch: 1 },
      { at: 2 * MIN, place: 'a', action: 'check', active: false, epoch: 1 },
      { at: 2 * MIN, place: 'a', action: 'check', gen: 3, active: true, epoch: 1 },
    ],
  },
  {
    name: 'a recorded leave generation never goes down',
    steps: [
      { at: 0, place: 'a', action: 'leave', gen: 3, active: false, epoch: 0 },
      { at: MIN, place: 'a', action: 'leave', gen: 1, active: false, epoch: 0 },
      { at: 2 * MIN, place: 'a', action: 'check', gen: 2, active: false, epoch: 0 },
      { at: 2 * MIN, place: 'a', action: 'check', gen: 3, active: true, epoch: 1 },
    ],
  },
  {
    name: 'a leave older than a day is forgotten: an old check is judged by the lease alone',
    steps: [
      { at: 0, place: 'a', action: 'leave', gen: 5, active: false, epoch: 0 },
      { at: DAY + MIN, place: 'a', action: 'check', gen: 2, active: true, epoch: 1 },
    ],
  },
  {
    name: 'a leave a little under a day old still discards an older check',
    steps: [
      { at: 0, place: 'a', action: 'leave', gen: 5, active: false, epoch: 0 },
      { at: DAY - MIN, place: 'a', action: 'check', gen: 2, active: false, epoch: 0 },
    ],
  },
];

import { activeFrame, activeHandle } from './presence';

/** The one screen-to-Bower reaction port. */
export const REACTIONS = {
  'point-tidy': 'Tuft up and a lean toward the pointer.',
  yes: 'Two nods.', send: 'Two nods and a chirp.', no: 'A head tilt.', duplicate: 'A head tilt.',
  'drag-over': 'Leans forward, beak open.', 'task-done': 'A short chirp.', 'link-open': 'The eye follows.',
  offline: 'A startle, then the alarm pose while the message shows.',
  'drop-folder': 'A small hop.', online: 'A small hop.', tap: 'A small hop and a chirp.',
  bin: 'A startle, then the eyes look at the action.', error: 'A startle, then the eyes look at the action.',
  rule: 'Carries a small paper.', 'moves-off': 'Settles once, then holds.',
  'moves-on': 'Wakes and shakes its feathers.', hide: 'One wing wave.', done: 'Shows off (tail fan).',
} as const;
export type ReactionKind = keyof typeof REACTIONS;
export interface Reaction { end(): void }
export function react(kind: ReactionKind, at?: Element): Reaction {
  const frame = activeFrame()?.getBoundingClientRect();
  const rect = at?.getBoundingClientRect();
  const point = frame && rect ? { x: rect.left + rect.width / 2 - frame.left,
    y: rect.top + rect.height / 2 - frame.top } : undefined;
  return activeHandle()?.play(kind, point) ?? { end() {} };
}

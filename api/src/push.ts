/**
 * Web push to the user's devices when a run finishes. Not built yet: #17
 * fills in `sendPush` (VAPID signing, `listPushSubs`, dropping expired
 * subscriptions). Until then it is a deliberate no-op, so the runner
 * endpoints can already call it at the right moment.
 */

import type { Env } from './env.js';
import type { Run } from './types.js';

/** Sends `run`'s outcome to every push subscription of `userId`. */
export type SendPush = (env: Env, userId: string, run: Run) => Promise<void>;

/** No-op until #17: resolves without sending anything. */
export const sendPush: SendPush = () => Promise.resolve();

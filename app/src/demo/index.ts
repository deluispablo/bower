/**
 * Demo mode (#192): the app with no backend. A build with `VITE_DEMO=1`
 * loads this module from `api.ts` (a dynamic import, so its own chunk, and
 * none of it in a real build) and `install()` puts the in-memory clients
 * behind the same exported functions the app already calls: the Worker
 * (`api.ts`) and Drive (`drive.ts`). No `fetch` reaches the network.
 */

import { setWorkerClient } from '../api.js';
import type { WorkerClient } from '../api.js';
import { setDriveClient } from '../drive.js';
import type { DriveClient } from '../drive.js';
import { createDemoWorker } from './api.js';
import { createDemoDrive } from './drive.js';
import { DemoServer } from './server.js';

export interface Demo {
  server: DemoServer;
  worker: WorkerClient;
  drive: DriveClient;
}

/**
 * A fresh demo: Alex's folder as the fixture has it, nothing run yet.
 * `storage` is `null` in tests, so `tourSeenAt` starts unset and nothing
 * touches real browser storage; `install()` passes `sessionStorage`.
 */
export function createDemo(
  now: () => number = () => Date.now(),
  storage: Storage | null = null,
): Demo {
  const server = new DemoServer(now, storage);
  return {
    server,
    worker: createDemoWorker(server, now),
    drive: createDemoDrive(server),
  };
}

/**
 * Swaps both clients for a fresh demo. `sessionStorage`, not
 * `localStorage` (#494): `tourSeenAt` survives a reload of the same tab,
 * but a new tab or a fresh visit starts the demo over, tour included.
 */
export function install(): void {
  const demo = createDemo(undefined, sessionStorage);
  setWorkerClient(demo.worker);
  setDriveClient(demo.drive);
}

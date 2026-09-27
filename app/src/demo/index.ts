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
import { addSent, loadSent } from '../tell.js';
import { createDemoWorker } from './api.js';
import { createDemoDrive } from './drive.js';
import { FIXTURE_SENT } from './fixture.js';
import { DemoServer } from './server.js';

export interface Demo {
  server: DemoServer;
  worker: WorkerClient;
  drive: DriveClient;
}

/** A fresh demo: Alex's folder as the fixture has it, nothing run yet. */
export function createDemo(now: () => number = () => Date.now()): Demo {
  const server = new DemoServer(now);
  return {
    server,
    worker: createDemoWorker(server, now),
    drive: createDemoDrive(server),
  };
}

/** Swaps both clients for a fresh demo and seeds the Tell Bower history. */
export function install(): void {
  const demo = createDemo();
  setWorkerClient(demo.worker);
  setDriveClient(demo.drive);
  // The sent list lives on the device (`tell.ts`); an empty one starts
  // from the fixture's history, oldest first so the newest ends on top.
  if (loadSent().length === 0) {
    for (const item of [...FIXTURE_SENT].reverse()) addSent(item);
  }
}

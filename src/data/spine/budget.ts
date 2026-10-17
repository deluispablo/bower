/**
 * How many subrequests (fetches) one `POST /process` may make. A Worker invocation on the free plan may make 50
 * (https://developers.cloudflare.com/workers/platform/limits/#subrequests); admission keeps to 35, leaving room for
 * the retries it cannot foresee (a refreshed token, a Drive answer that is tried again).
 */
export const SUBREQUEST_BUDGET = 35;

/** What the dispatch after admission may need: its one request and its two retries (`dispatchOutcome`). */
export const DISPATCH_SUBREQUESTS = 3;

/**
 * A read the reader chose not to make (admission is out of subrequests, TL-P4-11): not a failure of the file. What
 * it would have decided is left to the runner, which reads every file itself and holds a pile by the same rules
 * before any write (`scripted.ts`, `capturePiles` with notes). Only the Worker's admission reader raises it.
 */
export class NotReadHere extends Error {
  constructor() {
    super('This file was not read at admission');
    this.name = 'NotReadHere';
  }
}

/**
 * The listing would fetch past the budget (the folder is too big for one press): admission refuses the press as too
 * large (`payload-too-large`). Only the Worker's admission reader raises it, before a listing page.
 */
export class FolderTooBig extends Error {
  constructor() {
    super('The folder listing would pass the subrequest budget');
    this.name = 'FolderTooBig';
  }
}

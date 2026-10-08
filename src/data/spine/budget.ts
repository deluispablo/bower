/**
 * How many subrequests (fetches) one `POST /process` may make. A Worker invocation on the free plan may make 50
 * (https://developers.cloudflare.com/workers/platform/limits/#subrequests); admission keeps to 35, leaving room for
 * the retries it cannot foresee (a refreshed token, a Drive answer that is tried again).
 */
export const SUBREQUEST_BUDGET = 35;

/**
 * Drive v3 for the real-adapter world (P3-18): the runner's Drive v3 fake (`drive-v3.ts`, unchanged) with what
 * real Drive also does and the app's `DriveHttp` needs, answered over the same `FakeDrive`:
 * - `PATCH files/:id` with `{ trashed: false }` restores from the Bin, with the `name` and `appProperties` of the same
 *   body set by the same update (files.update, https://developers.google.com/drive/api/reference/rest/v3/files/update);
 * - `fullText contains '…'` in a listing's `q` (search for files,
 *   https://developers.google.com/drive/api/guides/search-files), matched on name and text as the `FakeDrive` does;
 * - access tokens come from Google's token endpoint here, not from the fake's token route: `mint` gives one, and
 *   `revoke` makes every token given so far answer 401, as a revoked grant does.
 */
import { API, RUN_ID, TICKET, driveV3, type DriveV3 } from './drive-v3';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import type { Fetch } from './real-world-types';

const FOLDER = 'application/vnd.google-apps.folder';

export interface RealDrive {
  wire: DriveV3;
  fetch: Fetch;
  /** The same Drive and tokens, paging by `size` on this transport alone (the Worker's), not by `paging.size`. */
  fetchPaged(size: number): Fetch;
  /** A new access token Drive takes. */
  mint(): Promise<string>;
  /** Every token given so far stops working. */
  revoke(): void;
  /** Every write sent, as `METHOD path`. */
  writes: string[];
}

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=UTF-8' } });
const unauthorized = (): Response => json(401, { error: { code: 401, message: 'authError', errors: [{ domain: 'global', reason: 'authError', message: 'authError' }] } });

export function realDrive(drive: FakeDrive): RealDrive {
  const wire = driveV3(drive);
  const revoked = new Set<string>();
  const given = new Set<string>();
  const writes: string[] = [];
  const transport = (pageSize?: number): Fetch => async (input, sent = {}) => {
    // A body as bytes: a page's Blob (jsdom's, in the app's suite) is not one Node's Response reads.
    const blob = sent.body as { arrayBuffer?: () => Promise<ArrayBuffer> } | null | undefined;
    const init: RequestInit = typeof blob?.arrayBuffer === 'function' ? { ...sent, body: new Uint8Array(await blob.arrayBuffer()) } : sent;
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init.method ?? 'GET').toUpperCase();
    const token = new Headers(init.headers).get('authorization')?.replace(/^Bearer /, '') ?? '';
    if (revoked.has(token)) return unauthorized();
    if (method !== 'GET') writes.push(`${method} ${url.pathname}`);
    const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (method === 'PATCH' && one && given.has(token)) {
      const patch = JSON.parse(String(init.body ?? '{}')) as { trashed?: boolean; name?: string; appProperties?: Record<string, string> };
      if (patch.trashed === false) {
        try {
          const f = await drive.untrash(decodeURIComponent(one[1] ?? ''), patch.appProperties, patch.name);
          return json(200, { kind: 'drive#file', id: f.id, name: f.name, mimeType: f.folder ? FOLDER : 'text/plain', parents: f.parents, modifiedTime: f.modifiedTime, createdTime: f.createdTime, ...(f.appProperties ? { appProperties: f.appProperties } : {}), trashed: false });
        } catch {
          return json(404, { error: { code: 404, message: 'notFound', errors: [{ domain: 'global', reason: 'notFound', message: 'notFound' }] } });
        }
      }
    }
    const q = url.searchParams.get('q') ?? '';
    const words = /fullText contains '((?:[^'\\]|\\.)*)'/.exec(q);
    if (method === 'GET' && url.pathname === '/drive/v3/files' && words && given.has(token)) {
      const text = (words[1] ?? '').replace(/\\(.)/g, '$1');
      const parents = [...q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1] ?? '');
      const hits = [];
      for (const parent of parents) hits.push(...(await drive.fullText(parent, text)).filter((f) => f.parents[0] === parent));
      return json(200, { kind: 'drive#fileList', files: hits.map((f) => ({ kind: 'drive#file', id: f.id, name: f.name, mimeType: f.folder ? FOLDER : 'text/plain', parents: f.parents, modifiedTime: f.modifiedTime, createdTime: f.createdTime, ...(f.appProperties ? { appProperties: f.appProperties } : {}), trashed: false })) });
    }
    return await (pageSize === undefined ? wire.fetch : wire.fetchPaged(pageSize))(input, init);
  };
  return {
    wire,
    fetch: transport(),
    fetchPaged: transport,
    writes,
    mint: async () => {
      // The fake keeps the tokens Drive takes; its own token route is how one is added.
      const res = await wire.fetch(`${API}/runner/runs/${RUN_ID}/token`, { headers: { authorization: `Bearer ${TICKET}` } });
      const { accessToken } = (await res.json()) as { accessToken: string };
      given.add(accessToken);
      return accessToken;
    },
    revoke: () => {
      for (const t of given) revoked.add(t);
    },
  };
}

/**
 * A fake of Drive's resumable upload protocol for the upload-queue tests
 * (spec §7c item 6). Hermetic: no network, no real Google.
 *
 * - A chunk `PUT` with `Content-Range: bytes a-b/total` answers 308 with
 *   `Range: bytes=0-N` until the last byte, then 201 with the file.
 *   `acceptPerChunk` makes Drive keep only part of each chunk, so the next
 *   one must start from the confirmed byte.
 * - A status `PUT` with `Content-Range: bytes *\/total` answers 308 with
 *   the bytes held, or 200 once the file is complete.
 * - `expire(session)` makes that session answer 404, so the file restarts.
 * - `fakeUploadStore({ quotaBytes })` throws a `QuotaExceededError` when a
 *   copy would not fit.
 */

import type { UploadRecord } from '../../src/cache.js';
import { UploadError } from '../../src/upload-queue.js';
import type {
  ResumableResponse,
  ResumableTransport,
  UploadStore,
} from '../../src/upload-queue.js';

export interface FakeSession {
  url: string;
  name: string;
  parentId: string;
  size: number;
  received: number;
  fileId: string | null;
  expired: boolean;
}

export interface FakeRequest {
  method: 'POST' | 'PUT';
  url: string;
  contentRange?: string;
  /** Bytes in the request body. */
  bytes: number;
}

export interface FakeDriveOptions {
  /** Bytes Drive keeps from each chunk (default: all of it). */
  acceptPerChunk?: number;
  /** Runs before each chunk is answered; may await or throw. */
  beforeChunk?: (request: FakeRequest) => void | Promise<void>;
}

export interface FakeResumableDrive {
  transport: ResumableTransport;
  sessions: Map<string, FakeSession>;
  requests: FakeRequest[];
  /** Files Drive holds, in the order they completed. */
  files: { id: string; name: string; parentId: string; size: number }[];
  /** Makes the session answer 404 from now on. */
  expire: (url: string) => void;
  /** Answers the next request of any kind with `status` (0: network error). */
  failNext: (status: number) => void;
}

function answer(
  status: number,
  headers: Record<string, string> = {},
  body = '',
): ResumableResponse {
  return {
    status,
    header: (name) => headers[name] ?? null,
    body,
  };
}

export function fakeResumableDrive(
  options: FakeDriveOptions = {},
): FakeResumableDrive {
  const sessions = new Map<string, FakeSession>();
  const requests: FakeRequest[] = [];
  const files: FakeResumableDrive['files'] = [];
  let failures: number[] = [];
  let counter = 0;

  function takeFailure(): ResumableResponse | undefined {
    const status = failures.shift();
    if (status === undefined) return undefined;
    if (status === 0) throw new UploadError(0, 'network');
    return answer(status);
  }

  function held(session: FakeSession): ResumableResponse {
    return session.received > 0
      ? answer(308, { Range: `bytes=0-${session.received - 1}` })
      : answer(308);
  }

  function complete(session: FakeSession, status: number): ResumableResponse {
    if (session.fileId === null) {
      counter += 1;
      session.fileId = `FILE_${counter}`;
      files.push({
        id: session.fileId,
        name: session.name,
        parentId: session.parentId,
        size: session.size,
      });
    }
    return answer(
      status,
      {},
      JSON.stringify({ id: session.fileId, name: session.name }),
    );
  }

  const transport: ResumableTransport = {
    open(url, headers, body) {
      requests.push({ method: 'POST', url, bytes: body.length });
      const failed = takeFailure();
      if (failed !== undefined) return Promise.resolve(failed);
      const meta = JSON.parse(body) as { name: string; parents: string[] };
      counter += 1;
      const session: FakeSession = {
        url: `https://drive.test/session/${counter}`,
        name: meta.name,
        parentId: meta.parents[0] ?? '',
        size: Number(headers['X-Upload-Content-Length']),
        received: 0,
        fileId: null,
        expired: false,
      };
      sessions.set(session.url, session);
      return Promise.resolve(answer(200, { Location: session.url }));
    },

    async put(url, headers, body, onProgress) {
      const contentRange = headers['Content-Range'] ?? '';
      const request: FakeRequest = {
        method: 'PUT',
        url,
        contentRange,
        bytes: body?.size ?? 0,
      };
      requests.push(request);
      if (body !== null) await options.beforeChunk?.(request);
      const failed = takeFailure();
      if (failed !== undefined) return failed;
      const session = sessions.get(url);
      if (session === undefined || session.expired) return answer(404);

      if (contentRange.startsWith('bytes */')) {
        return session.received === session.size
          ? complete(session, 200)
          : held(session);
      }
      const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
      if (match === null) return answer(400);
      const start = Number(match[1]);
      const end = Number(match[2]) + 1;
      if (start !== session.received) return held(session);
      const size = body?.size ?? 0;
      onProgress?.(Math.floor(size / 2));
      onProgress?.(size);
      const keep = Math.min(end - start, options.acceptPerChunk ?? Infinity);
      session.received = start + keep;
      if (session.received === session.size) return complete(session, 201);
      return held(session);
    },
  };

  return {
    transport,
    sessions,
    requests,
    files,
    expire(url) {
      const session = sessions.get(url);
      if (session !== undefined) session.expired = true;
    },
    failNext(status) {
      failures = [...failures, status];
    },
  };
}

export interface FakeUploadStore extends UploadStore {
  records: Map<string, UploadRecord>;
}

/** An in-memory `UploadStore`; over `quotaBytes` a write throws. */
export function fakeUploadStore(
  options: { quotaBytes?: number } = {},
): FakeUploadStore {
  const records = new Map<string, UploadRecord>();
  const key = (userId: string, id: string): string => `${userId}\u0000${id}`;
  return {
    records,
    list(userId) {
      return Promise.resolve(
        [...records.values()]
          .filter((r) => r.userId === userId)
          .sort((a, b) => a.addedAt.localeCompare(b.addedAt)),
      );
    },
    put(record) {
      const others = [...records.entries()]
        .filter(([k]) => k !== key(record.userId, record.id))
        .reduce((sum, [, r]) => sum + r.size, 0);
      if (others + record.size > (options.quotaBytes ?? Infinity)) {
        return Promise.reject(
          new DOMException(
            'The quota has been exceeded.',
            'QuotaExceededError',
          ),
        );
      }
      records.set(key(record.userId, record.id), { ...record });
      return Promise.resolve();
    },
    remove(userId, id) {
      records.delete(key(userId, id));
      return Promise.resolve();
    },
    clear(userId) {
      for (const [k, r] of records) {
        if (userId === undefined || r.userId === userId) records.delete(k);
      }
      return Promise.resolve();
    },
  };
}

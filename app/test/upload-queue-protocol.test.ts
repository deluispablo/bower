import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  askStatus,
  confirmedFrom,
  sendResumable,
  sessionStatus,
  xhrTransport,
} from '../src/upload-queue.js';
import type { UploadHooks } from '../src/upload-queue.js';
import { fakeResumableDrive } from './helpers/fake-resumable-drive.js';

vi.mock('../src/drive.js', () => ({
  DRIVE_BASE: 'https://drive.test',
  RESUMABLE_CHUNK_BYTES: 8 * 1024 * 1024,
  getToken: () => Promise.resolve({ accessToken: 'TOKEN' }),
  invalidateToken: () => undefined,
}));

const CHUNK = 256;

function bytes(n: number): Blob {
  return new Blob([new Uint8Array(n)]);
}

function target(size: number, session: string | null = null, confirmed = 0) {
  return {
    name: 'photo.jpg',
    parentId: 'FOLDER_ID',
    type: 'image/jpeg',
    size,
    blob: bytes(size),
    session,
    confirmed,
  };
}

function hooks(): UploadHooks & {
  sessions: string[];
  confirmed: number[];
  progress: number[];
} {
  const sessions: string[] = [];
  const confirmed: number[] = [];
  const progress: number[] = [];
  return {
    sessions,
    confirmed,
    progress,
    onSession: (s) => {
      sessions.push(s);
      return Promise.resolve();
    },
    onConfirmed: (n) => {
      confirmed.push(n);
      return Promise.resolve();
    },
    onProgress: (n) => {
      progress.push(n);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('confirmedFrom and sessionStatus', () => {
  it('reads the next byte from a 308 Range header', () => {
    expect(confirmedFrom('bytes=0-99')).toBe(100);
    expect(confirmedFrom(null)).toBe(0);
  });

  it('maps 200/201 to done with the id, 404 and 410 to expired', () => {
    const res = (status: number, body = '') => ({
      status,
      header: () => null,
      body,
    });
    expect(sessionStatus(res(201, '{"id":"FILE_1"}'))).toEqual({
      kind: 'done',
      fileId: 'FILE_1',
    });
    expect(sessionStatus(res(200, '{"id":"FILE_2"}'))).toEqual({
      kind: 'done',
      fileId: 'FILE_2',
    });
    expect(sessionStatus(res(404))).toEqual({ kind: 'expired' });
    expect(sessionStatus(res(410))).toEqual({ kind: 'expired' });
    expect(() => sessionStatus(res(403))).toThrow('403');
  });
});

describe('sendResumable (R-UPL-5)', () => {
  it('resumes each chunk from the byte a 308 confirmed', async () => {
    const drive = fakeResumableDrive({ acceptPerChunk: 100 });
    const h = hooks();

    const id = await sendResumable(drive.transport, target(300), h, CHUNK);

    expect(id).toBe(drive.files[0]?.id);
    const ranges = drive.requests
      .filter((r) => r.method === 'PUT')
      .map((r) => r.contentRange);
    expect(ranges).toEqual([
      'bytes 0-255/300',
      'bytes 100-299/300',
      'bytes 200-299/300',
    ]);
    expect(h.confirmed).toEqual([100, 200]);
    expect(drive.files).toHaveLength(1);
  });

  it('restarts the file on a new session when Drive answers 404', async () => {
    let expired = false;
    const drive = fakeResumableDrive({
      beforeChunk: (request) => {
        // The first session expires before its second chunk arrives.
        if (!expired && request.contentRange === 'bytes 256-299/300') {
          expired = true;
          drive.expire(request.url);
        }
      },
    });
    const h = hooks();

    await sendResumable(drive.transport, target(300), h, CHUNK);

    expect(h.sessions).toHaveLength(2);
    expect(h.confirmed).toEqual([256, 0, 256]);
    const second = drive.sessions.get(h.sessions[1] ?? '');
    expect(second?.received).toBe(300);
    expect(drive.files).toHaveLength(1);
  });
});

describe('after a reload (R-UPL-8)', () => {
  it('asks the status with bytes */size and sends only the rest', async () => {
    const drive = fakeResumableDrive({ acceptPerChunk: 100 });
    const first = hooks();
    // A reload after the first chunk: the session and 100 bytes are known.
    await expect(
      sendResumable(
        drive.transport,
        target(300),
        { ...first, onConfirmed: () => Promise.reject(new Error('reload')) },
        CHUNK,
      ),
    ).rejects.toThrow('reload');
    const session = [...drive.sessions.keys()][0] ?? '';
    drive.requests.length = 0;

    const h = hooks();
    await sendResumable(drive.transport, target(300, session, 0), h, 1024);

    expect(drive.requests.map((r) => r.contentRange)).toEqual([
      'bytes */300',
      'bytes 100-299/300',
      'bytes 200-299/300',
    ]);
    expect(h.confirmed[0]).toBe(100);
    expect(h.sessions).toEqual([]);
  });

  it('takes the file id from a 200 on the status query', async () => {
    const drive = fakeResumableDrive();
    await sendResumable(drive.transport, target(300), hooks(), 1024);
    const session = [...drive.sessions.keys()][0] ?? '';

    const status = await askStatus(drive.transport, session, 300);

    expect(status).toEqual({ kind: 'done', fileId: drive.files[0]?.id });
    const again = await sendResumable(
      drive.transport,
      target(300, session, 300),
      hooks(),
      1024,
    );
    expect(again).toBe(drive.files[0]?.id);
    expect(drive.files).toHaveLength(1);
  });

  it('reports progress inside each chunk', async () => {
    const drive = fakeResumableDrive();
    const h = hooks();

    await sendResumable(drive.transport, target(300), h, CHUNK);

    expect(h.progress).toEqual([0, 128, 256, 256 + 22, 300, 300]);
  });
});

describe('xhrTransport (R-UPL-8)', () => {
  it('reports XHR upload.onprogress and reads the 308 Range', async () => {
    const sent: { headers: Record<string, string>; body: unknown }[] = [];
    class FakeXhr {
      upload: { onprogress: ((e: { loaded: number }) => void) | null } = {
        onprogress: null,
      };
      status = 0;
      responseText = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      private headers: Record<string, string> = {};
      open(): void {}
      setRequestHeader(name: string, value: string): void {
        this.headers[name] = value;
      }
      getResponseHeader(name: string): string | null {
        return name === 'Range' ? 'bytes=0-99' : null;
      }
      abort(): void {
        this.onabort?.();
      }
      send(body: unknown): void {
        sent.push({ headers: this.headers, body });
        this.upload.onprogress?.({ loaded: 40 });
        this.upload.onprogress?.({ loaded: 100 });
        this.status = 308;
        this.onload?.();
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const progress: number[] = [];

    const response = await xhrTransport().put(
      'https://drive.test/session/1',
      { 'Content-Range': 'bytes 0-99/300' },
      bytes(100),
      (loaded) => progress.push(loaded),
    );

    expect(progress).toEqual([40, 100]);
    expect(sessionStatus(response)).toEqual({ kind: 'partial', confirmed: 100 });
    expect(sent[0]?.headers).toMatchObject({
      Authorization: 'Bearer TOKEN',
      'Content-Range': 'bytes 0-99/300',
    });
  });
});

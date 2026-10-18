import { afterEach, expect, it, vi } from 'vitest';
import { answered, ANSWER_WAIT_MS } from './wait';
import { DriveHttp } from './drive/drive-http';
import { failureKind, isUnconfirmedWrite } from './drive/transport';
import { WorkerHttp } from './worker/worker-http';
import { BowerError } from './types';

const stalled = (status = 200): Response => new Response(new ReadableStream({ start() {} }), { status });
const broken = (status = 200): Response => new Response(new ReadableStream({ start(c) { c.error(new TypeError('Interrupted body')); } }), { status });
function observe(promise: Promise<unknown>) {
  const result: { state: string; error?: unknown; value?: unknown } = { state: 'pending' };
  void promise.then((value) => Object.assign(result, { state: 'done', value }), (error: unknown) => Object.assign(result, { state: 'failed', error }));
  return result;
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it.each(['worker', 'drive'] as const)('%s body stall ends at the attempt deadline, with no retry', async (kind) => {
  vi.useFakeTimers();
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(stalled()).mockResolvedValue(Response.json({ run: null, revision: 1 }));
  const result = observe(kind === 'worker' ? new WorkerHttp('', fetch).status() : new DriveHttp({ token: async () => 'token', fetch }).get('file'));
  await vi.advanceTimersByTimeAsync(ANSWER_WAIT_MS - 1);
  expect(result.state).toBe('pending');
  await vi.advanceTimersByTimeAsync(1);
  expect(result.state).toBe('failed');
  expect(result.error).toBeInstanceOf(BowerError);
  expect(result.error).toMatchObject({ code: 'offline' });
  expect(isUnconfirmedWrite(result.error)).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
});

it('answered keeps caller cancellation through a stalled body even if fetch ignores it', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const result = observe(answered(async () => stalled(), 'https://example.test', { signal: controller.signal }).then((res) => res.text()));
  await vi.advanceTimersByTimeAsync(1);
  controller.abort();
  await vi.advanceTimersByTimeAsync(0);
  expect(result.state).toBe('failed');
  expect(result.error).toMatchObject({ name: 'AbortError' });
  expect(vi.getTimerCount()).toBe(0);
});

it('an interrupted Drive read is a read failure, dispatched exactly once', async () => {
  const fetch = vi.fn(async () => broken());
  const result = await new DriveHttp({ token: async () => 'token', fetch }).get('file').catch((e: unknown) => e);
  expect(result).toBeInstanceOf(BowerError);
  expect(result).toMatchObject({ code: 'offline' });
  expect(isUnconfirmedWrite(result)).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([401, 429, 503])('a stalled error body keeps HTTP %s classification', async (status) => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const fetch = vi.fn(async () => stalled(status));
  const drive = new DriveHttp({ token: async () => 'token', fetch, pacing: { baseMs: 0 } });
  const result = observe(drive.update('file', { name: 'new' }));
  await vi.advanceTimersByTimeAsync(ANSWER_WAIT_MS + 100);
  expect(result.state).toBe('failed');
  expect(result.error).toBeInstanceOf(BowerError);
  expect(isUnconfirmedWrite(result.error)).toBe(status === 503);
  expect(failureKind(result.error)).toBe('retry');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([401, 429, 503])('Worker keeps HTTP %s when its error body stalls', async (status) => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const result = observe(new WorkerHttp('', async () => stalled(status)).status());
  await vi.advanceTimersByTimeAsync(ANSWER_WAIT_MS);
  expect(result.state).toBe('failed');
  expect(result.error).toMatchObject({ code: status === 401 ? 'auth' : 'unknown', cause: { httpStatus: status } });
});

it('a stalled write body is unsettled at its upload-adjusted deadline', async () => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const fetch = vi.fn(async () => stalled());
  const result = observe(new DriveHttp({ token: async () => 'token', fetch }).update('file', { name: 'new' }));
  await vi.advanceTimersByTimeAsync(ANSWER_WAIT_MS + 1);
  expect(result.state).toBe('failed');
  expect(isUnconfirmedWrite(result.error)).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([401, 429, 503])('a broken error body still permits the existing HTTP %s read recovery', async (status) => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const fetch = vi.fn(async () => Response.json({ id: 'file', name: 'note.md' })).mockResolvedValueOnce(broken(status));
  const drive = new DriveHttp({ token: async () => 'token', fetch, pacing: { baseMs: 0 } });
  await expect(drive.get('file')).resolves.toMatchObject({ id: 'file' });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('a completed body clears the deadline and preserves the Response API', async () => {
  vi.useFakeTimers();
  const drive = new DriveHttp({ token: async () => 'token', fetch: async () => Response.json({ id: 'file' }, { headers: { 'x-test': 'kept' } }) });
  const response = await drive.call('https://www.googleapis.com/drive/v3/files/file');
  expect(response).toBeInstanceOf(Response);
  expect(response.headers.get('x-test')).toBe('kept');
  await expect(response.json()).resolves.toEqual({ id: 'file' });
  expect(vi.getTimerCount()).toBe(0);
});

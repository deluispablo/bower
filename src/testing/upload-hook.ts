import type { DriveApi } from '@/data/drive/drive-api';

/** A file about to go up, as the queue opens its session. */
export interface UploadStart {
  parent: string;
  name: string;
  props: Record<string, string>;
}

/**
 * Runs `before` as each upload starts (every upload goes through the queue, which opens a session per file):
 * await to hold the file back, throw to refuse it.
 */
export function beforeUpload(drive: DriveApi, before: (start: UploadStart) => void | Promise<void>): void {
  const open = drive.openResumable.bind(drive);
  drive.openResumable = async (target) => {
    await before({ parent: target.parentId, name: target.name, props: target.appProperties ?? {} });
    return open(target);
  };
}

const stopped = (signal: AbortSignal | undefined): Promise<never> =>
  new Promise((_, reject) => {
    if (signal?.aborted) reject(new DOMException('The upload stopped.', 'AbortError'));
    signal?.addEventListener('abort', () => reject(new DOMException('The upload stopped.', 'AbortError')));
  });

/**
 * Holds every chunk until `until` settles; the queue stopping the file (a removed pile) ends the hold with an
 * `AbortError`, as a transfer stopped on the wire does. With `afterAnswer`, the chunk goes first and its answer is held:
 * the file is in Drive, the reply is late.
 */
export function holdChunks(drive: DriveApi, until: Promise<void>, afterAnswer = false, onAnswer?: (file: { id: string }) => void): void {
  const put = drive.putChunk.bind(drive);
  drive.putChunk = async (session, start, chunk, size, signal) => {
    if (!afterAnswer) await Promise.race([until, stopped(signal)]);
    const status = await put(session, start, chunk, size, signal);
    if (afterAnswer && status.kind === 'done') {
      onAnswer?.(status.file);
      await Promise.race([until, stopped(signal)]);
    }
    return status;
  };
}

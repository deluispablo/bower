/**
 * Inert stub of the resumable upload protocol, so tests load and fail by
 * their assertions before the protocol lands (upload-queue-persistent).
 * Every call refuses; nothing reaches Drive.
 */
import { BowerError } from '../types';
import { RESUMABLE_UNIT, type DriveFile, type ResumableDrive, type ResumableTarget } from './drive-api';

/** Drive wants chunks in multiples of 256 KiB; 8 MiB keeps requests few. */
export const RESUMABLE_CHUNK_BYTES = 32 * RESUMABLE_UNIT;

/** Times one file may restart after its session expired, per try. */
export const MAX_RESTARTS = 2;

/** The Drive calls a resumable upload needs. */
export type ResumableClient = ResumableDrive;

/** A target whose content hash is known, so what Drive has can be checked. */
export type CheckedTarget = ResumableTarget & { sha256: string };

/** What the protocol reports while it sends one file. */
export interface UploadHooks {
  onSession: (session: string) => Promise<void>;
  onConfirmed: (bytes: number) => Promise<void>;
  onProgress: (sent: number) => void;
  signal?: AbortSignal;
}

/** Bytes Drive holds, from a 308's `Range` header (stub: none). */
export function confirmedFrom(_range: string | null): number {
  return 0;
}

/** The `Content-Range` of a chunk (stub: a status question). */
export function chunkRange(_start: number, _end: number, size: number): string {
  return `bytes */${size}`;
}

/** Sends nothing: the protocol is not here yet. */
export async function sendResumable(
  _drive: ResumableClient,
  _upload: CheckedTarget & { body: Blob; session: string | null },
  _hooks: UploadHooks,
  _chunkSize: number = RESUMABLE_CHUNK_BYTES,
): Promise<DriveFile> {
  throw new BowerError('unknown', "This couldn't be sent. Try again.");
}

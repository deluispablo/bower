/** Strict record JSON and canonical identities; no schema or permission authority. */
export type RecordJsonValue = null | boolean | number | string | RecordJsonValue[] | { [key: string]: RecordJsonValue };
export type RecordJsonFailure = { ok: false; reason: 'encoding' | 'syntax' | 'duplicate-key' | 'unicode' | 'number' | 'value' };
export type RecordJsonResult<T> = { ok: true; value: T } | RecordJsonFailure;

/** Loadable proof stub; no normalized or authoritative output. */
export function parseRecordJson(_bytes: Uint8Array): RecordJsonResult<RecordJsonValue> {
  return { ok: false, reason: 'syntax' };
}

export function canonicalRecordJson(_value: unknown): RecordJsonResult<Uint8Array> {
  return { ok: false, reason: 'value' };
}

export async function hashRecordJson(_value: unknown): Promise<RecordJsonResult<string>> {
  return { ok: false, reason: 'value' };
}

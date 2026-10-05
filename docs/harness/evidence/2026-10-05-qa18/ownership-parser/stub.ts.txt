/** Pure internal raw-byte ownership boundary. No provider or public Sources API. */
export interface ByteSpan { readonly start: number; readonly end: number }
export type Owner = 'current' | 'personal' | 'timeline' | 'bower-note';
export type OwnershipFailure = 'unsupported-version' | 'damaged-boundary' | 'invalid-encoding';
export interface PersonalTask {
  readonly index: number;
  readonly label: string;
  readonly done: boolean;
  readonly checkboxByte: number;
}
export type OwnershipResult =
  | { readonly status: 'invalid'; readonly reason: OwnershipFailure }
  | { readonly status: 'plain' | 'legacy'; readonly personal: ByteSpan; readonly tasks: readonly PersonalTask[] }
  | { readonly status: 'v2'; readonly personal: ByteSpan; readonly payloads: Readonly<Record<Owner, ByteSpan>>; readonly tasks: readonly PersonalTask[] };
export interface TaskRequest {
  readonly index: number;
  readonly label: string;
  readonly previousDone: boolean;
  readonly done: boolean;
}
export type TaskResult =
  | { readonly kind: 'refused'; readonly reason: OwnershipFailure | 'task-not-found' | 'task-changed' }
  | { readonly kind: 'changed'; readonly bytes: Uint8Array; readonly label: string; readonly done: boolean };

/** Loadable proof baseline; the separate fix supplies actual ownership scanning. */
export function parseOwnership(_bytes: Uint8Array): OwnershipResult {
  return { status: 'invalid', reason: 'damaged-boundary' };
}

export function togglePersonalTask(_bytes: Uint8Array, _request: TaskRequest): TaskResult {
  return { kind: 'refused', reason: 'damaged-boundary' };
}

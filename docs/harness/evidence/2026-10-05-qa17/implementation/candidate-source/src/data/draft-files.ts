/**
 * The files of an Add draft. The list of things is kept for the visit
 * (sessionStorage), but a file itself cannot be: it lives here, in memory,
 * until the pile is saved. After a reload a draft's file is gone, and Add
 * asks for it again.
 */
const files = new Map<string, Blob>();

export function keep(key: string, file: Blob): void {
  files.set(key, file);
}

export function get(key: string): Blob | undefined {
  return files.get(key);
}

export function forget(key: string): void {
  files.delete(key);
}

/** Forget every pending draft, including bytes no longer named by stored metadata. */
export function forgetAll(): void {
  files.clear();
}

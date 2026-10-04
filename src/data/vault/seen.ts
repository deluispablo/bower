/**
 * What this device has opened since Bower filed or changed it. Kept in
 * localStorage only; it never leaves the device. A file is "new" again
 * when it changes (its modified time is part of the key).
 */
const KEY = 'bower:seen';
const MAX = 2000;

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function markSeen(id: string, modified: string): void {
  const key = `${id}@${modified}`;
  const all = read().filter((k) => !k.startsWith(`${id}@`));
  all.push(key);
  try {
    localStorage.setItem(KEY, JSON.stringify(all.slice(-MAX)));
  } catch {
    // Storage may be full or blocked; the dot just stays.
  }
}

export function isSeen(id: string, modified: string): boolean {
  return read().includes(`${id}@${modified}`);
}

/** Everything seen, read once, for a whole listing: `has(id, modified)`. */
export function seenNow(): (id: string, modified: string) => boolean {
  const all = new Set(read());
  return (id, modified) => all.has(`${id}@${modified}`);
}

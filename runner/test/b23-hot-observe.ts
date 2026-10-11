import { resolve } from 'node:path';
import { expect } from 'vitest';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import { loadCase } from '../src/corpus';
import * as driver from './corpus-run';
import { fixedDrive } from './drive-v3';

export const HOT = '.bower/hot.md';
export const pacing = { sleep: async (): Promise<void> => undefined };
export const empty = { kind: 'tidy-intent', v: 1, things: [] };

/** Future exports are assertion reds, never undefined calls or static import errors. */
export function requiredFunction<T>(module: object, name: string): T {
  const value: unknown = Reflect.get(module, name);
  expect(value, `production export ${name}`).toBeTypeOf('function');
  return value as T;
}

export const runOnDrive = requiredFunction<typeof driver.runOnDrive>(driver, 'runOnDrive');
export const redispatchCase = requiredFunction<typeof driver.redispatchCase>(driver, 'redispatchCase');

export async function setup(id = 'b1-maintenance-crash-resume') {
  const c = await loadCase(resolve(import.meta.dirname, '../../harness/corpus', id));
  const drive = fixedDrive();
  const root = await driver.seedCase(drive, c);
  return { c, drive, root };
}

export interface Observation { method: string; path: string; media: boolean; text: string; stamp?: string }
export interface LostReply { reached: boolean; enabled: boolean }

/** Observe only main's wire traffic, excluding corpus admission, seeding and scoring. */
export function observe(drive: FakeDrive, root: string, events: Observation[], lost?: LostReply) {
  return (fetch: typeof globalThis.fetch): typeof globalThis.fetch => async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== 'https://www.googleapis.com') return fetch(input, init);
    const method = (init.method ?? 'GET').toUpperCase();
    const id = /^\/(?:upload\/)?drive\/v3\/files\/([^/]+)$/.exec(url.pathname)?.[1];
    const body = init.body == null ? '' : await new Response(init.body).text();
    const boundary = /^--([^\r\n]+)\r\n/.exec(body)?.[1];
    const parts = boundary ? body.split(`--${boundary}`).slice(1, -1)
      .map((part) => part.slice(part.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '')) : [];
    const metadata = parts[0] ?? (!url.pathname.startsWith('/upload/') && body ? body : undefined);
    const meta = metadata ? JSON.parse(metadata) as { name?: string; parents?: string[]; appProperties?: { bowerOp?: string } } : undefined;
    const path = id ? drive.pathOf(decodeURIComponent(id), root) : meta?.name && meta.parents?.[0]
      ? [drive.pathOf(meta.parents[0], root), meta.name].filter(Boolean).join('/') : undefined;
    if (lost?.enabled && lost.reached && path === HOT) throw new TypeError('Made-up hot connection remains lost');
    if (path) events.push({ method, path, media: url.searchParams.get('alt') === 'media',
      text: url.searchParams.get('uploadType') === 'media' ? body : parts[1] ?? body,
      stamp: meta?.appProperties?.bowerOp });
    const response = await fetch(input, init);
    if (lost?.enabled && path === HOT && ['POST', 'PATCH'].includes(method)) {
      expect(response.ok, 'fault happens after hot was stored by the real adapter').toBe(true);
      lost.reached = true;
      throw new TypeError('Lost made-up hot reply');
    }
    return response;
  };
}

export const writes = (events: Observation[], path: string): Observation[] => events.filter((e) =>
  e.path === path && ['POST', 'PATCH', 'DELETE'].includes(e.method));
export const manifests = (run: driver.CaseRun): Array<[string, string]> => Object.entries(run.after)
  .filter(([path]) => /\/runs\/.*\/manifest-[^/]+\.json$/.test(path));

export function section(text: string | undefined, heading: string): string[] {
  const rows = (text ?? '').split('\n');
  const start = rows.indexOf(`## ${heading}`);
  expect.soft(start, `hot has ${heading}`).toBeGreaterThanOrEqual(0);
  if (start < 0) return [];
  const end = rows.findIndex((row, i) => i > start && row.startsWith('## '));
  return rows.slice(start + 1, end < 0 ? undefined : end).filter((row) => row.startsWith('- '));
}

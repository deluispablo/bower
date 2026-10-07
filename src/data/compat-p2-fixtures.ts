/// <reference types="node" />
/**
 * For the compatibility tests only (P3-18): the files the accepted app (P2, `00ec9a5`) wrote, as kept in
 * `contracts/fixtures/p2/`, and the folder they sat in, as the shared readers and the runner's readers see it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalRecordJson } from './contracts/record-json';
import type { DriveFile } from './drive/drive-api';

export const P2_SOURCE = '00ec9a5';
export const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'contracts/fixtures/p2');

/** Every shape the accepted app wrote, one fixture each. */
export const SHAPES = [
  'last-run', 'questions', 'suggestions', 'requests', 'hashes',
  'run-manifest', 'run-checkpoint', 'run-report', 'pile-declaration', 'pile-disposition',
  'journal-rule', 'journal-rule-removes', 'journal-request', 'journal-move', 'journal-rename',
  'journal-create', 'journal-trash', 'journal-task', 'journal-answer',
] as const;
export type Shape = (typeof SHAPES)[number];

export interface P2File { path: string; content: unknown }
export interface P2Fixture { source: string; files: P2File[] }

export const missingFixtures = (): string[] => SHAPES.filter((s) => !existsSync(join(FIXTURE_DIR, `${s}.json`)));

export function fixture(shape: Shape): P2Fixture {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${shape}.json`), 'utf8')) as P2Fixture;
}

/** The one file of a fixture that holds one. */
export function only(shape: Shape): P2File {
  const [file, ...more] = fixture(shape).files;
  if (!file || more.length) throw new Error(`${shape} should hold exactly one file`);
  return file;
}

/** A record's bytes as the app wrote them: canonical record JSON, whose hash its name carries. */
export function recordBytes(content: unknown): Uint8Array {
  const out = canonicalRecordJson(content);
  if (!out.ok) throw new Error(`fixture is not a record: ${out.reason}`);
  return out.value;
}

export interface Tree {
  rootId: string;
  files: DriveFile[];
  text: Map<string, string>;
}

/**
 * The folder the fixtures sat in: `.bower/runs/<run>/…` and `.bower/piles/…` as Drive lists them, every record
 * under the name the app gave it.
 */
export function folderOf(rootId: string, shapes: readonly Shape[]): Tree {
  const files: DriveFile[] = [];
  const text = new Map<string, string>();
  const folders = new Map<string, string>();
  let n = 0;
  const base = { modifiedTime: '2026-10-07T09:00:00.000Z', createdTime: '2026-10-07T09:00:00.000Z' };
  const folder = (name: string, parent: string): string => {
    const key = `${parent}/${name}`;
    const known = folders.get(key);
    if (known) return known;
    const id = `d${++n}`;
    folders.set(key, id);
    files.push({ id, name, folder: true, parents: [parent], ...base });
    return id;
  };
  for (const shape of shapes) {
    for (const file of fixture(shape).files) {
      const parts = file.path.split('/');
      const name = parts.pop() ?? '';
      let parent = rootId;
      for (const part of parts) parent = folder(part, parent);
      const id = `x${++n}`;
      const isRecord = parts[1] === 'runs' || parts[1] === 'piles';
      const body = isRecord ? new TextDecoder().decode(recordBytes(file.content)) : JSON.stringify(file.content);
      files.push({ id, name, folder: false, parents: [parent], size: body.length, ...base });
      text.set(id, body);
    }
  }
  return { rootId, files, text };
}

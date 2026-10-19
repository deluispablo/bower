/** A personal note filed from the inbox stays the person's: Bower moves it and marks only what it wrote. */
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VaultIndex } from '../../src/data/vault/vault-index';
import { loadCase } from '../src/corpus';
import { precheck } from '../src/precheck';
import { AT, runScripted } from './corpus-run';

const PERSON = 'Resources/Gardening/Alex notes.md';
const BOWERS = 'Resources/Gardening/Garden bulletin.md';

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function run() {
  const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c17-b7-authority-full-cap'));
  const r = await runScripted(c);
  expect(r.code).toBe(0);
  return { c, r };
}

describe('person-note-owner', () => {
  it('person-note-owner AC1: a personal note filed from the inbox keeps its bytes and gets no Bower mark', async () => {
    const { c, r } = await run();
    expect(r.after[PERSON]).toBe(c.inboxFiles['Alex notes.md']);
    expect(Object.hasOwn(r.props[PERSON] ?? {}, 'by')).toBe(false);
    expect(r.props[PERSON]?.bowerNew).toBe('1');
    expect(r.props[BOWERS]?.by).toBe('bower');
  });

  it('person-note-owner AC2: every reader of the mark sees the filed note as the person\'s', async () => {
    const { r } = await run();
    const entries = VaultIndex.build(r.root, await r.drive.listAll(r.root)).entries();
    const notes = (await precheck(r.drive, r.root)).notes;
    expect(entries.get(PERSON)?.byBower).toBeUndefined();
    expect(notes.find((n) => n.path === PERSON)?.owner).toBe('person');
    expect(entries.get(BOWERS)?.byBower).toBe(true);
    expect(notes.find((n) => n.path === BOWERS)?.owner).toBe('bower');
  });
});

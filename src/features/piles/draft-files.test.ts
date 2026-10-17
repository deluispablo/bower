import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forget, get, keep } from './draft-files';
import { forgetThisPerson } from '../../data/device';

describe('the files of an Add draft', () => {
  it('keep then get returns the file, and forget drops it', () => {
    const b = new Blob(['receipt']);
    keep('d1', b);
    expect(get('d1')).toBe(b);
    expect(get('d1')).toBe(b);
    forget('d1');
    expect(get('d1')).toBeUndefined();
  });

  it('a draft from before a reload has no file', () => {
    expect(get('never-kept')).toBeUndefined();
  });
});


const PERSON_LOCAL = ['bower:seen', 'bower:dismissed', 'bower:run-seen', 'bower:bookmarks', 'bower:open', 'bower:stopped-away', 'bower:failed-lines'];
// The last is one pile's note draft: keyed per pile, forgotten by its prefix after the listed keys (qa7-drafts R3, R5).
const PERSON_SESSION = ['bower:add-draft', 'bower:add-items', 'bower:tell-draft', 'bower:tell-intent', 'bower:toured', 'bower:tabs', 'bower:tell-kind', 'bower:pile-note:PILE_A'];
const OUTBOX = '[{"v":1,"id":"CHANGE_A","device":"DEVICE_A","at":1,"kind":"create","what":"Synthetic note","fileId":"FILE_A"}]';
const PREFS = '{"theme":"dark"}';
const KEYS = ['DRAFT_A', 'ORPHAN_A', 'NEXT_A'];

describe('person cleanup forgets pending draft bytes and keeps the folder outbox', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    KEYS.forEach(forget);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    KEYS.forEach(forget);
  });
  function seed() {
    for (const key of PERSON_LOCAL) localStorage.setItem(key, '[]');
    for (const key of PERSON_SESSION) sessionStorage.setItem(key, '[]');
    sessionStorage.setItem('bower:add-items', '[{"key":"DRAFT_A","name":"Synthetic.txt"}]');
    localStorage.setItem('bower:outbox:FOLDER_A', OUTBOX);
    localStorage.setItem('bower:prefs', PREFS);
    const selected = new Blob(['Synthetic pending bytes A.\n']);
    const orphan = new Blob(['Synthetic orphan bytes A.\n']);
    keep('DRAFT_A', selected); keep('ORPHAN_A', orphan);
    expect(get('DRAFT_A')).toBe(selected); expect(get('ORPHAN_A')).toBe(orphan);
  }
  function retained() {
    expect(localStorage.getItem('bower:outbox:FOLDER_A')).toBe(OUTBOX);
    expect(localStorage.getItem('bower:outbox:FOLDER_B')).toBeNull();
    expect(localStorage.getItem('bower:prefs')).toBe(PREFS);
  }
  function noBytes() {
    expect(get('DRAFT_A')).toBeUndefined();
    expect(get('ORPHAN_A')).toBeUndefined();
  }
  it('forgets every kept key synchronously alongside all ten person keys', () => {
    seed();
    for (const key of PERSON_LOCAL) expect(localStorage.getItem(key), key).not.toBeNull();
    for (const key of PERSON_SESSION) expect(sessionStorage.getItem(key), key).not.toBeNull();
    forgetThisPerson();
    noBytes();
    for (const key of PERSON_LOCAL) expect(localStorage.getItem(key), key).toBeNull();
    for (const key of PERSON_SESSION) expect(sessionStorage.getItem(key), key).toBeNull();
    retained();
  });
  for (const metadata of [null, '{broken metadata']) it(`forgets orphan bytes when item metadata is ${metadata === null ? 'absent' : 'corrupt'}`, () => {
    seed();
    if (metadata === null) sessionStorage.removeItem('bower:add-items');
    else sessionStorage.setItem('bower:add-items', metadata);
    forgetThisPerson(); noBytes(); retained();
  });
  it('continues every accessible metadata attempt after individual local and session deletion fail', () => {
    seed();
    const local = localStorage, session = sessionStorage;
    const nativeRemove = Storage.prototype.removeItem;
    const denied = new DOMException('Synthetic deletion denied', 'SecurityError');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const attempted: string[] = [];
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key: string) {
      attempted.push(`${this === local ? 'local' : 'session'}:${key}`);
      if ((this === local && key === 'bower:seen') || (this === session && key === 'bower:add-draft')) throw denied;
      nativeRemove.call(this, key);
    });
    forgetThisPerson();
    expect(attempted).toEqual([...PERSON_LOCAL.map((key) => `local:${key}`), ...PERSON_SESSION.map((key) => `session:${key}`)]);
    noBytes();
    for (const key of PERSON_LOCAL) expect(local.getItem(key), key).toBe(key === 'bower:seen' ? '[]' : null);
    for (const key of PERSON_SESSION) expect(session.getItem(key), key).toBe(key === 'bower:add-draft' ? '[]' : null);
    expect(log).toHaveBeenCalledTimes(2); expect(log.mock.calls.every(([error]) => error === denied)).toBe(true);
    retained();
  });
  for (const both of [false, true]) it(`clears memory with ${both ? 'both storage getters' : 'local storage getter'} unavailable without claiming denied keys deleted`, () => {
    seed();
    const local = localStorage, session = sessionStorage;
    const names = both ? ['localStorage', 'sessionStorage'] as const : ['localStorage'] as const;
    const original = names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    const denied = new DOMException('Synthetic storage getter denied', 'SecurityError');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, get: () => { throw denied; } });
      expect(() => forgetThisPerson()).not.toThrow(); noBytes();
      for (const key of PERSON_LOCAL) expect(local.getItem(key), key).toBe('[]');
      for (const key of PERSON_SESSION) expect(session.getItem(key), key).toBe(both ? key === 'bower:add-items' ? '[{"key":"DRAFT_A","name":"Synthetic.txt"}]' : '[]' : null);
      expect(log).toHaveBeenCalledTimes(PERSON_LOCAL.length + (both ? PERSON_SESSION.length : 0));
      expect(log.mock.calls.every(([error]) => error === denied)).toBe(true);
    } finally {
      for (const [name, descriptor] of original) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    }
    retained();
  });
  it('repeats cleanup harmlessly and admits new same-visit bytes with per-key forget', () => {
    seed(); forgetThisPerson(); forgetThisPerson(); noBytes(); retained();
    const next = new Blob(['Synthetic next draft.']); keep('NEXT_A', next);
    expect(get('NEXT_A')).toBe(next); expect(get('NEXT_A')).toBe(next);
    forget('NEXT_A'); expect(get('NEXT_A')).toBeUndefined(); retained();
  });
});

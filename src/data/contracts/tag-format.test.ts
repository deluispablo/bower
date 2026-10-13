import { describe, expect, it } from 'vitest';
import { BowerError } from '../types';
import { isRunnerFile, SYSTEM } from '../vault/layout';
import { parseNote, serializeNote, type NoteFile } from './note-format';

const TAGS = '.bower/tags.json';
const readable = isRunnerFile as (path: string, value: unknown) => boolean;
const note = (tags: string[]): NoteFile => ({ summary: 'Alex grows herbs.', properties: [], tags,
  currentState: [], body: 'Alex grows herbs.', timeline: [], byBower: true });

// This test-facing export is a proposed seam in the allocated grammar home, not a second implementation.
async function normalizer(): Promise<(candidate: string) => string | null> {
  const homes = import.meta.glob('./tag-format.ts');
  const load = homes['./tag-format.ts'];
  expect(load, 'B7 shared growth-candidate normalization is missing from tag-format.ts').toBeTypeOf('function');
  const module = await (load as () => Promise<object>)();
  const fn: unknown = Reflect.get(module, 'normalizeTag');
  expect(fn, 'shared normalizeTag export').toBeTypeOf('function');
  return fn as (candidate: string) => string | null;
}

describe('B7 shared stored and generated tag contracts', () => {
  it('b7-list-strict-write-lenient-read', () => {
    expect(isRunnerFile(SYSTEM.questions, { v: 1, questions: [] })).toBe(true);
    expect(readable(TAGS, { v: 1, tags: ['gardening', 'remote-work'] }), 'valid v1 vocabulary is readable').toBe(true);
    for (const invalid of [{ v: 2, tags: [] }, { v: 1, tags: 'gardening' }, { v: 1, tags: ['bad/tag'] },
      { v: 1, tags: [null] }]) {
      expect(readable(TAGS, invalid), JSON.stringify(invalid)).toBe(false);
    }
  });

  it('b7-slug-normalization', async () => {
    expect(parseNote('Control.md', serializeNote(note(['a', 'a'.repeat(40)]))).tags).toEqual(['a', 'a'.repeat(40)]);
    const normalize = await normalizer();
    expect([...new Set(['remote work', 'Remote-work', 'remote_work', ' remote--work '].map(normalize))]).toEqual(['remote-work']);
    for (const slug of ['a', 'a'.repeat(40), 'garden-2']) expect(normalize(slug)).toBe(slug);
    for (const unsafe of ['', 'a'.repeat(41), '1garden', '#garden', 'garden/private', 'a,b', '[a]', 'a:b',
      'a"b', 'a\nb', 'a\u200bb', '-garden', 'garden-']) expect(normalize(unsafe), JSON.stringify(unsafe)).toBeNull();
  });

  it('b7-three-thirty-two', () => {
    expect(parseNote('Control.md', serializeNote(note(['gardening', 'remote-work', 'learning']))).tags)
      .toEqual(['gardening', 'remote-work', 'learning']);
    expect(() => serializeNote(note(['gardening', 'remote-work', 'learning', 'compost'])),
      'generated fourth assignment refuses rather than truncates').toThrow(BowerError);
    expect(() => serializeNote(note(['gardening', 'gardening']))).toThrow(BowerError);
  });

  it('b7-legacy-note-tags-readable', () => {
    const flow = '---\nsummary: Alex keeps these words.\ntags: [old_topic, Garden/Private, third, fourth]\n---\n\nPersonal words.  \n';
    const block = '---\nsummary: Alex keeps these words.\ntags:\n  - "My Topic"\n  - rainwater\n  - personal\n  - reminders\n---\n\nPersonal words.  \n';
    expect(parseNote('Flow.md', flow).tags).toEqual(['old_topic', 'Garden/Private', 'third', 'fourth']);
    expect(parseNote('Block.md', block).tags).toEqual(['My Topic', 'rainwater', 'personal', 'reminders']);
    expect(serializeNote(parseNote('Flow.md', flow))).toBe(flow);
    expect(serializeNote(parseNote('Block.md', block))).toBe(block);
    expect(parseNote('Generated.md', serializeNote(note(['a', 'a'.repeat(40)]))).tags).toEqual(['a', 'a'.repeat(40)]);
    expect(() => serializeNote(note(['Garden/Private'])), 'lenient reads do not permit unsafe generated tags').toThrow(BowerError);
  });
});

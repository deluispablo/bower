import { expect, it } from 'vitest';
import { parseNote, serializeNote } from './note-format';

// Offline standards: Zod's shared declarative schemas (https://zod.dev/api),
// CommonMark list items (https://spec.commonmark.org/0.31.2/#list-items), and
// GFM's task-list extension (https://github.github.com/gfm/#task-list-items-extension-).
// The new home is deliberately loaded inside the test: absence is an assertion, not a suite load error.
async function declarations(): Promise<Record<string, { sections: readonly string[] }>> {
  const path = './note-templates';
  let module: object | undefined;
  let failure: unknown;
  try { module = await import(/* @vite-ignore */ path) as object; }
  catch (error) { failure = error; }
  expect(failure, 'The single note-templates declaration home must be available').toBeUndefined();
  const candidate: unknown = module ? Reflect.get(module, 'NOTE_TEMPLATES') : undefined;
  expect(candidate, 'note-templates must export NOTE_TEMPLATES').toBeTypeOf('object');
  return candidate as Record<string, { sections: readonly string[] }>;
}

it('B6a templates: b6-five-template-shapes declares exactly five ordered section shapes in one home', async () => {
  const raw = serializeNote({ summary: 'Alex keeps gardening notes.', byBower: true,
    properties: [], tags: [], currentState: [], body: 'Grounded words.', timeline: [] });
  expect(parseNote('Gardening.md', raw).body).toBe('Grounded words.');
  const templates = await declarations();
  expect(Object.keys(templates).sort()).toEqual(['area', 'concept', 'moc', 'profile', 'project', 'source']);
  expect(Object.fromEntries(Object.entries(templates).map(([key, value]) => [key, value.sections]))).toEqual({
    source: ['Summary', 'Key points', 'Related', 'Transcript'],
    concept: ['Current state', 'Notes', 'Related', 'Timeline'],
    project: ['Goal', 'Next steps', 'Current state', 'Notes', 'Timeline'],
    area: ['Standard to maintain', 'Current state', 'Notes', 'Timeline'],
    moc: ['Overview', 'Notes', 'Sources'],
    profile: ['Profile', 'My notes', 'Timeline'],
  });
});

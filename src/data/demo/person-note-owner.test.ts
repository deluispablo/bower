/** The demo files a person's Markdown as theirs and keeps Bower's own notes Bower's, as over Drive. */
import { afterEach, expect, it, vi } from 'vitest';
import { findNode } from '../tree';
import { DemoWorld } from './world';

const PERSON_DEMO = 'Resources/Cooking/Soup ideas.md';
const BOWERS_DEMO = 'Projects/Flat hunt/Flat 9, Wrenfield Road.md';

afterEach(() => vi.useRealTimers());

it('person-note-owner AC4: the demo files a person\'s Markdown as theirs and keeps Bower\'s own notes Bower\'s', async () => {
  vi.useFakeTimers();
  const w = new DemoWorld({ scenario: 'default', scale: 'demo', latency: 0 });
  const { runs, vault } = w.sources();
  try {
    await vault.addPile({ text: 'Soup ideas for the week', items: [{ name: 'Soup ideas.md', kind: 'note', origin: 'From this computer' }] });
    await runs.start('all');
    await vi.runAllTimersAsync();
    const done = await runs.current();
    expect(done?.phase).toBe('done');
    expect(done?.report?.filed.find((f) => f.name === 'Soup ideas.md')?.to).toBe('Resources/Cooking');
    const tree = await vault.tree();
    expect(findNode(tree, PERSON_DEMO)?.byBower).toBeUndefined();
    expect((await vault.note(PERSON_DEMO)).byBower).toBe(false);
    expect(done?.report?.created.some((c) => c.path === PERSON_DEMO)).toBe(false);
    expect(findNode(tree, BOWERS_DEMO)?.byBower).toBe(true);
    expect((await vault.note(BOWERS_DEMO)).byBower).toBe(true);
    expect(done?.report?.created).toContainEqual({ path: BOWERS_DEMO, what: 'A link you saved.' });
  } finally {
    w.dispose();
  }
});

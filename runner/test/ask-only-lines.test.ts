/**
 * A run that only asks (about a pile whose question is open already) still keeps the Timeline lines the model added
 * (review P4-8 minor): the run is not "nothing ready" when it has a line to write. Since brain-05 every line has its
 * evidence, here the request that asks for it.
 */
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClaudeSpawn } from '../src/claude';
import { loadCorpus } from '../src/corpus';
import { runWithClaude } from './corpus-run';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');

afterEach(() => vi.restoreAllMocks());

const envelope = (intent: unknown): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, duration_api_ms: 900, num_turns: 1, result: JSON.stringify(intent), usage: { input_tokens: 10, output_tokens: 10 } });

describe('a run that only asks', () => {
  it('keeps the Timeline line a request asked for', async () => {
    const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c11-ambiguous-stays');
    if (!c) throw new Error('no corpus case c11-ambiguous-stays');
    const already = { ...c, questions: [{ id: 'q-ask-p-1', text: 'Is this for the flat hunt?', yes: 'Yes', no: 'No', askedAt: 1 }], inbox: c.inbox.slice(1),
      journal: [{ kind: 'request' as const, text: 'Add to Flat hunt: Viewing moved to Saturday.' }] };
    const spawn: ClaudeSpawn = async (call) => {
      const ctx = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { piles: Array<{ pileId: string; words: string }>; requests?: Array<{ requestId: string }> };
      const intent = {
        kind: 'tidy-intent', v: 1, things: [],
        asks: [{ pileId: ctx.piles[0]?.pileId ?? 'none', text: 'Is this for the flat hunt?', yes: 'Yes', no: 'No' }],
        lines: [{ note: 'Projects/Flat hunt/Flat hunt.md', text: 'Viewing moved to Saturday.', cites: ctx.requests?.[0]?.requestId }],
      };
      return { code: 0, stderr: '', cut: null, stdout: envelope(intent) };
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const run = await runWithClaude(already, spawn);

    expect(run.code).toBe(0);
    expect(run.after['Projects/Flat hunt/Flat hunt.md']).toContain('Viewing moved to Saturday.');
  });
});

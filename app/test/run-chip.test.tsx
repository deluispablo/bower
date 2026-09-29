// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RunChip,
  chipModel,
  isTextField,
} from '../src/components/run-chip.js';
import type { ChipInput } from '../src/components/run-chip.js';
import {
  RUN_CHIP_LIFETIME_MS,
  readRunSeen,
  writeRunSeen,
} from '../src/run-store.js';
import { buildRun } from './fixtures/run-outcome-builders.js';

const FINISHED = Date.parse('2026-09-29T10:06:00.000Z');
const STARTED = Date.parse('2026-09-29T10:00:30.000Z');

function input(overrides: Partial<ChipInput>): ChipInput {
  return {
    phase: 'idle',
    run: null,
    lastFinished: null,
    resultSeen: false,
    now: FINISHED + 60_000,
    desktop: false,
    ...overrides,
  };
}

let host: HTMLElement | undefined;

function mount(vnode: ReturnType<typeof h>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  act(() => {
    render(vnode, host as HTMLElement);
  });
  return host;
}

afterEach(() => {
  if (host !== undefined) render(null, host);
  host?.remove();
  host = undefined;
  vi.unstubAllGlobals();
});

describe('chipModel: the four states', () => {
  it('running: the bold lead and the minutes, on a phone and on desktop', () => {
    const run = buildRun('running');
    const now = STARTED + 2 * 60_000 + 5_000;
    const phone = chipModel(input({ phase: 'running', run, now }));
    expect(phone).toMatchObject({
      state: 'running',
      title: 'Tidying up 2 things',
      detail: '2 min',
      name: 'Tidying up 2 things, 2 minutes so far. Show progress',
    });
    const desktop = chipModel(
      input({ phase: 'running', run, now, desktop: true }),
    );
    expect(desktop).toMatchObject({
      title: 'Tidying up',
      detail: '2 things · 2 min',
    });
  });

  it('running without a count yet still says it', () => {
    const model = chipModel(input({ phase: 'starting' }));
    expect(model?.title).toBe('Tidying up');
    expect(model?.name).toBe('Tidying up. Show progress');
  });

  it('done: the counts, and the full sentence as the name', () => {
    const run = buildRun('done');
    const model = chipModel(input({ lastFinished: run }));
    expect(model).toMatchObject({
      state: 'done',
      title: 'Done',
      detail: '2 filed · 1 new · 1 updated',
      name: 'Tidy-up done: 2 filed, 1 new note, 1 updated. See what changed',
    });
  });

  it('partly done: what is still in the inbox, and the desktop ending', () => {
    const run = buildRun('partial');
    const phone = chipModel(input({ lastFinished: run }));
    expect(phone).toMatchObject({
      state: 'partial',
      title: 'Partly done',
      detail: '1 filed · 1 new · 1 updated · 1 still in your inbox',
      name: 'Tidy-up partly done, 1 thing still in your inbox. See what happened',
    });
    const desktop = chipModel(input({ lastFinished: run, desktop: true }));
    expect(desktop?.detail).toBe('1 still in your inbox');
    expect(desktop?.name).toBe(
      'Tidy-up partly done, 1 thing still in your inbox. Finish it',
    );
  });

  it('did not finish: nothing changed', () => {
    const model = chipModel(input({ lastFinished: buildRun('failed') }));
    expect(model).toMatchObject({
      state: 'failed',
      title: 'Did not finish',
      detail: 'nothing changed',
      name: 'Tidy-up did not finish. Nothing changed. Show why',
    });
  });
});

describe('chipModel: lifetime', () => {
  it('a seen result has no chip', () => {
    const run = buildRun('done');
    expect(chipModel(input({ lastFinished: run, resultSeen: true }))).toBeNull();
  });

  it('a result goes after 24 hours', () => {
    const run = buildRun('done');
    const late = FINISHED + RUN_CHIP_LIFETIME_MS;
    expect(chipModel(input({ lastFinished: run, now: late }))).toBeNull();
    expect(
      chipModel(input({ lastFinished: run, now: late - 1000 })),
    ).not.toBeNull();
  });

  it('nothing to show with no run', () => {
    expect(chipModel(input({}))).toBeNull();
  });
});

describe('the seen flag', () => {
  it('is kept under bower:run-seen:<runKey>', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    expect(readRunSeen(storage, 'run-1')).toBe(false);
    writeRunSeen(storage, 'run-1');
    expect(store.has('bower:run-seen:run-1')).toBe(true);
    expect(readRunSeen(storage, 'run-1')).toBe(true);
    expect(readRunSeen(storage, 'run-2')).toBe(false);
  });

  it('fails closed when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
    };
    expect(readRunSeen(broken, 'run-1')).toBe(false);
    expect(() => writeRunSeen(broken, 'run-1')).not.toThrow();
  });
});

describe('RunChip', () => {
  const model = chipModel(input({ lastFinished: buildRun('done') }));
  if (model === null) throw new Error('fixture has no chip');

  it('is a polite status with one button named in full', () => {
    const root = mount(h(RunChip, { model, desktop: false, onOpen: vi.fn() }));
    const status = root.querySelector('[role="status"]');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    const button = root.querySelector('button');
    expect(button?.getAttribute('aria-label')).toBe(model.name);
    expect(root.querySelector('.run-chip-see')?.textContent).toBe('See');
  });

  it('says its state once, and not again when only the minute moves', () => {
    const run = buildRun('running');
    const at = (minutes: number): NonNullable<ReturnType<typeof chipModel>> => {
      const m = chipModel(
        input({
          phase: 'running',
          run,
          now: STARTED + minutes * 60_000 + 1000,
        }),
      );
      if (m === null) throw new Error('no chip');
      return m;
    };
    const onOpen = vi.fn();
    const root = mount(h(RunChip, { model: at(1), desktop: false, onOpen }));
    const said = (): string =>
      root.querySelector('.run-chip-announce')?.textContent ?? '';
    expect(said()).toBe('Tidying up 2 things');
    act(() => {
      render(h(RunChip, { model: at(3), desktop: false, onOpen }), root);
    });
    expect(said()).toBe('Tidying up 2 things');
    expect(root.querySelector('button')?.getAttribute('aria-label')).toContain(
      '3 minutes so far',
    );
  });

  it('opens the sheet on a click', () => {
    const onOpen = vi.fn();
    const root = mount(h(RunChip, { model, desktop: true, onOpen }));
    act(() => {
      root.querySelector('button')?.click();
    });
    expect(onOpen).toHaveBeenCalledOnce();
    expect(root.querySelector('.run-chip--desktop')).not.toBeNull();
    expect(root.querySelector('.run-chip-see')).toBeNull();
  });
});

describe('isTextField', () => {
  it('is true where the keyboard opens and false elsewhere', () => {
    const text = document.createElement('input');
    const area = document.createElement('textarea');
    const box = document.createElement('input');
    box.type = 'checkbox';
    const button = document.createElement('button');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    expect(isTextField(text)).toBe(true);
    expect(isTextField(area)).toBe(true);
    expect(isTextField(editable)).toBe(true);
    expect(isTextField(box)).toBe(false);
    expect(isTextField(button)).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});

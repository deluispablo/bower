// @vitest-environment jsdom

/**
 * Bower's suggestions (#199) as the Suggested group on the Bower tab's
 * Rules (#346): the fixture proposals file renders its open proposals
 * only, and Accept / Dismiss go through the vault's `decideProposal`.
 * Health keeps one line pointing there. The vault is a stand-in; the
 * Drive side is `proposals-write.test.ts`.
 */

import { h, render } from 'preact';
import type { FunctionComponent } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import fixtureRaw from './fixtures/proposals.md?raw';
import type { DriveFile } from '../src/drive.js';
import { PROPOSALS_PATH } from '../src/proposals.js';

const FILE: DriveFile = {
  id: 'proposals-1',
  name: 'Bower - Proposals.md',
  mimeType: 'text/markdown',
  parents: ['FOLDER_ID'],
  path: PROPOSALS_PATH,
  modifiedTime: '2026-09-27T09:00:00.000Z',
};

const decideProposal = vi.fn<(id: string, decision: string) => Promise<void>>(
  () => Promise.resolve(),
);
const getNoteText = vi.fn<(id: string) => Promise<string>>(() =>
  Promise.resolve(fixtureRaw.replace(/\r\n/g, '\n')),
);

/** The listing: the proposals file, or nothing at all. */
const listing = vi.hoisted(() => ({ withProposals: true }));

vi.mock('../src/vault-store.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../src/vault-store.js')>();
  const index = { byPath: new Map([[PROPOSALS_PATH, FILE]]) };
  const empty = { byPath: new Map() };
  return {
    ...original,
    useVault: () => ({
      index: listing.withProposals ? index : empty,
      status: 'idle',
      error: undefined,
      getNoteText,
      decideProposal,
    }),
  };
});

const { SuggestedRules } = await import('../src/components/suggested-rules.js');
const { Health } = await import('../src/routes/health.js');

let root: HTMLDivElement;

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function mount(component: FunctionComponent): Promise<void> {
  await act(() => {
    render(h(component, {}), root);
  });
  await flush();
}

beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
  listing.withProposals = true;
});

afterEach(() => {
  render(null, root);
  root.remove();
  decideProposal.mockClear();
});

function cards(): HTMLElement[] {
  return Array.from(root.querySelectorAll('.suggested-card'));
}

function button(card: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(card.querySelectorAll('button')).find(
    (b) => b.textContent === label,
  );
  if (found === undefined) throw new Error(`no ${label} button`);
  return found;
}

describe('Suggested: Bower suggestions on the Rules segment', () => {
  beforeEach(async () => {
    await mount(SuggestedRules);
  });

  it('lists the open proposals of the fixture file, and only those', () => {
    expect(root.querySelector('.suggested-head')?.textContent).toBe(
      'Suggested2',
    );
    expect(
      cards().map((c) => c.querySelector('.suggested-title')?.textContent),
    ).toEqual(['Invoices go to Money', 'A workflow for race results']);
    // Wikilinks shown as plain names.
    expect(cards()[1]?.textContent).toContain(
      'record the date, distance and time in Running log',
    );
    expect(root.textContent).not.toContain('Keep the garden tag');
  });

  it('Accept and Dismiss decide the proposal through the vault', async () => {
    const [invoices, race] = cards();
    if (invoices === undefined || race === undefined) throw new Error('cards');

    await act(() => {
      button(invoices, 'Accept').click();
    });
    await flush();
    expect(decideProposal).toHaveBeenCalledWith(
      '2026-09-20-invoices',
      'accepted',
    );
    expect(root.textContent).toContain(
      'Added to your rules: Invoices go to Money.',
    );

    await act(() => {
      button(race, 'Dismiss').click();
    });
    await flush();
    expect(decideProposal).toHaveBeenLastCalledWith(
      '2026-09-22-race-results',
      'dismissed',
    );
    expect(root.textContent).toContain(
      'Dismissed: A workflow for race results.',
    );
  });

  it('says so in one sentence when the decision cannot be saved', async () => {
    decideProposal.mockRejectedValueOnce(new Error('network down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const [invoices] = cards();
    if (invoices === undefined) throw new Error('cards');

    await act(() => {
      button(invoices, 'Accept').click();
    });
    await flush();
    expect(root.textContent).toContain(
      'Could not save your answer. Try again.',
    );
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('Health: one line pointing to the Bower tab', () => {
  it('says how many suggested rules wait, with a link to the Bower tab', async () => {
    await mount(Health);
    const link = root.querySelector<HTMLAnchorElement>('.health-suggested a');
    expect(link?.textContent).toBe('2 suggested rules on the Bower tab');
    expect(link?.getAttribute('href')).toBe('/bower');
    // The cards themselves are no longer on Health.
    expect(cards()).toHaveLength(0);
    expect(root.textContent).not.toContain('Accept');
  });

  it('shows no line when there is no proposals file', async () => {
    listing.withProposals = false;
    await mount(Health);
    expect(root.querySelector('.health-suggested')).toBeNull();
  });
});

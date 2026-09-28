// @vitest-environment jsdom

/**
 * The Rules screen (#342) on the demo fixture's `Rules.md` and proposals
 * file: the explanation above the groups, the groups with their counts
 * (only the first open), Suggested on top with Accept and Dismiss, a
 * paused rule's chip, and a tapped rule's sheet, whose every write goes
 * through the vault's `editRule` (Change it through the box's Send) or, for
 * Apply it, the request note writer. Drive, the session and the vault are
 * stand-ins; the Drive side of a rule edit is `rules-write.test.ts`.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Me } from '../src/api.js';
import { FIXTURE_FILES } from '../src/demo/fixture.js';
import type { CreateTextFileOptions, DriveFile } from '../src/drive.js';
import { PROPOSALS_PATH } from '../src/proposals.js';
import type { RuleEdit } from '../src/rules.js';

const me: Me = {
  email: 'you@example.com',
  vault: { folderId: 'FOLDER_ID', inboxFolderId: 'INBOX_ID', name: 'Bower' },
  quota: { used: 0, limit: 10 },
  needsReauth: false,
  hasApiKey: false,
};

function fixtureText(path: string): string {
  const content = FIXTURE_FILES.find((f) => f.path === path)?.content;
  if (typeof content !== 'string') throw new Error(`No ${path} in the demo`);
  return content;
}

function driveFile(id: string, path: string): DriveFile {
  return {
    id,
    name: path.split('/').at(-1) ?? path,
    mimeType: 'text/markdown',
    parents: ['FOLDER_ID'],
    path,
    modifiedTime: '2026-09-27T09:00:00.000Z',
  };
}

const state = vi.hoisted(() => ({
  texts: new Map<string, string>(),
}));

const index = {
  byPath: new Map([
    ['Rules.md', driveFile('RULES_ID', 'Rules.md')],
    [PROPOSALS_PATH, driveFile('PROPOSALS_ID', PROPOSALS_PATH)],
  ]),
};

type CreateTextFile = (
  parentId: string,
  name: string,
  content: string,
  options?: CreateTextFileOptions,
) => Promise<DriveFile>;

const createTextFile = vi.fn<CreateTextFile>((_parent, name) =>
  Promise.resolve(driveFile('NEW_ID', `0-Inbox/${name}`)),
);
const getNoteText = vi.fn((id: string) =>
  Promise.resolve(state.texts.get(id) ?? ''),
);
const editRule = vi.fn<(edit: RuleEdit) => Promise<void>>(() =>
  Promise.resolve(),
);
const decideProposal = vi.fn<(id: string, decision: string) => Promise<void>>(
  () => Promise.resolve(),
);
const refresh = vi.fn(() => Promise.resolve());

vi.mock('../src/drive.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/drive.js')>()),
  createTextFile,
}));

vi.mock('preact-iso', () => ({
  useLocation: () => ({ path: '/bower', query: {}, route: vi.fn() }),
}));

vi.mock('../src/run-store.js', () => ({
  useRun: () => ({ phase: 'idle', run: null, doItNow: vi.fn() }),
}));

vi.mock('../src/session.js', () => ({
  useSession: () => ({ me, setMe: vi.fn(), signOut: vi.fn() }),
}));

vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({
    files: [],
    fetchedAt: '2026-09-27T09:00:00.000Z',
    index,
    refresh,
    getNoteText,
    editRule,
    decideProposal,
  }),
}));

const { Bower } = await import('../src/routes/bower.js');

let root: HTMLDivElement;

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mount(): Promise<void> {
  root = document.createElement('div');
  document.body.append(root);
  await act(() => {
    render(h(Bower, null), root);
  });
  await flush();
}

function panel(): HTMLElement {
  const found = root.querySelector<HTMLElement>('#bower-panel-rules');
  if (found === null) throw new Error('No Rules panel');
  return found;
}

function buttons(scope: ParentNode = root): HTMLButtonElement[] {
  return [...scope.querySelectorAll('button')];
}

function buttonWith(text: string, scope: ParentNode = root): HTMLButtonElement {
  const found = buttons(scope).find((b) => b.textContent?.includes(text));
  if (found === undefined) throw new Error(`No button with "${text}"`);
  return found;
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
  await flush();
}

function sheet(): HTMLElement | null {
  return root.querySelector<HTMLElement>('[role="dialog"]');
}

beforeEach(() => {
  localStorage.clear();
  state.texts = new Map([
    ['RULES_ID', fixtureText('Rules.md')],
    ['PROPOSALS_ID', fixtureText(PROPOSALS_PATH)],
  ]);
  createTextFile.mockClear();
  editRule.mockClear();
  decideProposal.mockClear();
});

afterEach(() => {
  render(null, root);
  root.remove();
});

describe('the Rules screen', () => {
  it('puts the explanation above Suggested and the groups, each with its count, only the first open', async () => {
    await mount();
    const text = panel().textContent ?? '';
    const explanation = text.indexOf('Rules are yours and start at once.');
    expect(explanation).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('Suggested')).toBeGreaterThan(explanation);

    const groups = [
      ...panel().querySelectorAll<HTMLButtonElement>('.rules-group-row'),
    ].filter((row) => row.tagName === 'BUTTON');
    expect(
      groups.map((g) => [
        g.querySelector('.rules-group-name')?.textContent,
        g.querySelector('.rules-group-count')?.textContent,
        g.getAttribute('aria-expanded'),
      ]),
    ).toEqual([
      ['Money', '4', 'true'],
      ['Travel', '1', 'false'],
      ['Everything else', '1', 'false'],
    ]);
    expect(text.indexOf('Suggested')).toBeLessThan(text.indexOf('Money'));

    // The first group shows three rules and the rest behind "1 more".
    expect(panel().querySelectorAll('.rules-rule')).toHaveLength(3);
    expect(text).toContain('You said it · 26 Sep');
    await click(buttonWith('1 more in Money', panel()));
    expect(panel().querySelectorAll('.rules-rule')).toHaveLength(4);

    const travel = groups[1];
    if (travel === undefined) throw new Error('No Travel group');
    await click(travel);
    expect(travel.getAttribute('aria-expanded')).toBe('true');
    expect(panel().textContent).toContain(
      "Tickets and bookings go to the trip's project folder",
    );
  });

  it("names each group's count separately from its topic, singular and plural (#511)", async () => {
    // The name and the count used to sit right against each other with
    // nothing between them ("Money4"): a screen reader read one glued
    // word instead of "Money, 4 rules".
    await mount();
    const groups = [
      ...panel().querySelectorAll<HTMLButtonElement>('.rules-group-row'),
    ].filter((row) => row.tagName === 'BUTTON');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      'Money, 4 rules',
      'Travel, 1 rule',
      'Everything else, 1 rule',
    ]);
  });

  it('lists the open suggestions with Accept and Dismiss', async () => {
    await mount();
    const cards = [...panel().querySelectorAll<HTMLElement>('.suggested-card')];
    expect(
      cards.map((c) => c.querySelector('.suggested-title')?.textContent),
    ).toEqual(['Recipes go to Cooking', 'Runs go to the running log']);
    const first = cards[0];
    if (first === undefined) throw new Error('No card');
    await click(buttonWith('Accept', first));
    expect(decideProposal).toHaveBeenCalledWith(
      '2026-09-26-recipes',
      'accepted',
    );
    expect(panel().textContent).toContain(
      'Added to your rules: Recipes go to Cooking.',
    );
  });

  it('shows a Paused chip on a paused rule', async () => {
    state.texts.set(
      'RULES_ID',
      fixtureText('Rules.md').replace(
        "- Never archive Money (owner's request, 2026-09-27)",
        '- ~~Never archive Money~~ (paused 2026-09-28)',
      ),
    );
    await mount();
    const paused = buttonWith('Never archive Money', panel());
    expect(paused.querySelector('.bower-state--paused')?.textContent).toBe(
      'Paused',
    );
    expect(paused.textContent).toContain('Since 28 Sep');
    expect(
      buttonWith('Receipts go to Money', panel()).textContent,
    ).not.toContain('Paused');
  });

  it("a rule's sheet pauses it through editRule, and offers Resume for a paused one", async () => {
    await mount();
    await click(buttonWith('Never archive Money', panel()));
    const dialog = sheet();
    expect(dialog?.getAttribute('aria-label')).toBe('Never archive Money');
    expect(dialog?.textContent).toContain('Money · you said it on 27 Sep');
    expect(
      buttons(dialog ?? root).map(
        (b) =>
          b.querySelector('.rule-sheet-row-label')?.textContent ??
          b.textContent,
      ),
    ).toEqual([
      'Change it',
      'Apply it to what is already filed',
      'Pause it',
      'Remove it',
      'Cancel',
    ]);

    await click(buttonWith('Pause it', dialog ?? root));
    expect(sheet()).toBeNull();
    expect(editRule).toHaveBeenCalledWith({
      kind: 'pause',
      rule: {
        line: expect.any(Number) as number,
        raw: "- Never archive Money (owner's request, 2026-09-27)",
      },
    });
    expect(panel().textContent).toContain('Paused: Never archive Money');
  });

  it('Remove it goes through editRule too', async () => {
    await mount();
    await click(buttonWith('Receipts go to Money', panel()));
    await click(buttonWith('Remove it', sheet() ?? root));
    expect(editRule.mock.calls[0]?.[0].kind).toBe('remove');
  });

  it('Change it fills the box, and Send rewrites the rule instead of sending a note', async () => {
    await mount();
    await click(buttonWith('Receipts go to Money', panel()));
    await click(buttonWith('Change it', sheet() ?? root));
    const box = root.querySelector('textarea');
    if (box === null) throw new Error('No box');
    expect(box.value).toBe('Receipts go to Money, named by shop and date');

    await act(() => {
      box.value = 'Receipts go to Money, named by shop';
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const send = buttons().find((b) => b.getAttribute('aria-label') === 'Send');
    if (send === undefined) throw new Error('No Send');
    await click(send);

    expect(createTextFile).not.toHaveBeenCalled();
    expect(editRule).toHaveBeenCalledWith({
      kind: 'change',
      rule: {
        line: expect.any(Number) as number,
        raw: "- Receipts go to Money, named by shop and date (owner's request, 2026-09-26)",
      },
      text: 'Receipts go to Money, named by shop',
    });
    expect(box.value).toBe('');
    expect(panel().hasAttribute('hidden')).toBe(false);
  });

  it('Apply it sends the job note for the next tidy-up and touches no rule', async () => {
    await mount();
    await click(buttonWith('Receipts go to Money', panel()));
    await click(
      buttonWith('Apply it to what is already filed', sheet() ?? root),
    );
    expect(editRule).not.toHaveBeenCalled();
    expect(createTextFile).toHaveBeenCalledTimes(1);
    const content = createTextFile.mock.calls[0]?.[2] ?? '';
    expect(content).toContain('kind: request\n');
    expect(content).toContain(
      'Apply this rule to what is already filed: Receipts go to Money, named by shop and date',
    );
  });

  it('with no rule and no suggestion: the empty state', async () => {
    state.texts = new Map([
      ['RULES_ID', '# Rules\n\nNothing here yet.\n'],
      ['PROPOSALS_ID', ''],
    ]);
    await mount();
    expect(panel().textContent).toContain('Nothing yet');
    expect(panel().textContent).not.toContain('Rules are yours');
  });
});

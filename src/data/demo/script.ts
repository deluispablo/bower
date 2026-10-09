/**
 * The scripted provider (TL-P3-22 addendum, TL-P4-14 stage 3): the demo fixture's stand-ins for a model, as one reply
 * (`Decisions`) the planner reads the way it reads the model's. Only this side reads the fixture: the Claude provider's
 * path never reaches it (`claude-provider-reaches-no-fixture`). It uses no model and no network of its own; its results
 * for the C04-C11 journeys are the fixture's, and the same folder and admitted set give the same plan.
 */
import { BowerError } from '../types';
import { linkTitle, savedLinkUrl } from '../search-text';
import type { RunProvider } from '../spine/provider';
import type { ScriptedRead } from '../spine/read';
import { generatedName, planScripted, runKeys, type AuthoredState, type Decisions, type HubLine, type ScriptedRun } from '../spine/scripted';
import { DISAGREEMENTS, FILING, HUB_UPDATES, MERGES, NOT_LOOKED_UP, askAbout, citedName, disagreement, disagreementAnswer, guessFolder, saltmereQuestion, scriptedRequest, seedPiles, wordRule, type HubUpdate } from './fixture';

export type { HubUpdate };

/** The demo's plan for each sample inbox thing, by the name it was added under. */
const PLAN_BY_NAME = new Map(
  seedPiles(0)
    .flatMap((p) => p.items)
    .flatMap((it) => {
      const plan = FILING[it.id];
      return plan ? [[it.name, plan] as const] : [];
    }),
);

/**
 * The scripted reply: things filed where the fixture's plan sends them, else a guess from the pile's words; the hub
 * notes a full tidy-up brings up to date (`updates`, the demo's by default); the Current states it updates (`states`,
 * none by default: a situation's, as the model's would be); merges, questions, request answers and rule wordings as the
 * fixture has them. It takes every request, and acts on every answer unless it updates Current states.
 */
export function scriptedDecisions(updates: readonly HubUpdate[] = HUB_UPDATES, states: readonly AuthoredState[] = []): Decisions {
  return {
    thing: (t) => {
      const plan = PLAN_BY_NAME.get(t.name);
      // A saved link is named from its address unless the plan names it (as the legacy runner did).
      const url = t.linkText === null || plan ? null : savedLinkUrl(t.linkText);
      return { to: plan?.to ?? guessFolder(`${t.words} ${t.name}`, t.kind), name: plan?.title ?? (url ? `${linkTitle(url)}.url` : t.fileName) };
    },
    words: (_pileId, words) => ({ to: guessFolder(words, 'note'), name: generatedName(words) }),
    pileAsk: (pile) => askAbout(pile.text),
    thingAsk: () => null,
    note: () => null,
    lines: [],
    states,
    areas: new Map(),
    keep: [],
    // It acts on every answer; with Current states to update (a situation's), the plan settles answers on its own, as
    // for the model's reply, so a yes to "Write it" grants its one write (`c3-state-mark`, TL-P4-19 addendum 13).
    ...(states.length ? {} : { settles: () => true }),
    merge: (item, yes) => MERGES.find((m) => m.item === item.name && yes(m.question)) ?? null,
    ownNote: (name) => PLAN_BY_NAME.get(name)?.note ?? null,
    hubLines: updates.map((u): HubLine => {
      const plan = u.cites === undefined ? undefined : PLAN_BY_NAME.get(u.cites);
      return { ...u, ...(plan ? { source: citedName(plan) } : {}) };
    }),
    askAfter: (pile, at) => (/saltmere/i.test(pile.text) ? saltmereQuestion(at) : null),
    request: (text) => {
      const r = scriptedRequest(text);
      if (!r) return null;
      if (r.kind === 'lookup') return { kind: 'lookup', uses: r.uses, found: r.found, answer: r.answer, offline: NOT_LOOKED_UP };
      if (r.kind === 'compare') return { kind: 'compare', uses: r.uses, note: r.note, answer: r.answer };
      return { kind: 'answer', uses: r.uses, answer: r.answer };
    },
    said: {
      about: (questionId) => DISAGREEMENTS.some((r) => questionId.startsWith(`q-${r.id}-`)),
      line: (q, yes) => disagreementAnswer(q, yes),
    },
    disagreements: (words) => DISAGREEMENTS.filter((r) => r.words.test(words)).map((rule) => ({
      note: rule.note,
      property: rule.property,
      question: (said, added, stored, at) => disagreement(said, added, stored, rule, at),
    })),
    wordRule,
  };
}

/** The scripted provider: the run's plan from the admitted set it took, read through `read`. */
export function scriptedProvider(read: ScriptedRead, run: ScriptedRun): RunProvider {
  return async ({ taken }) => {
    if (taken.rootId !== run.rootId) {
      console.error(`The admitted set is for another folder than run ${run.runId}'s`);
      throw new BowerError('unknown', "Bower's server didn't say what to tidy. Try again.");
    }
    const plan = await planScripted(read, run.rootId, { scope: taken.scope, allowWeb: run.allowWeb, runId: run.runId, requestId: taken.id, requestedAt: taken.at, taken, mintKey: await runKeys(run.runId), decisions: scriptedDecisions(), context: run.context });
    return plan.manifest;
  };
}

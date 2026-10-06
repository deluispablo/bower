import type { Rule } from './types';

/** A rule's words as compared: case, spaces and a closing full stop do not make it another rule. */
export const ruleKey = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!]+$/, '');

/** The rule these words repeat, if any (its wording or your words). */
export function ruleLike(rules: readonly Rule[], text: string): Rule | undefined {
  const k = ruleKey(text);
  return rules.find((r) => ruleKey(r.text) === k || (r.yourWords !== undefined && ruleKey(r.yourWords) === k));
}

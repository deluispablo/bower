/**
 * The Bower tab's Rules segment (#342, boards Phone-Bower and
 * Phone-Rule-Menu, handover C.7 and D.3): the explanation always on top,
 * then Suggested (`suggested-rules.tsx`, #346: Bower's open proposals with
 * Accept and Dismiss) when there are any, then `Rules.md`'s topic groups, each with its count,
 * collapsed except the first. An open group shows its first few rules and
 * "n more in <topic>"; a paused rule carries a Paused chip. Tapping a rule
 * opens its sheet (`rule-sheet.tsx`): Pause / Resume and Remove are written
 * here through the vault's `editRule` (`rules.ts`), Change it and Apply it
 * go back to the tab (`onChange`, `onApply`), which owns the box.
 *
 * With no rule and no suggestion it is the empty state of board
 * Phone-Bower-Empty.
 */

import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { Badge } from './badge.js';
import { Confirm } from './confirm.js';
import { Hint } from './hint.js';
import { IconChevronRight, IconShield } from './icons.js';
import { RULE_PANEL_QUERY, RuleSheet } from './rule-sheet.js';
import type { RuleAction } from './rule-sheet.js';
import { SuggestedRules, useOpenProposals } from './suggested-rules.js';
import { SaveError } from '../drive.js';
import type { DriveFile } from '../drive.js';
import { parseRules, RuleError, ruleMeta } from '../rules.js';
import type { Rule, RuleGroup } from '../rules.js';
import { showToast } from '../toast-store.js';
import { useMediaQuery } from '../use-media-query.js';
import { OfflineError, useVault } from '../vault-store.js';

/** Where the owner's rules live, from the top of the Bower folder. */
const RULES_PATH = 'Rules.md';

/** How many rules an open group shows before "n more in <topic>". */
export const RULES_SHOWN = 3;

export type TextLoad =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; text: string }
  | { status: 'offline' }
  | { status: 'error' };

/** The text of `file`, read again whenever the listing gives it a new
 * `modifiedTime` (after a write, `recordNote` patches it). */
export function useFileText(file: DriveFile | undefined): TextLoad {
  const { getNoteText } = useVault();
  const [load, setLoad] = useState<TextLoad>({ status: 'loading' });

  useEffect(() => {
    if (file === undefined) {
      setLoad({ status: 'none' });
      return;
    }
    let cancelled = false;
    getNoteText(file.id)
      .then((text) => {
        if (!cancelled) setLoad({ status: 'ready', text });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof OfflineError) {
          setLoad({ status: 'offline' });
          return;
        }
        console.error(err);
        setLoad({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [file, getNoteText]);

  return load;
}

/** One short sentence for a write to `Rules.md` that did not go
 * through. */
export function writeError(err: unknown): string {
  if (err instanceof RuleError) return err.message;
  if (err instanceof SaveError && err.code === 'conflict') {
    return 'Your notes changed meanwhile. Try again.';
  }
  return 'Could not save that. Try again.';
}

export interface RulesPanelProps {
  /** A sentence about the last change, from here or from the tab. */
  message: string | null;
  onMessage: (message: string | null) => void;
  /** Change it: the tab fills the box and rewrites the rule on Send. */
  onChange: (rule: Rule) => void;
  /** Apply it to what is already filed: the tab sends the job note. */
  onApply: (rule: Rule) => void;
}

interface Picked {
  topic: string;
  rule: Rule;
}

function Group({
  group,
  index,
  open,
  full,
  onToggle,
  onShowAll,
  onPick,
}: {
  group: RuleGroup;
  index: number;
  open: boolean;
  full: boolean;
  onToggle: () => void;
  onShowAll: () => void;
  onPick: (rule: Rule) => void;
}): JSX.Element {
  const listId = `rules-group-${String(index)}`;
  const shown = full ? group.rules : group.rules.slice(0, RULES_SHOWN);
  const more = group.rules.length - shown.length;
  return (
    <div class="rules-group">
      <button
        type="button"
        class="rules-group-row"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        // #511: the count sat right against the name with nothing between
        // them ("From the interview1"), so a screen reader read them as
        // one glued word ("From the interview1" rather than "From the
        // interview, 1 rule"). An explicit label separates them.
        aria-label={`${group.topic}, ${group.count} ${group.count === 1 ? 'rule' : 'rules'}`}
        onClick={onToggle}
      >
        <span class="rules-group-chevron">
          <IconChevronRight />
        </span>
        <IconShield />
        <span class="rules-group-name">{group.topic}</span>
        <span class="rules-group-count">{group.count}</span>
      </button>
      {open && (
        <ul id={listId} class="rules-list">
          {shown.map((rule) => {
            const meta = ruleMeta(rule);
            return (
              <li key={`${String(rule.line)}:${rule.raw}`}>
                <button
                  type="button"
                  class="card rules-rule"
                  onClick={() => {
                    onPick(rule);
                  }}
                >
                  <span class="rules-rule-body">
                    <span class="rules-rule-text">{rule.text}</span>
                    {(rule.paused || meta !== '') && (
                      <span class="rules-rule-meta">
                        {rule.paused && <Badge tone="check">Paused</Badge>}
                        {meta}
                      </span>
                    )}
                  </span>
                  <IconChevronRight />
                </button>
              </li>
            );
          })}
          {more > 0 && (
            <li>
              <button type="button" class="rules-more" onClick={onShowAll}>
                {more} more in {group.topic}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** The Rules intro (S-BW-6, BW-Rules): what rules are, then how to use
 * them; the phone says "Tap", desktop "Click" (K-27). */
export function rulesTipText(desktop: boolean): string {
  return `Bower files everything else into your four folders. ${desktop ? 'Click' : 'Tap'} a rule to change it, pause it, remove it, or apply it to what is already filed.`;
}

export function RulesPanel({
  message,
  onMessage,
  onChange,
  onApply,
}: RulesPanelProps): JSX.Element | null {
  const { index, editRule } = useVault();
  const rulesLoad = useFileText(index?.byPath.get(RULES_PATH));
  const proposalsLoad = useOpenProposals();

  // Topics the person opened or closed; the first group is open until
  // they close it.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [full, setFull] = useState<Record<string, boolean>>({});
  const [picked, setPicked] = useState<Picked | null>(null);
  // Remove asks first (#907's confirm, "Remove this rule?").
  const [removing, setRemoving] = useState<Rule | null>(null);
  const [busy, setBusy] = useState(false);
  const desktop = useMediaQuery(RULE_PANEL_QUERY);

  const groups =
    rulesLoad.status === 'ready' ? parseRules(rulesLoad.text).groups : [];
  const suggested =
    proposalsLoad.status === 'ready' ? proposalsLoad.open.length : 0;

  if (rulesLoad.status === 'loading') return null;
  // Rules read, suggestions not yet: wait rather than flash the empty
  // state.
  if (groups.length === 0 && proposalsLoad.status === 'loading') return null;
  if (rulesLoad.status === 'offline') {
    return (
      <p class="bower-panel-note">
        Offline: your rules are not saved on this device yet.
      </p>
    );
  }
  if (rulesLoad.status === 'error') {
    return <p class="bower-panel-note">Could not load your rules.</p>;
  }

  async function onRuleAction(rule: Rule, action: RuleAction): Promise<void> {
    setPicked(null);
    if (action === 'change') {
      onChange(rule);
      return;
    }
    if (action === 'apply') {
      onApply(rule);
      return;
    }
    if (action === 'remove') {
      setRemoving(rule);
      return;
    }
    await editRuleNow(rule, action);
  }

  async function editRuleNow(
    rule: Rule,
    action: Exclude<RuleAction, 'change' | 'apply'>,
  ): Promise<void> {
    setBusy(true);
    onMessage(null);
    try {
      await editRule({
        kind: action,
        rule: { line: rule.line, raw: rule.raw },
      });
      if (action === 'remove') {
        showToast('Rule removed.');
      } else {
        onMessage(`${action === 'pause' ? 'Paused' : 'Resumed'}: ${rule.text}`);
      }
    } catch (err) {
      console.error(err);
      onMessage(writeError(err));
    } finally {
      setBusy(false);
    }
  }

  const status =
    message === null ? null : (
      <p class="rules-status" role="status">
        {message}
      </p>
    );

  if (groups.length === 0 && suggested === 0) {
    return (
      <>
        {status}
        <p class="bower-panel-note">
          No rules yet. Say one in the box: &ldquo;From now on&hellip;&rdquo;
        </p>
      </>
    );
  }

  return (
    <div class="rules-panel" aria-busy={busy}>
      {/* The shared tip (#908's Hint; its ✕ reads "Dismiss this tip"). */}
      <Hint id="rules-yours" variant="tip" icon={<IconShield />}>
        <b>Rules are yours and start at once.</b> {rulesTipText(desktop)}
      </Hint>
      {status}
      <SuggestedRules />
      {groups.map((group, i) => {
        const key = group.topic.toLowerCase();
        const open = toggled[key] ?? i === 0;
        return (
          <Group
            key={key}
            group={group}
            index={i}
            open={open}
            full={full[key] === true}
            onToggle={() => {
              setToggled((prev) => ({ ...prev, [key]: !open }));
            }}
            onShowAll={() => {
              setFull((prev) => ({ ...prev, [key]: true }));
            }}
            onPick={(rule) => {
              setPicked({ topic: group.topic, rule });
            }}
          />
        );
      })}
      {removing !== null && (
        <Confirm
          action="removeRule"
          onConfirm={() => {
            const rule = removing;
            setRemoving(null);
            void editRuleNow(rule, 'remove');
          }}
          onCancel={() => {
            setRemoving(null);
          }}
        />
      )}
      {picked !== null && (
        <RuleSheet
          topic={picked.topic}
          rule={picked.rule}
          onPick={(action) => void onRuleAction(picked.rule, action)}
          onClose={() => {
            setPicked(null);
          }}
        />
      )}
    </div>
  );
}

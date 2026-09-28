/**
 * A rule, tapped (#342, board Phone-Rule-Menu, handover C.7): a bottom
 * sheet with the rule's topic, who asked for it and when, its text, and
 * four rows: Change it, Apply it to what is already filed, Pause it (or
 * Resume it, for a paused rule), Remove it, then Cancel. The sheet only
 * says which row was picked; the Bower tab does the writing, every write
 * to `Rules.md` through `rules.ts` (`applyRuleEdit`, via the vault's
 * `editRule`).
 *
 * Mounted fresh on each open like the pin sheet, so its focus trap always
 * attaches; Escape and a backdrop tap close it.
 */

import { useRef } from 'preact/hooks';
import type { JSX } from 'preact';

import { IconClock, IconClose, IconEdit, IconRedo } from './icons.js';
import { useFocusTrap } from './use-focus-trap.js';
import { ruleSheetLabel } from '../rules.js';
import type { Rule } from '../rules.js';
import '../styles/rule-sheet.css';

export type RuleAction = 'change' | 'apply' | 'pause' | 'resume' | 'remove';

export interface RuleSheetProps {
  topic: string;
  rule: Rule;
  onPick: (action: RuleAction) => void;
  onClose: () => void;
}

interface Row {
  action: RuleAction;
  label: string;
  hint: string;
  Icon: () => JSX.Element;
}

function rowsFor(rule: Rule): Row[] {
  return [
    {
      action: 'change',
      label: 'Change it',
      hint: 'Rewrite it in your words',
      Icon: IconEdit,
    },
    {
      action: 'apply',
      label: 'Apply it to what is already filed',
      hint: 'Bower goes through what is filed on the next tidy-up',
      Icon: IconRedo,
    },
    rule.paused
      ? {
          action: 'resume',
          label: 'Resume it',
          hint: 'Bower follows it again from now on',
          Icon: IconClock,
        }
      : {
          action: 'pause',
          label: 'Pause it',
          hint: 'Kept, but not followed until you turn it back on',
          Icon: IconClock,
        },
    {
      action: 'remove',
      label: 'Remove it',
      hint: 'Nothing already filed moves',
      Icon: IconClose,
    },
  ];
}

export function RuleSheet({
  topic,
  rule,
  onPick,
  onClose,
}: RuleSheetProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onClose);

  return (
    <div class="rule-sheet">
      <div class="rule-sheet-backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        class="rule-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label={rule.text}
        tabIndex={-1}
      >
        <div class="rule-sheet-head">
          <p class="rule-sheet-label">{ruleSheetLabel(topic, rule)}</p>
          <p class="rule-sheet-text">{rule.text}</p>
        </div>
        {rowsFor(rule).map(({ action, label, hint, Icon }) => (
          <button
            key={action}
            type="button"
            class="rule-sheet-row"
            onClick={() => {
              onPick(action);
            }}
          >
            <Icon />
            <span class="rule-sheet-row-text">
              <span class="rule-sheet-row-label">{label}</span>
              <span class="rule-sheet-row-hint">{hint}</span>
            </span>
          </button>
        ))}
        <button type="button" class="rule-sheet-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

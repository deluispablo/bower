/**
 * A rule, tapped (#342, board Phone-Rule-Menu, handover C.7): a bottom
 * sheet with the rule's topic, who asked for it and when, its text, and
 * four rows: Change it, Apply it to what is already filed, Pause it (or
 * Resume it, for a paused rule), Remove it, then Cancel. The sheet only
 * says which row was picked; the Bower tab does the writing, every write
 * to `Rules.md` through `rules.ts` (`applyRuleEdit`, via the vault's
 * `editRule`).
 *
 * An `Overlay` (R-OVL-2): the scrim, focus trap, Escape, inert page and
 * scroll lock come from `overlay.tsx`; Escape and a scrim tap close it. It
 * portals into `document.body`, outside the inert shell. On the phone it
 * is an action sheet ending with Cancel; from 900 px a 440 px side panel
 * with ✕ "Close the rule" (#915, boards BW-Rule-375 and BW-Rule-1280,
 * R-BW-6). The rule text is body text, 16 px, never a heading (D-48).
 */

import type { JSX } from 'preact';

import { IconClose, IconEdit, IconPause, IconPlay, IconRedo } from './icons.js';
import { Overlay, OverlayHeader } from './overlay.js';
import { Queued } from './queued-overlay.js';
import { OVERLAY_PRIORITY } from '../overlay-queue.js';
import { ruleSheetLabel } from '../rules.js';
import { useMediaQuery } from '../use-media-query.js';
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
          label: 'Turn it back on',
          hint: 'Bower follows it again from now on',
          Icon: IconPlay,
        }
      : {
          action: 'pause',
          label: 'Pause it',
          hint: 'Kept, but not followed until you turn it back on',
          Icon: IconPause,
        },
    {
      action: 'remove',
      label: 'Remove it',
      hint: 'Nothing already filed moves',
      Icon: IconClose,
    },
  ];
}

/** From here the rule opens as a side panel (R-OVL-1's desktop width). */
export const RULE_PANEL_QUERY = '(min-width: 900px)';

/** The close word on each width: Cancel ends the phone's action sheet, ✕
 * named "Close the rule" closes the desktop panel (never both, R-SHEET-2). */
export function ruleSheetClose(desktop: boolean): 'cancel' | 'close' {
  return desktop ? 'close' : 'cancel';
}

export function RuleSheet({
  topic,
  rule,
  onPick,
  onClose,
}: RuleSheetProps): JSX.Element {
  const desktop = useMediaQuery(RULE_PANEL_QUERY);
  const close = ruleSheetClose(desktop);
  return (
    <Queued id="rule-sheet" priority={OVERLAY_PRIORITY.own}>
      <Overlay
        kind={desktop ? 'sheet' : 'menu'}
        label={rule.text}
        onClose={onClose}
      >
        <div class={`rule-sheet-body rule-sheet-body--${close}`}>
          <div class="rule-sheet-head">
            {close === 'close' ? (
              <OverlayHeader
                titleId="rule-sheet-title"
                title={
                  <span class="rule-sheet-label">
                    {ruleSheetLabel(topic, rule)}
                  </span>
                }
                closeLabel="Close the rule"
                onClose={onClose}
              />
            ) : (
              <p class="rule-sheet-label">{ruleSheetLabel(topic, rule)}</p>
            )}
            <p class="rule-sheet-text">{rule.text}</p>
          </div>
          {rowsFor(rule).map(({ action, label, hint, Icon }) => (
            <button
              key={action}
              type="button"
              role={close === 'cancel' ? 'menuitem' : undefined}
              class={`rule-sheet-row rule-sheet-row--${action}`}
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
          {close === 'cancel' && (
            <button
              type="button"
              role="menuitem"
              class="rule-sheet-cancel"
              onClick={onClose}
            >
              Cancel
            </button>
          )}
        </div>
      </Overlay>
    </Queued>
  );
}

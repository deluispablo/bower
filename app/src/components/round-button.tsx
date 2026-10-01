/**
 * The round button at the right of every text box and search field (spec
 * §3.12, boards BW-Rules, BW-Asking, BW-Typing, BW-Dictating, BW-Sending,
 * BW-Blocked). Visual only: the caller picks the `state` and the name; the
 * dictation logic lives elsewhere (#910). A 40 px circle (32 in the desktop
 * search field) with a 44 px target that never moves or resizes.
 *
 * `mic-off` is the owner review's crossed-out, dimmed microphone (O-R2);
 * it and `spinner` stay focusable with `aria-disabled` and ignore presses.
 * Styles in `styles/primitives.css`.
 */

import type { JSX } from 'preact';

import { IconArrowUp, IconMic, IconMicOff } from './icons.js';

export type RoundButtonState =
  'mic' | 'asking' | 'mic-off' | 'arrow' | 'stop' | 'spinner';

export interface RoundButtonProps {
  state: RoundButtonState;
  /** The accessible name ("Dictate", "Send", "Stop dictating", "Sending…"). */
  label: string;
  onPress?: () => void;
  /** 32 px, for the desktop search field; 40 px otherwise. */
  small?: boolean;
  /** `aria-pressed` for the mic (false) and the stop square (true). */
  pressed?: boolean;
  /** Focusable but inert (`aria-disabled`), for the arrow while offline. */
  disabled?: boolean;
}

/** The drawn size in px; the same in every state. */
export const ROUND_BUTTON_SIZE = 40;
export const ROUND_BUTTON_SIZE_SMALL = 32;

const INERT: ReadonlySet<RoundButtonState> = new Set(['mic-off', 'spinner']);

function Glyph({ state }: { state: RoundButtonState }): JSX.Element {
  switch (state) {
    case 'mic':
    case 'asking':
      return <IconMic />;
    case 'mic-off':
      return <IconMicOff />;
    case 'arrow':
      return <IconArrowUp />;
    case 'stop':
      return <span class="round-button-stop-square" aria-hidden="true" />;
    case 'spinner':
      return <span class="round-button-spin" aria-hidden="true" />;
  }
}

export function RoundButton({
  state,
  label,
  onPress,
  small = false,
  pressed,
  disabled = false,
}: RoundButtonProps): JSX.Element {
  const inert = INERT.has(state) || disabled;
  const classes = `round-button round-button-${state}${small ? ' round-button-small' : ''}`;
  return (
    <button
      type="button"
      class={classes}
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      aria-disabled={inert ? 'true' : undefined}
      // Keeps the caret in the box: a press never takes focus from it.
      onPointerDown={(e) => e.preventDefault()}
      aria-busy={state === 'spinner' ? 'true' : undefined}
      data-state={state}
      onClick={() => {
        if (!inert) onPress?.();
      }}
    >
      <Glyph state={state} />
    </button>
  );
}

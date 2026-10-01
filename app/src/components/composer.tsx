/**
 * The one text box (spec §3.12 as overridden by the owner review O-R1 to
 * O-R3; boards BW-Rules, BW-Typing, BW-Asking, BW-Dictating, BW-Sending,
 * BW-Failed, BW-Blocked). A rounded box with one round button inside,
 * bottom right, that never moves or resizes (G-24, K-22):
 *
 * - empty: the microphone ("Dictate");
 * - with text in `send`: the teal arrow, named by effect ("Send", "Put in
 *   the inbox", "Rename"...); `save` keeps the mic and saves as you type;
 * - asking for the microphone, listening (the stop square), sending (the
 *   spinner), failed (the arrow again, the text kept), blocked or not
 *   available (the mic crossed out and dimmed), offline (the arrow inert).
 *
 * The one line under the box says which, and is the polite live region.
 * Dictation runs on `useDictation` (`dictate-button.tsx`).
 */

import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';

import { useOnline } from '../online.js';
import { useMediaQuery } from '../use-media-query.js';
import { useDictation } from './dictate-button.js';
import type { DictateState } from './dictate-button.js';
import { RoundButton } from './round-button.js';
import type { RoundButtonState } from './round-button.js';

import '../styles/composer.css';

export type ComposerMode = 'send' | 'save';

/** How long `save` waits after the last keystroke (spec §3.12). */
export const SAVE_DEBOUNCE_MS = 600;
/** Where the box stops growing and scrolls inside (spec §3.12). */
export const COMPOSER_MAX_HEIGHT = 200;

const DESKTOP_QUERY = '(min-width: 900px)';

/** Every line under the box, exactly as the boards (and O-R2) write them. */
export const COMPOSER_LINES = {
  asking: 'Allow the microphone to dictate.',
  listeningPhone: 'Listening. Tap the square to stop.',
  // Canon K-27: desktop says "click" (BW-Dictating-1280 still reads "Tap").
  listeningDesktop: 'Listening. Click the square to stop.',
  blocked:
    'The microphone is blocked. You can allow it in your browser settings.',
  unavailable: 'Dictation is off in this browser. Type instead.',
  failed: 'Could not send. Try again.',
  offline: 'You are offline. Try again when you are back online.',
} as const;

export interface ComposerProps {
  mode: ComposerMode;
  rows: 1 | 3;
  /** The box's accessible name. */
  label: string;
  placeholder?: string;
  value: string;
  onChange: (next: string) => void;
  /**
   * `send`: the arrow, Enter (rows 1) or Ctrl/⌘ + Enter (rows 3), with the
   * trimmed text. `save`: every pause of 600 ms while typing.
   */
  onCommit: (value: string) => void;
  /** The arrow's name by effect; "Send" when left out. */
  commitLabel?: string;
  /** A real `<input>` of this type (the link, the key); a textarea otherwise. */
  inputType?: 'text' | 'url' | 'password';
  /** The on-screen keyboard to show (`url` for a pasted link), keeping
   * the growing textarea. */
  inputMode?: 'text' | 'url';
  /** The commit is on its way: the spinner, the text read-only. */
  sending?: boolean;
  /** A failure to show under the box in the danger colour. */
  error?: string | null;
  /** A muted line under the box when there is nothing else to say. */
  hint?: string | null;
  id?: string;
  /** Gives the caller the field (to focus it). */
  inputRef?: { current: HTMLTextAreaElement | HTMLInputElement | null };
  /** Called whenever the microphone goes on or off. */
  onListening?: (on: boolean) => void;
  maxLength?: number;
  /** The text fails a check (`aria-invalid`). */
  invalid?: boolean;
  /** The box takes no text for now (the interview's areas are full). */
  disabled?: boolean;
  /** Focus the box when it mounts (a sheet's only field). */
  autoFocus?: boolean;
  /** Extra class on the wrapper. */
  class?: string;
}

export interface ComposerButton {
  state: RoundButtonState;
  label: string;
  /** `aria-pressed`: set on the mic and the stop square only. */
  pressed?: boolean;
  /** The arrow is inert (offline). */
  disabled?: boolean;
}

/** Which round button the box shows (spec §3.12 states, O-R1, O-R2). */
export function composerButton(input: {
  mode: ComposerMode;
  dictation: DictateState;
  hasText: boolean;
  sending: boolean;
  online: boolean;
  commitLabel: string;
}): ComposerButton {
  if (input.sending) return { state: 'spinner', label: 'Sending' };
  if (input.dictation === 'listening') {
    return { state: 'stop', label: 'Stop dictating', pressed: true };
  }
  if (input.dictation === 'asking') {
    return { state: 'asking', label: 'Dictate', pressed: false };
  }
  if (input.hasText && input.mode === 'send') {
    return {
      state: 'arrow',
      label: input.commitLabel,
      ...(!input.online && { disabled: true }),
    };
  }
  if (input.dictation === 'blocked' || input.dictation === 'unavailable') {
    return { state: 'mic-off', label: 'Dictation is off' };
  }
  return { state: 'mic', label: 'Dictate', pressed: false };
}

export interface ComposerLine {
  text: string;
  tone: 'muted' | 'danger';
  /** The 8 px danger dot before the text (listening). */
  dot?: boolean;
}

/** The one line under the box, or `null` (spec §3.12, BW boards). */
export function composerLine(input: {
  dictation: DictateState;
  desktop: boolean;
  online: boolean;
  error: string | null;
  failure: string;
  hint: string | null;
}): ComposerLine | null {
  if (input.dictation === 'listening') {
    return {
      text: input.desktop
        ? COMPOSER_LINES.listeningDesktop
        : COMPOSER_LINES.listeningPhone,
      tone: 'danger',
      dot: true,
    };
  }
  if (input.dictation === 'asking') {
    return { text: COMPOSER_LINES.asking, tone: 'muted' };
  }
  if (input.error !== null) return { text: input.error, tone: 'danger' };
  if (!input.online) return { text: COMPOSER_LINES.offline, tone: 'muted' };
  if (input.dictation === 'blocked') {
    return { text: COMPOSER_LINES.blocked, tone: 'muted' };
  }
  if (input.dictation === 'unavailable') {
    return { text: COMPOSER_LINES.unavailable, tone: 'muted' };
  }
  if (input.failure !== '') return { text: input.failure, tone: 'muted' };
  if (input.hint !== null) return { text: input.hint, tone: 'muted' };
  return null;
}

/** Whether a key press commits: Enter in rows 1, Ctrl/⌘ + Enter in rows 3. */
export function commitsOnKey(
  rows: 1 | 3,
  key: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
): boolean {
  if (key.key !== 'Enter') return false;
  if (rows === 1) return !key.shiftKey;
  return key.ctrlKey || key.metaKey;
}

type Field = HTMLTextAreaElement | HTMLInputElement;

export function Composer({
  mode,
  rows,
  label,
  placeholder,
  value,
  onChange,
  onCommit,
  commitLabel = 'Send',
  inputType,
  inputMode,
  sending = false,
  error = null,
  hint = null,
  id,
  inputRef,
  onListening,
  maxLength,
  invalid = false,
  disabled = false,
  autoFocus = false,
  class: rootClass,
}: ComposerProps): JSX.Element {
  const online = useOnline();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const field = useRef<Field | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const dictation = useDictation({
    value,
    onValue: onChange,
    field,
    ...(onListening !== undefined && { onListening }),
  });
  const hasText = value.trim() !== '';
  const button = composerButton({
    mode,
    dictation: dictation.state,
    hasText,
    sending,
    online,
    commitLabel,
  });
  const line = composerLine({
    dictation: dictation.state,
    desktop,
    online,
    error,
    failure: dictation.failure,
    hint,
  });

  // After the overlay's focus trap has put focus on its first control (the
  // ✕): the trap's effect runs after this one, so wait one task.
  useEffect(() => {
    if (!autoFocus) return undefined;
    const timer = setTimeout(() => {
      const f = field.current;
      if (f === null) return;
      f.focus();
      const end = f.value.length;
      f.setSelectionRange(end, end);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // `save`: the text is kept 600 ms after the last change, never on mount.
  const saved = useRef(value);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  useEffect(() => {
    if (mode !== 'save' || value === saved.current) return undefined;
    const timer = setTimeout(() => {
      saved.current = value;
      onCommitRef.current(value);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [mode, value]);

  // The box grows with the text up to 200 px, then scrolls inside.
  useLayoutEffect(() => {
    const f = field.current;
    if (!(f instanceof HTMLTextAreaElement)) return;
    f.style.height = 'auto';
    if (f.scrollHeight > 0) {
      f.style.height = `${Math.min(f.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
    }
  }, [value]);

  function commit(): void {
    if (mode !== 'send' || sending || disabled || !online || !hasText) return;
    dictation.stop();
    onCommit(value.trim());
  }

  function press(): void {
    if (button.state === 'arrow') {
      commit();
      return;
    }
    dictation.toggle();
    field.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && dictation.state === 'listening') {
      e.preventDefault();
      e.stopPropagation();
      dictation.stop();
      return;
    }
    if (commitsOnKey(rows, e)) {
      e.preventDefault();
      commit();
    }
  }

  function onFocusOut(e: FocusEvent): void {
    const next = e.relatedTarget;
    if (next instanceof Node && root.current?.contains(next)) return;
    dictation.stop();
  }

  const setField = (el: Field | null): void => {
    field.current = el;
    if (inputRef !== undefined) inputRef.current = el;
  };
  const lineId = id !== undefined ? `${id}-line` : undefined;
  const shared = {
    id,
    class: `composer-input${inputType === 'password' ? ' composer-mono' : ''}`,
    value,
    placeholder,
    maxLength,
    readOnly: sending,
    inputMode,
    disabled,
    'aria-label': label,
    'aria-invalid': invalid || undefined,
    'aria-describedby': line !== null ? lineId : undefined,
    onKeyDown,
    onInput: (e: JSX.TargetedEvent<Field>): void =>
      onChange(e.currentTarget.value),
  };

  const classes = [
    'composer',
    `composer-rows-${rows}`,
    hasText ? 'composer-filled' : '',
    dictation.state === 'listening' ? 'composer-listening' : '',
    rootClass ?? '',
  ]
    .filter((c) => c !== '')
    .join(' ');

  return (
    <div
      class={classes}
      ref={root}
      data-state={button.state}
      onFocusOut={onFocusOut}
    >
      <div class="composer-box">
        {inputType !== undefined ? (
          <input
            {...shared}
            ref={setField}
            type={inputType}
            autoComplete={inputType === 'password' ? 'off' : undefined}
            spellcheck={inputType === 'text'}
          />
        ) : (
          <textarea {...shared} ref={setField} rows={rows} />
        )}
        <RoundButton
          state={button.state}
          label={button.label}
          onPress={press}
          {...(button.pressed !== undefined && { pressed: button.pressed })}
          {...((button.disabled === true || disabled) && { disabled: true })}
        />
      </div>
      <p
        id={lineId}
        class={`composer-line${line?.tone === 'danger' ? ' composer-line-danger' : ''}`}
        aria-live="polite"
      >
        {line?.dot === true && <span class="composer-dot" aria-hidden="true" />}
        {line?.text}
      </p>
    </div>
  );
}

/**
 * The search field (spec §3.15 as overridden by the owner review O-R4;
 * boards HM-Main, SE-Empty, SE-Query, every sidebar). The same box as the
 * Composer: radius 24, the page background, 1 px border (teal when open or
 * holding text), the search glyph on the left and the round microphone on
 * the right. 52 px with a 40 px mic on the phone, 44 px with a 32 px mic
 * on desktop.
 *
 * - `trigger` (Home, the Folders tab, the drawer, the sidebar): a button
 *   that looks like the field and opens Search. Its mic opens Search and
 *   starts dictating into Search's field (a proposal the design gate
 *   confirms); crossed out when dictation is blocked or not available,
 *   where a press opens Search only.
 * - `input` (inside Search): the real field, focused on open, a small ✕
 *   "Clear the search" once it holds text, and ✕ "Close Search" after it.
 */

import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

import { openSwitcher } from '../switcher-store.js';
import { COMPOSER_LINES } from './composer.js';
import {
  dictationBlocked,
  getRecognitionCtor,
  useDictation,
} from './dictate-button.js';
import { IconClose, IconSearch } from './icons.js';
import { RoundButton } from './round-button.js';

import '../styles/search-field.css';

export const SEARCH_PLACEHOLDER = 'Search folders, notes and files';

export type SearchFieldSize = 'phone' | 'desktop';

let dictateOnOpen = false;

/** The trigger's mic asks Search's field to start dictating when it opens. */
export function requestSearchDictation(): void {
  dictateOnOpen = true;
}

/** Read once by Search's field on open; clears the request. */
export function takeSearchDictation(): boolean {
  const asked = dictateOnOpen;
  dictateOnOpen = false;
  return asked;
}

/** "⌘ K" on an Apple keyboard, "Ctrl K" everywhere else. */
export function shortcutHint(platform: string): string {
  return /Mac|iPhone|iPad/i.test(platform) ? '⌘ K' : 'Ctrl K';
}

function platformName(): string {
  try {
    return navigator.platform;
  } catch (err) {
    console.error('Could not read the platform', err);
    return '';
  }
}

export interface SearchTriggerProps {
  variant: 'trigger';
  size?: SearchFieldSize;
  /** Shows the "Ctrl K" / "⌘ K" hint (the desktop sidebar). */
  shortcut?: boolean;
  /** Runs before Search opens (the drawer closes itself). */
  onOpen?: () => void;
}

export interface SearchInputProps {
  variant: 'input';
  size?: SearchFieldSize;
  value: string;
  onChange: (next: string) => void;
  /** ✕ "Close Search". */
  onClose: () => void;
  inputRef?: { current: HTMLInputElement | null };
  onKeyDown?: (event: KeyboardEvent) => void;
}

export type SearchFieldProps = SearchTriggerProps | SearchInputProps;

export function SearchField(props: SearchFieldProps): JSX.Element {
  return props.variant === 'trigger' ? (
    <SearchTrigger {...props} />
  ) : (
    <SearchInput {...props} />
  );
}

function SearchTrigger({
  size = 'phone',
  shortcut = false,
  onOpen,
}: SearchTriggerProps): JSX.Element {
  const small = size === 'desktop';
  const canDictate = getRecognitionCtor() !== undefined && !dictationBlocked();

  function open(dictate: boolean): void {
    onOpen?.();
    if (dictate && canDictate) requestSearchDictation();
    openSwitcher();
  }

  return (
    <div class={`search-field search-field-trigger search-field-${size}`}>
      <button
        type="button"
        class="search-field-open"
        aria-label={SEARCH_PLACEHOLDER}
        onClick={() => open(false)}
      >
        <IconSearch />
        <span class="search-field-placeholder">{SEARCH_PLACEHOLDER}</span>
        {shortcut && (
          <kbd class="search-field-kbd" aria-hidden="true">
            {shortcutHint(platformName())}
          </kbd>
        )}
      </button>
      {/* The crossed-out mic is inert (`aria-disabled`), yet a press on it
          still opens Search for typing: its click bubbles to this span. */}
      <span
        class="search-field-mic"
        onClick={canDictate ? undefined : () => open(false)}
      >
        <RoundButton
          state={canDictate ? 'mic' : 'mic-off'}
          label={canDictate ? 'Dictate' : 'Dictation is off'}
          small={small}
          onPress={() => open(true)}
        />
      </span>
    </div>
  );
}

function SearchInput({
  size = 'phone',
  value,
  onChange,
  onClose,
  inputRef,
  onKeyDown,
}: SearchInputProps): JSX.Element {
  const small = size === 'desktop';
  const field = useRef<HTMLInputElement | null>(null);
  const dictation = useDictation({ value, onValue: onChange, field });
  const { state } = dictation;

  useEffect(() => {
    field.current?.focus();
    if (takeSearchDictation()) dictation.start();
  }, []);

  const off = state === 'blocked' || state === 'unavailable';
  const listening = state === 'listening';
  const button = listening
    ? { state: 'stop' as const, label: 'Stop dictating', pressed: true }
    : state === 'asking'
      ? { state: 'asking' as const, label: 'Dictate', pressed: false }
      : off
        ? { state: 'mic-off' as const, label: 'Dictation is off' }
        : { state: 'mic' as const, label: 'Dictate', pressed: false };

  return (
    <div class="search-field-row">
      <div
        class={`search-field search-field-input search-field-${size}`}
        data-state={button.state}
      >
        <IconSearch />
        <input
          ref={(el) => {
            field.current = el;
            if (inputRef !== undefined) inputRef.current = el;
          }}
          type="search"
          class="search-field-text"
          placeholder={SEARCH_PLACEHOLDER}
          aria-label={SEARCH_PLACEHOLDER}
          value={value}
          enterKeyHint="search"
          onInput={(e) => onChange(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && listening) {
              e.preventDefault();
              e.stopPropagation();
              dictation.stop();
              return;
            }
            onKeyDown?.(e);
          }}
        />
        {value !== '' && (
          <button
            type="button"
            class="search-field-clear"
            aria-label="Clear the search"
            onClick={() => {
              onChange('');
              field.current?.focus();
            }}
          >
            <IconClose />
          </button>
        )}
        <RoundButton
          state={button.state}
          label={button.label}
          small={small}
          onPress={() => {
            dictation.toggle();
            field.current?.focus();
          }}
          {...(button.pressed !== undefined && { pressed: button.pressed })}
        />
      </div>
      <button
        type="button"
        class="icon-button search-field-close"
        aria-label="Close Search"
        onClick={onClose}
      >
        <IconClose />
      </button>
      {/* O-R2: a blocked mic says so under the box, as the Composer does. */}
      {state === 'blocked' && (
        <p class="search-field-line" aria-live="polite">
          {COMPOSER_LINES.blocked}
        </p>
      )}
    </div>
  );
}

/**
 * Dictation (spec §5 `dictate-button.tsx`, §6.16 R-DICT-1, R-API-12, D18).
 * `useDictation` is the Web Speech state machine every microphone runs on
 * (the Composer's round button, #910). `DictateButton` wraps a textarea: a microphone inside the box, bottom right, that
 * fills the box with what the person says. States: ready, asking (first
 * use), listening, blocked, not available (no button, a one-time tip on
 * touch devices). The browser turns speech into text; nothing is kept.
 */

import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import { useMediaQuery } from '../use-media-query.js';
import '../styles/dictate-button.css';
import { Hint } from './hint.js';
import { IconHelp, IconMic, IconStopSquare } from './icons.js';

export type DictateState =
  'ready' | 'asking' | 'listening' | 'blocked' | 'unavailable';

/** What the app reads from a recogniser (the DOM lib has no type for it). */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface RecognitionResultEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [index: number]: { transcript: string };
    };
  };
}

type RecognitionCtor = new () => Recognition;

/** The stored language choice (`bower:pref:dictationLang`); '' = the device's. */
export const DICTATION_LANG_KEY = 'bower:pref:dictationLang';
const USED_KEY = 'bower:dictation:used';
/** Silence that ends a dictation (spec §6.16). */
export const SILENCE_MS = 3000;

/** The recogniser's usual languages for the small menu. */
export const DICTATION_LANGUAGES: readonly string[] = [
  'en-GB',
  'en-US',
  'es-ES',
  'es-MX',
  'ca-ES',
  'fr-FR',
  'de-DE',
  'it-IT',
  'pt-BR',
  'pt-PT',
  'nl-NL',
];

/** The recogniser this browser has, or `undefined` (Firefox, some iPhones). */
export function getRecognitionCtor(): RecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? undefined;
}

export interface Inserted {
  value: string;
  caret: number;
}

/**
 * Puts `spoken` into `value` over the selection `start..end`, adding a
 * space on either side only when the neighbouring text needs one. Empty
 * speech changes nothing (returns `null`).
 */
export function insertSpoken(
  value: string,
  spoken: string,
  start: number,
  end: number,
): Inserted | null {
  const text = spoken.trim();
  if (text === '') return null;
  const from = Math.min(Math.max(start, 0), value.length);
  const to = Math.min(Math.max(end, from), value.length);
  const before = value.slice(0, from);
  const after = value.slice(to);
  const lead = before !== '' && !/\s$/.test(before) ? ' ' : '';
  const trail = after !== '' && !/^\s/.test(after) ? ' ' : '';
  return {
    value: before + lead + text + trail + after,
    caret: before.length + lead.length + text.length,
  };
}

/** "en-GB" as "English (UK)"; the tag itself when the browser can't name it. */
export function languageLabel(tag: string): string {
  try {
    const name = new Intl.DisplayNames(['en'], {
      type: 'language',
      languageDisplay: 'standard',
    }).of(tag);
    if (name === undefined) return tag;
    return name.replace('United Kingdom', 'UK').replace('United States', 'US');
  } catch (err) {
    console.error('Could not name a dictation language', err);
    return tag;
  }
}

function readLang(): string {
  try {
    const raw = localStorage.getItem(DICTATION_LANG_KEY);
    if (raw === null) return '';
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : '';
  } catch (err) {
    console.error('Could not read the dictation language', err);
    return '';
  }
}

function writeLang(tag: string): void {
  try {
    localStorage.setItem(DICTATION_LANG_KEY, JSON.stringify(tag));
  } catch (err) {
    console.error('Could not keep the dictation language', err);
  }
}

function hasUsedBefore(): boolean {
  try {
    return localStorage.getItem(USED_KEY) !== null;
  } catch (err) {
    console.error('Could not read the dictation flag', err);
    return true;
  }
}

function markUsed(): void {
  try {
    localStorage.setItem(USED_KEY, '1');
  } catch (err) {
    console.error('Could not keep the dictation flag', err);
  }
}

function isTouch(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch (err) {
    console.error('Could not read the pointer type', err);
    return false;
  }
}

/** From this width the app is the desktop layout ("click", not "tap"). */
export const DESKTOP_QUERY = '(min-width: 900px)';

/** Canon K-27: desktop says "Click", the phone says "Tap". */
export function pressWord(desktop: boolean): 'Click' | 'Tap' {
  return desktop ? 'Click' : 'Tap';
}

/** Whether the app is in its desktop layout (for `pressWord`). */
export function useDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}

/** What moves the dictation state machine (R-API-12). */
export type DictateEvent =
  /** The person pressed the mic; `firstUse` until the browser said yes once. */
  | { type: 'start'; firstUse: boolean }
  /** The recogniser started: the microphone is on. */
  | { type: 'started' }
  /** A stop, the end of speech, or the silence timer. */
  | { type: 'stop' }
  /** The recogniser failed with this code. */
  | { type: 'error'; error: string }
  /** This browser has no recogniser. */
  | { type: 'missing' };

let blockedThisSession = false;

/**
 * Whether the browser refused the microphone earlier in this session: every
 * box then starts crossed out (spec §3.12, "chosen once per session").
 */
export function dictationBlocked(): boolean {
  return blockedThisSession;
}

/** For tests: forget a refusal. */
export function resetDictationBlocked(): void {
  blockedThisSession = false;
}

/** Whether a recogniser error means the browser refused the microphone. */
export function isBlockedError(error: string): boolean {
  return error === 'not-allowed' || error === 'service-not-allowed';
}

/**
 * The dictation state machine: `ready | asking | listening | blocked |
 * unavailable`. Unavailable is final. Blocked holds until the browser
 * actually starts listening (the person allowed the microphone in the
 * browser's settings); the Composer draws it crossed out and inert.
 */
export function nextDictateState(
  state: DictateState,
  event: DictateEvent,
): DictateState {
  if (event.type === 'missing' || state === 'unavailable') return 'unavailable';
  switch (event.type) {
    case 'start':
      if (state === 'blocked') return 'blocked';
      return event.firstUse ? 'asking' : 'ready';
    case 'started':
      return 'listening';
    case 'stop':
      return state === 'blocked' ? 'blocked' : 'ready';
    case 'error':
      return isBlockedError(event.error) || state === 'blocked'
        ? 'blocked'
        : 'ready';
  }
}

/** A text field dictation writes into (keeps the caret). */
type DictationField = HTMLTextAreaElement | HTMLInputElement;

export interface DictationOptions {
  value: string;
  onValue: (next: string) => void;
  /** The field the words go into, for the caret. */
  field: { current: DictationField | null };
  /** Called whenever the microphone goes on or off. */
  onListening?: (on: boolean) => void;
}

export interface Dictation {
  state: DictateState;
  /** Words heard but not final yet. */
  interim: string;
  /** "Listening" / "Stopped", for a screen reader. */
  announce: string;
  /** A short sentence after a failure that is not a refusal, else ''. */
  failure: string;
  /** The chosen language tag; '' = the device's. */
  lang: string;
  /** Starts listening, or stops when already on. */
  toggle: () => void;
  start: () => void;
  stop: () => void;
  chooseLang: (tag: string) => void;
}

/**
 * The Web Speech dictation behind every microphone (R-API-12): the state
 * machine above, the language from Settings, a 3 s silence stop, and the
 * words put in at the caret. The browser turns speech into text; nothing
 * is kept. Leaving the screen (unmount) ends a dictation.
 */
export function useDictation({
  value,
  onValue,
  field,
  onListening,
}: DictationOptions): Dictation {
  const [state, setState] = useState<DictateState>(() =>
    getRecognitionCtor() === undefined
      ? 'unavailable'
      : blockedThisSession
        ? 'blocked'
        : 'ready',
  );
  const [interim, setInterim] = useState('');
  const [announce, setAnnounce] = useState('');
  const [failure, setFailure] = useState('');
  const [lang, setLang] = useState<string>(readLang);
  const desktop = useDesktop();
  const desktopRef = useRef(desktop);
  desktopRef.current = desktop;
  const rec = useRef<Recognition | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  const onValueRef = useRef(onValue);
  const caret = useRef<{ start: number; end: number } | null>(null);
  const pendingCaret = useRef<number | null>(null);
  const onListeningRef = useRef(onListening);
  valueRef.current = value;
  onValueRef.current = onValue;
  onListeningRef.current = onListening;

  const move = (event: DictateEvent): void => {
    setState((s) => nextDictateState(s, event));
  };

  const listening = state === 'listening';
  useEffect(() => {
    onListeningRef.current?.(listening);
    return () => onListeningRef.current?.(false);
  }, [listening]);

  useLayoutEffect(() => {
    const f = field.current;
    if (pendingCaret.current === null || f === null) return;
    f.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [value]);

  function clearTimer(): void {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }

  function detach(): void {
    const r = rec.current;
    rec.current = null;
    clearTimer();
    if (r === null) return;
    r.onstart = null;
    r.onresult = null;
    r.onerror = null;
    r.onend = null;
  }

  function finish(): void {
    detach();
    setInterim('');
    setAnnounce('Stopped');
    move({ type: 'stop' });
  }

  function stop(): void {
    const r = rec.current;
    if (r === null) return;
    finish();
    r.stop();
  }

  function armSilence(): void {
    clearTimer();
    timer.current = setTimeout(stop, SILENCE_MS);
  }

  function place(): { start: number; end: number } {
    const f = field.current;
    if (f !== null && document.activeElement === f) {
      caret.current = {
        start: f.selectionStart ?? f.value.length,
        end: f.selectionEnd ?? f.value.length,
      };
    }
    const end = valueRef.current.length;
    return caret.current ?? { start: end, end };
  }

  function begin(tag: string): void {
    const Ctor = getRecognitionCtor();
    if (Ctor === undefined) {
      move({ type: 'missing' });
      return;
    }
    setFailure('');
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = tag !== '' ? tag : navigator.language;
    r.onstart = (): void => {
      markUsed();
      blockedThisSession = false;
      move({ type: 'started' });
      setAnnounce('Listening');
      armSilence();
    };
    r.onresult = (event): void => {
      armSilence();
      let finals = '';
      let guess = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const first = result?.[0];
        if (result === undefined || first === undefined) continue;
        if (result.isFinal) finals += first.transcript;
        else guess += first.transcript;
      }
      setInterim(guess.trim());
      if (finals === '') return;
      const at = place();
      const next = insertSpoken(valueRef.current, finals, at.start, at.end);
      if (next === null) return;
      valueRef.current = next.value;
      caret.current = { start: next.caret, end: next.caret };
      pendingCaret.current = next.caret;
      onValueRef.current(next.value);
    };
    r.onerror = (event): void => {
      console.error('Dictation error', event.error);
      if (isBlockedError(event.error)) blockedThisSession = true;
      detach();
      setInterim('');
      setAnnounce('Stopped');
      move({ type: 'error', error: event.error });
      if (
        !isBlockedError(event.error) &&
        event.error !== 'no-speech' &&
        event.error !== 'aborted'
      ) {
        setFailure(
          `Dictation stopped. ${pressWord(desktopRef.current)} the mic to try again.`,
        );
      }
    };
    r.onend = (): void => {
      if (rec.current === r) finish();
    };
    rec.current = r;
    const f = field.current;
    const end = valueRef.current.length;
    caret.current =
      f !== null
        ? { start: f.selectionStart ?? end, end: f.selectionEnd ?? end }
        : { start: end, end };
    move({ type: 'start', firstUse: !hasUsedBefore() });
    try {
      r.start();
    } catch (err) {
      console.error('Dictation could not start', err);
      detach();
      move({ type: 'stop' });
      setFailure(
        `Dictation could not start. ${pressWord(desktopRef.current)} the mic to try again.`,
      );
    }
  }

  function start(): void {
    if (state === 'unavailable') return;
    begin(lang);
  }

  function toggle(): void {
    if (rec.current !== null) stop();
    else start();
  }

  function chooseLang(tag: string): void {
    writeLang(tag);
    setLang(tag);
    const r = rec.current;
    if (r === null) return;
    detach();
    r.abort();
    begin(tag);
  }

  // Leaving the screen (unmount) ends the dictation.
  useEffect(
    () => () => {
      const r = rec.current;
      detach();
      r?.abort();
    },
    [],
  );

  return {
    state,
    interim,
    announce,
    failure,
    lang,
    toggle,
    start,
    stop,
    chooseLang,
  };
}

export interface DictateButtonProps {
  value: string;
  onValue: (next: string) => void;
  /** The box's accessible name (also its visible label elsewhere). */
  label: string;
  id?: string;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  /** Extra class on the wrapper (a caller lays the box out). */
  class?: string;
  /** Extra class on the textarea. */
  inputClass?: string;
  /** Gives the caller the textarea (to focus it). */
  inputRef?: { current: HTMLTextAreaElement | null };
  onBlur?: () => void;
  /** Called whenever the microphone goes on or off. */
  onListening?: (on: boolean) => void;
}

/**
 * The older textarea with a microphone, kept for the boxes that adopt the
 * Composer in wave 2 (note editor, pile note, Add). New boxes use
 * `Composer` (`composer.tsx`), which shares `useDictation`.
 */
export function DictateButton({
  value,
  onValue,
  label,
  id,
  rows = 4,
  placeholder,
  maxLength,
  disabled = false,
  class: rootClass,
  inputClass,
  inputRef,
  onBlur,
  onListening,
}: DictateButtonProps): JSX.Element {
  const area = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const dictation = useDictation({
    value,
    onValue,
    field: area,
    ...(onListening !== undefined && { onListening }),
  });
  const { state, interim, announce, failure, lang } = dictation;
  const listening = state === 'listening';

  function onFocusOut(e: FocusEvent): void {
    const next = e.relatedTarget;
    if (next instanceof Node && root.current?.contains(next)) return;
    dictation.stop();
    setMenuOpen(false);
  }

  const available = state !== 'unavailable';
  const shown = lang !== '' ? lang : navigator.language;
  const menu: ReadonlyArray<{ tag: string; text: string }> = [
    { tag: '', text: 'Match my device' },
    ...DICTATION_LANGUAGES.map((tag) => ({ tag, text: languageLabel(tag) })),
  ];

  return (
    <div
      class={`dictate${listening ? ' dictate-listening' : ''}${rootClass !== undefined ? ` ${rootClass}` : ''}`}
      ref={root}
      onFocusOut={onFocusOut}
    >
      <div class="dictate-box">
        <textarea
          ref={(el): void => {
            area.current = el;
            if (inputRef !== undefined) inputRef.current = el;
          }}
          id={id}
          class={`dictate-input${available ? ' dictate-input-padded' : ''}${inputClass !== undefined ? ` ${inputClass}` : ''}`}
          onBlur={onBlur}
          aria-label={label}
          rows={rows}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          value={value}
          onInput={(e): void => onValue(e.currentTarget.value)}
        />
        {available && (
          <button
            type="button"
            class={`dictate-btn${state === 'asking' ? ' dictate-btn-asking' : ''}`}
            aria-pressed={listening}
            aria-label={listening ? 'Stop dictating' : 'Dictate'}
            disabled={disabled}
            onPointerDown={(e): void => e.preventDefault()}
            onClick={(): void => {
              setMenuOpen(false);
              dictation.toggle();
            }}
          >
            {listening ? <IconStopSquare /> : <IconMic />}
          </button>
        )}
      </div>
      <span class="dictate-live" role="status">
        {announce}
      </span>
      {listening && (
        <div class="dictate-line">
          {interim !== '' && <span class="dictate-interim">{interim}</span>}
          <span class="dictate-status">
            Listening in {languageLabel(shown)}
            {' · '}
            <button
              type="button"
              class="dictate-change"
              aria-expanded={menuOpen}
              onClick={(): void => setMenuOpen(!menuOpen)}
            >
              Change
            </button>
          </span>
        </div>
      )}
      {menuOpen && (
        <ul class="dictate-menu" role="menu" aria-label="Dictation language">
          {menu.map((item) => (
            <li key={item.tag} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={item.tag === lang}
                onClick={(): void => {
                  setMenuOpen(false);
                  dictation.chooseLang(item.tag);
                }}
              >
                {item.text}
              </button>
            </li>
          ))}
        </ul>
      )}
      {state === 'asking' && (
        <Hint id="dictate-asking" variant="state" icon={<IconHelp />}>
          Allow the microphone when your browser asks. Your browser turns speech
          into text; Bower never keeps the sound.
        </Hint>
      )}
      {state === 'blocked' && (
        <p class="dictate-alert" role="alert">
          The microphone is blocked. Allow it in your browser&apos;s site
          settings, then tap the mic again.
        </p>
      )}
      {failure !== '' && state === 'ready' && (
        <p class="dictate-alert" role="alert">
          {failure}
        </p>
      )}
      {state === 'unavailable' && isTouch() && (
        <Hint id="dictate-keyboard" variant="tip" icon={<IconHelp />}>
          Long text? Use the microphone key on your phone&apos;s keyboard to
          dictate.
        </Hint>
      )}
    </div>
  );
}

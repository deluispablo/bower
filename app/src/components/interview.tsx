/**
 * The first-run interview's own four screens (#198, spec D.2): one question
 * at a time, the bird asking in a bubble (same shape as onboarding's
 * `.onb-ask`/`.onb-bubble`), a row of chips that fill the answer and a free
 * text field for the owner's own words. Purely presentational: the answers
 * live here until "Finish" (`onFinish`), which is `routes/onboarding.tsx`'s
 * (and Settings') job to write through `vault-store.tsx`'s
 * `submitInterview`. "Skip the interview" (`onSkip`) leaves at any question
 * with nothing decided, so nothing is written.
 */

import type { Ref } from 'preact';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import {
  INTERVIEW_KEEP_CHIPS,
  INTERVIEW_TIP,
  interviewGreeting,
  interviewQuestionLabel,
  joinKeepAnswer,
  type InterviewAnswers,
} from '../interview.js';
import { useSession } from '../session.js';
import { Bird } from './bird.js';
import { Composer } from './composer.js';
import '../styles/interview.css';

const LANGUAGE_CHIPS = ['English', 'Spanish', 'English and Spanish'];

const AREA_CHIPS = [
  'Health',
  'Career',
  'Home',
  'Finance',
  'Family',
  'Learning',
];

const MAX_AREAS = 3;

/** Under the own-area field once three areas are picked (#999). */
const AREA_LIMIT_HINT = 'Up to three. Unpick one to add another.';

const MATCH_EXISTING = 'Match my existing notes';

/** Question 4's chips: "Match my existing notes" only when there are notes
 * to match, i.e. the person picked a folder they already had (#999). */
function styleChips(existingFolder: boolean): readonly string[] {
  const base = ['Short and plain', 'Detailed, with dates'];
  return existingFolder ? [...base, MATCH_EXISTING] : base;
}

export interface InterviewProps {
  /** The whole interview was finished: the last question's "Finish". */
  onFinish: (answers: InterviewAnswers) => void;
  /** "Skip the interview", at any question. */
  onSkip: () => void;
  /** A write from a previous "Finish" is in flight. */
  busy: boolean;
  /** What went wrong writing the previous "Finish", if anything. */
  error: string | null;
  /** Focus target when this screen appears (`onboarding.tsx`'s own
   * new-screen-focus effect, same as every other first-run step). */
  headingRef: Ref<HTMLHeadingElement>;
  /** The dots row for the first-run flow, shown instead of the interview's
   * own four; nothing when this is a standalone replay from Settings. */
  dots?: JSX.Element;
  /** The notes folder was one the person already had (or this is a replay
   * from Settings), so there are notes whose style question 4 can offer
   * to match. A Bower folder made seconds ago has none. */
  existingFolder: boolean;
}

interface ChipRowProps {
  chips: readonly string[];
  /** A chip is on when it equals this (single-select) or is included in it
   * (multi-select, `readonly string[]`). */
  value: string | readonly string[];
  onPick: (chip: string) => void;
}

function ChipRow({ chips, value, onPick }: ChipRowProps): JSX.Element {
  const isOn = (chip: string): boolean =>
    Array.isArray(value) ? value.includes(chip) : value === chip;
  return (
    <div class="interview-chips">
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          class={
            isOn(chip) ? 'chip interview-chip is-on' : 'chip interview-chip'
          }
          aria-pressed={isOn(chip)}
          onClick={() => onPick(chip)}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}

/** `picked` with `chip` toggled: removed if present, added at the end
 * otherwise (question 1 has no limit). */
function toggleChip(picked: readonly string[], chip: string): string[] {
  return picked.includes(chip)
    ? picked.filter((c) => c !== chip)
    : [...picked, chip];
}

/** `areas` with `name` toggled: removed if present, added (up to `MAX_AREAS`)
 * otherwise. */
function toggleArea(areas: readonly string[], name: string): string[] {
  if (areas.includes(name)) return areas.filter((a) => a !== name);
  if (areas.length >= MAX_AREAS) return [...areas];
  return [...areas, name];
}

/** The signed-in person's name, or nothing when there is no session (the
 * component tests mount the interview bare). */
function useFirstName(): string | undefined {
  try {
    return useSession().me?.name;
  } catch {
    return undefined;
  }
}

/**
 * The interview's answers live in its state as they are typed and are
 * written on Finish, so a `save` box has nothing more to do (#910).
 */
function keepAsTyped(): void {
  // Nothing to write until Finish.
}

export function Interview({
  onFinish,
  onSkip,
  busy,
  error,
  headingRef,
  dots,
  existingFolder,
}: InterviewProps): JSX.Element {
  const firstName = useFirstName();
  const [question, setQuestion] = useState(0);
  const [keepChips, setKeepChips] = useState<string[]>([]);
  const [keepText, setKeepText] = useState('');
  const [languages, setLanguages] = useState('');
  const [areas, setAreas] = useState<string[]>([]);
  const [customArea, setCustomArea] = useState('');
  const [titleStyle, setTitleStyle] = useState('');
  const [example, setExample] = useState('');

  const last = question === 3;
  const areaLimitReached = areas.length >= MAX_AREAS;

  function addCustomArea(): void {
    const name = customArea.trim();
    if (name === '' || areas.length >= MAX_AREAS || areas.includes(name)) {
      return;
    }
    setAreas([...areas, name]);
    setCustomArea('');
  }

  function next(): void {
    if (last) {
      onFinish({
        keep: joinKeepAnswer(keepChips, keepText),
        languages,
        areas,
        titleStyle,
        example,
      });
      return;
    }
    setQuestion((q) => q + 1);
  }

  function back(): void {
    setQuestion((q) => Math.max(0, q - 1));
  }

  return (
    <section class="onb interview">
      <div class="onb-ask">
        <Bird state="looking" size={64} />
        <p class="onb-bubble">{interviewGreeting(firstName)}</p>
      </div>
      <h1 ref={headingRef} tabIndex={-1} class="onb-title">
        Tell Bower about yourself
      </h1>

      <p class="interview-step">{interviewQuestionLabel(question)}</p>

      {question === 0 && (
        <div class="interview-question">
          <ChipRow
            chips={INTERVIEW_KEEP_CHIPS}
            value={keepChips}
            onPick={(chip) => setKeepChips((prev) => toggleChip(prev, chip))}
          />
          <Composer
            mode="save"
            rows={1}
            label="What you will keep here"
            placeholder="Or say it your way"
            value={keepText}
            onChange={setKeepText}
            onCommit={keepAsTyped}
          />
        </div>
      )}

      {question === 1 && (
        <div class="interview-question">
          <ChipRow
            chips={LANGUAGE_CHIPS}
            value={languages}
            onPick={setLanguages}
          />
          <Composer
            mode="save"
            rows={1}
            label="Languages your notes come in"
            placeholder="Or say it your way"
            value={languages}
            onChange={setLanguages}
            onCommit={keepAsTyped}
          />
        </div>
      )}

      {question === 2 && (
        <div class="interview-question">
          <ChipRow
            chips={[
              ...AREA_CHIPS,
              ...areas.filter((a) => !AREA_CHIPS.includes(a)),
            ]}
            value={areas}
            onPick={(chip) => setAreas((prev) => toggleArea(prev, chip))}
          />
          <div class="interview-area-add">
            <Composer
              mode="send"
              rows={1}
              label="Add your own area"
              placeholder="Add your own"
              commitLabel="Add the area"
              value={customArea}
              onChange={setCustomArea}
              onCommit={addCustomArea}
              disabled={areaLimitReached}
              hint={areaLimitReached ? AREA_LIMIT_HINT : null}
            />
          </div>
          {areas.length > 0 && (
            <p class="onb-note">Picked: {areas.join(', ')}</p>
          )}
        </div>
      )}

      {question === 3 && (
        <div class="interview-question">
          <ChipRow
            chips={styleChips(existingFolder)}
            value={titleStyle}
            onPick={setTitleStyle}
          />
          <Composer
            mode="save"
            rows={1}
            label="How you like titles and tags"
            placeholder="Or say it your way"
            value={titleStyle}
            onChange={setTitleStyle}
            onCommit={keepAsTyped}
          />
          <Composer
            mode="save"
            rows={1}
            label="An example title or tag"
            placeholder="An example, e.g. 2026-09-27 Dentist"
            value={example}
            onChange={setExample}
            onCommit={keepAsTyped}
          />
        </div>
      )}

      <p class="interview-tip">{INTERVIEW_TIP}</p>

      {error !== null && <p class="auth-error">{error}</p>}

      <div class="auth-actions">
        <button
          type="button"
          class="button onb-primary"
          disabled={busy}
          onClick={next}
        >
          {last ? (busy ? 'Saving…' : 'Finish') : 'Next'}
        </button>
        <div class="interview-secondary">
          {question > 0 && (
            <button
              type="button"
              class="button-link"
              disabled={busy}
              onClick={back}
            >
              Back
            </button>
          )}
          <button
            type="button"
            class="button-link"
            disabled={busy}
            onClick={onSkip}
          >
            Skip
          </button>
        </div>
      </div>

      {/* One row of dots: the first-run flow's own when it passes them,
          the interview's four otherwise (the Settings replay). */}
      {dots ?? (
        <div class="interview-dots" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} class={i === question ? 'is-on' : undefined} />
          ))}
        </div>
      )}
    </section>
  );
}

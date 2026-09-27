/**
 * The Tell Bower composer (spec §6, Tell Bower row): the example chips, the
 * message box with the bird singing while it holds focus and text, and the
 * send button. Purely presentational — sending the message, the offline
 * reason and any error stay with the caller (`routes/tell.tsx` today; the
 * Home inline composer of #143 next), which is why the props are just the
 * value, the submit callback and whether sending is currently allowed.
 *
 * The bird sings only while the box is both focused and non-empty; it goes
 * back to looking the moment either stops being true, including on blur.
 */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import { Bird } from './bird.js';
import { IconSend } from './icons.js';

interface Example {
  label: string;
  text: string;
}

const EXAMPLES: Example[] = [
  {
    label: 'A rule',
    text: 'From now on, file recipes under Cooking and tag them #recipe',
  },
  {
    label: 'A task',
    text: 'Summarise the PDF I added today in three bullet points',
  },
  {
    label: 'A question',
    text: 'What did I save about trip planning last month?',
  },
];

export interface TellComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** True when sending is not currently possible (offline, no folder yet, or a send already in flight). */
  disabled: boolean;
  /** A send is in flight: swaps the send button's accessible name. */
  sending?: boolean;
}

export function TellComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  sending = false,
}: TellComposerProps): JSX.Element {
  const [focused, setFocused] = useState(false);
  const singing = focused && value.trim() !== '';

  return (
    <div class="tell-composer">
      <div class="tell-examples">
        {EXAMPLES.map((example) => (
          <button
            key={example.label}
            type="button"
            class="chip"
            onClick={() => onChange(example.text)}
          >
            {example.label}
          </button>
        ))}
      </div>
      <div class="tell-composer-row">
        <Bird state={singing ? 'singing' : 'looking'} size={64} />
        <textarea
          class="tell-textarea"
          aria-label="Message"
          placeholder="For example: file every receipt under Finance"
          value={value}
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
          }}
          onInput={(event) => {
            onChange((event.target as HTMLTextAreaElement).value);
          }}
        />
        <button
          type="button"
          class="button tell-send"
          aria-label={sending ? 'Sending' : 'Send'}
          disabled={disabled}
          aria-disabled={disabled}
          onClick={onSubmit}
        >
          <IconSend />
        </button>
      </div>
    </div>
  );
}

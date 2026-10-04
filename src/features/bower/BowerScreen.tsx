import { useRef, useState } from 'react';
import { shortDay } from '@/app/words';
import { report } from '@/ui/report';
import { startRun } from '@/features/tidy/start-run';
import { useRequests, useRules, useRun, useSources } from '@/data/provider';
import { BowerError } from '@/data/types';
import { PoseBower, type Pose } from '@/bird/Bower';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { toast } from '@/ui/toast';
import { useUi } from '@/app/ui-store';
import { RULE_EXAMPLES } from '@/data/examples';
import { canDictate, dictate } from './dictation';
import { isRunning } from '@/features/tidy/run-words';
import s from './bower.module.css';


/**
 * Talking to Bower: a request for the next tidy-up ("put my visa papers
 * together") or a rule it keeps ("receipts go to Money, by month").
 * Either becomes a note in the inbox that Bower reads.
 */
export function BowerScreen() {
  const { vault, runs } = useSources();
  const { data: rules } = useRules();
  const { data: run } = useRun();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'request' | 'rule'>('request');
  const { data: requests } = useRequests();
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const pose: Pose = listening ? 'wait' : typing ? 'wait' : isRunning(run) ? 'write' : 'idle';

  const send = async (): Promise<void> => {
    const t = text.trim();
    if (!t) return;
    try {
      if (kind === 'rule') {
        await vault.addRule(t);
        toast('Saved as you wrote it. Bower words it clearly in the next tidy-up.');
      } else await vault.addRequest(t);
      setText('');
    } catch (e) {
      report(e, 'That did not send. Try again.');
    }
  };

  return (
    <div className={s.page}>
      <div className={s.hero}>
        <PoseBower pose={pose} size={120} />
        <div>
          <h1 className={s.title}>Tell Bower</h1>
          <p className="muted">Ask for something in the next tidy-up, or give it a rule to keep.</p>
        </div>
      </div>
      <form
        className={s.composer}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className={s.kinds} role="radiogroup" aria-label="What is it?">
          <button type="button" role="radio" aria-checked={kind === 'request'} onClick={() => setKind('request')}>
            A request
          </button>
          <button type="button" role="radio" aria-checked={kind === 'rule'} onClick={() => setKind('rule')}>
            A rule
          </button>
        </div>
        <textarea
          rows={3}
          aria-label={kind === 'rule' ? 'The rule' : 'Your request'}
          placeholder={kind === 'rule' ? 'Receipts go to Money, by month' : 'Put my visa papers together and tell me what is missing'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send();
          }}
        />
        {kind === 'rule' && (
          <div className={s.samples} aria-label="Try one">
            {RULE_EXAMPLES.map((r) => (
              <button key={r} type="button" onClick={() => setText(r)}>
                {r}
              </button>
            ))}
          </div>
        )}
        <div className={s.composerFoot}>
          {canDictate() ? (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              aria-pressed={listening}
              onClick={() => {
                if (listening) {
                  stopRef.current?.();
                  return;
                }
                const before = text ? `${text.trim()} ` : '';
                setListening(true);
                stopRef.current = dictate(
                  (t) => setText(before + t),
                  (err) => {
                    setListening(false);
                    if (err === 'not-allowed') toast('Bower cannot use the microphone. Allow it in the browser.');
                    else if (err && err !== 'no-speech' && err !== 'aborted') toast('Dictation stopped. Try again.');
                  },
                );
              }}
            >
              <Icon name="mic" size={18} /> {listening ? 'Listening… tap to stop' : 'Speak'}
            </Button>
          ) : (
            <span />
          )}
          <Button size="sm" type="submit" disabled={!text.trim()}>
            <Icon name="send" size={16} /> {kind === 'rule' ? 'Keep this rule' : 'Send'}
          </Button>
        </div>
      </form>

      {(requests ?? []).length > 0 && (
        <section className={s.sent} aria-labelledby="asked">
          <h2 id="asked" className={s.h2}>
            What you asked
          </h2>
          {(requests ?? []).map((m, i) => (
            <div key={m.id} className={s.bubble}>
              <p>{m.text}</p>
              <p className={s.bubbleSub}>{m.done ?? 'Waiting for the next tidy-up.'}</p>
              {i === 0 && !m.done && !isRunning(run) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void startRun(runs, 'instructions').then(
                      () => useUi.getState().setTidy(true),
                      (e: unknown) => toast(e instanceof BowerError ? e.message : 'It did not start. Try again in a minute.'),
                    )
                  }
                >
                  Let Bower do it now
                </Button>
              )}
            </div>
          ))}
        </section>
      )}

      <section className={s.rules} aria-labelledby="rules">
        <h2 id="rules" className={s.h2}>
          Your rules
        </h2>
        <p className="muted" style={{ fontSize: 15, marginBottom: 6 }}>
          Bower follows these in every tidy-up. They are kept with your notes, in your Bower folder.
        </p>
        <ul>
          {(rules ?? []).map((r) => (
            <li key={r.id} className={r.pending ? s.pending : undefined}>
              <span className={s.ruleText}>{r.pending ? `"${r.text}"` : r.text}</span>
              {r.pending ? (
                <span className={s.pendingNote}>Waiting for the next tidy-up, where Bower words it clearly.</span>
              ) : (
                r.yourWords && <span className="muted">You wrote: "{r.yourWords}"</span>
              )}
              <span className="muted">Added {shortDay(r.since)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

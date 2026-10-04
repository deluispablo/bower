import { useRef, useState } from 'react';
import { useRules, useRun, useSources } from '@/data/provider';
import { BowerError } from '@/data/types';
import { PoseBower, type Pose } from '@/bird/Bower';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { toast } from '@/ui/toast';
import { useUi } from '@/app/ui-store';
import { SAMPLE_RULES } from '@/data/demo/fixture';
import { canDictate, dictate } from './dictation';
import { isRunning } from '@/features/tidy/run-words';
import s from './bower.module.css';

interface Sent {
  id: number;
  text: string;
  kind: 'request' | 'rule';
  at: number;
}

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
  const [sent, setSent] = useState<Sent[]>([]);
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const pose: Pose = listening ? 'wait' : typing ? 'wait' : isRunning(run) ? 'write' : 'idle';

  const send = async (): Promise<void> => {
    const t = text.trim();
    if (!t) return;
    try {
      if (kind === 'rule') await vault.addRule(t);
      setSent((x) => [{ id: Date.now(), text: t, kind, at: Date.now() }, ...x]);
      setText('');
    } catch (e) {
      toast(e instanceof BowerError ? e.message : 'That did not send. Try again.');
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
            {SAMPLE_RULES.map((r) => (
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

      {sent.length > 0 && (
        <section className={s.sent} aria-label="Sent">
          {sent.map((m, i) => (
            <div key={m.id} className={s.bubble}>
              <p>{m.text}</p>
              <p className={s.bubbleSub}>
                {m.kind === 'rule' ? 'Saved as you wrote it. In the next tidy-up Bower words it clearly in your rules, and keeps your words next to it.' : 'In your inbox. Bower does it in the next tidy-up.'}
              </p>
              {i === 0 && !isRunning(run) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void runs.start('instructions').then(
                      () => useUi.getState().setTidy(true),
                      (e: unknown) => toast(e instanceof BowerError ? e.message : 'It did not start. Try again in a minute.'),
                    )
                  }
                >
                  Let Bower read it now
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
          Bower follows these in every tidy-up. They live in Rules.md in your folder.
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
              <span className="muted">Added {new Date(r.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

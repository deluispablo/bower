import { LoadError } from '@/ui/LoadError';
import { useRef, useState } from 'react';
import { shortDay } from '@/app/words';
import { report, undoToast } from '@/ui/report';
import { startRun } from '@/features/tidy/start-run';
import { Link } from 'react-router';
import { noteRoute } from '@/app/paths';
import { useRequests, useRulesSection, useRun, useSources } from '@/data/provider';
import { PoseBower, type Pose } from '@/bird/Bower';
import { Segmented } from '@/ui/Segmented';
import { Button } from '@/ui/Button';
import { fieldBox, Textarea } from '@/ui/Field';
import { Icon } from '@/ui/Icon';
import { toast } from '@/ui/toast';
import { useUi } from '@/app/ui-store';
import { RULE_EXAMPLES } from '@/data/examples';
import { canDictate, dictate } from './dictation';
import { isRunning } from '@/features/tidy/run-words';
import { Inline, Markdown } from '@/features/note/markdown';
import { useNoteLink } from '@/features/note/note-link';
import { useIsDesktop } from '@/ui/media';
import { FailedChanges } from './FailedChanges';
import s from './bower.module.css';


/**
 * Talking to Bower: a request for the next tidy-up ("put my visa papers
 * together") or a rule it keeps ("receipts go to Money, by month").
 * Either becomes a note in the inbox that Bower reads.
 */
export function BowerScreen() {
  const { vault, runs } = useSources();
  const rulesState = useRulesSection();
  const { rules, prose } = rulesState;
  const runState = useRun();
  const { data: run } = runState;
  const [text, setText] = useState('');
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [kind, setKind] = useState<'request' | 'rule'>('request');
  const link = useNoteLink();
  const requestsState = useRequests();
  const { data: requests } = requestsState;
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  /** One id per intended request: the same words sent again after a wait are that request, never a second one. */
  const intent = useRef<{ text: string; id: string } | null>(null);
  // The phone has no side panel: what failed shows here, where Bower's panel content lives on a phone.
  const desktop = useIsDesktop();
  const pose: Pose = listening ? 'wait' : typing ? 'wait' : isRunning(run) ? 'write' : 'idle';

  const send = async (): Promise<void> => {
    const t = text.trim();
    if (!t || saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      if (kind === 'rule') {
        await vault.addRule(t);
        toast('Saved as you wrote it. Bower words it clearly in the next tidy-up.');
      } else {
        if (intent.current?.text !== t) intent.current = { text: t, id: crypto.randomUUID() };
        await vault.addRequest(t, intent.current.id);
      }
      intent.current = null;
      setText('');
      composerRef.current?.focus();
    } catch (e) {
      report(e, 'That did not send. Try again.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const removeRule = async (id: string): Promise<void> => {
    const pressed = document.activeElement;
    try {
      const undo = await vault.removeRule(id);
      // The pressed row is leaving: the keyboard goes to the page now, not after a render that may land later.
      // Only if the person has not moved on while the removal waited.
      const now = document.activeElement;
      if (!now || now === document.body || now === pressed) document.getElementById('main')?.focus();
      undoToast('Rule removed. Bower stops following it from the next tidy-up.', undo, () => 'The rule is back.');
    } catch (e) {
      report(e, 'That did not work. Try again.');
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
      <LoadError state={runState} />
      {!desktop && <FailedChanges />}
      <form
        className={`${s.composer} ${fieldBox({ stack: true })}`}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Segmented
          label="What is it?"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'request', label: 'A request' },
            { value: 'rule', label: 'A rule' },
          ]}
        />
        <Textarea
          inBox
          ref={composerRef}
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
          <Button size="sm" type="submit" disabled={busy || !text.trim()}>
            <Icon name="send" size={16} /> {kind === 'rule' ? 'Keep this rule' : 'Send'}
          </Button>
        </div>
      </form>

      <LoadError state={requestsState} />
      {(requests ?? []).length > 0 && (
        <section className={s.sent} aria-labelledby="asked">
          <h2 id="asked" className={s.h2}>
            What you asked
          </h2>
          {(requests ?? []).map((m, i) => (
            <div key={m.id} className={s.bubble}>
              <p>{m.text}</p>
              {/* What Bower did, with links to what it names (C09). */}
              <p className={s.bubbleSub}>{m.done ? <Inline text={m.done} link={link} /> : 'Waiting for the next tidy-up.'}</p>
              {i === 0 && !m.done && !isRunning(run) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void startRun(runs, 'instructions').then(
                      () => useUi.getState().setTidy(true),
                      (e: unknown) => report(e, 'It did not start. Try again in a minute.'),
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
        <LoadError state={rulesState} />
        {prose && (
          <>
            <h3 id="rules-written" className={s.label}>
              Written in your rules note
            </h3>
            <div role="region" aria-labelledby="rules-written" className={s.written}>
              <Markdown text={prose} link={link} headingLevel={4} />
            </div>
            <div className={s.proseFoot}>
              <span className="muted">Bower follows these too. To change them, edit the note.</span>
              <Link to={noteRoute('Rules.md')}>Open your rules note</Link>
            </div>
            {!!rules?.length && (
              <h3 className={s.label}>Added in Bower</h3>
            )}
          </>
        )}
        <ul className={s.ruleList}>
          {(rules ?? []).map((r) => (
            <li key={r.id} className={r.pending ? s.pending : undefined}>
              <span className={s.ruleText}>{r.pending ? `"${r.text}"` : r.text}</span>
              {r.pending ? (
                <span className={s.pendingNote}>Waiting for the next tidy-up, where Bower words it clearly.</span>
              ) : (
                r.yourWords && <span className="muted">You wrote: "{r.yourWords}"</span>
              )}
              <span className={s.ruleFoot}>
                <span className="muted">Added {shortDay(r.since)}</span>
                <Button size="sm" variant="ghost" aria-label={`Remove the rule: ${r.text}`} onClick={() => void removeRule(r.id)}>
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

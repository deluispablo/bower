import { useId } from 'react';
import { useNavigate } from 'react-router';
import { useUi } from '@/app/ui-store';
import { FIRST_TIDY_STEPS, type FirstTidyStep } from '@/data/contracts/first-tidy';
import { useSources } from '@/data/provider';
import type { RunState } from '@/data/types';
import { hasReplay } from '@/features/tidy/run-words';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { keepFirstTidyStep, useFirstTidy, useFirstTidyFailure } from './useFirstTidy';
import s from './home.module.css';

type Step = { key: FirstTidyStep; title: string; text: string; action: { label: string; go: () => void } | null };

/** The first tidy-up in three steps, above the Inbox until its report has been opened. Only the current step acts. */
export function FirstTidyChecklist({ run }: { run: RunState | null | undefined }) {
  const { data } = useFirstTidy();
  const failure = useFirstTidyFailure((f) => f.failure);
  const { vault } = useSources();
  const { setTidy, startReplay } = useUi();
  const navigate = useNavigate();
  const id = useId();
  if (!data || data.reviewed) return null;
  const current = FIRST_TIDY_STEPS.find((k) => !data[k]);
  const done = run?.phase === 'done' ? run : null;
  const steps: Step[] = [
    { key: 'added', title: 'Add a few things', text: 'Photos, PDFs, links or notes, from your phone or computer.', action: { label: 'Add a pile', go: () => void navigate('/add') } },
    { key: 'started', title: 'Press Tidy up', text: 'Bower reads each one, names it and files it. About 5 minutes; you can close the app.', action: { label: 'Tidy up', go: () => setTidy(true) } },
    // While a run goes or after it failed, the running and stopped cards act; step 3 waits for a finished run.
    { key: 'reviewed', title: 'See where it went', text: 'Bower shows you everything it did, and asks if it is unsure.',
      action: done ? { label: 'See the report', go: () => (hasReplay(done) ? startReplay(done.id) : setTidy(true, done.id)) } : null },
  ];
  return (
    <section className={s.card} aria-labelledby={id}>
      <h2 id={id} className={s.cardTitle}>Your first tidy-up</h2>
      <ol className={s.steps}>
        {steps.map((step, i) => (
          <li key={step.key} className={data[step.key] ? s.stepDone : undefined} aria-current={step.key === current ? 'step' : undefined}>
            <span className={s.stepMark} aria-hidden="true">{data[step.key] ? <Icon name="check" size={16} stroke={2.6} /> : i + 1}</span>
            <div>
              <p className={s.stepTitle}>
                {step.title}
                {data[step.key] && <span className="sr-only"> Done</span>}
              </p>
              <p className="muted">{step.text}</p>
              {step.key === current && step.action && (
                <Button size="sm" className={s.stepButton} onClick={step.action.go}>{step.action.label}</Button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {failure && !data[failure.step] && (
        <div className={s.row2}>
          <p role="alert" className={s.unfinished}>{failure.message}</p>
          <Button size="sm" onClick={() => void keepFirstTidyStep(vault, failure.step)}>Try again</Button>
        </div>
      )}
    </section>
  );
}

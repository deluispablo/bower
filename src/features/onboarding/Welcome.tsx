import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useSources } from '@/data/provider';
import { BowerError, PARA_ROOTS, type ParaRoot } from '@/data/types';
import { paraColor } from '@/app/paths';
import { PoseBower } from '@/bird/Bower';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { toHeading } from '@/ui/focus';
import { LoadError } from '@/ui/LoadError';
import s from './welcome.module.css';

const MEANING: Record<ParaRoot, string> = {
  Inbox: 'Where new things wait for a tidy-up',
  Projects: 'Things with an end, like a flat hunt',
  Areas: 'Things that go on: home, money, health',
  Resources: 'Things for later: recipes, manuals',
  Archive: 'Things that are done',
};

const STEPS = [
  { title: 'Throw it in', text: 'Add photos, PDFs, links and notes as they come. Group the ones that belong together and say what they are.' },
  { title: 'Press Tidy up', text: 'Bower reads each one, names it, writes what matters into your notes and files it. About 5 minutes; close the app if you like.' },
  { title: 'Find it later', text: 'Everything lives in your own Drive, in folders you can open anywhere, in any notes app.' },
];

const TOURED = 'bower:toured';
function markToured(): void {
  cameBack = false;
  try {
    sessionStorage.setItem(TOURED, '1');
  } catch {
    // expected: Without storage, Back may show the tour once more.
  }
}
function toured(): boolean {
  try {
    return sessionStorage.getItem(TOURED) === '1';
  } catch {
    // expected: storage may be blocked (a private window); the default holds.
    return false;
  }
}

/**
 * First sign-in: Bower makes the folder, then shows the three ideas. Once
 * toured, Welcome goes Home, but only while the folder exists: with no
 * folder, Home would send back here (a loop), so the folder is made again.
 */
/** The folder was found, not made: kept while the welcome remounts once the folder is ready. */
let cameBack = false;

export function Welcome({ missing = false }: { missing?: boolean }) {
  if (toured() && !missing) return <Navigate to="/" replace />;
  return <WelcomeSteps />;
}

function WelcomeSteps() {
  const { session } = useSources();
  const nav = useNavigate();
  const [made, setMade] = useState<ParaRoot[]>([]);
  const [ready, setReady] = useState(false);
  const [back, setBack] = useState(cameBack);
  // Each step is a history entry, so the phone's back button goes back a step.
  const [params, setParams] = useSearchParams();
  const step = Math.min(STEPS.length - 1, Math.max(-1, Number(params.get('step') ?? -1)));
  // Finishing replaces the entry and marks the tour done, so Back after it does not show it again.
  const setStep = (n: number): void => setParams({ step: String(n) });
  const started = useRef(false);
  const [error, setError] = useState<BowerError | null>(null);
  const progressId = useId();
  // A step change (not the first render of a deep link) puts the keyboard on the new heading.
  const title = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    if (title.current) toHeading(title.current);
  }, [step]);

  // One attempt at a time: the mount starts it once, and LoadError's Try again starts it again after a failure.
  const attempt = useCallback(() => {
    setError(null);
    void session
      .folderState()
      .then(async (st) => {
        if (st === 'ready') {
          setMade([...PARA_ROOTS]);
          setReady(true);
          return;
        }
        const { found } = await session.createFolder((r) => setMade((m) => [...m, r]));
        cameBack = found;
        setBack(found);
        setReady(true);
      })
      .catch((e: unknown) => {
        console.error(e);
        setError(e instanceof BowerError ? e : new BowerError('unknown', 'Your Bower folder could not be opened. Try again.'));
      });
  }, [session]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    attempt();
  }, [attempt]);

  if (step >= 0) {
    const st = STEPS[step];
    return (
      <main className={s.page}>
        <p id={progressId} className="sr-only">{`Step ${step + 1} of ${STEPS.length}`}</p>
        <div className={s.dots} aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={i === step ? s.dotOn : ''} />
          ))}
        </div>
        <PoseBower pose={(['carry', 'read', 'proud'] as const)[step] ?? 'idle'} size={150} />
        <h1 ref={title} aria-describedby={progressId} className={s.title}>{st?.title}</h1>
        <p className={s.text}>{st?.text}</p>
        <div className={s.foot}>
          <Button block onClick={() => (step + 1 < STEPS.length ? setStep(step + 1) : (markToured(), nav('/add', { replace: true })))}>
            {step + 1 < STEPS.length ? 'Next' : 'Add your first pile'}
          </Button>
          <Button variant="ghost" block onClick={() => (markToured(), nav('/', { replace: true }))}>
            {step + 1 < STEPS.length ? 'Skip' : 'Look around first'}
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className={s.page}>
      <div className={s.head}>
        <PoseBower pose={ready ? 'proud' : 'carry'} size={96} />
        <div>
          <h1 ref={title} className={s.title}>{back ? 'Welcome back' : ready ? 'Your folder is ready' : 'Making your Bower folder'}</h1>
          <p className="muted">{back ? 'Your Bower folder is still in your Drive, with everything in it.' : ready ? 'It is called Bower, in My Drive.' : 'In your Google Drive. A few seconds.'}</p>
        </div>
      </div>
      <ul className={s.folders} aria-live="polite">
        {PARA_ROOTS.map((r) => (
          <li key={r} className={made.includes(r) ? s.in : s.out}>
            <span className={s.ftile} style={{ color: paraColor(r) }}>
              <Icon name="folder" size={20} />
            </span>
            <span className={s.fmain}>
              <span className={s.fname}>{r}</span>
              <span className="muted">{MEANING[r]}</span>
            </span>
            {made.includes(r) && <Icon name="check" size={20} stroke={2.4} className={s.check} />}
          </li>
        ))}
      </ul>
      <div className={s.foot}>
        <LoadError state={{ error, reload: attempt }} />
        <Button block disabled={!ready} onClick={() => setStep(0)}>
          Show me around
        </Button>
      </div>
    </main>
  );
}

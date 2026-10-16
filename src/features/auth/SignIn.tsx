import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useSources } from '@/data/provider';
import { PoseBower } from '@/bird/Bower';
import { BowerMark } from '@/ui/Icon';
import { Court } from '@/bird/Court';
import s from './signin.module.css';

function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.2C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.4 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/** What the Worker's callback says, as one word in the address (TL-P3-07). */
const SIGNIN_SENTENCES: Record<string, string> = {
  cancelled: 'Sign-in was cancelled.',
  failed: "Bower couldn't sign you in. Try again.",
};

export function SignIn() {
  const [params, setParams] = useSearchParams();
  const { session } = useSources();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Said once, then the parameter leaves the address so a reload does not repeat it.
  const [returned] = useState(() => SIGNIN_SENTENCES[params.get('signin') ?? ''] ?? null);
  useEffect(() => {
    if (!params.has('signin')) return;
    const next = new URLSearchParams(params);
    next.delete('signin');
    setParams(next, { replace: true });
  }, [params, setParams]);
  // Arriving from "Delete my account": said once.
  const [bye] = useState(() => {
    try {
      return sessionStorage.getItem('bower:bye');
    } catch {
      // expected: no storage; nothing to say.
      return null;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.removeItem('bower:bye');
    } catch {
      // expected: no storage; nothing was kept.
    }
  }, []);
  return (
    <div className={s.wrap}>
      <div className={s.art}>
        <span className={s.brand}>
          <BowerMark size={30} />
          <span>Bower</span>
        </span>
        <div className={s.court}>
          <PoseBower pose="idle" size={180} className={s.bird} />
          <Court />
        </div>
      </div>
      <main className={s.panel}>
        {bye && (
          <p className={s.bye} role="status">
            {bye === 'signed-out' ? 'Signed out. This device forgot you.' : 'Your account is gone. Your notes stay in your Drive.'}
          </p>
        )}
        <h1 className={s.hero}>Your Drive, tidied by a bowerbird.</h1>
        <p className={s.lead}>Throw in photos, PDFs, links and notes. Bower names each one and files it in a folder of your own Drive.</p>
        <button
          type="button"
          className={s.google}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            session.signIn().catch((e: unknown) => {
              console.error(e);
              setBusy(false);
              setError('Google did not answer. Try again.');
            });
          }}
        >
          <GoogleG />
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </button>
        {(error ?? returned) && (
          <p role="alert" className={s.error}>
            {error ?? returned}
          </p>
        )}
        <p className={s.small}>Bower makes one folder in your Drive and works only there. Only people invited to this Bower can sign in.</p>
        <nav aria-label="About" className={s.links}>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <a href="https://github.com/deluispablo/bower" rel="noreferrer">
            Run your own Bower
          </a>
        </nav>
      </main>
    </div>
  );
}

import { Link } from 'react-router';
import { BowerMark } from '@/ui/Icon';
import s from './legal.module.css';

/** Plain words on what Bower keeps and what it does not. Readable signed in or out. */
export function Privacy() {
  return (
    <main className={s.page}>
      <Top />
      <h1>Privacy</h1>
      <p>Bower files what you save into a folder of your own Google Drive. Your notes and files stay there; Bower does not keep a copy anywhere else.</p>
      <h2>What Bower keeps</h2>
      <ul>
        <li>Your name and email, to know who you are.</li>
        <li>A key that lets Bower reach its own folder in your Drive, stored encrypted.</li>
        <li>Whether a tidy-up is running and how it ended, without any content.</li>
      </ul>
      <h2>What Bower never does</h2>
      <ul>
        <li>Read anything in your Drive outside its own folder.</li>
        <li>Keep your notes or files on its servers.</li>
        <li>Write passport, ID or account numbers into your notes.</li>
        <li>Look things up on the web, unless you turn that on in Settings.</li>
      </ul>
      <h2>Leaving</h2>
      <p>Delete the app in Settings and Bower forgets you. Your folder stays in your Drive, with everything in it.</p>
    </main>
  );
}

export function Terms() {
  return (
    <main className={s.page}>
      <Top />
      <h1>Terms</h1>
      <p>This Bower is run by the person who invited you, for themselves and the people they invite. Use it for your own things.</p>
      <ul>
        <li>Your folder and everything in it are yours.</li>
        <li>Bower can get a name or a folder wrong. Nothing is deleted: every move can be undone, and what Bower set aside waits in the inbox.</li>
        <li>The person who runs this Bower can stop it at any time; your folder stays in your Drive.</li>
      </ul>
    </main>
  );
}

function Top() {
  return (
    <p className={s.top}>
      <Link to="/" className={s.brand}>
        <BowerMark size={26} /> Bower
      </Link>
    </p>
  );
}

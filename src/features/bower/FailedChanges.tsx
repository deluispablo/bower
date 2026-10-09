import { useFailedChanges, useSources } from '@/data/provider';
import { report } from '@/ui/report';
import { focusMain } from '@/ui/focus';
import { Button } from '@/ui/Button';
import s from './bower.module.css';

/**
 * What failed: each change whose line Drive refused while nobody waited on it, with what is true about it, until it is
 * put away (then never shown again). One component for both layouts: the desktop's side panel and the phone's Bower tab.
 */
export function FailedChanges() {
  const { data: failed } = useFailedChanges();
  const { vault } = useSources();
  // Seen once: put away, a change Bower could not note is not shown again.
  const putAway = (id: string): void => void vault.putAwayFailed?.(id).then(focusMain, (e: unknown) => report(e, 'That did not work. Try again.'));
  return (
    <>
      {(failed ?? []).map((f) => (
        <div key={f.id} className={s.panelCard}>
          <strong>{f.sentence}</strong>
          <span className="muted">{f.what}</span>
          <Button size="sm" variant="ghost" onClick={() => putAway(f.id)}>
            Put it away
          </Button>
        </div>
      ))}
    </>
  );
}

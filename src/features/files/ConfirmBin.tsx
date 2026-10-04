import { displayName, nameOf } from '@/data/tree';
import { useUi } from '@/app/ui-store';
import { goWithIt } from '@/app/words';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { useFileActions } from './file-actions';
import s from './files.module.css';

/** A folder with things in it goes to the Bin only after a yes. */
export function ConfirmBin() {
  const { confirmBin, setConfirmBin } = useUi();
  const act = useFileActions();
  const name = confirmBin ? displayName(nameOf(confirmBin.path)) : '';
  return (
    <Sheet open={!!confirmBin} onOpenChange={(o) => !o && setConfirmBin(null)} title={`Put ${name} in the Bin?`}>
      <p className="muted">{confirmBin ? goWithIt(confirmBin.count, confirmBin.nested) : ''}</p>
      <div className={s.confirmRow}>
        <Button variant="ghost" onClick={() => setConfirmBin(null)}>
          Keep it
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            const p = confirmBin?.path;
            setConfirmBin(null);
            if (p) void act.trash(p);
          }}
        >
          Put it in the Bin
        </Button>
      </div>
    </Sheet>
  );
}

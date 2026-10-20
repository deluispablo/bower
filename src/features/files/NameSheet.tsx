import { LoadError } from '@/ui/LoadError';
import { Bone, Skeleton } from '@/ui/Skeleton';
import { useTree } from '@/data/provider';
import { findNode, thingName, nameOf, parentOf } from '@/data/tree';
import { crumbs } from '@/app/paths';
import { useUi } from '@/app/ui-store';
import { afterOverlaysClosed } from '@/ui/back';
import { toast } from '@/ui/toast';
import { Sheet } from '@/ui/Sheet';
import { useFileActions } from './file-actions';
import { NameForm } from './NameForm';
import { nameRules } from './name-rules';
import s from './files.module.css';

/** Rename and New folder from a page share one name sheet. */
export function NameSheet() {
  const { naming: asking, setNaming } = useUi();
  const naming = asking && 'folder' in asking && asking.inline ? null : asking;
  const treeState = useTree();
  const { data: tree } = treeState;
  const act = useFileActions();
  const renaming = naming && 'rename' in naming ? naming.rename : null;
  const making = naming && 'folder' in naming ? naming : null;
  const node = renaming ? findNode(tree ?? [], renaming) : null;
  const start = renaming ? (node?.type === 'folder' ? nameOf(renaming) : thingName(nameOf(renaming))) : '';
  // A note or a file says its links follow it; a folder says nothing.
  const links = renaming && node?.type === 'file' ? (node.kind === 'note' ? 'Links to this note keep working.' : 'Links to this file keep working.') : null;
  const what = renaming ? 'Rename' : 'New folder';
  const where = renaming ? parentOf(renaming) : (making?.folder ?? '');
  const save = async (name: string): Promise<void> => {
    const n = name.trim();
    if (!n) return;
    // The sheet closes first (its history entry with it), then the page moves.
    setNaming(null);
    await new Promise((r) => setTimeout(r, 0));
    await afterOverlaysClosed();
    if (renaming) {
      await act.rename(renaming, n);
      return;
    }
    if (!making) return;
    const { name: safe, notice } = nameRules(n);
    if (notice) toast(notice);
    await act.createNamed(making.folder, safe);
  };
  return (
    <Sheet open={!!naming} onOpenChange={(o) => !o && setNaming(null)} title={what} description={`In ${crumbs(where)}`}>
      {renaming && <LoadError state={treeState} />}
      {renaming && tree === undefined && !treeState.error && (
        // In the name form's own layout: its 48 px box over its 44 px buttons.
        <Skeleton label="Opening the name form" className={s.nameForm}>
          <Bone style={{ height: 48 }} />
          <Bone style={{ height: 44 }} />
        </Skeleton>
      )}
      {naming && (!renaming || (tree !== undefined && !treeState.error)) && <NameForm key={JSON.stringify(naming)} start={start} links={links} label={renaming ? 'Rename' : 'Make the folder'} onSave={(n) => void save(n)} onCancel={() => setNaming(null)} />}
    </Sheet>
  );
}

import { LoadError } from '@/ui/LoadError';
import { useState } from 'react';
import { useSources, useTree } from '@/data/provider';
import { BowerError } from '@/data/types';
import { findNode, thingName, nameOf, parentOf } from '@/data/tree';
import { crumbs } from '@/app/paths';
import { useUi } from '@/app/ui-store';
import { Button } from '@/ui/Button';
import { afterOverlaysClosed } from '@/ui/back';
import { report } from '@/ui/report';
import { toast } from '@/ui/toast';
import { Sheet } from '@/ui/Sheet';
import { useFileActions } from './file-actions';
import s from './files.module.css';

/** Rename, New note and New folder from a page: the name is asked here, then the thing opens. */
export function NameSheet() {
  const { naming, setNaming } = useUi();
  const { vault } = useSources();
  const treeState = useTree();
  const { data: tree } = treeState;
  const act = useFileActions();
  const renaming = naming && 'rename' in naming ? naming.rename : null;
  const making = naming && 'folder' in naming ? naming : null;
  const node = renaming ? findNode(tree ?? [], renaming) : null;
  const start = renaming ? (node?.type === 'folder' ? nameOf(renaming) : thingName(nameOf(renaming))) : '';
  const what = renaming ? 'Rename' : making?.type === 'folder' ? 'New folder' : 'New note';
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
    if (/[/\\]/.test(n)) toast('Names cannot have slashes; Bower used a dash.');
    const safe = n.replace(/[/\\]/g, '-');
    try {
      // A note's name is typed without .md; typed with it, it is not doubled.
      const path = await vault.create(making.folder, making.type, making.type === 'note' ? `${safe.replace(/\.md$/i, '')}.md` : safe);
      act.open({ path, type: making.type === 'note' ? 'file' : 'folder' });
    } catch (e) {
      if (e instanceof BowerError && e.applied?.path) act.open({ path: e.applied.path, type: making.type === 'note' ? 'file' : 'folder' });
      report(e, making.type === 'note' ? 'The note was not made. Try again.' : 'The folder was not made. Try again.');
    }
  };
  return (
    <Sheet open={!!naming} onOpenChange={(o) => !o && setNaming(null)} title={what} description={`In ${crumbs(where)}`}>
      {renaming && <LoadError state={treeState} />}
      {renaming && tree === undefined && !treeState.error && <p className="muted">Looking…</p>}
      {naming && (!renaming || (tree !== undefined && !treeState.error)) && <NameForm key={JSON.stringify(naming)} start={start} label={renaming ? 'Rename' : making?.type === 'folder' ? 'Make the folder' : 'Make the note'} onSave={(n) => void save(n)} />}
    </Sheet>
  );
}

/** The name box, fresh for each ask (a rename starts from the name it has). */
function NameForm({ start, label, onSave }: { start: string; label: string; onSave: (name: string) => void }) {
  const [name, setName] = useState(start);
  return (
    <form
      className={s.nameForm}
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name);
      }}
    >
      <input autoFocus aria-label="Name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="submit" disabled={!name.trim()}>
        {label}
      </Button>
    </form>
  );
}

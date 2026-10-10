import { LoadError } from '@/ui/LoadError';
import { useEffect, useId, useRef, useState } from 'react';
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
import { FieldError, Input } from '@/ui/Field';
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
  // A note or a file says its links follow it; a folder says nothing.
  const links = renaming && node?.type === 'file' ? (node.kind === 'note' ? 'Links to this note keep working.' : 'Links to this file keep working.') : null;
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
    if (making.type === 'folder') {
      await act.createNamed(making.folder, safe);
      return;
    }
    try {
      // A note's name is typed without .md; typed with it, it is not doubled.
      const path = await vault.create(making.folder, making.type, `${safe.replace(/\.md$/i, '')}.md`);
      act.open({ path, type: 'file' });
    } catch (e) {
      if (e instanceof BowerError && e.applied?.path) act.open({ path: e.applied.path, type: 'file' });
      report(e, 'The note was not made. Try again.');
    }
  };
  return (
    <Sheet open={!!naming} onOpenChange={(o) => !o && setNaming(null)} title={what} description={`In ${crumbs(where)}`}>
      {renaming && <LoadError state={treeState} />}
      {renaming && tree === undefined && !treeState.error && <p className="muted">Looking…</p>}
      {naming && (!renaming || (tree !== undefined && !treeState.error)) && <NameForm key={JSON.stringify(naming)} start={start} links={links} label={renaming ? 'Rename' : making?.type === 'folder' ? 'Make the folder' : 'Make the note'} onSave={(n) => void save(n)} onCancel={() => setNaming(null)} />}
    </Sheet>
  );
}

/** The name box, fresh for each ask (a rename starts from the name it has, selected). */
function NameForm({ start, label, links, onSave, onCancel }: { start: string; label: string; links: string | null; onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(start);
  const field = useRef<HTMLInputElement>(null);
  const ids = useId();
  const slash = /[/\\]/.test(name);
  // The start is already the name without its extension (thingName), so selecting it all is the platform convention:
  // Finder, Explorer and Android Files select the name and leave ".pdf" out.
  useEffect(() => field.current?.select(), []);
  return (
    <form
      className={s.nameForm}
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name);
      }}
    >
      <Input
        ref={field}
        autoFocus
        aria-label="Name"
        placeholder="Name"
        value={name}
        invalid={slash}
        errorId={`${ids}-slash`}
        aria-describedby={links ? `${ids}-links` : undefined}
        onChange={(e) => setName(e.target.value)}
      />
      {slash && <FieldError id={`${ids}-slash`}>Names cannot have slashes; Bower used a dash.</FieldError>}
      {links && (
        <p id={`${ids}-links`} className="muted">
          {links}
        </p>
      )}
      <div className={s.nameActions}>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          {label}
        </Button>
      </div>
    </form>
  );
}

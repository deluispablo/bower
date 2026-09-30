/**
 * A minimal page for the piles end-to-end test (#771, spec R-PILE-6): a
 * stand-in for Add that drives the real pile store and the real Drive
 * client (`drive.ts`) against the test's mocked Drive, and adopts the
 * waiting piles from the inbox listing the way Add does on every visit
 * (R-PILE-3). Leaving it closes the open pile (R-PILE-2). `v5-piles.e2e.ts`
 * bundles this file on the fly; it is never part of the app build.
 */

import { render } from 'preact';
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { getText, listFolder, upload } from '../src/drive.js';
import {
  adoptPile,
  attachToPile,
  closePile,
  openPile,
  parsePileNote,
  setPileText,
  startPile,
  usePiles,
} from '../src/pile-store.js';
import { isContextNote } from '../src/run-progress.js';

const INBOX = 'FOLDER_ID';

/** Add's R-PILE-3: piles left in the inbox by an earlier visit. */
async function adoptWaitingPiles(): Promise<void> {
  const files = await listFolder(INBOX);
  const present = new Map(files.map((file) => [file.name, file]));
  for (const note of files) {
    if (!isContextNote(`0-Inbox/${note.name}`)) continue;
    const fields = parsePileNote(await getText(note.id));
    if (fields !== null) adoptPile(INBOX, note, fields, present);
  }
}

function AddStandIn(): JSX.Element {
  const piles = usePiles();
  const [note, setNote] = useState('');

  useEffect(() => {
    adoptWaitingPiles().then(
      () => {
        document.body.dataset.listed = '1';
      },
      (error: unknown) => {
        console.error(error);
      },
    );
    // R-PILE-2: leaving Add closes the open pile.
    return () => {
      const open = openPile();
      if (open !== undefined) void closePile(open.id);
    };
  }, []);

  const onPick = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    const pile = openPile() ?? startPile(INBOX);
    if (note.trim() !== '') void setPileText(pile.id, note);
    for (const file of picked) {
      void attachToPile(pile.id, { name: file.name, state: 'uploading' })
        .then(() => upload(INBOX, file))
        .then((created) =>
          attachToPile(pile.id, {
            name: file.name,
            fileId: created.id,
            state: 'done',
          }),
        )
        .catch((error: unknown) => {
          console.error(error);
        });
    }
  };

  const onNote = (event: Event): void => {
    const text = (event.currentTarget as HTMLTextAreaElement).value;
    setNote(text);
    const open = openPile();
    if (open !== undefined) void setPileText(open.id, text);
  };

  return (
    <main>
      <label>
        What is this pile?
        <textarea value={note} onInput={onNote} />
      </label>
      <input type="file" multiple aria-label="Add files" onChange={onPick} />
      <button
        type="button"
        onClick={() => {
          const open = openPile();
          setNote('');
          if (open !== undefined) void closePile(open.id);
        }}
      >
        Start another pile
      </button>
      <ul aria-label="Waiting piles">
        {piles.map((pile) => (
          <li key={pile.id} data-testid="pile">
            <p data-testid="pile-note">{pile.text}</p>
            <ul>
              {pile.items.map((item) => (
                <li key={item.name}>{item.name}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Harness(): JSX.Element {
  const [inAdd, setInAdd] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setInAdd((value) => !value)}>
        {inAdd ? 'Leave Add' : 'Open Add'}
      </button>
      {inAdd && <AddStandIn />}
    </>
  );
}

const root = document.getElementById('root');
if (root !== null) render(<Harness />, root);

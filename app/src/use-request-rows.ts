import { useEffect, useRef, useState } from 'preact/hooks';

import { answerNotes, requestRows, waitingNotes } from './bower-tab.js';
import type { RequestRow } from './bower-tab.js';
import { useRuns } from './components/activity-panel.js';
import { useFileText } from './components/rules-panel.js';
import type { DriveFile } from './drive.js';
import { allRules, parseRules } from './rules.js';
import { useRun } from './run-store.js';
import { OfflineError, useVault } from './vault-store.js';

const RULES_PATH = 'Rules.md';

/** The words of the instruction and answer notes, by file id, through the
 * vault's note cache; a note that cannot be read is left out. */
function useNoteTexts(
  notes: readonly DriveFile[],
): ReadonlyMap<string, string> {
  const { getNoteText } = useVault();
  const [texts, setTexts] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const key = notes
    .map((note) => `${note.id}@${note.modifiedTime ?? ''}`)
    .join('|');

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      notesRef.current.map(async (note): Promise<[string, string] | null> => {
        try {
          return [note.id, await getNoteText(note.id)];
        } catch (err) {
          if (!(err instanceof OfflineError)) console.error(err);
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setTexts(
        new Map(
          entries.filter((entry): entry is [string, string] => entry !== null),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [key, getNoteText]);
  return texts;
}

/**
 * The requests store's rows (`requestRows`, spec §6.7) for a screen that is
 * not the Bower tab: what a note's box reads to show that Bower is writing
 * it (R-BIRD-10). The finished runs (`GET /runs`) are read only while
 * something is waiting or running, since a reading state needs neither.
 */
export function useRequestRows(): readonly RequestRow[] {
  const { index, files, fetchedAt } = useVault();
  const { phase, run, lastFinished } = useRun();
  const inFlight = phase === 'queued' || phase === 'running';
  const waiting = waitingNotes(files);
  const texts = useNoteTexts([...waiting, ...answerNotes(files)]);
  const runsLoad = useRuns(
    inFlight || waiting.length > 0,
    lastFinished?.finishedAt ?? null,
  );
  const rulesLoad = useFileText(index?.byPath.get(RULES_PATH));
  return requestRows({
    runs: runsLoad.status === 'ready' ? runsLoad.runs : [],
    files,
    fetchedAt,
    texts,
    justSent: [],
    runSince: inFlight ? (run?.requestedAt ?? null) : null,
    rules:
      rulesLoad.status === 'ready' ? allRules(parseRules(rulesLoad.text)) : [],
    justKept: [],
  });
}

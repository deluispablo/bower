/**
 * A minimal page for the durable upload queue's end-to-end test (#768): the
 * real queue, the real chip in a stand-in for the shell's bar slot, and a
 * file input. Drive is mocked by the test's routes. `v5-upload.e2e.ts`
 * bundles this file on the fly; it is never part of the app build.
 */

import { render } from 'preact';
import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';

import { UploadChipSlot } from '../src/components/upload-chip.js';
import {
  ShellSlotsProvider,
  useShellSlots,
} from '../src/components/shell-slots.js';
import { startUploads, uploadQueue } from '../src/upload-queue.js';

function Bar(): JSX.Element {
  const { uploadChip } = useShellSlots();
  return <div data-testid="bar">{uploadChip}</div>;
}

function Harness(): JSX.Element {
  useEffect(() => {
    startUploads('you@example.com').then(
      () => {
        document.body.dataset.ready = '1';
      },
      (error: unknown) => {
        console.error(error);
      },
    );
  }, []);
  const onPick = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;
    for (const file of Array.from(input.files ?? [])) {
      void uploadQueue().add({
        blob: file,
        name: file.name,
        pileId: 'inbox',
        parentId: 'FOLDER_ID',
      });
    }
  };
  return (
    <ShellSlotsProvider>
      <main>
        <UploadChipSlot />
        <Bar />
        <input type="file" multiple aria-label="Pick files" onChange={onPick} />
      </main>
    </ShellSlotsProvider>
  );
}

const root = document.getElementById('root');
if (root !== null) render(<Harness />, root);

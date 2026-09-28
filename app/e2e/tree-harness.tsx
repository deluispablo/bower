/**
 * A minimal page for the tree's performance e2e (#590): the tree on a
 * 2,000-note fixture, every folder open. `v4-perf.e2e.ts` bundles this file
 * on the fly; it is never part of the app build. With `#box` in the URL the
 * tree sits in its own scrolling box (the desktop sidebar); without, the
 * page itself scrolls (the phone's Notes tab).
 */

import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { Tree } from '../src/components/tree.js';
import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import { buildVaultIndex } from '../src/vault-index.js';

const FOLDERS = 20;
const NOTES_PER_FOLDER = 100;

/** 20 folders of 100 notes under "1-Projects": 2,000 notes. */
function fixture(): DriveFile[] {
  const files: DriveFile[] = [
    {
      id: 'projects',
      name: '1-Projects',
      mimeType: FOLDER_MIME,
      parents: ['ROOT'],
      path: '1-Projects',
    },
  ];
  for (let f = 0; f < FOLDERS; f++) {
    const folder = `Batch ${String(f).padStart(2, '0')}`;
    files.push({
      id: `folder${f}`,
      name: folder,
      mimeType: FOLDER_MIME,
      parents: ['projects'],
      path: `1-Projects/${folder}`,
    });
    for (let n = 0; n < NOTES_PER_FOLDER; n++) {
      const name = `Note ${String(f * NOTES_PER_FOLDER + n).padStart(4, '0')}.md`;
      files.push({
        id: `note${f}-${n}`,
        name,
        mimeType: 'text/markdown',
        parents: [`folder${f}`],
        path: `1-Projects/${folder}/${name}`,
      });
    }
  }
  return files;
}

const index = buildVaultIndex(fixture());

function Harness(): preact.JSX.Element {
  const [expandKey, setExpandKey] = useState(0);
  // The tree opens every folder when the key changes.
  useEffect(() => setExpandKey(1), []);
  const tree = <Tree index={index} expandKey={expandKey} />;
  if (window.location.hash === '#box') {
    return (
      <div id="box" style={{ height: '600px', overflowY: 'auto' }}>
        {tree}
      </div>
    );
  }
  return <main>{tree}</main>;
}

const root = document.getElementById('root');
if (root !== null) render(<Harness />, root);

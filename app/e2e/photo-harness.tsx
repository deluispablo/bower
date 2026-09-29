/**
 * A minimal page for the photo viewer's end-to-end test (#605): the viewer
 * on five photos in "Flat hunt", before the file screen mounts it (#606).
 * `v4-photo.e2e.ts` bundles this file on the fly; it is never part of the
 * app build.
 */

import { render } from 'preact';
import { useState } from 'preact/hooks';

import { OverlayHost } from '../src/components/overlay.js';
import { PhotoViewer } from '../src/components/photo-viewer.js';

const NAMES = [
  'Front door',
  'Arlington Road, window sign',
  'Kitchen',
  'Garden',
  'Floor plan',
];

function picture(index: number): string {
  const hue = String(index * 60);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">' +
    `<rect width="1200" height="800" fill="hsl(${hue} 60% 45%)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function Harness(): preact.JSX.Element {
  const [index, setIndex] = useState(1);
  return (
    <main>
      <PhotoViewer
        src={picture(index)}
        title={NAMES[index] ?? ''}
        siblings={NAMES.map((name, id) => ({ id: String(id), name }))}
        index={index}
        folderName="Flat hunt"
        onNavigate={setIndex}
      />
      <OverlayHost />
    </main>
  );
}

const root = document.getElementById('root');
if (root !== null) render(<Harness />, root);

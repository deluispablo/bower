// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import {
  blobCacheKey,
  driveFileIdOf,
  driveViewUrl,
  embedKind,
  fileLinkHtml,
  imagePlaceholder,
  parseLinkTarget,
  resolveRelativePath,
  transclusionPlaceholder,
} from '../src/markdown/embeds.js';
import {
  hydrateEmbeds,
  MAX_IMAGE_BYTES,
  MAX_TRANSCLUDED_CHARS,
  MAX_TRANSCLUSION_DEPTH,
  MAX_TRANSCLUSIONS,
} from '../src/markdown/hydrate-embeds.js';
import type { EmbedLoaders } from '../src/markdown/hydrate-embeds.js';
import { renderNote } from '../src/markdown/render.js';
import { buildVaultIndex } from '../src/vault-index.js';

function file(
  id: string,
  path: string,
  mimeType = 'text/markdown',
  extra: Partial<DriveFile> = {},
): DriveFile {
  const name = path.split('/').pop() ?? path;
  return { id, name, mimeType, parents: ['PARENT'], path, ...extra };
}

describe('embedKind', () => {
  it.each([
    [file('a', 'Note.md'), 'note'],
    [file('b', 'Upper.MD', 'text/plain'), 'note'],
    [file('c', 'photo.PNG', 'application/octet-stream'), 'image'],
    [file('d', 'diagram.svg', 'image/svg+xml'), 'image'],
    [file('e', 'camera', 'image/jpeg'), 'image'],
    [file('f', 'scan.pdf', 'application/pdf'), 'file'],
    [file('g', 'budget.xlsx', 'application/vnd.ms-excel'), 'file'],
    [file('h', 'phone.heic', 'image/heic'), 'file'],
  ] as const)('classifies %#', (input, kind) => {
    expect(embedKind(input)).toBe(kind);
  });
});

describe('driveViewUrl', () => {
  it('uses webViewLink when Drive sent one', () => {
    const pdf = file('scan', 'scan.pdf', 'application/pdf', {
      webViewLink: 'https://drive.google.com/file/d/scan/view?usp=drivesdk',
    });
    expect(driveViewUrl(pdf)).toBe(
      'https://drive.google.com/file/d/scan/view?usp=drivesdk',
    );
  });

  it('falls back to the Drive viewer URL', () => {
    expect(driveViewUrl(file('a b', 'x.pdf', 'application/pdf'))).toBe(
      'https://drive.google.com/file/d/a%20b/view',
    );
    expect(
      driveViewUrl(
        file('x', 'x.pdf', 'application/pdf', {
          webViewLink: 'javascript:alert(1)',
        }),
      ),
    ).toBe('https://drive.google.com/file/d/x/view');
  });
});

describe('blobCacheKey', () => {
  it('changes when the file changes', () => {
    expect(blobCacheKey(file('img', 'a.png', 'image/png'))).toBe('img');
    expect(
      blobCacheKey(
        file('img', 'a.png', 'image/png', {
          modifiedTime: '2026-01-02T03:04:05.000Z',
        }),
      ),
    ).toBe('img@2026-01-02T03:04:05.000Z');
  });
});

describe('parseLinkTarget', () => {
  it.each([
    ['https://example.com/a.png'],
    ['mailto:you@example.com'],
    ['javascript:alert(1)'],
    ['//example.com/a.png'],
    ['#heading'],
    ['/note/abc'],
    [''],
  ])('ignores %s', (href) => {
    expect(parseLinkTarget(href)).toBeUndefined();
  });

  it('decodes the path and splits the fragment', () => {
    expect(parseLinkTarget('img/My%20Photo.png')).toEqual({
      path: 'img/My Photo.png',
    });
    expect(parseLinkTarget('Garden%20Plan.md#Next%20steps')).toEqual({
      path: 'Garden Plan.md',
      fragment: 'Next steps',
    });
    expect(parseLinkTarget('bad%zz.png')).toEqual({ path: 'bad%zz.png' });
  });
});

describe('resolveRelativePath', () => {
  it('resolves against the note folder', () => {
    expect(resolveRelativePath('1-Projects/Garden/Plan.md', 'bed.png')).toBe(
      '1-Projects/Garden/bed.png',
    );
    expect(
      resolveRelativePath('1-Projects/Garden/Plan.md', './img/../bed.png'),
    ).toBe('1-Projects/Garden/bed.png');
    expect(
      resolveRelativePath(
        '1-Projects/Garden/Plan.md',
        '../../Attachments/a.png',
      ),
    ).toBe('Attachments/a.png');
    expect(resolveRelativePath('Top.md', 'a.png')).toBe('a.png');
    expect(resolveRelativePath('', 'a.png')).toBe('a.png');
  });

  it('treats a leading slash as the top of the folder', () => {
    expect(
      resolveRelativePath('1-Projects/Plan.md', '/Attachments/a.png'),
    ).toBe('Attachments/a.png');
  });

  it('refuses to climb above the folder', () => {
    expect(resolveRelativePath('Plan.md', '../a.png')).toBeUndefined();
  });
});

describe('placeholders', () => {
  const pdf = file('scan', 'scan.pdf', 'application/pdf', {
    webViewLink: 'https://drive.google.com/file/d/scan/view',
  });

  it("links other files to the file's screen in the app", () => {
    expect(fileLinkHtml(pdf, 'scan.pdf', true)).toBe(
      '<a class="wikilink wikilink-file wikilink-embed" ' +
        'href="/file/scan">scan.pdf</a>',
    );
  });

  it('reads the file id out of a Drive or Docs link', () => {
    expect(
      driveFileIdOf('https://drive.google.com/file/d/scan_1-x/view?usp=sharing'),
    ).toBe('scan_1-x');
    expect(
      driveFileIdOf('https://docs.google.com/document/d/DOC_ID/edit'),
    ).toBe('DOC_ID');
    expect(driveFileIdOf('https://drive.google.com/open?id=OPEN_ID')).toBe(
      'OPEN_ID',
    );
    expect(driveFileIdOf('https://example.com/file/d/scan/view')).toBe(
      undefined,
    );
    expect(driveFileIdOf('not a url')).toBe(undefined);
  });

  it('escapes image and transclusion placeholders', () => {
    expect(
      imagePlaceholder(file('i"d', 'a.png', 'image/png'), 'A "b" <c>'),
    ).toBe(
      '<img class="embed-image" data-bower-file="i&quot;d" ' +
        'alt="A &quot;b&quot; &lt;c&gt;">',
    );
    expect(
      transclusionPlaceholder(file('n', 'Note.md'), 'Note', '#user-content-x'),
    ).toBe(
      '<div class="transclusion-pending" data-bower-embed="n">' +
        '<a class="wikilink wikilink-embed" href="/note/n#user-content-x">Note</a>' +
        '</div>',
    );
  });
});

describe('hydrateEmbeds', () => {
  const index = buildVaultIndex([
    file('host', 'Host.md'),
    file('other', 'Other.md'),
    file('photo', 'photo.png', 'image/png'),
    file('scan', 'scan.pdf', 'application/pdf'),
  ]);

  function mount(markdown: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = renderNote(markdown, index, { path: 'Host.md' }).html;
    return root;
  }

  function loaders(overrides: Partial<EmbedLoaders> = {}): EmbedLoaders {
    let next = 0;
    return {
      index,
      loadImage: vi.fn(() => Promise.resolve(new Blob(['png']))),
      loadNoteText: vi.fn(() =>
        Promise.resolve('# Other\n\nBody with ![[photo.png]] and ![[Host]].'),
      ),
      renderEmbeddedNote: (text, embedded) =>
        renderNote(text, index, { path: embedded.path, transclude: false })
          .html,
      createObjectUrl: vi.fn(() => `blob:test/${next++}`),
      revokeObjectUrl: vi.fn(),
      ...overrides,
    };
  }

  it('loads images, transcludes once and revokes URLs on cleanup', async () => {
    const root = mount('![[photo.png]]\n\n![[Other]]\n\n[[scan.pdf]]');
    const deps = loaders();
    const cleanup = hydrateEmbeds(root, deps);
    await vi.waitFor(() => {
      expect(root.querySelector('section.transclusion')).not.toBeNull();
      expect(root.querySelectorAll('img[src^="blob:"]')).toHaveLength(2);
    });

    const section = root.querySelector('section.transclusion');
    expect(
      section?.querySelector('.transclusion-title a')?.getAttribute('href'),
    ).toBe('/note/other');
    // The transcluded note links back to its own embed instead of nesting.
    expect(section?.querySelector('[data-bower-embed]')).toBeNull();
    expect(
      section?.querySelector('a.wikilink-embed[href="/note/host"]'),
    ).not.toBeNull();
    expect(section?.querySelector('[id]')).toBeNull();
    // Same image twice: fetched once, one object URL.
    expect(deps.loadImage).toHaveBeenCalledTimes(1);
    expect(deps.createObjectUrl).toHaveBeenCalledTimes(1);
    expect(
      root.querySelector('a.wikilink-file')?.getAttribute('href'),
    ).toMatch(/^\/file\//);

    cleanup();
    expect(deps.revokeObjectUrl).toHaveBeenCalledWith('blob:test/0');
  });

  it('keeps a link when a note or an image cannot be loaded', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const root = mount('![[photo.png|A photo]]\n\n![[Other]]');
    const deps = loaders({
      loadImage: () => Promise.reject(new Error('offline')),
      loadNoteText: () => Promise.reject(new Error('offline')),
    });
    hydrateEmbeds(root, deps);
    await vi.waitFor(() => {
      expect(root.querySelector('a.embed-failed')?.textContent).toBe('A photo');
    });
    expect(root.querySelector('img')).toBeNull();
    expect(
      root.querySelector('[data-bower-embed] a')?.getAttribute('href'),
    ).toBe('/note/other');
    expect(root.querySelector('section.transclusion')).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('does nothing after cleanup', async () => {
    let resolveImage: (blob: Blob) => void = () => {};
    const deps = loaders({
      loadImage: () =>
        new Promise<Blob>((resolve) => {
          resolveImage = resolve;
        }),
    });
    const root = mount('![[photo.png]]');
    const cleanup = hydrateEmbeds(root, deps);
    cleanup();
    resolveImage(new Blob(['png']));
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.createObjectUrl).not.toHaveBeenCalled();
    expect(root.querySelector('img')?.hasAttribute('src')).toBe(false);
  });

  it('ignores placeholders that point at the wrong kind of file', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<img data-bower-file="scan" alt="x"><div data-bower-embed="photo"></div>';
    const deps = loaders();
    hydrateEmbeds(root, deps);
    expect(deps.loadImage).not.toHaveBeenCalled();
    expect(deps.loadNoteText).not.toHaveBeenCalled();
  });

  it('never creates an object URL of a non-image type', async () => {
    const created: Blob[] = [];
    const deps = loaders({
      // An HTML page saved as `photo.png`, served back as what it is.
      loadImage: () =>
        Promise.resolve(
          new Blob(['<script>x()</script>'], { type: 'text/html' }),
        ),
      createObjectUrl: (blob) => {
        created.push(blob);
        return 'blob:test/typed';
      },
    });
    const root = mount('![[photo.png]]');
    hydrateEmbeds(root, deps);
    await vi.waitFor(() => {
      expect(root.querySelector('img')?.getAttribute('src')).toBe(
        'blob:test/typed',
      );
    });
    expect(created.map((blob) => blob.type)).toEqual(['image/png']);
  });

  it('links to Drive instead of loading an image over the size cap', async () => {
    const big = buildVaultIndex([
      file('huge', 'huge.png', 'image/png', { size: MAX_IMAGE_BYTES + 1 }),
      file('sneaky', 'sneaky.png', 'image/png'),
    ]);
    const root = document.createElement('div');
    root.innerHTML = renderNote('![[huge.png]]\n\n![[sneaky.png]]', big).html;
    const deps = loaders({
      index: big,
      // Drive reported no size for `sneaky`, but the bytes are too many.
      loadImage: vi.fn(() =>
        Promise.resolve(new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)])),
      ),
    });
    hydrateEmbeds(root, deps);
    await vi.waitFor(() => {
      expect(root.querySelectorAll('a.embed-failed')).toHaveLength(2);
    });
    expect(deps.loadImage).toHaveBeenCalledTimes(1);
    expect(deps.createObjectUrl).not.toHaveBeenCalled();
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('a.embed-failed')?.getAttribute('rel')).toBe(
      'noopener noreferrer',
    );
  });
});

/**
 * Transclusion caps (#188), with a vault that loops: Host embeds Loop A,
 * Loop A embeds Loop B and itself, Loop B embeds Loop A back; and a chain
 * Deep 1 → Deep 2 → ... → Deep 5.
 */
describe('transclusion caps', () => {
  const notes = new Map<string, string>([
    ['host', 'Host body.'],
    ['a', 'A body. ![[Loop B]]\n\n![[Loop A]]'],
    ['b', 'B body. ![[Loop A]]'],
    ['d1', 'Deep 1 body.\n\n![[Deep 2]]'],
    ['d2', 'Deep 2 body.\n\n![[Deep 3]]'],
    ['d3', 'Deep 3 body.\n\n![[Deep 4]]'],
    ['d4', 'Deep 4 body.\n\n![[Deep 5]]'],
    ['d5', 'Deep 5 body.'],
  ]);
  const files = [
    file('host', 'Host.md'),
    file('a', 'Loop A.md'),
    file('b', 'Loop B.md'),
    ...[1, 2, 3, 4, 5].map((n) => file(`d${n}`, `Deep ${n}.md`)),
    ...Array.from({ length: 25 }, (_, n) => file(`many${n}`, `Many ${n}.md`)),
  ];
  const index = buildVaultIndex(files);

  function run(markdown: string, text = (id: string) => notes.get(id)) {
    const root = document.createElement('div');
    root.innerHTML = renderNote(markdown, index, { path: 'Host.md' }).html;
    const loadNoteText = vi.fn((id: string) =>
      Promise.resolve(text(id) ?? `${id} body.`),
    );
    const cleanup = hydrateEmbeds(root, {
      index,
      loadImage: () => Promise.reject(new Error('no images here')),
      loadNoteText,
      renderEmbeddedNote: (body, embedded, transclude) =>
        renderNote(body, index, { path: embedded.path, transclude }).html,
    });
    return { root, loadNoteText, cleanup };
  }

  /** Nesting depth of every transclusion section, outermost first. */
  function depths(root: HTMLElement): number[] {
    return [...root.querySelectorAll('section.transclusion')].map((section) => {
      let depth = 0;
      for (let node: Element | null = section; node !== null;) {
        if (node.matches('section.transclusion')) depth += 1;
        node = node.parentElement;
      }
      return depth;
    });
  }

  it('stops a transclusion loop at the first repeat', async () => {
    const { root, loadNoteText } = run('![[Loop A]]');
    await vi.waitFor(() => {
      expect(root.querySelectorAll('section.transclusion')).toHaveLength(2);
    });
    // Let any stray load finish before counting.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(depths(root)).toEqual([1, 2]);
    expect(loadNoteText.mock.calls.map(([id]) => id)).toEqual(['a', 'b']);
    // Loop B's embed of Loop A, and Loop A's of itself, stay plain links.
    const links = root.querySelectorAll('a.wikilink-embed[href="/note/a"]');
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(root.textContent).toContain('A body.');
    expect(root.textContent).toContain('B body.');
  });

  it(`nests at most ${MAX_TRANSCLUSION_DEPTH} deep`, async () => {
    const { root } = run('![[Deep 1]]');
    await vi.waitFor(() => {
      expect(root.textContent).toContain('Deep 3 body.');
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(depths(root)).toEqual([1, 2, 3]);
    expect(root.textContent).not.toContain('Deep 4 body.');
    expect(
      root.querySelector('a.wikilink-embed[href="/note/d4"]'),
    ).not.toBeNull();
    expect(root.querySelector('[data-bower-embed]')).toBeNull();
  });

  it(`transcludes at most ${MAX_TRANSCLUSIONS} notes per note`, async () => {
    const markdown = Array.from(
      { length: 25 },
      (_, n) => `![[Many ${n}]]`,
    ).join('\n\n');
    const { root, loadNoteText } = run(markdown);
    await vi.waitFor(() => {
      expect(root.querySelectorAll('section.transclusion')).toHaveLength(
        MAX_TRANSCLUSIONS,
      );
    });
    expect(loadNoteText).toHaveBeenCalledTimes(MAX_TRANSCLUSIONS);
    // The rest keep their placeholder with a plain link.
    const rest = root.querySelectorAll('[data-bower-embed] a.wikilink-embed');
    expect(rest).toHaveLength(25 - MAX_TRANSCLUSIONS);
  });

  it('keeps a link to a note too long to transclude', async () => {
    const { root, loadNoteText } = run('![[Loop B]]', () =>
      'x'.repeat(MAX_TRANSCLUDED_CHARS + 1),
    );
    await vi.waitFor(() => {
      expect(loadNoteText).toHaveBeenCalled();
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(root.querySelector('section.transclusion')).toBeNull();
    expect(
      root.querySelector('[data-bower-embed="b"] a')?.getAttribute('href'),
    ).toBe('/note/b');
  });
});

describe('links to files in the Bower folder (#609)', () => {
  const index = buildVaultIndex([
    file('host', 'Host.md'),
    file('lease', 'Flat hunt/Lease agreement.pdf', 'application/pdf'),
  ]);

  function linkOf(markdown: string): HTMLAnchorElement | null {
    const root = document.createElement('div');
    root.innerHTML = renderNote(markdown, index).html;
    return root.querySelector('a');
  }

  it("opens a Drive URL of a file in the index on the file's screen", () => {
    const link = linkOf(
      '[the lease](https://drive.google.com/file/d/lease/view?usp=sharing)',
    );
    expect(link?.getAttribute('href')).toBe('/file/lease');
    expect(link?.hasAttribute('target')).toBe(false);
    expect(link?.textContent).toBe('the lease');
  });

  it('opens a wikilink to a PDF on its screen', () => {
    expect(linkOf('See [[Lease agreement.pdf]].')?.getAttribute('href')).toBe(
      '/file/lease',
    );
  });

  it('leaves a Drive URL of a file that is not in the folder alone', () => {
    const link = linkOf('[else](https://drive.google.com/file/d/elsewhere/view)');
    expect(link?.getAttribute('href')).toBe(
      'https://drive.google.com/file/d/elsewhere/view',
    );
    expect(link?.getAttribute('target')).toBe('_blank');
  });
});

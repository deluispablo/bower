// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import {
  blobCacheKey,
  driveViewUrl,
  embedKind,
  fileLinkHtml,
  imagePlaceholder,
  parseLinkTarget,
  resolveRelativePath,
  transclusionPlaceholder,
} from '../src/markdown/embeds.js';
import { hydrateEmbeds } from '../src/markdown/hydrate-embeds.js';
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

  it('links other files to Drive in a new tab', () => {
    expect(fileLinkHtml(pdf, 'scan.pdf', true)).toBe(
      '<a class="wikilink wikilink-file wikilink-embed" ' +
        'href="https://drive.google.com/file/d/scan/view" target="_blank" ' +
        'rel="noopener noreferrer">scan.pdf</a>',
    );
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
    expect(root.querySelector('a.wikilink-file')?.getAttribute('target')).toBe(
      '_blank',
    );

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
});

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import { renderNote, sanitizeHtml } from '../src/markdown/render.js';
import { buildVaultIndex } from '../src/vault-index.js';
import rulebook from '../../vault-template/CLAUDE.md?raw';

function file(id: string, path: string): DriveFile {
  const name = path.split('/').pop() ?? path;
  return { id, name, mimeType: 'text/markdown', parents: ['PARENT'], path };
}

const index = buildVaultIndex([
  file('about', 'About-Me.md'),
  file('index', 'index.md'),
  file('plan', '1-Projects/Garden/Garden Plan.md'),
  file('seeds', '1-Projects/Garden/Seed List.md'),
]);

function dom(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

/** A 200-line note with the constructs a real vault uses. */
function longNote(): string {
  const lines = [
    '---',
    'tags: [project, home]',
    'status: active',
    'related: ["[[Seed List]]", "[[Nowhere]]"]',
    '---',
    '# Garden',
    '',
    'Plan in [[Garden Plan|the plan]], see [[Seed List#Tomatoes]] and [[Missing Note]].',
    'Read the [guide](https://example.com/guide) or mail <you@example.com>.',
    '',
    '## Tasks',
    '',
    '- [x] Buy soil',
    '- [ ] Sow ==tomatoes== early',
    '',
    '## Beds',
    '',
    '| Bed | Crop | Link |',
    '| --- | :---: | ---: |',
  ];
  for (let row = 1; lines.length < 180; row++) {
    lines.push(`| ${row} | Crop ${row} | [[Seed List\\|seeds ${row}]] |`);
  }
  lines.push(
    '',
    '```ts',
    'const beds = 3;',
    '```',
    '',
    '> A quote with **bold** text.',
    '',
    '> [!warning] Frost',
    '> Cover the beds at night.',
    '',
  );
  while (lines.length < 200) lines.push(`Line ${lines.length} of notes.`, '');
  return lines.slice(0, 200).join('\n');
}

describe('renderNote', () => {
  it('renders the vault rulebook with headings and nothing executable', () => {
    const note = renderNote(rulebook, index);
    const root = dom(note.html);

    expect(note.frontmatter.tags).toEqual(['meta', 'personal']);
    expect(note.tags).toEqual(['meta', 'personal']);
    expect(root.querySelector('h1')?.textContent).toContain('Vault rulebook');
    expect(root.querySelector('h2#user-content-purpose')).not.toBeNull();
    expect(
      root.querySelector('h3#user-content-frontmatter-yaml'),
    ).not.toBeNull();
    expect(root.querySelectorAll('pre code').length).toBeGreaterThan(0);
    // Wikilinks shown as examples inside code stay literal.
    expect(root.querySelector('pre code')?.textContent).toContain('0-Inbox/');
    expect(note.html).not.toContain('<script');
    expect(note.html).not.toMatch(/\son\w+=/i);
  });

  it('renders a long note with tables, tasks and links', () => {
    const source = longNote();
    expect(source.split('\n')).toHaveLength(200);
    const note = renderNote(source, index);
    const root = dom(note.html);

    const rows = root.querySelectorAll('table tbody tr');
    expect(rows.length).toBeGreaterThan(150);
    expect(root.querySelector('th[align="center"]')?.textContent).toBe('Crop');
    const cellLink = rows[0]?.querySelector('a.wikilink');
    expect(cellLink?.getAttribute('href')).toBe('/note/seeds');
    expect(cellLink?.textContent).toBe('seeds 1');

    const boxes = root.querySelectorAll<HTMLInputElement>(
      'li input[type="checkbox"]',
    );
    expect(boxes).toHaveLength(2);
    expect([...boxes].map((box) => box.checked)).toEqual([true, false]);
    expect([...boxes].every((box) => box.disabled)).toBe(true);

    const plan = root.querySelector('a.wikilink[href="/note/plan"]');
    expect(plan?.textContent).toBe('the plan');
    expect(
      root.querySelector('a[href="/note/seeds#user-content-tomatoes"]')
        ?.textContent,
    ).toBe('Seed List > Tomatoes');
    expect(root.querySelector('span.wikilink-missing')?.textContent).toBe(
      'Missing Note',
    );

    const external = root.querySelector('a[href="https://example.com/guide"]');
    expect(external?.getAttribute('target')).toBe('_blank');
    expect(external?.getAttribute('rel')).toBe('noopener noreferrer');
    const mail = root.querySelector('a[href^="mailto:"]');
    expect(mail?.hasAttribute('target')).toBe(false);

    expect(root.querySelector('mark')?.textContent).toBe('tomatoes');
    expect(root.querySelector('pre code.language-ts')?.textContent).toContain(
      'const beds',
    );
    expect(root.querySelector('blockquote strong')?.textContent).toBe('bold');
    expect(
      root.querySelector('.callout.callout-warning .callout-title')
        ?.textContent,
    ).toBe('Frost');
  });

  it('neutralises raw HTML and dangerous links', () => {
    const note = renderNote(
      [
        '<img src=x onerror="alert(1)">',
        '',
        '<a href="javascript:alert(1)">click</a>',
        '',
        '[md link](javascript:alert(1)) and ![img](javascript:alert(1))',
        '',
        '<script>alert(1)</script>',
        '<iframe src="https://example.com"></iframe>',
        '<style>body { display: none }</style>',
        '<div onclick="alert(1)" style="color: red">styled</div>',
        '<input type="text" value="x"> <form action="https://example.com"><button>Go</button></form>',
        '<a href="https://example.com" target="_self">raw</a>',
        '<h2 id="cookie">Named</h2>',
      ].join('\n'),
      index,
    );
    const root = dom(note.html);

    expect(note.html).not.toMatch(
      /onerror|onclick|javascript:|<script|<iframe|<style|<form/i,
    );
    expect(root.querySelector('[style]')).toBeNull();
    expect(root.querySelector('img')?.hasAttribute('src')).toBe(false);
    for (const anchor of root.querySelectorAll('a')) {
      const href = anchor.getAttribute('href');
      if (href !== null) expect(href).toMatch(/^(https?:|mailto:|\/note\/|#)/);
    }
    const input = root.querySelector('input');
    expect(input?.getAttribute('type')).toBe('checkbox');
    expect(input?.hasAttribute('disabled')).toBe(true);
    expect(
      root
        .querySelector('a[href="https://example.com"]')
        ?.getAttribute('target'),
    ).toBe('_blank');
    expect(root.querySelector('h2')?.id).toBe('user-content-cookie');
  });

  it('renders callouts, highlights and unique heading anchors', () => {
    const note = renderNote(
      [
        '> [!NOTE]',
        '> Body with [[Garden Plan]].',
        '',
        '> [!tip]- Folded ==tip==',
        '> Second line',
        '',
        '> Plain quote',
        '',
        'Some ==marked **bold**== text, not == this ==.',
        '',
        '## Same',
        '## Same',
        '## Same',
      ].join('\n'),
      index,
    );
    const root = dom(note.html);

    const [first, second] = root.querySelectorAll('div.callout');
    expect(first?.className).toBe('callout callout-note');
    expect(first?.querySelector('.callout-title')?.textContent).toBe('Note');
    expect(
      first?.querySelector('.callout-content a.wikilink')?.getAttribute('href'),
    ).toBe('/note/plan');
    expect(second?.className).toBe('callout callout-tip');
    expect(second?.querySelector('.callout-title mark')?.textContent).toBe(
      'tip',
    );
    expect(root.querySelectorAll('blockquote')).toHaveLength(1);

    const marks = root.querySelectorAll('p mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]?.innerHTML).toBe('marked <strong>bold</strong>');

    expect(
      [...root.querySelectorAll('h2')].map((heading) => heading.id),
    ).toEqual([
      'user-content-same',
      'user-content-same-1',
      'user-content-same-2',
    ]);
  });

  it('renders attachments: image placeholders, Drive links, transclusions', () => {
    const attachments = buildVaultIndex([
      file('plan', '1-Projects/Garden/Garden Plan.md'),
      file('seeds', '1-Projects/Garden/Seed List.md'),
      {
        ...file('bed', '1-Projects/Garden/img/bed.png'),
        mimeType: 'image/png',
      },
      {
        ...file('scan', 'Attachments/scan.pdf'),
        mimeType: 'application/pdf',
        webViewLink: 'https://drive.google.com/file/d/scan/view',
      },
    ]);
    const note = renderNote(
      [
        'Intro with ![[bed.png|The bed]] inline.',
        '',
        '![[Seed List]]',
        '',
        '![Bed](img/bed.png) and [](img/bed.png)',
        '',
        '[the scan](../../Attachments/scan.pdf), [[scan.pdf]] and ![[scan.pdf]]',
        '',
        '[seeds](Seed%20List.md#Tomatoes) and [web](https://example.com/a.png)',
        '',
        '![[Garden Plan]]',
      ].join('\n'),
      attachments,
      { path: '1-Projects/Garden/Garden Plan.md' },
    );
    const root = dom(note.html);

    const images = [...root.querySelectorAll('img')];
    expect(images.map((img) => img.getAttribute('data-bower-file'))).toEqual([
      'bed',
      'bed',
      'bed',
    ]);
    expect(images.map((img) => img.alt)).toEqual(['The bed', 'Bed', 'bed.png']);
    expect(images.every((img) => !img.hasAttribute('src'))).toBe(true);

    // A lone embed line is a block of its own, not inside a paragraph.
    const embed = root.querySelector('div[data-bower-embed="seeds"]');
    expect(embed?.parentElement).toBe(root);
    expect(embed?.querySelector('a')?.getAttribute('href')).toBe('/note/seeds');

    const drive = [...root.querySelectorAll('a.wikilink-file')];
    expect(drive).toHaveLength(3);
    for (const link of drive) {
      expect(link.getAttribute('href')).toBe('/file/scan');
      expect(link.hasAttribute('target')).toBe(false);
    }
    expect(drive[0]?.textContent).toBe('the scan');

    expect(
      root.querySelector('a[href="/note/seeds#user-content-tomatoes"]')
        ?.textContent,
    ).toBe('seeds');
    expect(
      root.querySelector('a[href="https://example.com/a.png"]'),
    ).not.toBeNull();
    // A note never transcludes itself.
    expect(root.querySelector('[data-bower-embed="plan"]')).toBeNull();
    expect(
      root.querySelector('a.wikilink-embed[href="/note/plan"]'),
    ).not.toBeNull();
  });

  it('renders embedded notes as links when transclusion is off', () => {
    const note = renderNote('![[Seed List]]', index, { transclude: false });
    const root = dom(note.html);
    expect(root.querySelector('[data-bower-embed]')).toBeNull();
    expect(root.querySelector('a.wikilink-embed')?.getAttribute('href')).toBe(
      '/note/seeds',
    );
  });

  it('allows only the two placeholder data attributes', () => {
    const root = dom(
      sanitizeHtml(
        '<img data-bower-file="x" data-other="y" alt="a">' +
          '<div data-bower-embed="n"></div>',
      ),
    );
    expect(root.querySelector('img')?.getAttribute('data-bower-file')).toBe(
      'x',
    );
    expect(root.querySelector('img')?.hasAttribute('data-other')).toBe(false);
    expect(root.querySelector('div')?.getAttribute('data-bower-embed')).toBe(
      'n',
    );
  });

  it('returns empty frontmatter and tags for a note with none', () => {
    const note = renderNote('Just text.', index);
    expect(note.frontmatter).toEqual({});
    expect(note.tags).toEqual([]);
  });

  describe('drops a first heading equal to the title (issue #307)', () => {
    it('drops it when the body opens with `# <title>`', () => {
      const note = renderNote('# Garden\n\nPlan in [[Garden Plan]].', index, {
        title: 'Garden',
      });
      const root = dom(note.html);
      expect(root.querySelector('h1')).toBeNull();
      expect(note.html).toContain('Plan in');
    });

    it('matches case-insensitively and ignores emphasis markers', () => {
      const note = renderNote('# **garden**\n\nBody.', index, {
        title: 'Garden',
      });
      expect(dom(note.html).querySelector('h1')).toBeNull();
    });

    it('leaves the heading when no title is given', () => {
      const note = renderNote('# Garden\n\nBody.', index);
      expect(dom(note.html).querySelector('h1')?.textContent).toBe('Garden');
    });

    it('leaves the heading when its text does not match the title', () => {
      const note = renderNote('# Garden\n\nBody.', index, {
        title: 'Seed List',
      });
      expect(dom(note.html).querySelector('h1')?.textContent).toBe('Garden');
    });

    it('drops the title heading after a leading paragraph or callout (#609)', () => {
      const paragraph = renderNote('Intro.\n\n# Garden\n\nBody.', index, {
        title: 'Garden',
      });
      expect(dom(paragraph.html).querySelector('h1')).toBeNull();
      expect(dom(paragraph.html).textContent).toContain('Intro.');
      const callout = renderNote(
        "> [!bower] Bower's note\n> First line. (from the file)\n\n# Garden\n\nBody.",
        index,
        { title: 'Garden' },
      );
      expect(dom(callout.html).querySelector('h1')).toBeNull();
      expect(dom(callout.html).querySelector('.bower-note')).not.toBeNull();
    });

    it('keeps a matching heading that comes after another heading', () => {
      const note = renderNote('## Intro\n\n# Garden\n\nBody.', index, {
        title: 'Garden',
      });
      expect(dom(note.html).querySelector('h1')?.textContent).toBe('Garden');
    });

    it('only drops the very first heading, keeping later ones', () => {
      const note = renderNote('# Garden\n\n## Garden\n\nBody.', index, {
        title: 'Garden',
      });
      const root = dom(note.html);
      expect(root.querySelector('h1')).toBeNull();
      expect(root.querySelector('h2')?.textContent).toBe('Garden');
    });
  });

  it('sanitizes stand-alone HTML with the same allowlist', () => {
    expect(
      sanitizeHtml('<b onmouseover="x()">ok</b><script>x()</script>'),
    ).toBe('<b>ok</b>');
  });
});

/**
 * The sanitiser profile (#188): what a hostile note, for example a web page
 * clipped into the Bower folder, can and cannot put on the page.
 */
describe('sanitiser profile', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo=';

  function hostile(): HTMLElement {
    const note = renderNote(
      [
        '[js](javascript:alert(1)) [JS](JaVaScRiPt:alert(1)) [vb](vbscript:msgbox(1))',
        '[tab](java\tscript:alert(1)) ![img](javascript:alert(1))',
        '<a href="javascript:alert(1)">a</a> <a href="&#106;avascript:alert(1)">b</a>',
        '<a href=" javascript:alert(1)">c</a> <a href="vbscript:msgbox(1)">d</a>',
        '<a href="java&#x09;script:alert(1)">e</a>',
        '',
        '<svg onload="alert(1)"><circle r="5"></circle><script>alert(1)</script></svg>',
        '<math><mi xlink:href="javascript:alert(1)">m</mi></math>',
        '',
        `<img id="png" src="${PNG}"> ![inline](${PNG})`,
        '<img id="svg" src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">',
        '<img id="html" src="data:text/html,<script>alert(1)</script>">',
        '<a id="data-link" href="data:text/html,<script>alert(1)</script>">f</a>',
        '<a id="data-img-link" href="' + PNG + '">g</a>',
        '',
        '[web](https://example.com/page) <a href="HTTP://example.com/up" rel="opener" target="_self">up</a>',
        '[[Garden Plan]] [anchor](#top) <a href="/note/plan#user-content-x">in</a>',
        '<a href="/note/../auth/logout">climb</a> <a href="//example.com/x">proto</a>',
        '<a href="mailto:you@example.com" target="_blank">mail</a>',
      ].join('\n'),
      index,
    );
    return dom(note.html);
  }

  it('never lets javascript: or vbscript: through, however written', () => {
    const root = hostile();
    expect(root.querySelector('script')).toBeNull();
    // A tab inside the scheme stops Markdown from making a link at all:
    // what is left is text, so check attributes, not the whole HTML.
    for (const element of root.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        expect(attribute.value).not.toMatch(/javascript|vbscript|script:/i);
      }
    }
    for (const element of root.querySelectorAll('[href], [src]')) {
      for (const name of ['href', 'src']) {
        const value = element.getAttribute(name);
        if (value !== null)
          expect(value).toMatch(
            /^(https?:|mailto:|\/note\/|#|data:image\/png)/i,
          );
      }
    }
  });

  it('drops SVG and MathML elements with their handlers', () => {
    const root = hostile();
    expect(root.querySelector('svg, circle, math, mi')).toBeNull();
    expect(root.innerHTML).not.toMatch(/onload|xlink/i);
  });

  it('keeps data: URLs only as raster images in img', () => {
    const root = hostile();
    expect(root.querySelector('#user-content-png')?.getAttribute('src')).toBe(
      PNG,
    );
    expect(root.querySelector(`img[alt="inline"]`)?.getAttribute('src')).toBe(
      PNG,
    );
    expect(root.querySelector('#user-content-svg')?.hasAttribute('src')).toBe(
      false,
    );
    expect(root.querySelector('#user-content-html')?.hasAttribute('src')).toBe(
      false,
    );
    expect(
      root.querySelector('#user-content-data-link')?.hasAttribute('href'),
    ).toBe(false);
    expect(
      root.querySelector('#user-content-data-img-link')?.hasAttribute('href'),
    ).toBe(false);
  });

  it('opens external links in a new tab without opener or referrer', () => {
    const root = hostile();
    for (const href of ['https://example.com/page', 'HTTP://example.com/up']) {
      const link = root.querySelector(`a[href="${href}"]`);
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it('leaves links inside the app alone and drops paths that climb out of /note/', () => {
    const root = hostile();
    for (const href of ['/note/plan', '#top', '/note/plan#user-content-x']) {
      const link = root.querySelector(`a[href="${href}"]`);
      expect(link).not.toBeNull();
      expect(link?.hasAttribute('target')).toBe(false);
      expect(link?.hasAttribute('rel')).toBe(false);
    }
    const mail = root.querySelector('a[href^="mailto:"]');
    expect(mail?.hasAttribute('target')).toBe(false);
    for (const text of ['climb', 'proto']) {
      const link = [...root.querySelectorAll('a')].find(
        (anchor) => anchor.textContent === text,
      );
      expect(link?.hasAttribute('href')).toBe(false);
    }
  });
});

describe('sanitizeHtml and collapsible boxes (#602)', () => {
  it('keeps details, summary and open, and drops their event handlers', () => {
    const root = dom(
      sanitizeHtml(
        '<details open="" ontoggle="alert(1)" class="bower-section">' +
          '<summary onclick="alert(2)">Bower on this section</summary>' +
          '<p>Line</p></details>',
      ),
    );
    const details = root.querySelector('details.bower-section');
    expect(details?.hasAttribute('open')).toBe(true);
    expect(details?.querySelector('summary')?.textContent).toBe(
      'Bower on this section',
    );
    expect(root.querySelector('[onclick], [ontoggle]')).toBeNull();
  });

  it("turns a note's own <details ontoggle> into a harmless box", () => {
    const html = renderNote(
      '<details open ontoggle="alert(1)"><summary>More</summary>x</details>\n',
      index,
    ).html;
    expect(dom(html).querySelector('details')).not.toBeNull();
    expect(html).not.toContain('alert');
  });
});

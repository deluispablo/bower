"""Writes a large synthetic Bower folder for the benchmark (fake data only).

    python agent/bench/make-large-vault.py

Starts from a copy of agent/bench/vault/ and adds project and area folders
until there are about 30 of them, each with a hub note, for about 400 notes
and 120 originals (small text PDFs and PNG pictures). It then rewrites
index.md with a row for every note and file (rules v23 rows: no tags, no
description), and log.md with about 600 lines, some of them `Correction:`.

The output goes to agent/bench/vault-large/, which git ignores. Everything
comes from a fixed seed and sorted lists, never from the clock, so every run
writes the same bytes. Standard library only.
"""

import random
import shutil
import struct
import zlib
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'vault'
TARGET = HERE / 'vault-large'
SEED = 974
NOTES = 400
ORIGINALS = 120
LOG_LINES = 600
CORRECTIONS = 24

# Made-up people, companies and places only.
PEOPLE = ['Sam Sample', 'Robin Example', 'Casey Placeholder', 'Jordan Testwell', 'Morgan Fakeley',
          'Riley Demo', 'Quinn Mockford', 'Taylor Stubbs', 'Jamie Dummett', 'Avery Sampleton']
COMPANIES = ['Example Mutual', 'Sample Systems', 'North Example Ltd', 'Placeholder & Co', 'Demo Builders',
             'Mockup Motors', 'Testbed Energy', 'Example Telecom', 'Sample Bank', 'Fakewood Garden Centre']
PLACES = ['Exampleton', 'Samplebury', 'Mockford Green', 'Testwick', 'Demo Park', 'Placeholder Lane']
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September']

# New folders: (top folder, name, tag, keywords, one-line purpose).
FOLDERS = [
    ('1-Projects', 'Kitchen refit', 'project', ['Worktop', 'Cabinets', 'Tiles', 'Sink', 'Lighting', 'Fitter'],
     'A new kitchen before spring.'),
    ('1-Projects', 'Allotment', 'project', ['Plot', 'Seeds', 'Compost', 'Shed key', 'Watering', 'Harvest'],
     'Plot 14 at the Exampleton allotments.'),
    ('1-Projects', 'Half marathon', 'project', ['Training', 'Shoes', 'Race entry', 'Long run', 'Pacing', 'Recovery'],
     'The Samplebury half marathon in April.'),
    ('1-Projects', 'Spanish course', 'project', ['Lesson', 'Vocabulary', 'Grammar', 'Homework', 'Exam', 'Podcast'],
     'Reach B1 by the summer.'),
    ('1-Projects', 'Photo book', 'project', ['Layout', 'Cover', 'Prints', 'Captions', 'Album', 'Order'],
     'A photo book of the year for the family.'),
    ('1-Projects', 'Bathroom tiles', 'project', ['Grout', 'Tiles', 'Sealant', 'Quote', 'Mirror', 'Extractor fan'],
     'Retile the bathroom wall.'),
    ('1-Projects', 'Side project app', 'project', ['Idea', 'Prototype', 'Feedback', 'Hosting', 'Logo', 'Roadmap'],
     'A small budgeting app, evenings only.'),
    ('1-Projects', 'Summer holiday 2027', 'project', ['Flights', 'Hotel', 'Itinerary', 'Budget', 'Ferry', 'Insurance'],
     'Two weeks away next summer.'),
    ('1-Projects', 'Car replacement', 'project', ['Test drive', 'Finance', 'Trade-in', 'Shortlist', 'Warranty', 'Dealer'],
     'Replace the car before the next MOT.'),
    ('2-Areas', 'Pets', 'area', ['Vet', 'Food', 'Vaccinations', 'Pet insurance', 'Walks', 'Grooming'],
     'Biscuit the dog.'),
    ('2-Areas', 'Bills', 'area', ['Water', 'Gas', 'Council tax', 'Broadband', 'TV licence', 'Meter reading'],
     'Household bills and meter readings.'),
    ('2-Areas', 'Taxes', 'area', ['Tax return', 'Payslip', 'P60', 'Tax code', 'Expenses', 'Refund'],
     'Tax returns and letters from the tax office.'),
    ('2-Areas', 'Pension', 'area', ['Statement', 'Contributions', 'Provider', 'Forecast', 'Transfer', 'Beneficiary'],
     'Workplace and private pensions.'),
    ('2-Areas', 'Work', 'area', ['One-to-one', 'Objectives', 'Training', 'Expenses', 'Team', 'Review'],
     'The current job.'),
    ('2-Areas', 'Family', 'area', ['Birthday', 'Visit', 'Gift', 'Call', 'Recipe', 'Holiday'],
     'Family plans and dates to remember.'),
    ('2-Areas', 'Friends', 'area', ['Dinner', 'Trip', 'Birthday', 'Book club', 'Quiz night', 'Housewarming'],
     'Plans with friends.'),
    ('2-Areas', 'Garden', 'area', ['Lawn', 'Hedge', 'Pots', 'Bird feeder', 'Bulbs', 'Fence'],
     'The back garden.'),
    ('2-Areas', 'Bike', 'area', ['Service', 'Tyres', 'Lights', 'Lock', 'Commute', 'Chain'],
     'The commuting bike.'),
    ('2-Areas', 'Phone and broadband', 'area', ['Contract', 'Router', 'Speed test', 'Upgrade', 'Roaming', 'Bill'],
     'Phone, broadband and their contracts.'),
    ('2-Areas', 'Documents', 'area', ['Passport', 'Driving licence', 'Birth certificate', 'Tenancy', 'Warranty', 'ID'],
     'Where the important documents are.'),
    ('2-Areas', 'Volunteering', 'area', ['Shift', 'Food bank', 'Training', 'Rota', 'Event', 'Fundraiser'],
     'Saturday shifts at the Testwick food bank.'),
    ('2-Areas', 'Hobbies', 'area', ['Guitar', 'Sketching', 'Board games', 'Chess', 'Pottery', 'Knitting'],
     'Things done for fun.'),
    ('2-Areas', 'Gym', 'area', ['Membership', 'Routine', 'Classes', 'Progress', 'Locker', 'Trainer'],
     'Gym membership and routines.'),
]

TITLES = ['{k} notes', '{k} plan', '{k}, {company}', '{k} costs', 'Call with {first} about {k}', '{k} checklist',
          '{k} ideas', '{k}, {month} update', '{k} questions', '{k} options', '{k} in {place}', '{k} log']
SENTENCES = [
    '{person} from {company} said the {k} would cost about {amount}.',
    'Booked for {day} {month} in {place}.',
    'Next step: call {company} and ask about the {k}.',
    '{first} thinks the {k} can wait until {month}.',
    'Paid {amount} by card; the confirmation is in the email from {company}.',
    'Compared three options; {company} was the cheapest at {amount}.',
    'Reminder to check the {k} again at the end of {month}.',
    'Met {person} at {place} to talk it through.',
    'Kept the paperwork; nothing else to do for now.',
    'The {k} is done for this year.',
]
DOC_KINDS = ['quote', 'letter', 'statement', 'invoice', 'confirmation', 'contract', 'booking']
PICTURE_KINDS = ['photo', 'screenshot', 'sketch']


def text_pdf(path: Path, lines: list[str]) -> None:
    """A one-page A4 PDF whose text layer holds `lines` (as make-fixtures.py)."""

    def esc(s: str) -> str:
        return s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')

    ops = ['BT', '/F1 11 Tf', '14 TL', '56 780 Td'] + [f'({esc(x)}) Tj T*' for x in lines] + ['ET']
    stream = '\n'.join(ops).encode('latin-1')
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] '
        b'/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        b'<< /Length %d >>\nstream\n' % len(stream) + stream + b'\nendstream',
    ]
    out = bytearray(b'%PDF-1.4\n')
    offsets = []
    for n, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b'%d 0 obj\n' % n + body + b'\nendobj\n'
    xref = len(out)
    out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objects) + 1)
    for off in offsets:
        out += b'%010d 00000 n \n' % off
    out += b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objects) + 1, xref)
    path.write_bytes(bytes(out))


def png(path: Path, rng: random.Random) -> None:
    """A small 96x64 picture of coloured blocks, written with zlib only."""
    width, height = 96, 64
    colours = [bytes(rng.randrange(40, 230) for _ in range(3)) for _ in range(6)]
    rows = b''
    for y in range(height):
        row = b''.join(colours[(x // 32) + 3 * (y // 32)] for x in range(width))
        rows += b'\x00' + row

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

    header = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(rows, 9))
                     + chunk(b'IEND', b''))


def spread(total: int, parts: int, rng: random.Random) -> list[int]:
    """`total` split over `parts` counts that differ by a few."""
    counts = [total // parts] * parts
    for i in range(total - sum(counts)):
        counts[i % parts] += 1
    for _ in range(parts):
        a, b = rng.randrange(parts), rng.randrange(parts)
        if counts[a] > 6:
            counts[a] -= 1
            counts[b] += 1
    return counts


def main() -> None:
    rng = random.Random(SEED)
    if TARGET.exists():
        shutil.rmtree(TARGET)
    shutil.copytree(SOURCE, TARGET)

    content = ['1-Projects', '2-Areas', '3-Resources', '4-Archives']
    existing_notes = sum(1 for top in content for _ in (TARGET / top).rglob('*.md'))
    existing_files = sum(1 for top in content for p in (TARGET / top).rglob('*') if p.is_file() and p.suffix != '.md')
    start = date(2026, 1, 5)
    # (YYYY-MM-DD HH:MM, text), sorted at the end; the small folder's own lines first.
    events: list[tuple[str, str]] = [
        ('2026-09-12 10:02', 'Filed: North Example Ltd, junior analyst.pdf → 1-Projects/Job hunt'),
        ('2026-09-20 09:15', 'Answer: Which flat first'),
    ]

    def when(d: date) -> str:
        return f'{d.isoformat()} {rng.randrange(7, 23):02d}:{rng.randrange(60):02d}'

    note_counts = spread(NOTES - existing_notes - len(FOLDERS), len(FOLDERS), rng)
    file_counts = spread(ORIGINALS - existing_files, len(FOLDERS), rng)
    for (top, name, tag, keywords, purpose), n_notes, n_files in zip(FOLDERS, note_counts, file_counts):
        folder = TARGET / top / name
        folder.mkdir(parents=True)
        created = start + timedelta(days=rng.randrange(0, 60))
        hub_lines: list[str] = []

        files: list[str] = []
        for i in range(n_files):
            k = keywords[i % len(keywords)]
            d = created + timedelta(days=rng.randrange(0, 200))
            if i % 3 == 2:
                fname = f'{k} {PICTURE_KINDS[i % len(PICTURE_KINDS)]} {d.isoformat()}.png'
                png(folder / fname, rng)
                desc = f'{PICTURE_KINDS[i % len(PICTURE_KINDS)].capitalize()} of the {k.lower()}, {MONTHS[d.month - 1]}'
            else:
                company = rng.choice(COMPANIES)
                kind = DOC_KINDS[i % len(DOC_KINDS)]
                fname = f'{k} {kind}, {company} {d.isoformat()}.pdf'
                text_pdf(folder / fname, [company, f'{kind.capitalize()}: {k}', f'Date: {d.isoformat()}',
                                          f'Reference: {SEED}-{rng.randrange(10000, 99999)}', 'For: Alex',
                                          f'Amount: {rng.randrange(20, 900)}.{rng.randrange(100):02d}'])
                desc = f'{kind.capitalize()} from {company} about {k.lower()}'
            files.append(fname)
            hub_lines.append(f'- [[{fname}]] {desc}')
            events.append((when(d), f'Filed: {fname} → {top}/{name}'))

        titles: set[str] = set()
        while len(titles) < n_notes:
            person = rng.choice(PEOPLE)
            titles.add(rng.choice(TITLES).format(k=rng.choice(keywords), company=rng.choice(COMPANIES),
                                                 first=person.split()[0], month=rng.choice(MONTHS),
                                                 place=rng.choice(PLACES)))
        for title in sorted(titles):
            d = created + timedelta(days=rng.randrange(0, 200))
            k = rng.choice(keywords)
            sentences = []
            for s in rng.sample(SENTENCES, rng.randrange(3, 7)):
                person = rng.choice(PEOPLE)
                sentences.append(s.format(k=k.lower(), person=person, first=person.split()[0],
                                          company=rng.choice(COMPANIES), place=rng.choice(PLACES),
                                          month=rng.choice(MONTHS), day=rng.randrange(1, 29),
                                          amount=f'{rng.randrange(15, 2500)} pounds'))
            body = ' '.join(sentences)
            if files and rng.random() < 0.3:
                body += f'\n\nSee [[{rng.choice(files)}]].'
            (folder / f'{title}.md').write_text(
                f'---\ntags: [{tag}, {name.lower().replace(" ", "-")}]\ntype: note\nby: bower\n'
                f'created: {d.isoformat()}\n---\n\n# {title}\n\n{body}\n', encoding='utf-8', newline='\n')
            hub_lines.append(f'- [[{title}]] {body[:40]}')
            events.append((when(d), f'Filed: {title}.md → {top}/{name}'))

        hub_lines.sort()
        (folder / f'{name}.md').write_text(
            f'---\ntags: [{tag}, hub]\ntype: hub\nby: bower\ncreated: {created.isoformat()}\n---\n\n# {name}\n\n'
            f'{purpose}\n\n## Notes & documents\n' + '\n'.join(hub_lines) + '\n', encoding='utf-8', newline='\n')

    # index.md: a row for every note and file, rules v23 shape.
    sections = [('Projects', '1-Projects'), ('Areas', '2-Areas'), ('Resources', '3-Resources'),
                ('Archives', '4-Archives'), ('Answers', 'Answers')]
    folders: list[str] = []
    index = ['---', 'tags: [meta, hub]', 'created: 2026-09-01', 'updated: 2026-09-28', '---', '', '# Index', '',
             'Catalogue of everything in the vault. Bower updates it on every ingest, move or archive.', '']
    for title, top in sections:
        index.append(f'## {title}')
        paths = sorted((p for p in (TARGET / top).rglob('*') if p.is_file() and not p.name.startswith('_')),
                       key=lambda p: p.relative_to(TARGET).as_posix())
        for p in paths:
            rel = p.relative_to(TARGET).as_posix()
            if p.suffix == '.md':
                hub = p.stem == p.parent.name
                kind = 'Hub' if hub else 'Answer' if top == 'Answers' else 'Note'
                index.append(f'- [[{rel[:-3]}]] · {kind} · by Bower')
                if hub:
                    folders.append(p.parent.relative_to(TARGET).as_posix())
            else:
                kind = 'PDF' if p.suffix == '.pdf' else 'Image'
                index.append(f'- [[{rel}]] · {kind} · filed by Bower')
        index.append('')
    index += ['## Meta', '- [[About-Me]]', '- [[log]]']
    (TARGET / 'index.md').write_text('\n'.join(index) + '\n', encoding='utf-8', newline='\n')

    # log.md: filings, corrections and other lines, padded to about LOG_LINES.
    folders.sort()
    for _ in range(CORRECTIONS):
        a, b = rng.sample(folders, 2)
        d = start + timedelta(days=rng.randrange(30, 265))
        events.append((when(d), f'Correction: {a} -> {b} ({d.isoformat()})'))
    fillers = ['Context: notes about the {k}', 'Tag added: #{t}', 'Answer: what is next for the {k}', 'Rule added/changed: file {k} notes in {f}']
    while len(events) < LOG_LINES - 1:
        top, name, tag, keywords, _ = rng.choice(FOLDERS)
        k = rng.choice(keywords).lower()
        d = start + timedelta(days=rng.randrange(0, 265))
        events.append((when(d), rng.choice(fillers).format(k=k, t=k.replace(' ', '-'), f=f'{top}/{name}')))
    events.sort()
    log = ['---', 'tags: [meta]', 'created: 2026-09-01', 'updated: 2026-09-28', '---', '', '# Log', '',
           'Append-only record of everything Bower does. One line per operation: '
           '`YYYY-MM-DD HH:MM · <what> · <files>`.', '', '- 2026-01-04 · Vault created from the Bower template.']
    log += [f'- {stamp} · {text}' for stamp, text in events]
    (TARGET / 'log.md').write_text('\n'.join(log) + '\n', encoding='utf-8', newline='\n')

    notes = sum(1 for top in content for _ in (TARGET / top).rglob('*.md'))
    originals = sum(1 for top in content for p in (TARGET / top).rglob('*') if p.is_file() and p.suffix != '.md')
    pa = sum(1 for f in folders if f.startswith(('1-', '2-')))
    print(f'{TARGET.name}: {len(folders)} folders with a hub ({pa} project and area), {notes} notes, {originals} originals, '
          f'{len(log) - 10} log lines, {len(index)} index lines')


if __name__ == '__main__':
    main()

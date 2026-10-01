"""Writes the benchmark's PDF files (fake content only).

    python agent/bench/make-fixtures.py

Text PDFs are written by hand (one page, Helvetica, a text layer that
pdftotext reads). The scan is a picture of a letter saved as a PDF with
Pillow, so it has no text layer at all. The output is committed, so every
benchmark run reads the same bytes; run this again only to change a file.
"""

from pathlib import Path

HERE = Path(__file__).resolve().parent


def text_pdf(path: Path, lines: list[str]) -> None:
    """A one-page A4 PDF whose text layer holds `lines`, top to bottom."""

    def esc(s: str) -> str:
        return s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')

    ops = ['BT', '/F1 11 Tf', '14 TL', '56 780 Td']
    for line in lines:
        ops.append(f'({esc(line)}) Tj T*')
    ops.append('ET')
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
    out += b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (
        len(objects) + 1,
        xref,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(bytes(out))


def scan_pdf(path: Path, lines: list[str]) -> None:
    """A one-page PDF that is only a greyscale picture of `lines`."""
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new('L', (850, 1100), 245)
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default(size=22)
    y = 80
    for line in lines:
        draw.text((70, y), line, fill=30, font=font)
        y += 34
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, 'PDF', resolution=100.0)


text_pdf(
    HERE / 'vault/2-Areas/Home/Home insurance policy 2026.pdf',
    [
        'Example Mutual - Home Contents Insurance',
        'Policy schedule 2026-2027',
        '',
        'Policyholder: Alex',
        'Address: 12 Sample Lane, Leeds',
        'Policy period: 2026-07-01 to 2027-06-30',
        'Annual premium: 148.00',
        '',
        'What is covered',
        '- Contents up to 25,000, including laptops and phones in the home.',
        '- Escape of water: damage from a burst pipe, a leaking washing machine',
        '  or a leaking radiator is covered.',
        '- Theft after forced entry.',
        '- Accidental damage to TVs and computers.',
        '',
        'What is not covered',
        '- Wear and tear, damp and condensation.',
        '- Items left in a car.',
        '- Damage when the home is empty for more than 60 days in a row.',
        '',
        'Excess',
        '- Standard excess: 100 per claim.',
        '- Escape of water excess: 350 per claim.',
        '',
        'To claim, call 0800 000 0000 within 30 days of the damage.',
    ],
)

text_pdf(
    HERE / 'cases/2-text-pdf/Community garden newsletter, autumn.pdf',
    [
        'Sample Street Community Garden - Autumn Newsletter',
        '',
        'Welcome to the autumn issue. This season we planted forty bulbs,',
        'fixed the compost bays and welcomed six new members.',
        '',
        'Dates for your diary',
        '- Saturday 18 October: bulb planting, 10:00 to 12:00.',
        '- Saturday 8 November: leaf collection and soup lunch.',
        '- Sunday 7 December: winter social at the Example Cafe.',
        '',
        'Plot fees for 2027 stay at 25 a year, due by 31 January.',
        'The tool shed code changes on 1 November; ask a coordinator.',
        '',
        'Thanks to everyone who helped at the summer open day.',
    ],
)

text_pdf(
    HERE / 'cases/3-receipt-pdf/receipt-2026-09-14.pdf',
    [
        'EXAMPLE HARDWARE',
        '42 Sample Road, Leeds',
        '',
        'Receipt no. 000123        2026-09-14 15:42',
        '',
        'Wood screws 4x40 (200)          6.49',
        'Paving slab 450x450 x 6        23.94',
        'Sharp sand 25 kg x 2            9.98',
        'Spirit level 600 mm            11.50',
        '',
        'Subtotal                       51.91',
        'VAT included                    8.65',
        'TOTAL                          51.91',
        '',
        'Paid by card',
        'Returns within 28 days with this receipt.',
    ],
)

scan_pdf(
    HERE / 'cases/4-scanned-pdf/scan0001.pdf',
    [
        'Sample City Libraries',
        '',
        '1 September 2026',
        '',
        'Dear Alex,',
        '',
        'Your library card ends on 30 September 2026.',
        'To renew it, bring proof of address to any branch',
        'before that date, or renew online.',
        '',
        'You have one book on loan, due back on 12 October.',
        '',
        'Kind regards,',
        'Membership team',
    ],
)

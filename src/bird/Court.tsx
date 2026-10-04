/**
 * Bower's court: a twig and the finds laid out small at the back, large at
 * the front, the brand's one pattern (brand book, "The court").
 */
const ROWS: Array<Array<[string, number]>> = [
  [['#3b82f6', 10], ['#f0b64f', 10], ['#c4b5fd', 10], ['#3b82f6', 10], ['#5fcfbc', 10]],
  [['#f0b64f', 15], ['#3b82f6', 15], ['#93c5fd', 15], ['#f0b64f', 15]],
  [['#3b82f6', 22], ['#5fcfbc', 22], ['#f0b64f', 22]],
];

export function Court({ scale = 1 }: { scale?: number }) {
  return (
    <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg viewBox="0 0 200 20" width={190 * scale} height={19 * scale} style={{ display: 'block' }}>
        <path d="M4 9 C60 6 140 12 196 8" stroke="#8a6038" strokeWidth="5" strokeLinecap="round" fill="none" />
        <path d="M60 8 l-14 -7 M132 10 l12 -8 M98 9 l6 8" stroke="#6b4a2e" strokeWidth="3" strokeLinecap="round" />
        <path d="M20 8 C70 6 130 11 180 8" stroke="#b78a58" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity=".7" />
      </svg>
      {ROWS.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: (14 + i * 10) * scale, marginTop: (8 + i * 4) * scale }}>
          {row.map(([c, size], j) => (
            <span key={j} style={{ width: size * scale, height: size * scale, borderRadius: c === '#3b82f6' ? '50%' : '30%', background: c, boxShadow: '0 2px 0 rgba(0,0,0,.25)' }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The parts of the v10 drawing the motion engine moves. */
export type RigPart = 'rig' | 'head' | 'tail' | 'wing' | 'legs' | 'jaw' | 'tuft' | 'eye' | 'iris' | 'carry';

interface Props {
  /** Hears each part's element (for the motion engine). */
  onPart?: (part: RigPart, el: SVGGElement | null) => void;
}

/**
 * Bower, drawing v10, on a 100 × 100 grid with its feet on y = 92. Each part
 * is a group with its own pivot (see the brand book), so every pose is a
 * rotation or a scale of the same parts. Decorative: what Bower "says" is
 * always written next to it.
 */
export function Rig({ onPart }: Props) {
  const r = (part: RigPart) => (onPart ? (el: SVGGElement | null) => onPart(part, el) : undefined);
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" focusable="false" style={{ overflow: 'visible', display: 'block' }}>
      <g className="b-rig" ref={r('rig')}>
        <g className="b-tail" ref={r('tail')}>
          <rect fill="#2a8d80" x="6" y="66" width="28" height="7" rx="3.5" transform="rotate(-40 32 70)" />
          <rect fill="#2f9c8d" x="4" y="66" width="30" height="7" rx="3.5" transform="rotate(-24 32 70)" />
          <rect fill="#2a8d80" x="8" y="66" width="26" height="7" rx="3.5" transform="rotate(-10 32 70)" />
        </g>
        <g className="b-legs" ref={r('legs')} fill="none" stroke="#f0b64f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M46 81L44 91M44 91H51M44 91L40 92.4" />
          <path d="M55 81L56 91M56 91H63M56 91L52 92.4" />
        </g>
        <path fill="#5fcfbc" d="M30 70C30 54 44 44 58 46C72 48 76 62 72 72C68 82 56 86 46 85C36 84 30 78 30 70Z" />
        <ellipse fill="#b9ece2" cx="59" cy="73" rx="11" ry="8.5" transform="rotate(-30 59 73)" />
        <g className="b-wing" ref={r('wing')}>
          <path fill="#2f9c8d" d="M58 52C66 56 64 70 54 74C44 78 32 76 24 72C32 68 40 58 58 52Z" />
          <path fill="none" stroke="#45b3a3" strokeWidth="1.2" strokeLinecap="round" d="M50 62C44 66 38 69 31 71M54 67C48 70 42 72 36 73" />
        </g>
        <g className="b-head" ref={r('head')}>
          <ellipse fill="#5fcfbc" cx="60" cy="47" rx="9" ry="7" />
          <g className="b-tuft" ref={r('tuft')} fill="#5fcfbc">
            <path d="M57 24Q52 14 59 15Q61 19 62 23Z" />
            <path d="M62 22Q62 11 68 14Q66 18 66 23Z" />
          </g>
          <circle fill="#5fcfbc" cx="64" cy="36" r="15" />
          <ellipse fill="#ff9fb4" fillOpacity=".55" cx="73" cy="44" rx="3.2" ry="2" />
          <g className="b-eye" ref={r('eye')}>
            <circle fill="#fff" cx="70" cy="34" r="6.4" />
            <g className="b-iris" ref={r('iris')}>
              <circle fill="#1b2233" cx="70.6" cy="34" r="4.4" />
              <circle fill="none" stroke="#8e7cf3" strokeWidth="1.1" cx="70.6" cy="34" r="3.8" />
              <circle fill="#fff" cx="72" cy="32.4" r="1.5" />
            </g>
          </g>
          <g className="b-jaw" ref={r('jaw')}>
            <path fill="#d9952e" d="M78 38Q86 38 89 39Q85 42 78 41Z" />
          </g>
          <path fill="#f0b64f" d="M78 31Q88 33 92 37Q86 38 78 38Z" />
          {/* Something small held in the beak: hidden until the engine's holding() or the carry still frame shows it. */}
          <g className="b-carry" ref={r('carry')} display="none">
            <rect x="84" y="34" width="14" height="17" rx="2.5" fill="#f3f6fa" />
            <path d="M87 40h8M87 44h8M87 48h5" stroke="#93a3b8" strokeWidth="1.4" strokeLinecap="round" />
          </g>
        </g>
      </g>
    </svg>
  );
}

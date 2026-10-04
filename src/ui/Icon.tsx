/** Stroke icons on a 24 grid, drawn for Bower. Decorative unless labelled by their button. */
const PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  add: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  note: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h4',
  image: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15 9h.01',
  link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  pdf: 'M6 3h8l4 4v14H6zM14 3v4h4M9 13h1.5a1.5 1.5 0 0 1 0 3H9v-5',
  drive: 'M8 4h8l6 10-4 6H6l-4-6zM8 4l6 10M2 14h12',
  x: 'M6 6l12 12M18 6L6 18',
  chev: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  down: 'M6 9l6 6 6-6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  check: 'M5 12l5 5 9-10',
  cmd: 'M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z',
  gear: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  graph: 'M6 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M18 8m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M8 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7.5 7.8l.8 8.4M8 6.4l8 1.4M16.4 9.4l-6.8 7.2',
  outline: 'M4 6h16M8 12h12M8 18h12M4 12h.01M4 18h.01',
  sweep: 'M20.5 3.5l-7.2 7.2M11.6 9.4l3 3M11.6 9.4C8.4 9.6 5.2 12.2 3.5 17l3.5 3.5c4.8-1.7 7.4-4.9 7.6-8.1M6.7 15.2l2 2M9.2 13.1l1.7 1.7',
  pile: 'M4 8l8-4 8 4-8 4zM4 12l8 4 8-4M4 16l8 4 8-4',
  side: 'M4 4h16v16H4zM10 4v16',
  sideRight: 'M4 4h16v16H4zM14 4v16',
  newNote: 'M14 3H6v18h12V7zM14 3v4h4M12 11v6M9 14h6',
  newFolder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 10v6M9 13h6',
  sort: 'M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4',
  reveal: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  collapse: 'M7 20l5-5 5 5M7 4l5 5 5-5',
  expand: 'M7 15l5 5 5-5M7 9l5-5 5 5',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  rename: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  move: 'M5 12h14M13 6l6 6-6 6',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  send: 'M5 12l15-7-6 15-2-6z',
  table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  play: 'M7 5l12 7-12 7z',
  question: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5V14M12 17.5h.01',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  shield: 'M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.3M12 16.5h.01',
} as const;

export type IconName = keyof typeof PATHS;

interface Props {
  name: IconName;
  size?: number;
  stroke?: number;
  className?: string;
  label?: string;
}

export function Icon({ name, size = 20, stroke = 1.8, className, label }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Bower's head on its own: the favicon drawing, for 16 to 28 px. */
export function BowerHead({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="34 8 62 62" aria-hidden="true" focusable="false">
      <path fill="#5fcfbc" d="M57 24Q52 14 59 15Q61 19 62 23Z" />
      <path fill="#5fcfbc" d="M62 22Q62 11 68 14Q66 18 66 23Z" />
      <circle fill="#5fcfbc" cx="64" cy="36" r="15" />
      <circle fill="#fff" cx="70" cy="34" r="6.4" />
      <circle fill="#1b2233" cx="70.6" cy="34" r="4.4" />
      <circle fill="#fff" cx="72" cy="32.4" r="1.5" />
      <path fill="#d9952e" d="M78 38Q86 38 89 39Q85 42 78 41Z" />
      <path fill="#f0b64f" d="M78 31Q88 33 92 37Q86 38 78 38Z" />
    </svg>
  );
}

/** The logo: the whole bird, simplified (brand book, "Logo"). */
export function BowerMark({ size = 32 }: { size?: number }) {
  return <img src="/bower-mark.svg" width={size} height={Math.round(size * 0.88)} alt="" aria-hidden="true" />;
}

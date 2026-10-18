import { Link } from 'react-router';
import { noteRoute } from '@/app/paths';
import type { LinkFn } from './markdown';
import { useResolver } from './resolve';

/**
 * A [[wikilink]] outside a note (a request's answer, a question): it opens the note it names, or reads as plain
 * words when no note has that name, as a note's own unresolved links do. `onClick` runs as a link opens (to close a sheet).
 */
export function useNoteLink(onClick?: () => void): LinkFn {
  const resolve = useResolver();
  return (target, label, key) => {
    const path = resolve(target);
    return path ? (
      <Link key={key} to={noteRoute(path)} onClick={onClick}>
        {label}
      </Link>
    ) : (
      <span key={key}>{label}</span>
    );
  };
}

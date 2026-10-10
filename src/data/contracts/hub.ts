import { nameOf } from './tree';

/** The shared hub/MOC recognition for the explorer and edit contract. */
export function isHub(path: string, name = nameOf(path), type?: string): boolean {
  if (type === 'moc' || type === 'hub') return true;
  const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  return !!parent && name === `${parent.slice(parent.lastIndexOf('/') + 1)}.md`;
}

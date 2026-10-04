import type { TreeNode } from '@/data/types';
import { rootOf } from '@/data/tree';

/** Routes for things in the folder; each path segment is encoded. */
const enc = (path: string): string => path.split('/').map(encodeURIComponent).join('/');
export const routeFor = (node: Pick<TreeNode, 'path' | 'type'>): string =>
  node.type === 'folder' ? `/files/${enc(node.path)}` : `/note/${enc(node.path)}`;
export const noteRoute = (path: string): string => `/note/${enc(path)}`;
export const folderRoute = (path: string): string => (path ? `/files/${enc(path)}` : '/files');
export const decodeSplat = (splat: string | undefined): string =>
  (splat ?? '').split('/').filter(Boolean).map(decodeURIComponent).join('/');

/** The colour of a main folder, used next to its name (never alone). */
export function paraColor(path: string): string {
  switch (rootOf(path)) {
    case 'Inbox':
      return 'var(--inbox)';
    case 'Projects':
      return 'var(--para-projects)';
    case 'Areas':
      return 'var(--para-areas)';
    case 'Resources':
      return 'var(--para-resources)';
    case 'Archive':
      return 'var(--para-archive)';
    default:
      return 'var(--text-muted)';
  }
}

/** "Projects / Flat hunt" */
export const crumbs = (folder: string): string => folder.split('/').filter(Boolean).join(' / ');

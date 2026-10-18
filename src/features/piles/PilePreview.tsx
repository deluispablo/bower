import { useEffect, useState } from 'react';
import { useSources } from '@/data/provider';
import type { PileItem } from '@/data/types';
import { Icon } from '@/ui/Icon';
import s from './piles.module.css';

/**
 * A thing's 38 x 38 px tile in the pile view: an arrived image shows its picture, anything else its icon. The object
 * URL lives only while its picture shows (revoked on replace and unmount), an answer for a row the screen left is
 * dropped, and a picture that cannot be shown keeps the icon with 'Preview unavailable' in the same box. Only a
 * refused read is an error; a format this browser cannot decode is not.
 */
export function PilePreview({ pileId, item }: { pileId: string; item: PileItem }) {
  const { vault } = useSources();
  const key = `${pileId}/${item.id}`;
  const ask = item.kind === 'image' && item.upload === undefined && vault.imagePreview !== undefined;
  const [shown, setShown] = useState<{ key: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!ask || !vault.imagePreview) return;
    let live = true;
    let url: string | null = null;
    vault.imagePreview(pileId, item.id).then(
      (blob) => {
        if (!live) return;
        url = URL.createObjectURL(blob);
        setShown({ key, url });
      },
      (e: unknown) => {
        if (!live) return;
        console.error(e);
        setShown({ key, url: null });
      },
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [ask, vault, pileId, item.id, key]);
  const mine = shown?.key === key ? shown : null;
  return (
    <span className={s.tile}>
      {mine?.url ? (
        <img src={mine.url} alt="" onError={() => setShown({ key, url: null })} />
      ) : (
        <Icon name={item.kind === 'image' ? 'image' : item.kind === 'link' ? 'link' : 'file'} />
      )}
      {mine && !mine.url && <span className="sr-only">Preview unavailable</span>}
    </span>
  );
}

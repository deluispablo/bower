import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useIsDesktop } from '@/ui/media';
import { Toasts } from '@/ui/toast';
import { DesktopShell } from './DesktopShell';
import { PhoneShell } from './PhoneShell';
import { useUi } from './ui-store';
import { Palette } from '@/features/palette/Palette';
import { TidySheet } from '@/features/tidy/TidySheet';
import { MovePicker } from '@/features/files/MovePicker';
import { useRunWatcher } from '@/features/tidy/useRunWatcher';
import { Replay } from '@/features/tidy/Replay';

/** Picks the desktop or phone frame and mounts what every screen shares. */
export function Shell() {
  const desktop = useIsDesktop();
  const nav = useNavigate();
  useRunWatcher();

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useUi.getState().setPalette(!useUi.getState().paletteOpen);
      } else if (mod && e.key.toLowerCase() === 'n' && e.altKey) {
        e.preventDefault();
        nav('/add');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);

  return (
    <>
      {desktop ? <DesktopShell /> : <PhoneShell />}
      <Palette />
      <TidySheet />
      <MovePicker />
      <Replay />
      <Toasts />
    </>
  );
}

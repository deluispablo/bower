import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useIsDesktop } from '@/ui/media';
import { useUser } from '@/data/provider';
import { useTabs } from './tabs-store';
import { DesktopShell } from './DesktopShell';
import { PhoneShell } from './PhoneShell';
import { useUi } from './ui-store';
import { Palette } from '@/features/palette/Palette';
import { TidySheet } from '@/features/tidy/TidySheet';
import { ConfirmBin } from '@/features/files/ConfirmBin';
import { NameSheet } from '@/features/files/NameSheet';
import { MovePicker } from '@/features/files/MovePicker';
import { useRunWatcher } from '@/features/tidy/useRunWatcher';
import { Replay } from '@/features/tidy/Replay';

/** Picks the desktop or phone frame and mounts what every screen shares. */
export function Shell() {
  const desktop = useIsDesktop();
  const nav = useNavigate();
  useRunWatcher();
  // Tabs kept in this browser tab belong to who is signed in.
  const { data: user } = useUser();
  useEffect(() => {
    if (user?.email) useTabs.getState().forPerson(user.email);
  }, [user?.email]);

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
      <ConfirmBin />
      <NameSheet />
      <Replay />
    </>
  );
}

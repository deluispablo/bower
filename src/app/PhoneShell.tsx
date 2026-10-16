import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Icon, BowerHead } from '@/ui/Icon';
import { IconButton } from '@/ui/Button';
import { useUi } from './ui-store';
import { Explorer } from '@/features/files/Explorer';
import { RunChip } from '@/features/tidy/RunChip';
import { Dock } from '@/ui/Dock';
import { Sheet } from '@/ui/Sheet';
import { usePrefs } from './prefs';
import s from './shell.module.css';

/** The phone frame: a tab bar, the tree as a drawer from the left edge, the run chip. */
export function PhoneShell() {
  const { drawerOpen, setDrawer } = useUi();
  const birdMoves = usePrefs((p) => p.birdMoves);
  const loc = useLocation();
  // Every navigation, to the same page too, is a new location key: it closes the drawer and sends the keyboard to the page.
  const [wasOpen, setWasOpen] = useState(false);
  const [openedOn, setOpenedOn] = useState(loc.key);
  if (drawerOpen !== wasOpen) {
    setWasOpen(drawerOpen);
    if (drawerOpen) setOpenedOn(loc.key);
  }
  useEffect(() => setDrawer(false), [loc.key, setDrawer]);

  // A swipe from the left edge opens the tree.
  const start = useRef<number | null>(null);
  return (
    <div className={s.phone}>
      <div
        className={s.edge}
        aria-hidden="true"
        onPointerDown={(e) => (start.current = e.clientX)}
        onPointerMove={(e) => {
          if (start.current !== null && e.clientX - start.current > 40) {
            start.current = null;
            setDrawer(true);
          }
        }}
        onPointerUp={() => (start.current = null)}
      />
      <main id="main" tabIndex={-1} style={{ outline: 'none' }}>
        <Outlet />
      </main>
      <Dock>
        <RunChip />
      </Dock>
      <nav className={s.tabbar} aria-label="Main">
        <NavLink to="/" end className={s.tb}>
          <Icon name="home" size={24} />
          <span>Home</span>
        </NavLink>
        <NavLink to="/files" className={s.tb}>
          <Icon name="folder" size={24} />
          <span>Files</span>
        </NavLink>
        <NavLink to="/add" className={s.tb}>
          <Icon name="add" size={24} />
          <span>Add</span>
        </NavLink>
        <NavLink to="/bower" className={s.tb}>
          <BowerHead size={26} />
          <span>Bower</span>
        </NavLink>
      </nav>
      <Sheet
        open={drawerOpen}
        onOpenChange={setDrawer}
        title="Your folders"
        hideTitle
        placement="left"
        still={!birdMoves}
        navigation={!drawerOpen && openedOn !== loc.key}
        style={{ left: 0, width: 'min(340px, 88vw)', paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className={s.drawerBody}>
          <div className={s.drawerHead}>
            <strong aria-hidden="true" style={{ fontFamily: 'var(--font-display)', color: 'var(--heading)', fontSize: 18 }}>Your folders</strong>
            <IconButton label="Close" onClick={() => setDrawer(false)}>
              <Icon name="x" />
            </IconButton>
          </div>
          <Explorer variant="drawer" />
        </div>
      </Sheet>
    </div>
  );
}

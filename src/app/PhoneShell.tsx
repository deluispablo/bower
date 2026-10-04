import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Icon, BowerHead } from '@/ui/Icon';
import { IconButton } from '@/ui/Button';
import { useUi } from './ui-store';
import { Explorer } from '@/features/files/Explorer';
import { RunChip } from '@/features/tidy/RunChip';
import s from './shell.module.css';

/** The phone frame: a tab bar, the tree as a drawer from the left edge, the run chip. */
export function PhoneShell() {
  const { drawerOpen, setDrawer } = useUi();
  const loc = useLocation();
  useEffect(() => setDrawer(false), [loc.pathname, setDrawer]);

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
      <main id="main">
        <Outlet />
      </main>
      <RunChip />
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
      {drawerOpen && (
        <>
          <div className={s.drawerScrim} onClick={() => setDrawer(false)} aria-hidden="true" />
          <aside className={s.drawer} role="dialog" aria-modal="true" aria-label="Your folders">
            <div className={s.drawerHead}>
              <strong style={{ fontFamily: 'var(--font-display)', color: 'var(--heading)', fontSize: 18 }}>Your folders</strong>
              <IconButton label="Close" onClick={() => setDrawer(false)}>
                <Icon name="x" />
              </IconButton>
            </div>
            <Explorer variant="drawer" />
          </aside>
        </>
      )}
    </div>
  );
}

import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Icon, BowerHead, BowerMark } from '@/ui/Icon';
import { Dock } from '@/ui/Dock';
import { IconButton } from '@/ui/Button';
import { usePrefs } from './prefs';
import { useUi } from './ui-store';
import { useTabs } from './tabs-store';
import { Tabs, tabPanel } from '@/ui/Tabs';
import { decodeSplat } from './paths';
import { thingName, nameOf } from '@/data/tree';
import { Explorer } from '@/features/files/Explorer';
import { SearchPanel } from '@/features/files/SearchPanel';
import { BookmarksPanel } from '@/features/files/BookmarksPanel';
import { RightPanel } from '@/features/note/RightPanel';
import { StatusBar } from '@/features/tidy/StatusBar';
import { TidyButton } from '@/features/tidy/TidyButton';
import s from './shell.module.css';

export function tabTitle(route: string): string {
  const [path] = route.split('?');
  if (!path || path === '/') return 'Home';
  if (path === '/add') return 'Add';
  if (path === '/bower') return 'Bower';
  if (path === '/settings') return 'Settings';
  if (path === '/files') return 'Your Bower folder';
  if (path.startsWith('/pile/')) return 'A pile';
  if (path.startsWith('/files/')) return nameOf(decodeSplat(path.slice(7)));
  if (path.startsWith('/note/')) return thingName(nameOf(decodeSplat(path.slice(6))));
  return 'Bower';
}

export function DesktopShell() {
  const { leftWidth, rightWidth, leftOpen, rightOpen, set } = usePrefs();
  const { leftTab, setLeftTab } = useUi();
  const loc = useLocation();
  const nav = useNavigate();
  const { tabs, active, follow, open, close, activate } = useTabs();
  const [searchByKey, setSearchByKey] = useState(false);

  const route = loc.pathname + loc.search;
  useEffect(() => follow(route), [route, follow]);
  // The active tab stays in sight however many are open.
  useEffect(() => {
    document.querySelector(`[data-tab="${active}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active, tabs.length]);

  const drag = useRef<{ side: 'left' | 'right'; x: number; w: number } | null>(null);
  const startDrag = (e: RPointerEvent<HTMLDivElement>): void => {
    const side = e.currentTarget.dataset.side === 'right' ? 'right' : 'left';
    drag.current = { side, x: e.clientX, w: side === 'left' ? leftWidth : rightWidth };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDrag = (e: RPointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const w = Math.max(220, Math.min(480, d.side === 'left' ? d.w + dx : d.w - dx));
    set(d.side === 'left' ? { leftWidth: w } : { rightWidth: w });
  };
  const endDrag = (): void => {
    drag.current = null;
  };
  const keyResize = (side: 'left' | 'right') => (e: RKeyboardEvent<HTMLDivElement>): void => {
    const step = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0;
    if (!step) return;
    e.preventDefault();
    const w = side === 'left' ? leftWidth + step : rightWidth - step;
    set(side === 'left' ? { leftWidth: Math.max(220, Math.min(480, w)) } : { rightWidth: Math.max(220, Math.min(480, w)) });
  };

  return (
    <div className={s.desk} style={{ ['--lw' as string]: `${leftOpen ? leftWidth : 0}px`, ['--rw' as string]: `${rightOpen ? rightWidth : 0}px` }}>
      <nav className={s.ribbon} aria-label="Main">
        <NavLink to="/" className={s.ribbonMark} aria-label="Bower, Home">
          <BowerMark size={30} />
        </NavLink>
        <NavLink to="/" end className={s.rb} aria-label="Home" title="Home">
          <Icon name="home" />
        </NavLink>
        <NavLink to="/add" className={s.rb} aria-label="Add a pile" title="Add a pile">
          <Icon name="add" />
        </NavLink>
        <NavLink to="/bower" className={s.rb} aria-label="Talk to Bower" title="Talk to Bower">
          <BowerHead size={22} />
        </NavLink>
        <button type="button" className={s.rb} aria-label="Command palette" title="Command palette (⌘K)" onClick={() => useUi.getState().setPalette(true)}>
          <Icon name="cmd" />
        </button>
        <span className={s.grow} />
        <NavLink to="/settings" className={s.rb} aria-label="Settings" title="Settings">
          <Icon name="gear" />
        </NavLink>
      </nav>

      {leftOpen && (
        <aside className={s.left} aria-label="Side panel">
          <Tabs
            label="Side panel"
            id="side"
            className={s.panelTabs}
            tabClassName={s.ptab}
            value={leftTab}
            onChange={(k, by) => {
              setSearchByKey(by === 'key');
              setLeftTab(k);
            }}
            items={[
              { key: 'files', label: 'Files', icon: <Icon name="folder" size={18} /> },
              { key: 'search', label: 'Search', icon: <Icon name="search" size={18} /> },
              { key: 'bookmarks', label: 'Bookmarks', icon: <Icon name="bookmark" size={18} /> },
            ]}
          />
          <div className={s.panelBody} {...tabPanel('side', leftTab)}>
            {leftTab === 'files' && <Explorer variant="panel" />}
            {leftTab === 'search' && <SearchPanel focus={!searchByKey} />}
            {leftTab === 'bookmarks' && <BookmarksPanel />}
          </div>
          <div className={s.resizer} role="separator" tabIndex={0} aria-orientation="vertical" aria-valuenow={leftWidth} aria-valuemin={220} aria-valuemax={480} aria-label="Resize the side panel" onKeyDown={keyResize('left')} data-side="left" onPointerDown={startDrag} onPointerMove={onDrag} onPointerUp={endDrag} />
        </aside>
      )}

      <div className={s.center}>
        <div className={s.tabstrip}>
          <IconButton small label={leftOpen ? 'Hide the side panel' : 'Show the side panel'} onClick={() => set({ leftOpen: !leftOpen })}>
            <Icon name="side" size={18} />
          </IconButton>
          <nav aria-label="Open tabs" className={s.tabs}>
            {tabs.map((t) => (
              <div key={t.id} data-tab={t.id} className={`${s.tab} ${t.id === active ? s.tabOn : ''}`}>
                <button
                  type="button"
                  aria-current={t.id === active ? 'page' : undefined}
                  className={s.tabLabel}
                  onClick={() => {
                    const x = activate(t.id);
                    if (x) nav(x.route);
                  }}
                  onAuxClick={(e) => {
                    if (e.button === 1) {
                      const x = close(t.id);
                      if (x) nav(x.route);
                    }
                  }}
                >
                  {tabTitle(t.route)}
                </button>
                <button
                  type="button"
                  className={s.tabX}
                  aria-label={`Close ${tabTitle(t.route)}`}
                  onClick={() => {
                    const x = close(t.id);
                    if (x) nav(x.route);
                  }}
                >
                  <Icon name="x" size={16} />
                </button>
              </div>
            ))}
          </nav>
          <IconButton
            small
            label="New tab"
              onClick={() => {
                open('/');
                nav('/');
              }}
            >
              <Icon name="add" size={16} />
            </IconButton>
          <span className={s.grow} />
          <TidyButton />
          <IconButton small label={rightOpen ? 'Hide the right panel' : 'Show the right panel'} onClick={() => set({ rightOpen: !rightOpen })}>
            <Icon name="sideRight" size={18} />
          </IconButton>
        </div>
        <main className={s.view} id="main" tabIndex={-1}>
          <Outlet />
        </main>
        <Dock />
      </div>

      {rightOpen && (
        <aside className={s.right} aria-label="Right panel">
          <div className={s.resizer + ' ' + s.resizerLeft} role="separator" tabIndex={0} aria-orientation="vertical" aria-valuenow={rightWidth} aria-valuemin={220} aria-valuemax={480} aria-label="Resize the right panel" onKeyDown={keyResize('right')} data-side="right" onPointerDown={startDrag} onPointerMove={onDrag} onPointerUp={endDrag} />
          <RightPanel />
        </aside>
      )}

      <StatusBar />
    </div>
  );
}

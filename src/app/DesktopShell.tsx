import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Icon, BowerHead, BowerMark } from '@/ui/Icon';
import { Dock } from '@/ui/Dock';
import { IconButton } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
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

const RIBBON = 52;
const PAGE_MIN = 560;
type Side = 'left' | 'right';
type PanelPrefs = Pick<ReturnType<typeof usePrefs.getState>, 'leftOpen' | 'rightOpen' | 'leftWidth' | 'rightWidth'>;

/** Keep the page readable, folding the secondary (right) panel first. */
export function docked(shellWidth: number, prefs: PanelPrefs): Record<Side, boolean> {
  let left = prefs.leftOpen;
  let right = prefs.rightOpen;
  const fits = () => RIBBON + (left ? prefs.leftWidth : 0) + (right ? prefs.rightWidth : 0) + PAGE_MIN <= shellWidth;
  if (!fits()) right = false;
  if (!fits()) left = false;
  return { left, right };
}

function panelLimit(shellWidth: number, prefs: PanelPrefs, side: Side): number {
  const shown = docked(shellWidth, prefs);
  const other = side === 'left' ? (shown.right ? prefs.rightWidth : 0) : (shown.left ? prefs.leftWidth : 0);
  return Math.min(480, shellWidth - RIBBON - PAGE_MIN - other);
}

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
  const { leftWidth, rightWidth, leftOpen, rightOpen, birdMoves, set } = usePrefs();
  const { leftTab, setLeftTab } = useUi();
  const loc = useLocation();
  const nav = useNavigate();
  const { tabs, active, follow, open, close, activate } = useTabs();
  const [searchByKey, setSearchByKey] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const leftPanel = useRef<HTMLElement>(null);
  const rightPanel = useRef<HTMLElement>(null);
  const leftToggle = useRef<HTMLButtonElement>(null);
  const rightToggle = useRef<HTMLButtonElement>(null);
  const [bounds, setBounds] = useState<{ width: number; left: number; top: number; height: number } | null>(null);
  const [overlay, setOverlay] = useState<{ side: Side; locationKey: string; open: boolean } | null>(null);
  const prefs = { leftWidth, rightWidth, leftOpen, rightOpen };
  const shellWidth = bounds?.width ?? 0;
  const measured = bounds !== null;
  const shown = docked(shellWidth, prefs);
  const leftFolded = !docked(shellWidth, { ...prefs, leftOpen: true }).left;
  const rightFolded = !docked(shellWidth, { ...prefs, rightOpen: true }).right;
  const leftMax = panelLimit(shellWidth, prefs, 'left');
  const rightMax = panelLimit(shellWidth, prefs, 'right');

  const route = loc.pathname + loc.search;
  // A route change dismisses the panel, leaving Sheet's navigation focus rule to the page heading.
  const overlaySide = overlay?.open && overlay.locationKey === loc.key && !shown[overlay.side] ? overlay.side : null;
  // Retain the dismissal reason for Sheet's close-focus hook, but never reopen on browser Back.
  useEffect(() => () => {
    setOverlay((current) => current?.open && current.locationKey === loc.key ? { ...current, open: false } : current);
  }, [loc.key]);
  useLayoutEffect(() => {
    const node = frame.current;
    if (!node) return;
    const measure = (observedWidth?: number): void => {
      const rect = node.getBoundingClientRect();
      const width = observedWidth ?? rect.width;
      const next = docked(width, usePrefs.getState());
      if (!next.left && leftPanel.current?.contains(document.activeElement)) leftToggle.current?.focus();
      if (!next.right && rightPanel.current?.contains(document.activeElement)) rightToggle.current?.focus();
      setOverlay((open) => open && next[open.side] ? null : open);
      setBounds({ width, left: rect.left, top: rect.top, height: rect.height });
    };
    // Establish docking before the page and panels mount, without waiting for the observer.
    measure();
    const observer = new ResizeObserver(([entry]) => {
      if (entry) measure(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const toggle = (side: Side): void => {
    const folded = side === 'left' ? leftFolded : rightFolded;
    if (folded) setOverlay(overlaySide === side ? null : { side, locationKey: loc.key, open: true });
    else set(side === 'left' ? { leftOpen: !leftOpen } : { rightOpen: !rightOpen });
  };
  useEffect(() => follow(route), [route, follow]);
  // The active tab stays in sight however many are open. Only the strip scrolls: scrollIntoView would move the
  // sequential focus starting point, so the first Tab would skip "Skip to content".
  useEffect(() => {
    const tab = document.querySelector(`[data-tab="${active}"]`);
    const strip = tab?.parentElement;
    if (!tab || !strip) return;
    const t = tab.getBoundingClientRect();
    const n = strip.getBoundingClientRect();
    strip.scrollLeft += t.left < n.left ? t.left - n.left : Math.max(0, t.right - n.right);
  }, [active, tabs.length, measured]);

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
    const w = Math.max(220, Math.min(d.side === 'left' ? leftMax : rightMax, d.side === 'left' ? d.w + dx : d.w - dx));
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
    const width = Math.max(220, Math.min(side === 'left' ? leftMax : rightMax, w));
    set(side === 'left' ? { leftWidth: width } : { rightWidth: width });
  };

  const sideContent = (
    <>
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
        {leftTab === 'search' && <SearchPanel focus={overlaySide !== 'left' && !searchByKey} />}
        {leftTab === 'bookmarks' && <BookmarksPanel />}
      </div>
    </>
  );

  if (!bounds) return <div ref={frame} className={s.desk} />;

  return (
    <div ref={frame} className={s.desk} style={{ ['--lw' as string]: `${shown.left ? leftWidth : 0}px`, ['--rw' as string]: `${shown.right ? rightWidth : 0}px` }}>
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
        <NavLink to="/bower" className={s.rb} aria-label="Ask" title="Ask">
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

      {shown.left && (
        <aside ref={leftPanel} className={s.left} aria-label="Side panel">
          {sideContent}
          <div className={s.resizer} role="separator" tabIndex={0} aria-orientation="vertical" aria-valuenow={Math.round(leftWidth)} aria-valuemin={220} aria-valuemax={leftMax} aria-label="Resize the side panel" onKeyDown={keyResize('left')} data-side="left" onPointerDown={startDrag} onPointerMove={onDrag} onPointerUp={endDrag} />
        </aside>
      )}

      <div className={s.center}>
        <div className={s.tabstrip}>
          <IconButton ref={leftToggle} small label={shown.left ? 'Hide the side panel' : 'Show the side panel'} aria-expanded={leftFolded ? overlaySide === 'left' : undefined} onClick={() => toggle('left')}>
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
          <IconButton ref={rightToggle} small label={shown.right ? 'Hide the right panel' : 'Show the right panel'} aria-expanded={rightFolded ? overlaySide === 'right' : undefined} onClick={() => toggle('right')}>
            <Icon name="sideRight" size={18} />
          </IconButton>
        </div>
        <main className={s.view} id="main" tabIndex={-1}>
          <Outlet />
        </main>
        <Dock />
      </div>

      {shown.right && (
        <aside ref={rightPanel} className={s.right} aria-label="Right panel">
          <div className={s.resizer + ' ' + s.resizerLeft} role="separator" tabIndex={0} aria-orientation="vertical" aria-valuenow={Math.round(rightWidth)} aria-valuemin={220} aria-valuemax={rightMax} aria-label="Resize the right panel" onKeyDown={keyResize('right')} data-side="right" onPointerDown={startDrag} onPointerMove={onDrag} onPointerUp={endDrag} />
          <RightPanel />
        </aside>
      )}

      <Sheet
        open={overlaySide !== null}
        onOpenChange={(open) => { if (!open) setOverlay(null); }}
        title={overlay?.side === 'left' ? 'Side panel' : 'Right panel'}
        hideTitle
        placement={overlay?.side ?? 'left'}
        still={!birdMoves}
        navigation={overlay !== null && overlay.locationKey !== loc.key}
        style={{
          width: Math.min(overlay?.side === 'left' ? leftWidth : rightWidth, Math.max(0, bounds.width - RIBBON)),
          left: overlay?.side === 'left' ? bounds.left + RIBBON : undefined,
          right: overlay?.side === 'right' ? window.innerWidth - bounds.left - bounds.width : undefined,
          top: bounds.top, height: bounds.height,
        }}
        overlayStyle={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, right: 'auto', bottom: 'auto' }}
      >
        <div className={`${s.panelClose} ${overlay?.side === 'right' ? s.panelCloseRight : ''}`}>
          <IconButton small className={s.overlayClose} label={overlay?.side === 'left' ? 'Close the side panel' : 'Close the right panel'} onClick={() => setOverlay(null)}>
            <Icon name="x" size={18} />
          </IconButton>
        </div>
        {overlay?.side === 'left' ? sideContent : <RightPanel />}
      </Sheet>

      <StatusBar />
    </div>
  );
}

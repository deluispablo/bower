import { beforeEach, afterEach, expect, it, vi } from 'vitest';

vi.mock('./clean-start', () => ({}));
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: vi.fn() }) }));
vi.mock('@/app/App', () => ({ App: () => null }));
vi.mock('@/app/prefs', () => ({ applyTheme: vi.fn(), usePrefs: { getState: () => ({ theme: 'dark' }) } }));
vi.mock('@/app/boot', () => ({ bootStart: vi.fn(), bootFail: vi.fn() }));
vi.mock('@/data/provider', () => ({ DataProvider: () => null }));
vi.mock('@/data/demo/scenario', () => ({ readScenario: () => 'default', readTimeScale: () => 'instant' }));
vi.mock('@/data/choose', () => ({ readSource: () => 'demo', buildSources: async () => ({ sources: {} }) }));

let handler: EventListener | undefined;
const reload = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  handler = undefined;
  reload.mockClear();
  sessionStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
  vi.stubGlobal('location', { reload });
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'vite:preloadError') handler = listener as EventListener;
    else add(type, listener, options);
  });
  await import('./main');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function preloadError(payload: unknown): Event {
  const event = Object.assign(new Event('vite:preloadError', { cancelable: true }), { payload });
  expect(handler, 'main installs the preload recovery handler').toBeTypeOf('function');
  handler?.(event);
  return event;
}

it('a missing lazy chunk reloads once per page load', () => {
  const error = new TypeError('Failed to fetch dynamically imported module: /assets/old.js');
  expect(preloadError(error).defaultPrevented).toBe(true);
  expect(preloadError(error).defaultPrevented).toBe(false);
  expect(reload).toHaveBeenCalledOnce();
});

it('the once-per-load guard works when storage throws', () => {
  vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new Error('Storage blocked'); });
  const error = new TypeError('Failed to fetch dynamically imported module: /assets/old.js');
  preloadError(error);
  preloadError(error);
  expect(reload).toHaveBeenCalledOnce();
});

it('a recent recovery prevents a loop across page loads', async () => {
  const error = new TypeError('Failed to fetch dynamically imported module: /assets/old.js');
  preloadError(error);
  vi.resetModules();
  await import('./main');
  expect(preloadError(error).defaultPrevented).toBe(false);
  expect(reload).toHaveBeenCalledOnce();
});

it('other preload errors continue to the existing error reporting', () => {
  expect(preloadError(new Error('A module threw during evaluation')).defaultPrevented).toBe(false);
  expect(preloadError(new Error('Unable to preload CSS for /assets/app.css')).defaultPrevented).toBe(false);
  expect(reload).not.toHaveBeenCalled();
});

it('the once-per-load guard also works when storing its timestamp throws', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage full'); });
  const error = new TypeError('Failed to fetch dynamically imported module: /assets/old.js');
  preloadError(error);
  preloadError(error);
  expect(reload).toHaveBeenCalledOnce();
});

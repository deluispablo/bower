import { cleanup, render, screen, act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dock } from './Dock';
import { Sheet } from './Sheet';
import { toast, useToasts } from './toast';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty('--dock-h');
  useToasts.setState({ list: [] });
});

/** Real modal lifecycle, including its overlay home; only browser history is inert in jsdom. */
function ModalDock({ first = false, second = false }: { first?: boolean; second?: boolean }) {
  return <>
    <Dock><button type="button">Watch the run</button></Dock>
    <Sheet open={first} onOpenChange={() => undefined} title="Pile details"><button type="button">Keep this pile</button></Sheet>
    <Sheet open={second} onOpenChange={() => undefined} title="More details"><button type="button">Keep these details</button></Sheet>
  </>;
}

function expectMessageHidden(text: string): void {
  const message = screen.queryByText(text, { exact: true });
  if (message) expect(message).not.toBeVisible();
  else expect(message).toBeNull();
}

describe('messages wait for sheets', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Do not leave jsdom's asynchronous back waiting for a later test's modal.
    vi.spyOn(history, 'pushState').mockImplementation(() => undefined);
  });

  it('MWS a message on screen disappears while a sheet is open', () => {
    const view = render(<ModalDock />);
    const run = vi.fn();
    let id = 0;
    act(() => { id = toast('Alex added a pile', { label: 'Undo', run }); });
    // Positive control: the message and action really showed before opening.
    expect(screen.getByText('Alex added a pile')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
    view.rerender(<ModalDock first />);
    expect(screen.getByRole('dialog', { name: 'Pile details' })).toBeVisible();
    expectMessageHidden('Alex added a pile');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(useToasts.getState().list).toEqual([{ id, text: 'Alex added a pile', action: { label: 'Undo', run } }]);
    // The run chip keeps today's visual behaviour, even though Radix makes the page inert.
    expect(screen.getByText('Watch the run')).toBeVisible();
    expect(run).not.toHaveBeenCalled();
    view.rerender(<ModalDock />);
    expect(screen.getByRole('status')).toHaveTextContent('Alex added a pile');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
  });

  it('MWS the status region stays mounted while a sheet is open', () => {
    const view = render(<ModalDock />);
    const status = screen.getByRole('status');
    act(() => { toast('Pile kept'); });
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent('Pile kept');
    expect(screen.getByText('Pile kept')).toBeVisible();

    view.rerender(<ModalDock first />);
    expect(screen.getByRole('dialog', { name: 'Pile details' })).toBeVisible();
    // Positive control: retaining the region must not expose its message over the sheet.
    expectMessageHidden('Pile kept');
    // Radix makes the background inaccessible; include hidden nodes to check DOM identity.
    expect.soft(screen.queryByRole('status', { hidden: true })).toBe(status);

    view.rerender(<ModalDock />);
    expect.soft(screen.getByRole('status')).toBe(status);
    expect(screen.getByText('Pile kept')).toBeVisible();
  });

  it.each([
    { kind: 'plain', duration: 4000, action: undefined },
    { kind: 'action', duration: 8000, action: { label: 'Undo', run: () => undefined } },
  ])('MWS the sheet closes and the $kind message resumes with its remaining time', ({ duration, action }) => {
    const view = render(<ModalDock />);
    let id = 0;
    act(() => { id = toast('Pile kept', action); });
    expect(screen.getByText('Pile kept')).toBeVisible();
    act(() => vi.advanceTimersByTime(1000));
    view.rerender(<ModalDock first />);
    expect(screen.getByRole('dialog', { name: 'Pile details' })).toBeVisible();
    act(() => vi.advanceTimersByTime(30_000));
    // Positive identity control: waiting never replaces or expires the message.
    expect(useToasts.getState().list.map((t) => t.id)).toEqual([id]);
    view.rerender(<ModalDock />);
    expect(screen.getByText('Pile kept')).toBeVisible();
    act(() => vi.advanceTimersByTime(duration - 1000 - 1));
    expect(screen.getByText('Pile kept')).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    expect(useToasts.getState().list).toHaveLength(0);
    expect(screen.queryByText('Pile kept')).toBeNull();
  });

  it('MWS timers resume only when the last sheet closes', () => {
    const view = render(<ModalDock />);
    act(() => { toast('Pile saved'); });
    expect(screen.getByText('Pile saved')).toBeVisible();
    act(() => vi.advanceTimersByTime(1000));
    view.rerender(<ModalDock first />);
    expect(screen.getByRole('dialog', { name: 'Pile details' })).toBeVisible();
    view.rerender(<ModalDock first second />);
    expect(screen.getByRole('dialog', { name: 'More details' })).toBeVisible();
    view.rerender(<ModalDock first />);
    expect(screen.getByRole('dialog', { name: 'Pile details' })).toBeVisible();
    act(() => vi.advanceTimersByTime(30_000));
    expect(useToasts.getState().list.map((t) => t.text)).toEqual(['Pile saved']);
    expectMessageHidden('Pile saved');
    view.rerender(<ModalDock />);
    expect(screen.getByText('Pile saved')).toBeVisible();
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.getByText('Pile saved')).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Pile saved')).toBeNull();
  });

  it('MWS a message raised while a sheet is open waits to show and be announced', () => {
    const view = render(<ModalDock first />);
    expect(screen.getByRole('dialog', { name: 'Pile details' })).toBeVisible();
    let id = 0;
    act(() => { id = toast('You chose "Keep one". Bower is doing it now.'); });
    // Positive control: it entered the production stack while the modal was open.
    expect(useToasts.getState().list.map((t) => t.id)).toEqual([id]);
    expectMessageHidden('You chose "Keep one". Bower is doing it now.');
    expect(screen.queryByRole('status')).toBeNull();
    act(() => vi.advanceTimersByTime(30_000));
    expect(useToasts.getState().list.map((t) => t.id)).toEqual([id]);
    view.rerender(<ModalDock />);
    const announced = screen.getByRole('status');
    expect(announced).toHaveAttribute('aria-live', 'polite');
    expect(announced).toHaveTextContent('You chose "Keep one". Bower is doing it now.');
    expect(announced).toBeVisible();
    act(() => vi.advanceTimersByTime(3999));
    expect(useToasts.getState().list.map((t) => t.id)).toEqual([id]);
    act(() => vi.advanceTimersByTime(1));
    expect(useToasts.getState().list).toHaveLength(0);
  });

  it('MWS messages raised during a sheet keep three at most and drop the oldest', () => {
    const view = render(<ModalDock />);
    act(() => { toast('One'); });
    expect(screen.getByText('One')).toBeVisible();
    view.rerender(<ModalDock first />);
    act(() => { for (const text of ['Two', 'Three', 'Four']) toast(text); });
    expect(useToasts.getState().list.map((t) => t.text)).toEqual(['Two', 'Three', 'Four']);
    act(() => vi.advanceTimersByTime(30_000));
    expect(useToasts.getState().list.map((t) => t.text)).toEqual(['Two', 'Three', 'Four']);
    view.rerender(<ModalDock />);
    expect([...screen.getByRole('status').children].map((n) => n.textContent)).toEqual(['Two', 'Three', 'Four']);
    expect(screen.queryByText('One')).toBeNull();
  });

  it('MWS pointer and keyboard holds released during a sheet cannot restart expiry behind it', () => {
    const view = render(<ModalDock />);
    let id = 0;
    act(() => {
      id = toast('Pile moved', { label: 'Undo', run: () => undefined });
      useToasts.getState().hold(id, true, 'pointer');
      useToasts.getState().hold(id, true, 'keyboard');
    });
    act(() => vi.advanceTimersByTime(30_000));
    // Positive control: both existing holds protect a visible, actionable message.
    expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
    view.rerender(<ModalDock first />);
    act(() => {
      useToasts.getState().hold(id, false, 'pointer');
      useToasts.getState().hold(id, false, 'keyboard');
      vi.advanceTimersByTime(30_000);
    });
    expect(useToasts.getState().list.map((t) => t.id)).toEqual([id]);
    view.rerender(<ModalDock />);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
    const undo = screen.getByRole('button', { name: 'Undo' });
    const message = screen.getByText('Pile moved').parentElement;
    if (!message) throw new Error('The message must have its event surface.');
    fireEvent.mouseEnter(message);
    act(() => undo.focus());
    fireEvent.mouseLeave(message);
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
    act(() => undo.blur());
    act(() => vi.advanceTimersByTime(7999));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    expect(useToasts.getState().list).toHaveLength(0);
  });
});

describe('the dock', () => {
  it('the dock stacks three messages at most, oldest first', () => {
    render(<Dock />);
    act(() => {
      for (const t of ['One', 'Two', 'Three', 'Four']) toast(t);
    });
    const texts = [...screen.getByRole('status').children].map((n) => n.textContent);
    expect(texts).toEqual(['Two', 'Three', 'Four']);
  });

  it('the dock publishes its height as --dock-h, and takes it back when it is empty', () => {
    let seen: ResizeObserverCallback = () => undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          seen = cb;
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    render(<Dock />);
    const stack = screen.getByTestId('dock-stack');
    const size = (h: number): void => {
      Object.defineProperty(stack, 'offsetHeight', { configurable: true, value: h });
      act(() => seen([], {} as ResizeObserver));
    };
    size(60);
    expect(document.documentElement.style.getPropertyValue('--dock-h')).toBe('60px');
    size(0);
    expect(document.documentElement.style.getPropertyValue('--dock-h')).toBe('0px');
  });
});

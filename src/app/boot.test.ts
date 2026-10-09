import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootDone, bootFail, bootStart } from './boot';

const message = 'Still openingYour Drive is answering slowly. Bower keeps trying.';

describe('boot status', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="boot" role="status"><div class="bird posed land"></div><p data-boot-line></p></div>';
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('one step at 3 s', () => {
    bootStart();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(2999);
    expect(document.querySelector('[data-boot-line]')).not.toHaveClass('show');
    vi.advanceTimersByTime(1);
    expect(document.querySelector('[data-boot-line]')).toHaveClass('show');
    expect(document.querySelector('[data-boot-line]')?.textContent).toBe(message);
  });

  it('no 8 s step', () => {
    bootStart();
    vi.advanceTimersByTime(3000);
    const atThree = document.querySelector('[data-boot-line]')?.innerHTML;
    vi.advanceTimersByTime(5000);
    expect(document.querySelector('[data-boot-line]')?.innerHTML).toBe(atThree);
    expect(document.querySelector('[data-boot-line]')?.textContent).toBe(message);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the bird gets the read class', () => {
    bootStart();
    vi.advanceTimersByTime(3000);
    expect(document.querySelector('.bird')).toHaveClass('read');
    expect(document.querySelector('.bird')).not.toHaveClass('land');
  });

  it('failure replaces read with alarm and focuses retry', () => {
    bootStart();
    vi.advanceTimersByTime(3000);
    const retry = vi.fn();
    bootFail('error', retry);
    expect(document.querySelector('.bird')).toHaveClass('alarm');
    expect(document.querySelector('.bird')).not.toHaveClass('read');
    expect(document.querySelector('b')).toHaveTextContent('Bower could not open');
    expect(document.querySelector('[data-boot-line]')).toHaveTextContent('Something went wrong while opening. Your notes are safe in your Drive.');
    const button = document.querySelector('button');
    expect(button).toHaveFocus();
    button?.click();
    expect(button).toHaveTextContent('Trying…');
    expect(button).toBeDisabled();
    vi.advanceTimersByTime(299);
    expect(retry).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(retry).toHaveBeenCalledOnce();
  });

  it('offline keeps its copy and sleep pose and cancels the status timer', () => {
    bootStart();
    bootFail('offline', vi.fn());
    vi.advanceTimersByTime(8000);
    expect(document.querySelector('.bird')).toHaveClass('sleep');
    expect(document.querySelector('[data-boot-line]')).toHaveTextContent("You're offlineBower opens when you're back online.");
  });

  it('completion cancels the status timer', () => {
    bootStart();
    bootDone();
    vi.advanceTimersByTime(8000);
    expect(document.getElementById('boot')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import interviewSource from '../src/components/interview.tsx?raw';
import onboardingSource from '../src/routes/onboarding.tsx?raw';
import {
  INTERVIEW_KEEP_CHIPS,
  INTERVIEW_QUESTIONS,
  INTERVIEW_TIP,
  interviewGreeting,
  interviewQuestionLabel,
} from '../src/interview.js';

describe('interview copy (#584, board Flow-01-Welcome)', () => {
  it('greets by first name', () => {
    expect(interviewGreeting('Alex Example')).toBe(
      'Hi Alex. Four quick questions so I file things your way. Skip anything you like.',
    );
    expect(interviewGreeting()).toBe(
      'Hi. Four quick questions so I file things your way. Skip anything you like.',
    );
  });

  it('numbers the questions "N of 4"', () => {
    expect(interviewQuestionLabel(0)).toBe('1 of 4 · What will you keep here?');
    expect(interviewQuestionLabel(1)).toBe(
      '2 of 4 · Which languages do your notes come in?',
    );
  });

  it('offers the board chips for the first question', () => {
    expect(INTERVIEW_KEEP_CHIPS).toEqual([
      'Home and bills',
      'Work',
      'Health',
      'Money',
      'Travel',
      'Studies',
      'A project',
    ]);
  });

  it('has the tip', () => {
    expect(INTERVIEW_TIP).toBe(
      'Bower learns from what you add over time: a contract, a bill, a letter. You never have to hand it anything; add what you want, when you want.',
    );
  });

  it('never mentions a CV, LinkedIn or a passport', () => {
    const copy = [
      INTERVIEW_TIP,
      ...INTERVIEW_QUESTIONS,
      ...INTERVIEW_KEEP_CHIPS,
      interviewGreeting('Alex'),
      interviewSource,
      onboardingSource,
    ].join('\n');
    expect(copy).not.toMatch(/\bCV\b|LinkedIn|passport/i);
  });
});

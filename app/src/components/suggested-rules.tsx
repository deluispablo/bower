/**
 * Bower's open suggestions (`Answers/Bower - Proposals.md`, #199) as the
 * Suggested group on top of the Bower tab's Rules (#346, spec C.7 and
 * D.3): each with Accept (the rule goes into your rules) and Dismiss.
 * Moved here from Health, which keeps a one-line pointer
 * (`useOpenProposals`).
 */

import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { SaveError } from '../drive.js';
import { setPref } from '../prefs.js';
import {
  findProposals,
  openProposals,
  plainText,
  ProposalError,
} from '../proposals.js';
import type { Proposal, ProposalDecision, ProposalKind } from '../proposals.js';
import { OfflineError, useVault } from '../vault-store.js';
import '../styles/suggested-rules.css';

export type ProposalsLoad =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; open: Proposal[] }
  | { status: 'offline' }
  | { status: 'error' };

/**
 * The open proposals of the proposals file, read again whenever the
 * listing changes (an Accept or Dismiss rewrites the file). `none` when
 * there is no such file.
 */
export function useOpenProposals(): ProposalsLoad {
  const { index, getNoteText } = useVault();
  const [load, setLoad] = useState<ProposalsLoad>({ status: 'loading' });

  const file = index === null ? undefined : findProposals(index);

  useEffect(() => {
    if (file === undefined) return;
    let cancelled = false;
    getNoteText(file.id)
      .then((text) => {
        if (!cancelled) setLoad({ status: 'ready', open: openProposals(text) });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof OfflineError) {
          setLoad({ status: 'offline' });
          return;
        }
        console.error(err);
        setLoad({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [file, getNoteText]);

  return file === undefined ? { status: 'none' } : load;
}

const KIND_LABELS: Record<ProposalKind, string> = {
  rule: 'Bower suggests',
  workflow: 'Bower suggests',
  tag: 'New tag',
};

/** One short sentence for a decision that could not be saved. */
function decisionError(err: unknown): string {
  if (err instanceof ProposalError) return err.message;
  if (err instanceof SaveError && err.code === 'conflict') {
    return 'Your notes changed meanwhile. Try again.';
  }
  return 'Could not save your answer. Try again.';
}

/**
 * The Suggested group: nothing at all when there is no proposals file or
 * nothing is open. Showing the list records the time
 * (`proposalsSeenAt`).
 */
export function SuggestedRules(): JSX.Element | null {
  const { index, decideProposal } = useVault();
  const load = useOpenProposals();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const modifiedTime =
    index === null ? undefined : findProposals(index)?.modifiedTime;

  // Seen now, or at the file's own time if the device clock lags behind
  // Drive's, same as the health report's badge.
  useEffect(() => {
    if (load.status !== 'ready' || modifiedTime === undefined) return;
    const now = new Date().toISOString();
    setPref(
      'proposalsSeenAt',
      Date.parse(modifiedTime) > Date.parse(now) ? modifiedTime : now,
    );
  }, [load.status, modifiedTime]);

  if (load.status === 'none' || load.status === 'loading') return null;
  if (load.status === 'offline') {
    return (
      <p class="suggested-note">
        Offline: Bower's suggestions are not saved on this device yet.
      </p>
    );
  }
  if (load.status === 'error') {
    return <p class="suggested-note">Could not load Bower's suggestions.</p>;
  }
  if (load.open.length === 0 && message === null) return null;

  const decide = async (
    proposal: Proposal,
    decision: ProposalDecision,
  ): Promise<void> => {
    setBusy(proposal.id);
    setMessage(null);
    try {
      await decideProposal(proposal.id, decision);
      setMessage(
        decision === 'accepted'
          ? `Added to your rules: ${proposal.title}.`
          : `Dismissed: ${proposal.title}.`,
      );
    } catch (err) {
      console.error(err);
      setMessage(decisionError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section class="suggested" aria-labelledby="suggested-title">
      <h2 id="suggested-title" class="suggested-head">
        <span>Suggested</span>
        {load.open.length > 0 && (
          <span class="suggested-count">{load.open.length}</span>
        )}
      </h2>
      {load.open.length > 0 && (
        <>
          <p class="suggested-intro">
            Accept one and Bower follows it from now on: it goes into your
            rules.
          </p>
          <ul class="suggested-list">
            {load.open.map((proposal) => (
              <li key={proposal.id} class="card suggested-card">
                <p class="suggested-kind">{KIND_LABELS[proposal.kind]}</p>
                <p class="suggested-title">{proposal.title}</p>
                <p class="suggested-text">{plainText(proposal.text)}</p>
                {proposal.evidence !== '' && (
                  <p class="suggested-evidence">
                    {plainText(proposal.evidence)}
                  </p>
                )}
                <div class="suggested-actions">
                  <button
                    type="button"
                    class="suggested-accept"
                    disabled={busy !== null}
                    onClick={() => void decide(proposal, 'accepted')}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    class="suggested-dismiss"
                    disabled={busy !== null}
                    onClick={() => void decide(proposal, 'dismissed')}
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {message !== null && (
        <p class="suggested-note" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

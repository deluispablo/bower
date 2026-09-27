import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { Bird } from '../components/bird.js';
import {
  findReport,
  findingsIn,
  fixMessage,
  reportDateLabel,
  summarise,
} from '../health-report.js';
import type { HealthCounts, HealthFinding } from '../health-report.js';
import { parseFrontmatter } from '../markdown/frontmatter.js';
import { setPref } from '../prefs.js';
import { OfflineError, useVault } from '../vault-store.js';
import '../styles/health.css';

/** External link, kept local: the icon set (`components/icons.tsx`) is owned by #144 in parallel. */
function ExternalIcon(): JSX.Element {
  return (
    <svg
      class="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" />
    </svg>
  );
}

type ReportLoad =
  | { status: 'loading' }
  | { status: 'ready'; counts: HealthCounts; findings: HealthFinding[] }
  | { status: 'offline' }
  | { status: 'error'; message: string };

/** "Your notes are in good shape, four small things to fix." / "…, one small thing to fix." / all clear. */
function bubbleText(dateLabel: string, findings: number): string {
  const when = dateLabel === '' ? "Sunday's check" : `${dateLabel}'s check`;
  if (findings === 0) return `${when}. Your notes are in good shape.`;
  const count = findings === 1 ? 'one small thing' : `${findings} small things`;
  return `${when}. Your notes are in good shape, ${count} to fix.`;
}

interface FiguresProps {
  counts: HealthCounts;
}

function Figures({ counts }: FiguresProps) {
  return (
    <div class="health-figures">
      <div class="health-figure">
        <p class="health-figure-count">{counts.notes}</p>
        <p class="health-figure-label">notes</p>
      </div>
      <div class="health-figure">
        <p class="health-figure-count health-figure-count--warn">
          {counts.findings}
        </p>
        <p class="health-figure-label">to fix</p>
      </div>
      <div class="health-figure">
        <p class="health-figure-count health-figure-count--ok">
          {counts.brokenLinks}
        </p>
        <p class="health-figure-label">broken links</p>
      </div>
    </div>
  );
}

/**
 * The weekly health check (`Lint Report.md`): the bird done with a bubble
 * summarising the report's date and count, the three headline figures
 * (`summarise`), the findings list (`findingsIn`), a button that opens Tell
 * Bower with the fix request prefilled, and the report itself in Drive.
 * Opening it records the time, which clears the badge in the navigation.
 */
export function Health() {
  const { index, status, error, getNoteText } = useVault();
  const [load, setLoad] = useState<ReportLoad>({ status: 'loading' });

  const file = index === null ? undefined : findReport(index);
  const modifiedTime = file?.modifiedTime;

  // Seen now, or at the report's own time if the device clock lags behind
  // Drive's, so the badge does not come back for a report already read.
  useEffect(() => {
    if (modifiedTime === undefined) return;
    const now = new Date().toISOString();
    setPref(
      'healthSeenAt',
      Date.parse(modifiedTime) > Date.parse(now) ? modifiedTime : now,
    );
  }, [modifiedTime]);

  useEffect(() => {
    if (index === null || file === undefined) return;
    let cancelled = false;
    setLoad({ status: 'loading' });
    getNoteText(file.id)
      .then((text) => {
        if (cancelled) return;
        const report = parseFrontmatter(text);
        setLoad({
          status: 'ready',
          counts: summarise(report),
          findings: findingsIn(report.body),
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof OfflineError) {
          setLoad({ status: 'offline' });
          return;
        }
        console.error(err);
        setLoad({
          status: 'error',
          message: 'Could not load the health check.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [index, file, getNoteText]);

  if (index === null && (status === 'loading' || status === 'error')) {
    return (
      <section class="health">
        <h1>Health check</h1>
        <p>
          {status === 'error'
            ? (error ?? 'Could not load your notes.')
            : 'Loading…'}
        </p>
      </section>
    );
  }

  // Also covers a user with no Bower folder yet (no index at all).
  if (file === undefined) {
    return (
      <section class="health">
        <h1>Health check</h1>
        <p>No health check yet. Bower runs one every Sunday.</p>
      </section>
    );
  }

  const dateLabel =
    modifiedTime === undefined ? '' : reportDateLabel(modifiedTime);

  return (
    <section class="health">
      <div class="health-head">
        <h1>Health check</h1>
        {file.webViewLink !== undefined && (
          <a
            href={file.webViewLink}
            target="_blank"
            rel="noopener"
            class="health-drive-link"
          >
            <ExternalIcon /> Open report in Drive
          </a>
        )}
      </div>

      {load.status === 'loading' && <p>Loading…</p>}
      {load.status === 'offline' && (
        <p>Offline: the health check is not saved on this device yet.</p>
      )}
      {load.status === 'error' && <p>{load.message}</p>}
      {load.status === 'ready' && (
        <>
          <div class="health-bubble-row">
            <Bird state="done" size={72} />
            <p class="health-bubble">
              {bubbleText(dateLabel, load.counts.findings)}
            </p>
          </div>

          <Figures counts={load.counts} />

          {load.findings.length > 0 && (
            <div class="health-findings">
              <h2>To fix</h2>
              <ul class="health-findings-list">
                {load.findings.map((finding, i) => (
                  <li key={i} class="health-finding">
                    <p class="health-finding-text">{finding.text}</p>
                    {finding.detail !== undefined && (
                      <p class="health-finding-detail">{finding.detail}</p>
                    )}
                  </li>
                ))}
              </ul>
              <a
                href={`/tell?text=${encodeURIComponent(fixMessage(dateLabel))}`}
                class="health-fix-button"
              >
                Ask Bower to fix these
              </a>
            </div>
          )}
        </>
      )}
    </section>
  );
}

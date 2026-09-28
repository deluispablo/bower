import { useEffect, useState } from 'preact/hooks';

import { BackLink } from '../components/back-link.js';
import { Bird } from '../components/bird.js';
import { IconExternalLink } from '../components/icons.js';
import { useShellSlot } from '../components/shell-slots.js';
import { useOpenProposals } from '../components/suggested-rules.js';
import {
  findReport,
  findingsIn,
  fixMessage,
  reportDateLabel,
  summarise,
} from '../health-report.js';
import type { HealthCounts } from '../health-report.js';
import { parseFrontmatter } from '../markdown/frontmatter.js';
import { renderInline } from '../markdown/render.js';
import { setPref } from '../prefs.js';
import { OfflineError, useVault } from '../vault-store.js';
import '../styles/health.css';

/** One rendered finding: Markdown already turned into sanitized HTML
 * (`renderInline`, the note renderer's sanitiser profile) so `**bold**`,
 * backticks and wikilinks show as formatted HTML, never literal source. */
interface RenderedFinding {
  titleHtml: string;
  detailHtml?: string;
}

type ReportLoad =
  | { status: 'loading' }
  | {
      status: 'ready';
      counts: HealthCounts | undefined;
      findings: RenderedFinding[];
    }
  | { status: 'offline' }
  | { status: 'error'; message: string };

/**
 * The paragraph explaining what Health does and does not do, shown at the
 * top whatever else is loading (handover C.5). The design board's own copy
 * for this differs from the handover text ("Every Sunday Bower looks over
 * your folder…"); this issue asks for the handover's wording specifically.
 */
const EXPLAINER =
  'Every Sunday Bower reads through your notes and lists what it would fix: broken links, notes without a home, things that contradict each other. It never changes anything here; you decide.';

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
 * The one line pointing to Bower's open suggestions, now the Suggested
 * group on the Bower tab's Rules (#346, spec D.3). Nothing while they load
 * or when none is open; offline or a failed read shows nothing here either,
 * the Bower tab says so.
 */
function SuggestedPointer() {
  const proposals = useOpenProposals();
  if (proposals.status !== 'ready' || proposals.open.length === 0) return null;
  const n = proposals.open.length;
  return (
    <p class="health-suggested">
      <a href="/bower">
        {n} suggested {n === 1 ? 'rule' : 'rules'} on the Bower tab
      </a>
    </p>
  );
}

/**
 * The weekly health check (`Lint Report.md`): the bird done with a bubble
 * summarising the report's date and count, the three headline figures
 * (`summarise`), the findings list (`findingsIn`), a button that opens Tell
 * Bower with the fix request prefilled, and the report itself in Drive.
 * Opening it records the time, which clears the badge in the navigation.
 * A line under the report points to Bower's open suggestions on the Bower
 * tab (`SuggestedPointer`).
 */
/** The phone top bar (#318, Phone-Health board): Back to the Notes tab,
 * where the Health row lives, and the screen's title. Stable elements, so
 * they never refill the shell's slots on a re-render (`shell-slots.ts`). */
const BACK = <BackLink href="/notes" label="Notes" />;
const CRUMB = <span class="topbar-title">Health check</span>;

export function Health() {
  useShellSlot('back', BACK);
  useShellSlot('crumb', CRUMB);
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
          findings: findingsIn(report.body).map((finding) => ({
            titleHtml: renderInline(finding.text, index),
            detailHtml:
              finding.detail === undefined
                ? undefined
                : renderInline(finding.detail, index),
          })),
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
      <section class="health page-column">
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
      <section class="health page-column">
        <h1>Health check</h1>
        <p class="health-explainer">{EXPLAINER}</p>
        <p>No health check yet. Runs every Sunday.</p>
        <SuggestedPointer />
      </section>
    );
  }

  const dateLabel =
    modifiedTime === undefined ? '' : reportDateLabel(modifiedTime);

  return (
    <section class="health page-column">
      <div class="health-head">
        <h1>Health check</h1>
        {file.webViewLink !== undefined && (
          <a
            href={file.webViewLink}
            target="_blank"
            rel="noopener"
            class="health-drive-link"
          >
            <IconExternalLink /> Open report in Drive
          </a>
        )}
      </div>
      <p class="health-explainer">{EXPLAINER}</p>

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
              {bubbleText(dateLabel, load.findings.length)}
            </p>
          </div>

          {load.counts !== undefined && <Figures counts={load.counts} />}

          {load.findings.length > 0 && (
            <div class="health-findings">
              <h2>To fix</h2>
              <ul class="health-findings-list">
                {load.findings.map((finding, i) => (
                  <li key={i} class="health-finding">
                    <p
                      class="health-finding-text"
                      dangerouslySetInnerHTML={{ __html: finding.titleHtml }}
                    />
                    {finding.detailHtml !== undefined && (
                      <p
                        class="health-finding-detail"
                        dangerouslySetInnerHTML={{
                          __html: finding.detailHtml,
                        }}
                      />
                    )}
                  </li>
                ))}
              </ul>
              <a
                href={`/bower?text=${encodeURIComponent(fixMessage(dateLabel))}`}
                class="health-fix-button"
              >
                Ask Bower to fix these
              </a>
            </div>
          )}
        </>
      )}

      <SuggestedPointer />
    </section>
  );
}

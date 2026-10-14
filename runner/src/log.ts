import { formatLogEvent, readLog, type LogEvent } from '../../src/data/contracts/log-format';
import { isJournalRecord } from '../../src/data/contracts/journal-record';
import { indexedFront } from '../../src/data/contracts/note-format';
import type { Outcome } from '../../src/data/contracts/run-checkpoint';
import { targetPath, type MaintenanceDeclaration } from '../../src/data/contracts/run-manifest';
import { readTagList } from '../../src/data/contracts/tag-format';
import type { RunManifest } from '../../src/data/spine/records';
import { isHidden, SYSTEM } from '../../src/data/vault/layout';

/** Planned events select the target; settled events alone supply its lines. */
export function logEvents(manifest: RunManifest, declaration?: MaintenanceDeclaration, outcomes?: readonly Outcome[]): LogEvent[] {
  const events: LogEvent[] = [];
  let tags = readTagList(declaration?.sources.find((s) => s.path === SYSTEM.tags)?.text ?? null).tags;
  for (const op of manifest.operations) {
    if (outcomes && !outcomes.some((o) => o.operationId === op.operationId && o.state === 'applied')) continue;
    const e = op.effect;
    let action: string;
    let note: string;
    let detail: string;
    if (e.kind === 'write-runner-json' && e.path === SYSTEM.tags) {
      const after = readTagList(e.text).tags;
      const added = after.filter((tag) => !tags.includes(tag));
      tags = after;
      if (!added.length) continue;
      action = 'decision'; note = 'Tags'; detail = `Added tags: ${added.join(', ')}`;
    } else if (e.kind === 'create-text' && e.purpose === 'generated') {
      const parent = targetPath(manifest, e.parent);
      if (parent === null) continue;
      note = [parent, e.name].filter(Boolean).join('/');
      action = 'create'; detail = indexedFront(e.text).summary;
    } else if (e.kind === 'edit-text') {
      if (e.content.sha256 === e.beforeContent.sha256) continue;
      note = e.path;
      const linkOnly = e.changes.length > 0 && e.changes.every((c) => c.kind === 'link-rewrite');
      action = linkOnly ? 'fix' : 'update';
      detail = linkOnly ? `Links now point to ${e.changes.flatMap((c) => c.kind === 'link-rewrite' ? c.renames.map((r) => r.to) : []).join(', ')}`
        : manifest.reportPlan.flatMap((r) => r.value.updated).find((r) => r.op === op.operationId)?.what ?? `Updated ${e.path}`;
    } else if (e.kind === 'move') {
      const parent = targetPath(manifest, e.parent);
      const from = declaration?.sources.find((s) => s.file.fileId === e.before.fileId)?.path
        ?? manifest.capture.places.find((p) => p.file.fileId === e.before.fileId)?.path
        ?? (manifest.capture.members.some((m) => m.file.fileId === e.before.fileId) ? `Inbox/${e.before.name}` : undefined);
      if (parent === null || from === undefined) continue;
      note = [parent, e.name].filter(Boolean).join('/');
      if (note === from) continue;
      if (isHidden(from)) {
        if (parent !== SYSTEM.archive || !manifest.capture.journal.some((j) => j.fileIds.includes(e.before.fileId))) continue;
        const source = declaration?.sources.find((s) => s.file.fileId === e.before.fileId);
        if (!source) continue;
        const line: unknown = JSON.parse(source.text);
        if (!isJournalRecord(line) || line.undoes === undefined) continue;
        action = 'move'; note = line.path ?? ''; detail = line.what;
      } else {
        const filing = manifest.capture.members.some((m) => m.file.fileId === e.before.fileId);
        action = filing ? 'ingest' : 'move';
        detail = filing ? `From the inbox: ${e.before.name}` : `From ${from}`;
      }
    } else if (e.kind === 'bin') {
      const from = declaration?.sources.find((s) => s.file.fileId === e.before.fileId)?.path
        ?? manifest.capture.places.find((p) => p.file.fileId === e.before.fileId)?.path;
      if (!from || e.before.folder) continue;
      action = 'move'; note = from; detail = `Moved to Bin from ${from}`;
    } else continue;
    if (isHidden(note)) continue;
    events.push({ rootId: manifest.scope.rootId, runId: manifest.runId, operationId: op.operationId,
      requestedAt: manifest.requestedAt, action, note, detail });
  }
  return events;
}

export function appendLog(before: string, events: readonly LogEvent[]): string {
  const keys = new Set(readLog(before).keys);
  const lines = events.map(formatLogEvent).filter(({ line }) => !keys.has(line.slice(-12))).map(({ line }) => line);
  if (!lines.length) return before;
  return before + (before.endsWith('\n') ? '' : '\n') + lines.join('\n') + '\n';
}

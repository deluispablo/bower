/** Declarative shapes only. note-format remains the one Markdown serializer.
 * Shared-schema precedent: https://zod.dev/api
 * Lists: https://spec.commonmark.org/0.31.2/#list-items
 * Checkboxes: https://github.github.com/gfm/#task-list-items-extension-
 */
export const NOTE_TEMPLATES = {
  source: { sections: ['Summary', 'Key points', 'Related', 'Transcript'], body: 'Transcript', timeline: false, immutable: true },
  concept: { sections: ['Current state', 'Notes', 'Related', 'Timeline'], body: 'Notes', timeline: true, immutable: false },
  project: { sections: ['Goal', 'Next steps', 'Current state', 'Notes', 'Timeline'], body: 'Notes', timeline: true, immutable: false },
  area: { sections: ['Standard to maintain', 'Current state', 'Notes', 'Timeline'], body: 'Notes', timeline: true, immutable: false },
  moc: { sections: ['Overview', 'Notes', 'Sources'], body: 'Overview', timeline: false, immutable: false },
} as const;

export type NoteTemplate = keyof typeof NOTE_TEMPLATES;
export const TEMPLATE_REGIONS = ['goal', 'next-steps'] as const;
export type TemplateRegion = typeof TEMPLATE_REGIONS[number];

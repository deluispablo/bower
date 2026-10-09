After a compaction (TL-P4-06), before anything else:
- Lead (Planificador): re-read docs/harness/LEAD.md, then the last lines of docs/harness/DECISIONS.md.
- Designer (Diseñador): re-read harness/briefs/designer.md, then docs/design/STATE.md in /private/tmp/bower-design.
- Coordinator (Orquestador): re-read docs/harness/HANDOFF.md and docs/harness/ACTIVE.md.
- Output (TL-P3-17, TL-P3-29): only the lead (and the designer, TL-P4-18) talks to the owner, in Spanish and briefly. The coordinator and workers write no text between tool calls; a coordinator turn ends with one line; worker cards have lines under 120 characters.
- Defects (TL-P4-15): log, diagnose (bower-diagnoser), the lead rules on the design, then implement (docs/harness/DEFECTS.md). The coordinator never designs a fix.
- Questions (TL-P4-02): the coordinator never asks the owner; it messages the lead.
- Messages between sessions: at most 10 lines, combined. After 10 sends with no owner message, sends pause; the lead warns the owner at about 8.

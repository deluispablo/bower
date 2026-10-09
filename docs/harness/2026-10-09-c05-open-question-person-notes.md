# C05 open question: notes the person wrote

Deferred from p4-corpus-driver under TL-P4-28 addendum 2. This is a product-policy question, not a defect.

The case wanted to preserve the person's note identity, summary, state and prose, append sourced Timeline news,
ask exactly once for state permission, and never adopt their state merely because Bower appended a line.

The existing mechanism refuses this: `runner/src/claude.ts:413` shows only Bower notes and hubs, so the proposal
is rejected with `lineNote` (“a line on a note it was not shown”). Even if shown, note-edit refuses Timeline edits
on a person's note with `not-bower` (`src/data/contracts/note-edit.ts`). No production policy was changed.

Question for the designer and owner in the C05 packet: may Bower append sourced Timeline news to a note the
person wrote, and with what consent?

## Preserved material

The original case id is `c05-note-not-written-by-bower`. The exact proposal is preserved in `replies.json` below.
All folder contents follow verbatim for later discussion; they are outside the runnable corpus.

### case.json

```json
{
  "id": "c05-note-not-written-by-bower",
  "capability": "C05",
  "title": "A personal note stays personal after a sourced append",
  "covers": "scripted",
  "source": "new (C05 preservation through scripted intent replies and the existing planner)",
  "scope": "all",
  "allowWeb": false,
  "inbox": [
    {
      "line": "Update the garden plot from this committee letter.",
      "files": [
        "Water butt update.txt"
      ]
    }
  ],
  "journal": [],
  "questions": [],
  "bowerOwned": []
}

```

### expected.json

```json
{
  "files": {
    "present": [
      "Areas/Home/Garden plot.md",
      "Areas/Home/Water butt update.txt"
    ],
    "absent": [
      "Inbox/*",
      "Areas/Home/Water butt update.md"
    ]
  },
  "notes": [
    {
      "path": "Areas/Home/Garden plot.md",
      "contains": [
        "summary: Alex's plot at the Larkspur Lane community garden.",
        "## Current state\n- Alex will keep the shared water butt until the replacement arrives.\n\n## My plans\nAlex wants to paint the water butt amber.",
        "## My plans\nAlex wants to paint the water butt amber."
      ],
      "timeline": [
        "2026-09-12 \u00b7 Planted garlic.",
        "2026-10-07 \u00b7 The committee will replace the shared water butt.",
        "The replacement water butt has arrived.",
        "[[Water butt update.txt]]"
      ],
      "timelineCount": 3,
      "excludes": [
        "by: bower",
        "bower_state:"
      ]
    }
  ],
  "linksResolve": true,
  "report": {
    "filed": 1,
    "created": [],
    "updated": [
      "Areas/Home/Garden plot.md"
    ],
    "questionsAtMost": 1,
    "questionsExactly": 1
  }
}

```

### folder/Areas/Home/Garden plot.md

```text
---
summary: Alex's plot at the Larkspur Lane community garden.
---

## Current state
- Alex will keep the shared water butt until the replacement arrives.

## My plans
Alex wants to paint the water butt amber.

## Timeline
- 2026-09-12 · Planted garlic.
- 2026-10-07 · The committee will replace the shared water butt.

```

### inbox/Water butt update.txt

```text
Larkspur Lane community garden
2026-10-09
The replacement water butt has arrived. The committee asks Alex to return the shared water butt.

```

### replies.json

```json
[
  {
    "kind": "tidy-intent",
    "v": 1,
    "things": [
      {
        "fileId": "$file:Water butt update.txt",
        "to": "Areas/Home",
        "name": "Water butt update.txt"
      }
    ],
    "lines": [
      {
        "note": "Areas/Home/Garden plot.md",
        "text": "The replacement water butt has arrived. The committee asks Alex to return the shared water butt.",
        "cites": "$file:Water butt update.txt"
      }
    ],
    "states": [
      {
        "note": "Areas/Home/Garden plot.md",
        "lines": [
          "The replacement water butt has arrived.",
          "The committee asks Alex to return the shared water butt."
        ],
        "cites": "$file:Water butt update.txt"
      }
    ]
  }
]

```

### rubric.md

```text
Alex authored this note. Keep the person's summary, state, identity and prose. Append sourced news, ask once for state permission, and never adopt the section merely because Bower appended a line.

```

# Words-only summary route

Preserve the complete two-paragraph body exactly and serialize the reply's short summary as one valid scalar,
including the embedded quotes, apostrophe, colon and hash. The deterministic proposal uses JSON-style double
quotes with escaping; the model rubric accepts any valid spelling with identical decoded value. No front matter
may be copied from the body into metadata. Keep the existing hub and Personal plan intact and unadopted.
The summary is the reply's own few words about the note (words-note-summary), never the pile's words copied:
when the reply gives none, the summary is the fixed line "Written from a note you added.".
B1 owns the index projection. Hot maintenance, if enabled, is hidden and adds no created/updated row.

Pending: independent YAML-validity/round-trip oracle, all-author route matrix and production driver admission.

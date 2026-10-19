# Settled recovery with a refused hub edit and a lost log response

The case runs with its fault setup (corpus-fix-b8 AC3). Without it, the hub edit applies and the expectations fail.

- Faults: Drive refuses the hub edit with a conflict before any byte lands, and the create of the month file lands but its response is lost.
- The filing and the companion note settle. The health note is created once, before the log, and its created row survives recovery; nothing reports an update.
- The first attempt does not finish. Attempt 2 finishes from the saved run and attempt 3 changes nothing; neither calls the model.
- The month holds one line per applied operation, the ingest and then the create, and none for the refused hub edit.
- The source keeps its inbox bytes, the hub keeps its seed bytes, and the move and the create are each sent once.

Method points 1–8 agree: only applied outcomes are reported or logged, and recovery makes no duplicate fact or note.

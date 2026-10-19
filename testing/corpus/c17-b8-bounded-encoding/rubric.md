# Monthly readable log with a delimiter-rich name

- The folder starts with one month file, `.bower/log/2026-10.md`, holding one earlier line from another run. There is no annual log, and the run makes none.
- Filing `Options | alternatives.txt` beside Gardening appends two lines after every existing byte of that month: the ingest, then the create, in the order of the run's operations.
- The name is written as `Options / alternatives.txt`. Each line splits on ` | ` into date, action, note and detail, ends with its ` · op:` key, and holds no JSON.
- Each line fits in 4,096 bytes; an over-long detail is cut with an ellipsis before its key.
- A lost log response and its replay append each settled line once.

Method points 1–8 agree: a grounded linked note, the original kept, and a log of applied outcomes only.

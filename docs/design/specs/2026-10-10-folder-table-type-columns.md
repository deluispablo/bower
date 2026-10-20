# Folder Table: the type's columns (TL-P4-47 Q1)

The owner OKed this on 2026-10-10, with the majority rule for mixed folders. It is the least change to today's `FolderTable` (FolderScreen.tsx): one home, the same table, header buttons, sorting, `tableWrap` sideways scroll and phone view. Only which property columns show, and how their values read, changes. Severity (NN/g): minor.

## Columns

- **Order:** Name · Status · up to 4 type columns · Changed.
  - Name and Changed are as today.
  - Status is today's column: it shows only when something here has a status, with today's pill. A type that declares `status` does not spend one of its 4 on it.
- **The type columns:** the row's declared `table` subset, in its order, at most 4. The header is the property's label, as today (`p.label`).
- **Never a column:** the technical keys type, status (outside its own column), summary, tags, created, updated, source and related. Today's `kind` and `folder` stay excluded too.
- **A column the person asks for:** it replaces the 4th. The run report says so through today's request line (`"<request>" answered` in `runDetail`, or "N things you asked answered", and the request under "What you asked"); there is no new string.

## Which type a folder uses

- **One type:** when every note here with a type row has the same one, that row's columns show.
- **Mixed folder:** the type most of the notes here have. Only notes count, not subfolders. On a tie, the row that comes first in the type table wins. A note of another type leaves those cells empty, as today's missing values do.
- **No type row:** when no note here has a type row (or only the generic fallbacks), it is today's rule: the first 4 property keys found, minus the technical keys.

## Values

- **Text and enum:** as written. **List:** items joined with ", ".
- **Money:** the amount with its currency through `Intl.NumberFormat` (style currency), with no decimals when the amount is whole, for example "€48,000".
- **Number:** formatted the same way, without the currency.
- **Date:** the app's existing short date format.
- **Alignment:** money and number columns, header and cells, align right with `font-variant-numeric: tabular-nums` (standard table practice: GOV.UK Design System tables, numeric columns). Everything else stays left.
- **Sorting:** the same header buttons. Money and number sort by amount, dates by date, and text as today (`localeCompare`, numeric). An empty value sorts last in both directions.

## What the person sees: rows to test

| Situation | What shows |
| --- | --- |
| A folder of one type (job offers) | Name, Status (if any), its declared columns (Company, Salary, Location), Changed. No Summary, Tags, Source or Created column. |
| A type declaring more than 4 columns | Only its first 4. |
| A type declaring status | Status shows once, in today's Status column with its pill. |
| A mixed folder (2 job offers, 1 cover letter) | The job offer columns; the cover letter's cells are empty. |
| A tie between two types | The columns of the row that comes first in the type table. |
| A folder with no typed notes | Today's columns, minus the technical keys. |
| Money and numbers | "€48,000", right-aligned with tabular figures; sorting orders them by amount. |
| A column the person asked for | It stands in the 4th place; the report's detail says `"<request>" answered`, and "What you asked" lists it. |
| Phone at 375 | The same table, scrolling sideways as today. |

Accessibility: unchanged structure (th buttons with `aria-sort`). Axe at WCAG 2.2 on a typed folder, on demo and fake, at 375 and 1440.

# Requirements

## Goal
A small Next.js web app to design database schemas visually (similar to drawDB), persist them in SQLite, and move
them in and out as ANSI SQL or JSON without losing the extra documentation metadata.

## Pages
1. **Design list** (`/`) – CRUD for designs: create, open, edit info (name / short / long description), delete,
   plus *Duplicate* (copies the latest state into a new design named "<name> (copy)", "(copy 2)", …; version history is not copied)
   and *Import SQL / JSON* to create a design from a file.
2. **Editor** (`/designs/[id]`) – opened from the list. Canvas + side panel + menu bar.

## Functional requirements

### Home page menu and settings
- The home page has a top menu with only what applies without an open design: **File** (New design, Import SQL / JSON),
  **View** (the global view options) and **Settings** (a dialog with the same global view options: diagram view mode, grid,
  attributes, descriptions, line annotations, cardinality markers, and whether the designer opens with the Properties panel).
- These are the remembered per-user view options (see *Views*): changes made here apply to every diagram, and changes made in
  a diagram show up here. Per-diagram settings (line style, mandatory logical columns, default table color) and design-only
  menus (Data dictionary, Save version, ...) are intentionally not shown on the home page.

### Designs
- Each design has `name`, `shortDescription`, `longDescription`. Short/long descriptions are exported as comments at the very top of the SQL.
- Stored in SQLite (`data/designs.db`), autosaved from the editor (debounced).

### Tables
- Create, rename, delete, drag on the canvas (snaps to a 10px grid), set width.
- Extra fields: **description**, **color**.

### Columns
- Fields: `name`, `dataType`, **primary key**, **foreign key** (a reference to another table's column; drawn as a line),
  `notNull`, `unique`, `autoIncrement` (identity), `default`, `check`, **description**, **logicalErd** (boolean).
- `enumValues` (comma separated) is shown as `enum(a, b)`.
- **Custom order**: the order is whatever the user sets (move up/down); never auto-sorted.
- **Column groups** inside a table: each has `name`, **description**, can be **collapsed**, and holds columns.
  Columns may also exist outside any group. Columns can be moved between groups.

### Relationships (lines)
- Always **orthogonal** (horizontal/vertical only, never diagonal) and every point lies on the grid.
- Every bend is drawn with a **rounded corner** (configurable radius).
- **Labels can be moved by hand.** Press on a label and drag: the label slides **along the line** — its centre always lies on the line
  (snapped to the grid), however far the pointer strays from it, so it can go up / down on vertical runs and left / right on horizontal
  ones. This lets you pull apart labels that overlap. The position is stored as a distance **from the nearer end** of the line (the foreign-key
  table or the referenced table), so a label stays beside that end when tables move or resize. The relationship's Properties show the
  position and a **Reset** button (back to automatic).
- **The selected relationship is always on top.** Its label and its **adjusting dot** (drag it to move the line's middle run) are drawn in a
  top layer above every other line, label and table, so they can always be grabbed even when something else covers them. A label that
  overlaps another can be raised by selecting its line.
- A line and its label box are one target: hovering either highlights both, and clicking either selects the relationship (labels are
  drawn above all lines, so they stay clickable where lines overlap).
- Tables are drawn above lines, so a label box is **never hidden under a table**: if a table covers the label's normal spot (the middle
  of the line), the label slides along its line to the nearest spot no table covers, and returns when the table moves away
  (`pickLabelSpot` in `domain/routing.ts`). Like the line ends and crow's feet, it stays visible next to the tables.
- Optional annotation (label) on the line, `ON DELETE` / `ON UPDATE` actions, and a manual *bend* (drag the handle of the selected line).

### Canvas interactions
- Drag a table header to move it; drag the table's **right edge** to set a fixed width (snaps to the grid, min 160px).
- **Double-click** a table to open its **table view**. It is not a dialog: it fills the canvas area *under the top header* and the
  **Properties panel stays visible and usable** next to it (opening it selects the table; clicking a column or group in it selects
  that, and edits in the panel show up immediately). Click a group to hide/show its columns; *Collapse groups* / *Unfold groups*
  buttons; text can be selected and copied. It shows the table completely (all columns incl. those hidden by the logical view,
  all groups expanded, all attributes, descriptions and references) regardless of view settings. Close with the big **Close** button (like the data dictionary) or Esc.
  - **Copy Markdown** copies the Markdown of just this table (as in the data dictionary).
  - **Export SQL** opens the Export SQL dialog for just this table: its `CREATE TABLE`, indexes and the foreign keys it holds
    (`ALTER TABLE … FOREIGN KEY`, including to tables that are not exported). The same options apply.
- A colored table gets a light tint of its color as background.

### Table groups
- Concept separate from column groups: a **table group** has a name and description and clusters whole tables.
- In the table's Properties: a *Table group* selector (none / existing groups / **+ New group…**), and, for the selected
  group, editable name + description and *Delete group* (its tables become ungrouped). Groups are shared by all their tables.
- Reflected in the **data dictionary** overview: each group is a bold row (name | `N tables` | description) followed by its
  tables; ungrouped tables follow under a bold **Ungrouped** row. The overview's counts column is called **Contains**
  (`3 tables` for groups, `5 columns` for tables). The table sections follow the same order, under a `## <Group> Tables` heading per group.
- Stored in the design (`tableGroups`, `table.groupId`), exported to SQL/JSON and restored on import (see `SQL_COMMENT_PROTOCOL.md`).

### Table appearance
- On the canvas a table is a grid with three columns: **key** | **name** | **type**.
  - The **key cell is stacked**, one line each and only when applicable: `PK`, then `FK`, then the `UQ` / `NN` / `AI` tags.
  - Under the column name, in the same column: the **description** (small grey text), then the **enum values** as highlighted pills
    (like the UQ / NN tags). Long text wraps and the row grows; table and group descriptions stay as a grey line under the header / group name.
- In the **double-click detail dialog** the same key cell is used, but **description**, **enum values** and a **details** column
  (foreign-key target, default, check) are **separate columns**. A group is collapsed / expanded by **clicking** it, or with the
  *Collapse groups* / *Unfold groups* buttons.
- **Width**: per table, *Auto* (default; grows with content, description width capped) or *Fixed* (set in the panel or by
  dragging the table's right edge). Existing tables default to Auto.

### Selecting and moving tables
- **Ctrl/⌘+click** a table to add it to / remove it from the selection. **Ctrl/⌘+A** selects every table (not while typing in a field or
  with a dialog open). **Dragging on empty canvas** draws a selection rectangle that selects the tables it touches
  (Ctrl/⌘/Shift while starting it adds to the current selection). Panning is Space + drag, middle-mouse drag, or the wheel.
- Dragging any selected table moves **all** selected tables together (one change; lines follow). A plain click on one table of a
  selection selects just that table.
- With several tables selected the Properties panel shows only what they share: **color** and **table group** (a "mixed" state when
  they differ; changes apply to all), plus *Delete N tables* and *Clear selection*.
- **Ctrl/⌘+S** opens the *Save version* dialog (and suppresses the browser's own save dialog); ignored while an old version is open.

### Properties panel (right side)
- Can be hidden/shown with the button at the right of the menu bar, the ✕ in its header, or **Ctrl/⌘+B** (remembered, see *Views*).
- **What it shows depends on what you click** on the canvas:
  - a **column row** -> only that column's properties (with a link back to the table);
  - a **group row** -> only that group's properties (name, description, collapsed, add column, move, delete);
  - the **table title or description** -> everything: table, table group, width, all column groups and columns.
  - (On the canvas a group's ▶/▼ chevron collapses it; clicking the rest of the row selects it.)
- Table name, description, color, width and the column / group editors.
- **Group view** also lists and edits the group's own columns (full column editor for each, add / delete / move).
- **Foreign key** is set in two steps: 1) pick the reference **table**, 2) pick the reference **column** — only primary-key /
  unique columns of that table are offered (a table with a single such column is selected automatically).
- **Drag & drop** with the grip handle (⋮⋮): reorder columns, drag columns into or out of groups, and reorder groups
  (groups cannot be nested). Up/down arrows remain as a keyboard-friendly alternative.

### Views
- **View toggle button** in the top bar (editor and home page): one button whose label shows the active view — **Full view** or
  **Logical view** — and which switches to the other view when clicked. The View menu entries remain.
- **The logical view automatically hides column groups** (columns shown flat, collapse state ignored), exactly like *Hide groups*; the
  *Hide groups* menu item shows as checked and disabled while in logical view. The table view still shows groups.
- **Hide groups** (a remembered view option, also on the home page): the diagram shows every column as if column groups did not
  exist — no group rows, columns in their order, collapse state ignored. (The table view still shows groups.)
- **View menu**: *Full view* (all columns) or *Logical view* (columns with `logicalErd = true`, plus every column that has a
  **mandatory logical property**).
- **Settings → Mandatory logical column properties** (per design): any of PK, FK, NN, UQ, AI. Default **PK + FK**. A column with a
  checked property is always shown in the logical view, even if its own *Logical* flag is off. Unchecking everything = only flagged columns.
- **SQL import:** a column is logical only when the SQL says `-- @column.logical: true`; if the tag is missing it is *not* logical.
- **View options are remembered per user, in the database** (`app_settings`), and apply to **every** diagram, new ones included:
  view mode, grid, line annotations, cardinality markers, attributes, descriptions and whether the Properties panel is open.
  (Rendering settings such as corner radius and line color remain per design.) Changing a view option is not an edit: it does not
  mark the design as modified.
- **Column groups start collapsed whenever a diagram is opened.** Collapsing / unfolding afterwards (chevron, Properties panel,
  *Collapse all groups* / *Unfold all groups* in the View menu) is a session-only view state: it is not saved and not an edit.
- Toggles: grid, line annotations, cardinality markers, **column attributes** (not null, unique, identity, enum, default —
  shown after the data type) and **descriptions** (table, group and column descriptions, shown under the name).

### Settings (modal)
Corner radius, line width, line color, stub length, show grid / markers / labels, default table color. Stored per design.
**Undo history** (number of steps, 0 = off, default 50, max 500) is a per-user preference stored with the view options.

### Keys, indexes and undo
- **Primary key:** flag any number of columns as `PK`; more than one is a **composite primary key**. On the diagram the members are labelled `PK1`, `PK2`, … in column order.
- **Indexes:** the *Indexes* section of a table lists its indexes; each has a name (optional), a **Unique** flag and an ordered
  set of columns. A unique index over several columns is a composite unique constraint. Columns that take part show `IX`
  (index) or `UQ` (unique index) on the diagram; the table view and data dictionary list the index names.
- **Undo / redo:** Edit menu, toolbar buttons, Ctrl/⌘+Z and Ctrl/⌘+Shift+Z (or Ctrl+Y) when no text field / dialog has focus.
  Edits made in quick succession (typing, dragging) form one step. Not part of the history: view settings and which column
  groups are collapsed. Undo is disabled while an old version is open.

### Saving and versions
- **Autosave is a background process that never touches the UI**: the first change starts a short timer (0.3 s, not restarted by
  later changes); **only one save request is in flight at a time**; changes made while it runs are merged and exactly one follow-up
  save sends the **latest state**, so saves cannot overlap or overwrite newer data with older. Failed saves are retried
  (1 s, 3 s, 8 s) and the changes stay marked unsaved. The status text (top right) has a fixed width, so nothing shifts when it changes.
  Hiding the tab flushes a pending save; closing with unsaved changes asks for confirmation.
- Each diagram's **pan / zoom** is remembered in the browser, so a reload never moves the view.
- **Latest change state**: every edit is autosaved (debounced) into the `designs` table (`data` + `updated_at`). These saves are *not* versions.
- **Save version** (menu bar button, File menu): flushes pending edits, then inserts a row into `design_versions` with the next
  number for that design (previous + 1; numbering is per design) and the current datetime. An optional note can be added.
  Each version is a full, immutable snapshot (name, short/long description, diagram data).
- **Version history** (menu bar `vN` button, File menu): lists versions newest first with date/time, note and table count.
  Per version: *Restore* (copies it into the latest state; history is kept, no new version is created) and *SQL* (download).
- **View an old version**: *View* on a history row opens that version in the designer (`/designs/:id?version=N`), loaded from the
  snapshot. It is **read-only**: data edits are blocked, the Properties panel and *Add table* are disabled, saving is refused,
  and the latest state is never touched (pending edits are flushed *before* leaving the latest design). View options (view mode,
  toggles, collapsing groups) still work locally and are not saved. A banner shows the version, date and note; exports and the
  data dictionary reflect that version. Next to the version number (`vN · viewing`) the menu bar shows **Jump to latest (vM)** and
  **Restore this version**.
- The menu bar shows the latest version number and **● modified** when the current state differs from it.

### Data dictionary
- Top menu **Data dictionary** opens a **full-screen** dialog (with a Close button) showing a data dictionary generated from the
  **latest edit state** (always the full design, regardless of the logical view), rendered from Markdown.
- Contents: the title, then on the next line the design **version** and **update date and time** (`**Version:** 8 (edited since)
  · **Updated:** 2026-11-12 11:12`; "not saved yet" before the first saved version; for an old version being viewed, that
  version), descriptions, a summary line (`13 tables · 467 columns · 12 relationships`, no generation date, with an empty line
  before it), then the table of tables (links to each table, grouped by
  table group; no "Overview" heading). Below it, one `## <Group> Tables` heading per table group with the group description
  (`## Ungrouped Tables` for the rest; no group headings when there are no groups), and per table a `### <Table> table` heading
  (the table group is not repeated there) with its description and column tables (`Key | Column | Type | Constraints |
  Description`; constraints include NOT NULL, UNIQUE, IDENTITY, DEFAULT, CHECK, ENUM and REFERENCES with actions). Every column
  group gets a `#### <Group> columns` sub-heading + table, then indexes, and finally a relationships table.
- **Export PDF** opens the browser's print dialog for the document (choose *Save as PDF* as the destination).
- **Copy Markdown** copies the whole document. Selecting part of the preview and copying (Ctrl/Cmd+C) puts **Markdown**, not
  plain text, on the clipboard: whole blocks give their exact source, selected table rows give the header + those rows, and a
  snippet inside a cell or paragraph keeps its inline formatting (code, bold, links). Ctrl/Cmd+A selects just the document.

### Export / import
- **Export SQL** (File → Export SQL…) – `CREATE TABLE` (composite primary keys as one `PRIMARY KEY (a, b)` constraint),
  `CREATE [UNIQUE] INDEX` and `ALTER TABLE … FOREIGN KEY`. The dialog has a **database** selector — ANSI SQL, Oracle, PostgreSQL,
  MySQL (quoting, identity / auto-increment syntax, type names, Oracle FK limits) — and checkboxes for what to include: indexes,
  foreign keys, enum values (real SQL: MySQL `ENUM`, otherwise `CHECK … IN`), design name & description, table descriptions,
  column descriptions (on the column's line), table descriptions (after the table line), table colors, column / table groups (a table group is a header followed by its tables, groupless tables last), logical-view flags, relationship annotations, and optionally real
  database comments (`COMMENT ON …` / MySQL `COMMENT`). Design information is written as readable comments (see
  `SQL_COMMENT_PROTOCOL.md`); with all of it off the script is plain SQL without comments. On first open indexes, foreign
  keys, enum values, table / column descriptions, groups and relationship annotations are on; the **default / all / none**
  links next to *Design information* reset the choices. The choices are remembered in the browser.
- **Import SQL** – parses `CREATE TABLE` / `ALTER TABLE ADD FOREIGN KEY` / `COMMENT ON`. If the SQL contains the designer's
  comment tags, groups/descriptions/colors are restored; plain SQL also works. Tables are auto-laid out.
- **Export / import JSON** – full fidelity: table positions and sizes, groups, relationships including annotation, `bend`,
  and the computed route (side + corner points), plus settings.

## Non-functional
- Atomic design component structure, `src/app` as the Next.js app dir.
- No external diagram library: a custom SVG/DOM canvas keeps full control over grid snapping and routing.
- Documentation (this folder) is kept current with the code.

## Known limitations / possible next steps
- Undo / redo is per editor session (the history is dropped when a design is opened); view state (grid, view mode, collapsed
  groups) is not part of it.
- Composite foreign keys are modelled as one relationship per column pair (exported as separate constraints).
- Table-level `CHECK` constraints are ignored on import. Composite `UNIQUE` constraints and `CREATE [UNIQUE] INDEX` are imported as indexes.
- Connections are created through the column's *References* dropdown (not by dragging between columns).
- Routing is a 3-segment orthogonal route; it does not avoid other tables.

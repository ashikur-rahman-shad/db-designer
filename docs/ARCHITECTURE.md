# Architecture

Next.js (App Router, `src/app`), React 19, TypeScript, Tailwind CSS 4, Zustand + Immer, SQLite via `better-sqlite3`.

## Layers
```
src/
  app/                    Routes only (thin): pages + REST API
    page.tsx              /                 -> DesignListTemplate
    designs/[id]/page.tsx /designs/:id      -> EditorTemplate
    api/designs/...       GET/POST list+create, GET/PUT/DELETE by id
  components/             Atomic design
    atoms/                Button, IconButton, TextInput, TextArea, SelectInput, Chip, Checkbox, Label
    molecules/            Field, Modal, MenuDropdown, ColorPicker, ColumnEditor, DesignCard, DesignMetaForm
    organisms/            Canvas, TableNode (position/drag/resize), TableCard (presentational table, also used by TableDetailPanel), RelationshipLayer, SidePanel, TablePropertiesPanel,
                          RelationshipPanel, MenuBar, SettingsModal, ImportModal, ExportSqlModal, DesignInfoModal
    templates/            DesignListTemplate, EditorTemplate (page-level composition, autosave)
  domain/                 Pure TypeScript, no React/DOM: types, factories, layout metrics, routing
  lib/                    sql/{tokenizer,import,export}, json, download
  store/editorStore.ts    Zustand+Immer store: the editor's single source of truth
  server/                 db.ts (SQLite connection + schema), designRepository.ts
```
Dependency direction: `app → components → store → domain`; `lib → domain`; `server → domain`. Atoms never import the store;
molecules are prop-driven; organisms/templates may use the store.

## Data model (`src/domain/types.ts`)
`Design { id, name, shortDescription, longDescription, data }` where `data: DesignData`:
- `tables[]` – `{ id, name, description, color, x, y, width, items[] }`; `items` is the ordered list of **columns and groups**
  (`kind: "column" | "group"`; a group holds `columns[]`). This nesting makes custom order and optional grouping trivial.
- `tableGroups[]` – `{ id, name, description }`: named sets of tables; a table points to one via `groupId` (null = ungrouped). Separate from the
  *column* groups that live inside `table.items`. Deleting a group clears `groupId` on its tables; on import dangling ids are dropped.
- `relationships[]` – a foreign key `from` (child column) → `to` (parent column), with `onDelete`, `onUpdate`, `label`, `bend`.
  The "FK" flag of a column is *derived* from the existence of a relationship, so it can never be inconsistent.
- `settings` – view mode and line/grid rendering options.

SQLite tables:
- `app_settings(key, value JSON, updated_at)` – per-user preferences; currently the remembered **view options** (`viewOptions`:
  view mode, grid, labels, markers, attributes, descriptions, panel open). `server/settingsRepository.ts`, `GET/PUT /api/settings/view`.
  The editor page passes them to `EditorTemplate`, whose `load()` applies them over the design's own settings (seeded from the design the very first time);
  a store subscription saves changes (debounced). Group collapse is session state: `load()` collapses every column group and
  `transient()` store updates (view options, collapse) never bump `rev`.
- `designs(id, name, short_description, long_description, data JSON, created_at, updated_at)` – the **latest edit state**; autosave overwrites it.
- `design_versions(id, design_id → designs ON DELETE CASCADE, version, note, name, short_description, long_description, data JSON, created_at, UNIQUE(design_id, version))`
  – immutable snapshots. `version = MAX(version) + 1` per design, computed inside a transaction (`server/versionRepository.ts`).
  "Modified since version" is computed by comparing the current state with the latest snapshot's content (not by timestamps).
API: `POST /api/designs/:id/duplicate` (copy of the latest state, no versions), `GET/POST /api/designs/:id/versions`, `GET /api/designs/:id/versions/:n`, `POST /api/designs/:id/versions/:n/restore`.
Viewing an old version: the page reads `?version=N` and passes that snapshot to `EditorTemplate` with `viewing`; the store then sets
`viewing`, `mutate()` ignores everything except view-only actions (and never bumps `rev`), and `saveNow()` returns false while
`viewing` is set, so autosave can never overwrite the latest state. `EditorTemplate` loads the store in a layout effect and renders
children only afterwards (no store writes during render).
Client: `lib/designApi.ts` (`saveNow`, `saveVersion`, `restoreVersion`), `SaveVersionModal`, `VersionHistoryModal`.
The whole diagram is stored as one JSON document (`data`); the list page reads only counts from it.

## Grid and layout (`domain/layout.ts`)
Unit = 10px (`GRID`). Header = 40, row = 30, group header = 30, widths are multiples of 10, positions are snapped on move/import.
`layoutTable(table, opts)` (use `tableLayout(data, table)` to get settings + foreign keys from the design) returns each row's offset and an `anchorY` per column; collapsed groups and hidden (logical view) columns
anchor their lines to the group header / table header, so lines never point into empty space.

`layoutTable` is the single source of truth for the tabular layout: column widths (from content, or the fixed width),
wrapped text (`domain/textMetrics.ts`, a deterministic DOM-free estimator so server and client agree), row heights (rounded
to the grid) and line anchors. `TableCard` renders the pre-wrapped lines verbatim, so drawing and routing always agree.
`LayoutOptions.descriptionStyle` is `"inline"` (canvas default: description lines, then enum pills, under the name, spanning the name+type cells) or `"column"` (table view: description and enum values each get a column; `detail` adds a details column). The key cell is stacked (PK / FK / UQ NN AI), so FK columns must be passed in (`fkColumnIds`). `collapsedIds` lets the dialog collapse groups independently of the stored flags.
Toggling attributes/descriptions or the width mode therefore changes table sizes and line anchors consistently. `layoutTable(table, { expandAll: true })` ignores logical view / collapsed groups (table view).

## Line labels
`Relationship.labelPos` is `null` (automatic: middle of the line, kept clear of tables by `pickLabelSpot`) or `{ from: "start" | "end", distance }`
(px along the line from the foreign-key / referenced end). `placementPoint` turns it into a point (clamped onto the line);
`nearestPlacement` converts a pointer position into the nearest on-line, grid-snapped placement from the nearer end. Distances are
measured from an end (not as a fraction) so the label does not drift when the line gets longer or shorter.
`RelationshipLayer` draws in two layers: `under` (tables are drawn above it: all lines, markers, non-selected labels) and `over`
(`z-20`, above the tables: only the selected relationship's label and adjusting dot). Label drags use window listeners because selecting
moves the label between the layers. The hovered relationship lives in the store so both layers highlight together.

## Selection
`Selection` also has `tables { ids }` (2+ tables: Ctrl+click, Ctrl+A, the rectangle). `selectTables` / `toggleTableSelection` / `selectAllTables`
normalise 0 / 1 / many; `moveTables`, `updateTables`, `setTablesGroup`, `deleteTables` are single changes. `Canvas` owns the rectangle
(live selection against `tableBoxes`) and Space/middle-button panning; `TableNode` drags the whole selection (`TableCard.onSelect` passes
the pointer event so Ctrl/⌘ can be detected). `hideGroups` is a view option handled in `layoutTable` (flat column list).
`Selection` is `table | relationship | column | group`. `TableCard` reports pointer-downs per part (header / table description -> table,
row -> column / group); `SidePanel` renders the full `TablePropertiesPanel`, or only `ColumnPropertiesPanel` / `GroupPropertiesPanel`.

## Drag & drop (Properties panel)
HTML5 drag events on the grip handles. `TablePropertiesPanel` turns the hovered row + cursor position into a plan
`{ container: groupId | null, before: id | null }` and calls the store action `moveNode`, which removes the node and inserts it
before `before` in the target container (groups are rejected as targets for groups). Covered by `store/moveNode.test.ts`.

## Line routing (`domain/routing.ts`)
`routeRelationship` produces orthogonal points only:
1. tables side by side (gap ≥ 2 cells): leave right side → one vertical run on a grid column → enter left side (or mirrored);
2. horizontally overlapping tables / self reference: loop out around the right edges.
The vertical run's x can be shifted by `bend` (grid cells), dragged via the handle on the selected line.
`roundedPath` converts the points to an SVG path using arcs (`radius = min(cornerRadius, seg/2)`) so corners are rounded and
segments stay axis-aligned. All route points are multiples of the grid (unit-tested in `routing.test.ts`).

## Autosave (`lib/designApi.ts`)
`scheduleSave()` (called from a store subscription, not a React effect) arms one 300 ms timer; `pump()` runs a single-flight loop
`while (hasUnsavedChanges()) PUT latest state` so edits made during a request are coalesced into one follow-up with the newest
state. `synced = {seq, rev}` plus the store's `loadSeq` say what is stored; failures retry with backoff; `saveNow()` (Save version,
History) awaits the loop. Covered by `lib/autosave.test.ts` (fake timers + fake network: never overlapping, latest-state-only, no
starvation, retry, read-only versions never save).

## Editor state and persistence
`useEditor` (Zustand+Immer) holds `data`, `meta`, selection, viewport. Every persisted mutation bumps `rev`;
`EditorTemplate` debounces (700 ms) a `PUT /api/designs/:id` and shows Saved / Saving / Failed in the menu bar.
Viewport (pan/zoom) and selection are not persisted.

## Import / export
- SQL: see `SQL_COMMENT_PROTOCOL.md`. Export emits `CREATE TABLE`s, then `ALTER TABLE ADD FOREIGN KEY`s (order-independent, cycle-safe).
  Import uses a small tokenizer + recursive parser that keeps comments in the token stream so tags bind to the next element.
- JSON protocol: `docs/JSON_PROTOCOL.md` is the normative description; `lib/jsonValidate.ts` implements its consistency rules and `lib/jsonProtocol.test.ts` parses the document's own example and checks the documented defaults / importer behaviour against the code.
- JSON (`lib/json.ts`): `{ format: "dbdesigner", version: 1, design, settings, tables[] (with x,y,width,height), relationships[] (with route.points, sides, cornerRadius) }`.
  Route data is informational on export; on import routes are recomputed from `bend` and table positions.

## Data dictionary
`lib/dataDictionary.ts` builds the document as **blocks** (heading, paragraph, table...). Table blocks keep their header/rows.
`lib/mdRender.ts` renders each block with `marked`; raw HTML is escaped (only `<br>` is allowed), unsafe link schemes and images
are dropped, so user-entered text cannot inject markup. Each rendered block is wrapped in `data-block="<index>"`, and
`lib/mdSelection.ts` maps the browser selection back to the blocks' source Markdown on `copy`. `DataDictionaryModal` +
`molecules/FullScreenModal` provide the UI; it recomputes from the editor store, so it always reflects the latest edit.

## Testing
`npm test` (Vitest): versions (numbering, immutability, restore, cascade) against a temp SQLite file, SQL round trip (groups, descriptions, flags, FKs, header), plain SQL import, routing is orthogonal and on grid.

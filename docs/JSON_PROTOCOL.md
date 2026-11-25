# JSON protocol (v1)

This is the full-fidelity file format of **DB Designer** (File → *Export as JSON* / *Import SQL / JSON*). It is written so that a
person **or an AI** can (1) understand what a database design is *for* and (2) edit it safely and hand it back.

It is the richest format: it keeps everything — structure, documentation, diagram layout, and line details. The SQL export
(see [`SQL_COMMENT_PROTOCOL.md`](SQL_COMMENT_PROTOCOL.md)) keeps structure and documentation but **not** layout.

---

## 0. If you are an AI asked to edit a design — read this first

1. **Return the complete JSON document**, valid JSON (no comments, no trailing commas), unless told otherwise.
2. **Never change existing `id` values.** Everything is connected by ids. Renaming a table or column means changing `name`, not `id`.
3. **New things need new, unique ids** — any string, by convention `tbl_…`, `col_…`, `grp_…` (column group), `tg_…` (table group), `rel_…` (e.g. `col_orders_status`).
4. **A foreign key is a relationship, not a column flag.** There is no `foreignKey` property. A column *is* a foreign key when a
   `relationships[]` entry has it as `fromColumnId`. To add or remove a foreign key, add or remove that entry.
5. **Keep references valid.** The importer does **not** reject a broken reference; it silently drops it from the diagram and the SQL.
   When you delete a table or column, also delete every relationship that mentions it.
6. **Document what you add.** Give every new table and column a meaningful `description` (this is what people and the data dictionary read).
   If the purpose of the design changes, update `design.longDescription`.
7. **Leave computed fields out** (`tables[].height`, `relationships[].route`) — they are ignored on import and recomputed.
8. **Place new tables on free space** on the 10 px grid (see [§7](#7-diagram-layout)).
9. Before answering, run the **checklist in [§9](#9-validation-checklist)**.

---

## 1. What a design is (the model in plain words)

A **design** is one database schema drawn as an ER diagram:

- **Tables** have columns. Columns can be organised into **column groups** (collapsible sections *inside* one table, e.g. "Audit"), or sit directly in the table.
- **Tables can themselves be clustered** into **table groups** (named "subject areas", e.g. "Customers", "Sales"). A table belongs to at most one.
- **Relationships** are foreign keys: a *child* column (`from`) references a *parent* column (`to`).
- Everything carries **documentation**: the design, every table group, table, column group and column has a `description`.
- The JSON also stores **how it is drawn**: table positions, widths, colours, line shape and label positions.

### How to read a design to understand its purpose

Read in this order — the documentation fields are where the intent lives:

1. `design.name`, `design.shortDescription`, `design.longDescription` — what system this is and why it exists.
2. `tableGroups[]` (`name`, `description`) — the business areas; `tables[].groupId` says which table belongs to which.
3. `tables[]` — `name` + `description`, then the `items` (columns). Column `description`, `enumValues` (the allowed vocabulary), `defaultValue` and `check` explain rules.
4. `relationships[]` — how the tables connect; `label` is a human phrase for the link (e.g. `"places"`: a user *places* orders). Direction: `from` (child, holds the FK) → `to` (parent).
5. `settings` — diagram appearance only; it says nothing about the business meaning.

Order of `items` is the intended column order. Primary keys (`primaryKey: true`) identify rows; `unique`, `notNull`, `autoIncrement` (identity) describe constraints.

---

## 2. File structure

```
{
  "format": "dbdesigner",          // REQUIRED. Must be exactly this, or the import is rejected.
  "version": 1,                    // informational (not checked on import)
  "design":   { name, shortDescription, longDescription },
  "settings": { ... },             // optional; missing keys get defaults
  "tableGroups":   [ ... ],        // optional (default: none)
  "tables":        [ ... ],        // optional (default: none)
  "relationships": [ ... ]         // optional (default: none)
}
```

Unknown top-level keys are ignored. The importer is forgiving: missing fields get the defaults below. It is **not** a validator —
see [§9](#9-validation-checklist).

---

## 3. Field reference

Types: `string`, `number`, `boolean`, `null`. "Default" is what the importer uses when the key is missing.

### 3.1 `design`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `name` | string | – (a new design becomes "Imported design") | Design name |
| `shortDescription` | string | `""` | One line: what is this schema for? |
| `longDescription` | string | `""` | Purpose, scope, conventions. Newlines allowed (`\n`) |

### 3.2 `tableGroups[]` — named sets of tables

| Field | Type | Default | Meaning |
|---|---|---|---|
| `id` | string | random | **Unique.** Referenced by `tables[].groupId` |
| `name` | string | `"group"` | Group name. Keep names unique (case-insensitive) — SQL refers to groups by name |
| `description` | string | `""` | What the tables in this group have in common |

### 3.3 `tables[]`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `id` | string | random | **Unique.** Referenced by relationships. **Always provide it** |
| `name` | string | `"new_table"` | SQL table name. Unique in the design |
| `description` | string | `""` | What the table stores |
| `color` | string `#rrggbb` | `"#3b82f6"` | Header colour (the body gets a light tint of it) |
| `groupId` | string \| null | `null` | `id` of a table group. A value that matches no group is reset to `null` |
| `x`, `y` | number | `0` | Top-left corner on the canvas, px. **Snapped to the 10 px grid on import** |
| `width` | number | `240` | Used **only if `autoWidth` is `false`**. Snapped to 10, minimum 160 |
| `autoWidth` | boolean | `true` | `true`: width follows the content. `false`: use `width` |
| `items` | array | `[]` | **Ordered** list of columns and column groups (see below) |
| `indexes` | array | `[]` | Secondary indexes / composite unique constraints (see *Indexes* below) |
| `height` | number | – | *Export only; ignored on import.* Computed from the content |

**Indexes.** Each entry of `indexes[]` is `{ "id": "idx_…", "name": "", "columnIds": ["col_a", "col_b"], "unique": false }`.
`columnIds` is the **ordered** list of columns (ids of columns of the same table; at least one). `unique: true` means the
*combination* of the columns must be unique (a composite unique constraint). An empty `name` is generated on export
(`idx_<table>_<columns>` / `uq_<table>_<columns>`). Ids must be unique like all other ids. Entries without valid columns are
dropped on import; unknown column ids are removed from `columnIds`. **Composite primary key:** there is no separate object —
set `primaryKey: true` (and `notNull: true`) on every key column; their order in `items` is the key order.

`items[]` mixes two kinds of entries, told apart by `kind`:

#### Column — `"kind": "column"`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `kind` | `"column"` | – | Anything that is not `"group"` is treated as a column |
| `id` | string | random | **Unique.** Referenced by relationships. **Always provide it** |
| `name` | string | `"column"` | SQL column name. Unique within the table |
| `dataType` | string | `"VARCHAR(255)"` | Full type text, ANSI-style: `INTEGER`, `BIGINT`, `VARCHAR(255)`, `DECIMAL(10, 2)`, `TIMESTAMP`, `BOOLEAN`, `TEXT`, `DATE`, `UUID`… |
| `primaryKey` | boolean | `false` | Part of the primary key. Several `true` columns form a composite key. **Also set `notNull: true`** |
| `notNull` | boolean | `false` | `NOT NULL` |
| `unique` | boolean | `false` | `UNIQUE` (single-column) |
| `autoIncrement` | boolean | `false` | Identity column (`GENERATED BY DEFAULT AS IDENTITY`) |
| `defaultValue` | string | `""` | A **SQL expression**, written as it would appear after `DEFAULT`: `0`, `'new'`, `CURRENT_TIMESTAMP`. Empty = none |
| `check` | string | `""` | The **condition only**, without `CHECK ( )`: `quantity > 0`. Empty = none |
| `description` | string | `""` | What the column means / how it is used |
| `enumValues` | string | `""` | Comma-separated allowed values: `"new, paid, shipped"`. Shown as an enum. Exported to SQL as a real constraint: MySQL `ENUM(...)`, otherwise `CHECK (col IN (...))` |
| `logicalErd` | boolean | **`true`** | Show this column in the *logical* view. (Note: the default is `true` here, whereas the SQL importer defaults to *not* logical) |

#### Column group — `"kind": "group"`

A collapsible section of columns inside one table. Groups **cannot be nested**.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `kind` | `"group"` | – | **Required** for a group |
| `id` | string | random | **Unique** |
| `name` | string | `"group"` | Section title |
| `description` | string | `""` | What the columns in the section have in common |
| `collapsed` | boolean | `false` | View state. The editor reopens every diagram with groups collapsed, so this is effectively ignored |
| `columns` | Column[] | `[]` | The columns of the group, in order (each a column object as above) |

### 3.4 `relationships[]` — foreign keys

One entry = one **column pair**. A composite foreign key is several entries (they are exported as separate constraints).

| Field | Type | Default | Meaning |
|---|---|---|---|
| `id` | string | random | **Unique** |
| `fromTableId` | string | **required** | The **child** table (holds the foreign key) |
| `fromColumnId` | string | **required** | The foreign-key column (inside `fromTableId`) |
| `toTableId` | string | **required** | The **parent** (referenced) table. May equal `fromTableId` (self reference) |
| `toColumnId` | string | **required** | The referenced column (inside `toTableId`). Should be a primary key or `unique` |
| `onDelete` | enum | `"NO ACTION"` | `NO ACTION`, `CASCADE`, `SET NULL`, `SET DEFAULT`, `RESTRICT` |
| `onUpdate` | enum | `"NO ACTION"` | same values |
| `label` | string | `""` | Text drawn on the line, e.g. `"places"`. Free text (convention: a verb phrase read from parent to child) |
| `bend` | integer | `0` | Moves the line's middle run sideways, in grid cells (10 px each). Pure layout |
| `labelPos` | object \| null | `null` | `null` = automatic. Otherwise `{ "from": "start" \| "end", "distance": <px> }`: the label's centre sits `distance` px along the line from its start (the foreign-key table) or end (the referenced table). Pure layout. Invalid values become `null` |
| `route` | object | – | *Export only; ignored on import.* `{fromSide, toSide, points[], cornerRadius}`: the computed orthogonal path |

### 3.5 `settings`

All optional; missing keys get the defaults. Only the first group matters for the *design*; the rest is appearance.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `logicalMandatory` | array of `"pk"\|"fk"\|"nn"\|"uq"\|"ai"` | `["pk","fk"]` | In the logical view, columns with any of these properties are shown even if their `logicalErd` is `false`. Invalid / duplicate entries are dropped |
| `cornerRadius` | number | `10` | Radius of rounded line corners, px |
| `lineWidth` | number | `1.5` | Line thickness |
| `lineColor` | string | `"#64748b"` | Line colour |
| `stubLength` | number | `20` | Straight stub (px) before a line may turn |
| `defaultTableColor` | string | `"#3b82f6"` | Colour for new tables |
| `viewMode`, `showGrid`, `showMarkers`, `showLabels`, `showAttributes`, `showDescriptions`, `hideGroups` | – | `"full"`, `true`… | **View options.** Each user's remembered view options override these whenever a diagram is opened, so editing them here has no lasting effect. Leave them alone |

---

## 4. Rules that make a design correct

These are the invariants the tool relies on (checked by `validateDesignData` in `src/lib/jsonValidate.ts`).

- **Ids are unique** across tables, column groups, columns, table groups and relationships (use one namespace — don't reuse an id for anything).
- **Every relationship resolves:** `fromTableId` is a table, `fromColumnId` is a column *of that table* (inside an `items` column or a group's `columns`); likewise for `toTableId` / `toColumnId`. Otherwise the relationship is silently ignored.
- **Table names are unique; column names are unique within their table; table-group names are unique** (case-insensitive). SQL identifiers: letters, digits, underscore, not starting with a digit.
- **`tables[].groupId` is `null` or the `id` of an existing table group.**
- **A referenced column (`toColumnId`) should be a primary key or `unique`** — otherwise the exported `FOREIGN KEY` is invalid SQL.
- **Primary-key columns should have `notNull: true`.**
- A column should be the foreign key of **at most one** relationship.
- Column groups hold columns only (no nesting). A column lives either at the top level of `items` or inside exactly one group.

---

## 5. What the importer does with your file

- `format` ≠ `"dbdesigner"` → rejected ("Not a DB Designer JSON file"). Everything else is accepted.
- **Missing fields get defaults** (tables above). Missing `items` = a table with no columns.
- `x`, `y`, `width` are snapped to the 10 px grid; `width` has a minimum of 160.
- A `groupId` that matches no table group becomes `null`. An invalid `labelPos` becomes `null`. `logicalMandatory` is cleaned.
- **Not repaired:** duplicate ids, relationships pointing at missing tables/columns, duplicate names. They are kept in the data and
  cause silent loss or odd behaviour. This is why [§9](#9-validation-checklist) exists.
- `height` and `route` are dropped (recomputed, never stored). Other unknown keys on objects are carried along but meaningless — don't add any.
- **Import in the editor replaces the current design's content** (tables, relationships, groups, and the name / descriptions if the file has them). It keeps the design's identity and its **version history**, and the change becomes the new "latest state"; use *Save version* to snapshot it.
- Importing from the home page creates a **new design**.

---

## 6. Editing recipes

Each recipe lists *every* place that must change.

| Task | What to change |
|---|---|
| **Add a table** | Append to `tables[]`: new `id`, `name`, `description`, `color`, `groupId`, free `x`/`y`, and `items` with at least a primary-key column (`primaryKey: true`, `notNull: true`; usually `autoIncrement: true` for integer ids). Optionally set `groupId` to a table group |
| **Add a column** | Append a column object to the table's `items` (or into a group's `columns`). New `id`, `name`, `dataType`, `description`. Nothing else references it yet |
| **Add a foreign key** | Add a column (e.g. `customer_id`, same `dataType` as the referenced column) **and** a `relationships[]` entry: `fromTableId`/`fromColumnId` = the new column, `toTableId`/`toColumnId` = the referenced PK/unique column. Set `onDelete`, optionally `label`. Usually also `notNull: true` if the reference is mandatory |
| **Make an existing column a foreign key** | Only add the relationship entry |
| **Remove a foreign key** | Delete the relationship entry (the column stays) |
| **Rename a table / column** | Change `name` only. Ids stay, so relationships keep working |
| **Delete a column** | Remove it from `items`/`columns`, **delete every relationship** whose `fromColumnId` or `toColumnId` is its id, and remove its id from every `indexes[].columnIds` (delete indexes left empty) |
| **Delete a table** | Remove it from `tables[]` **and delete every relationship** whose `fromTableId` or `toTableId` is its id |
| **Change a data type** | Change `dataType`. If it is a key, change the type of the columns it is related to as well |
| **Reorder columns** | Reorder the entries of `items` (or of a group's `columns`) |
| **Put columns in a group** | Add `{ "kind": "group", "id": …, "name": …, "description": …, "collapsed": false, "columns": [ … ] }` to `items` and **move** (not copy) the column objects into its `columns` |
| **Move a column out of a group** | Remove it from the group's `columns`, add it to `items` at the wanted position |
| **Add a table group** | Append to `tableGroups[]` (`id`, `name`, `description`), then set `groupId` on the tables that belong |
| **Delete a table group** | Remove it from `tableGroups[]` and set `groupId` to `null` on its tables |
| **Mark a column for the logical view** | `logicalErd: true` (PK/FK columns are shown anyway; see `settings.logicalMandatory`) |
| **Constrain values** | `enumValues` for the vocabulary, plus `check` (e.g. `status IN ('new', 'paid')`) if SQL must enforce it |
| **Document it** | Fill `description` fields; update `design.shortDescription` / `longDescription` when the purpose changes |

---

## 7. Diagram layout

Layout never changes the meaning of the schema, but a good layout makes the design readable.

- Everything snaps to a **10 px grid**. Use multiples of 10 for `x`, `y`, `width`.
- A table is `40` px of header plus its rows. A one-line column row is `30` px; rows grow in steps of 10 px when they have stacked key lines
  (PK / FK / UQ NN), a wrapped description or enum values; a column group header is `30`+ px. Auto-width tables are typically 200–600 px wide (minimum 160).
- **Leave free space.** Place new tables so their rectangle does not overlap another: keep about **80–120 px between tables**. Lines are always
  horizontal/vertical with rounded corners and attach to a table's left or right side; they need **at least 20 px** between two side-by-side tables for the
  straight "Z" route (otherwise they loop around the right edges).
- Put related tables (and tables of the same table group) near each other; parents usually to the left of their children.
- Do **not** compute `route`, `height`, or label positions yourself; leave `bend: 0` and `labelPos: null` unless asked.

---

## 8. Mapping to SQL (for context)

| JSON | SQL export |
|---|---|
| `tables[]`, `items` order | `CREATE TABLE`, column order |
| `dataType`, `notNull`, `unique`, `defaultValue`, `check`, `autoIncrement`, `primaryKey` | column definition / `PRIMARY KEY` / `GENERATED BY DEFAULT AS IDENTITY` |
| `relationships[]` | `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY … REFERENCES … ON DELETE … ON UPDATE …` (one per column pair) |
| descriptions, column groups, table groups, `enumValues`, `logicalErd`, relationship `label`, colours | comments: plain `--` text, `-- @group`, `-- @logical` etc. ([protocol](SQL_COMMENT_PROTOCOL.md)); `enumValues` become an `ENUM` / `CHECK ... IN` |
| `x`, `y`, `width`, `autoWidth`, `bend`, `labelPos`, `settings` | **not in SQL** (JSON only) |

---

## 9. Validation checklist

Run through this before returning an edited file. (The same rules are implemented in `validateDesignData`, `src/lib/jsonValidate.ts`.)

- [ ] It is valid JSON and `"format": "dbdesigner"` is present.
- [ ] No `id` appears twice anywhere in the file.
- [ ] No existing `id` was changed; every new object has a new unique `id`.
- [ ] Every relationship's four ids (`fromTableId`, `fromColumnId`, `toTableId`, `toColumnId`) exist, and each column is inside the table named next to it.
- [ ] Every deleted table/column also had its relationships deleted.
- [ ] Every referenced column (`toColumnId`) is `primaryKey` or `unique`.
- [ ] Primary-key columns have `notNull: true`.
- [ ] A foreign-key column's `dataType` matches the column it references.
- [ ] Table names unique; column names unique per table; table-group names unique.
- [ ] Every `groupId` is `null` or an existing table group id.
- [ ] Every new table/column has a `description`; `design.longDescription` still describes the purpose.
- [ ] New tables do not overlap others; coordinates are multiples of 10.
- [ ] `kind` is `"column"` or `"group"` on every `items[]` entry; groups contain only columns.

Common mistakes: reusing an id; adding a column named `…_id` but forgetting the relationship (it is then *not* a foreign key);
deleting a table but leaving its relationships; putting a column both at the top level and in a group; writing `check` as
`CHECK (x > 0)` instead of `x > 0`; leaving `route`/`height` stale (harmless, but pointless).

---

## 10. Complete example

A small web shop. This block is **parsed and validated by the test suite** (`src/lib/jsonProtocol.test.ts`), so it stays correct.

```json
{
  "format": "dbdesigner",
  "version": 1,
  "design": {
    "name": "Webshop",
    "shortDescription": "Customers, their orders and order lines.",
    "longDescription": "Schema of a small online shop.\nOrders are placed by registered users; each order has one or more lines."
  },
  "settings": {
    "logicalMandatory": ["pk", "fk"],
    "cornerRadius": 10,
    "lineWidth": 1.5,
    "lineColor": "#64748b",
    "stubLength": 20,
    "defaultTableColor": "#3b82f6"
  },
  "tableGroups": [
    { "id": "tg_customers", "name": "Customers", "description": "Who buys from us." },
    { "id": "tg_sales", "name": "Sales", "description": "Orders and what they contain." }
  ],
  "tables": [
    {
      "id": "tbl_users",
      "name": "users",
      "description": "Registered customers.",
      "color": "#ef4444",
      "groupId": "tg_customers",
      "x": 60,
      "y": 60,
      "width": 240,
      "autoWidth": true,
      "items": [
        {
          "kind": "column", "id": "col_users_id", "name": "id", "dataType": "INTEGER",
          "primaryKey": true, "notNull": true, "unique": false, "autoIncrement": true,
          "defaultValue": "", "check": "", "description": "Surrogate key.", "enumValues": "", "logicalErd": true
        },
        {
          "kind": "group", "id": "grp_users_contact", "name": "Contact",
          "description": "How to reach the customer.", "collapsed": false,
          "columns": [
            {
              "kind": "column", "id": "col_users_email", "name": "email", "dataType": "VARCHAR(255)",
              "primaryKey": false, "notNull": true, "unique": true, "autoIncrement": false,
              "defaultValue": "", "check": "", "description": "Login e-mail; must be unique.", "enumValues": "", "logicalErd": true
            },
            {
              "kind": "column", "id": "col_users_phone", "name": "phone", "dataType": "VARCHAR(30)",
              "primaryKey": false, "notNull": false, "unique": false, "autoIncrement": false,
              "defaultValue": "", "check": "", "description": "Optional phone number.", "enumValues": "", "logicalErd": false
            }
          ]
        },
        {
          "kind": "column", "id": "col_users_created", "name": "created_at", "dataType": "TIMESTAMP",
          "primaryKey": false, "notNull": true, "unique": false, "autoIncrement": false,
          "defaultValue": "CURRENT_TIMESTAMP", "check": "", "description": "When the account was created.", "enumValues": "", "logicalErd": false
        }
      ]
    },
    {
      "id": "tbl_orders",
      "name": "orders",
      "description": "One purchase by a customer.",
      "color": "#3b82f6",
      "groupId": "tg_sales",
      "x": 420,
      "y": 60,
      "width": 240,
      "autoWidth": true,
      "items": [
        {
          "kind": "column", "id": "col_orders_id", "name": "id", "dataType": "INTEGER",
          "primaryKey": true, "notNull": true, "unique": false, "autoIncrement": true,
          "defaultValue": "", "check": "", "description": "Order number.", "enumValues": "", "logicalErd": true
        },
        {
          "kind": "column", "id": "col_orders_user", "name": "user_id", "dataType": "INTEGER",
          "primaryKey": false, "notNull": true, "unique": false, "autoIncrement": false,
          "defaultValue": "", "check": "", "description": "The customer who placed the order.", "enumValues": "", "logicalErd": true
        },
        {
          "kind": "column", "id": "col_orders_status", "name": "status", "dataType": "VARCHAR(20)",
          "primaryKey": false, "notNull": true, "unique": false, "autoIncrement": false,
          "defaultValue": "'new'", "check": "status IN ('new', 'paid', 'shipped')", "description": "Where the order is in its life cycle.",
          "enumValues": "new, paid, shipped", "logicalErd": true
        }
      ]
    },
    {
      "id": "tbl_items",
      "name": "order_items",
      "description": "One product line of an order.",
      "color": "#10b981",
      "groupId": "tg_sales",
      "x": 780,
      "y": 60,
      "width": 240,
      "autoWidth": true,
      "items": [
        {
          "kind": "column", "id": "col_items_id", "name": "id", "dataType": "INTEGER",
          "primaryKey": true, "notNull": true, "unique": false, "autoIncrement": true,
          "defaultValue": "", "check": "", "description": "", "enumValues": "", "logicalErd": true
        },
        {
          "kind": "column", "id": "col_items_order", "name": "order_id", "dataType": "INTEGER",
          "primaryKey": false, "notNull": true, "unique": false, "autoIncrement": false,
          "defaultValue": "", "check": "", "description": "The order this line belongs to.", "enumValues": "", "logicalErd": true
        },
        {
          "kind": "column", "id": "col_items_qty", "name": "quantity", "dataType": "INTEGER",
          "primaryKey": false, "notNull": true, "unique": false, "autoIncrement": false,
          "defaultValue": "1", "check": "quantity > 0", "description": "Units ordered.", "enumValues": "", "logicalErd": true
        }
      ]
    }
  ],
  "relationships": [
    {
      "id": "rel_orders_user", "fromTableId": "tbl_orders", "fromColumnId": "col_orders_user",
      "toTableId": "tbl_users", "toColumnId": "col_users_id",
      "onDelete": "CASCADE", "onUpdate": "NO ACTION", "label": "places", "bend": 0, "labelPos": null
    },
    {
      "id": "rel_items_order", "fromTableId": "tbl_items", "fromColumnId": "col_items_order",
      "toTableId": "tbl_orders", "toColumnId": "col_orders_id",
      "onDelete": "CASCADE", "onUpdate": "NO ACTION", "label": "contains", "bend": 0, "labelPos": null
    }
  ]
}
```

Reading it: *users* (Customers area) place *orders* (Sales area); every order *contains* *order_items*. `orders.user_id` and
`order_items.order_id` are the foreign keys — they are foreign keys **because** the two `relationships` entries point at them.

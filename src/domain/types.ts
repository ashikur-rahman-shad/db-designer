export interface Point {
  x: number;
  y: number;
}

export type RefAction = "NO ACTION" | "CASCADE" | "SET NULL" | "SET DEFAULT" | "RESTRICT";
export const REF_ACTIONS: RefAction[] = ["NO ACTION", "CASCADE", "SET NULL", "SET DEFAULT", "RESTRICT"];

export interface Column {
  kind: "column";
  id: string;
  name: string;
  /** Full data type text, e.g. `VARCHAR(255)`. */
  dataType: string;
  primaryKey: boolean;
  notNull: boolean;
  unique: boolean;
  autoIncrement: boolean;
  defaultValue: string;
  check: string;
  description: string;
  /** Comma separated allowed values (rendered as an enum). */
  enumValues: string;
  /** Whether the column is shown in the "logical" view. */
  logicalErd: boolean;
}

export interface ColumnGroup {
  kind: "group";
  id: string;
  name: string;
  description: string;
  collapsed: boolean;
  columns: Column[];
}

export type TableItem = Column | ColumnGroup;

/** A named set of tables (a "subject area"); unrelated to column groups inside a table. */
export interface TableGroup {
  id: string;
  name: string;
  description: string;
}

/**
 * A secondary index of a table. With `unique` it is also a (possibly composite) unique constraint:
 * the combination of the columns must be unique. Column order matters (it is the index key order).
 */
export interface TableIndex {
  id: string;
  /** Empty = a name is generated on export (`idx_<table>_<columns>` / `uq_...`). */
  name: string;
  /** Ordered ids of the indexed columns (all belong to the same table). Never empty. */
  columnIds: string[];
  unique: boolean;
}

export interface TableModel {
  id: string;
  name: string;
  description: string;
  color: string;
  /** Table group this table belongs to (id into `DesignData.tableGroups`), or null. */
  groupId: string | null;
  x: number;
  y: number;
  /** Used when `autoWidth` is false. */
  width: number;
  /** Auto: the table grows with its content. Fixed: `width` is used. */
  autoWidth: boolean;
  /** Ordered: ungrouped columns and groups, in display order. */
  items: TableItem[];
  /** Secondary indexes / composite unique constraints. (The primary key is the set of columns flagged `primaryKey`.) */
  indexes: TableIndex[];
}

export interface LabelPlacement {
  from: "start" | "end";
  distance: number;
}

/** A foreign key: `from` (child, holds the FK) references `to` (parent). */
export interface Relationship {
  id: string;
  fromTableId: string;
  fromColumnId: string;
  toTableId: string;
  toColumnId: string;
  onDelete: RefAction;
  onUpdate: RefAction;
  /** Free-text annotation drawn on the line. */
  label: string;
  /** Manual offset (in grid cells) of the middle segment of the line. */
  bend: number;
  /**
   * Which side a "C" shaped line (both ends on the same side, because the tables overlap horizontally) loops around.
   * Absent = right. Ignored when the tables sit side by side, where the line joins facing sides automatically.
   */
  loopSide?: "left" | "right";
  /** Which way this label reads along the line (the pointed end of its box). Absent = the design setting `labelDirection`. */
  labelDirection?: LabelDirection;
  /**
   * Manual label position: the centre of the label box lies on the line, `distance` px along it from the line's
   * start (the foreign-key table) or end (the referenced table) — whichever was nearer when it was placed.
   * Measuring from an end keeps the label next to that end when the line gets longer / shorter.
   * null = automatic (the middle of the line, kept clear of tables).
   */
  labelPos: LabelPlacement | null;
}

export type LabelDirection = "parent-to-child" | "child-to-parent";

export type ViewMode = "full" | "logical";

/** Column properties that always make a column appear in the logical view. */
export type LogicalProp = "pk" | "fk" | "nn" | "uq" | "ai";
export const LOGICAL_PROPS: { key: LogicalProp; label: string; title: string }[] = [
  { key: "pk", label: "PK", title: "Primary key" },
  { key: "fk", label: "FK", title: "Foreign key" },
  { key: "nn", label: "NN", title: "Not null" },
  { key: "uq", label: "UQ", title: "Unique" },
  { key: "ai", label: "AI", title: "Identity / auto increment" },
];

export interface DesignSettings {
  /**
   * Columns with any of these properties are shown in the logical view even when their own
   * "logical" flag is off.
   */
  logicalMandatory: LogicalProp[];
  viewMode: ViewMode;
  cornerRadius: number;
  lineWidth: number;
  lineColor: string;
  /** Length (px) of the straight stub leaving a table before the line may turn. */
  stubLength: number;
  showGrid: boolean;
  showMarkers: boolean;
  showLabels: boolean;
  /**
   * Which way relationship labels read by default (the pointed end of the label box faces the table it reads towards):
   * "parent-to-child" = `parent |label> child`, "child-to-parent" = `parent <label| child`. A relationship can override it.
   */
  labelDirection: LabelDirection;
  /** Show extra column attributes (not null, unique, enum, ...) on the diagram. */
  showAttributes: boolean;
  /** Show table / group / column descriptions on the diagram. */
  showDescriptions: boolean;
  /** Show columns as if column groups did not exist (flat list, collapse state ignored). */
  hideGroups: boolean;
  defaultTableColor: string;
}

export interface DesignData {
  tableGroups: TableGroup[];
  tables: TableModel[];
  relationships: Relationship[];
  settings: DesignSettings;
}

export interface DesignMeta {
  name: string;
  shortDescription: string;
  longDescription: string;
}

export interface Design extends DesignMeta {
  id: string;
  data: DesignData;
  createdAt: string;
  updatedAt: string;
}

export interface DesignSummary extends DesignMeta {
  id: string;
  tableCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DesignVersionSummary {
  version: number;
  note: string;
  name: string;
  tableCount: number;
  createdAt: string;
}

export interface DesignVersion extends DesignVersionSummary, DesignMeta {
  designId: string;
  data: DesignData;
}

/** An old version opened (read-only) in the designer. */
export interface ViewingVersion {
  version: number;
  createdAt: string;
  note: string;
}

/** Version state of a design as shown in the editor. */
export interface VersionInfo {
  /** Highest saved version number (0 = none yet). */
  latest: number;
  /** True when the latest edit state differs from (is newer than) the latest version. */
  changedSinceVersion: boolean;
}

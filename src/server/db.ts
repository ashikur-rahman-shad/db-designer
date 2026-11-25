import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/** Bump when the schema below gains tables. A cached connection (dev hot reload) re-applies it automatically. */
const SCHEMA_VERSION = 2;
const globalForDb = globalThis as unknown as { __dbd?: Database.Database; __dbdSchema?: number };

const SCHEMA = `
    CREATE TABLE IF NOT EXISTS designs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      short_description TEXT NOT NULL DEFAULT '',
      long_description TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    -- Per-user preferences (e.g. the remembered view options), shared by every design.
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    -- Latest edit state lives in \`designs\` (data + updated_at). Each row below is an
    -- immutable snapshot created by "Save version"; numbers increment per design.
    CREATE TABLE IF NOT EXISTS design_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      design_id TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      short_description TEXT NOT NULL DEFAULT '',
      long_description TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (design_id, version)
    );
  `;

/** Singleton SQLite connection (survives Next.js dev hot reloads). */
export function getDb(): Database.Database {
  if (globalForDb.__dbd) {
    if (globalForDb.__dbdSchema !== SCHEMA_VERSION) {
      globalForDb.__dbd.exec(SCHEMA); // idempotent (IF NOT EXISTS): upgrades a long-lived dev-server connection
      globalForDb.__dbdSchema = SCHEMA_VERSION;
    }
    return globalForDb.__dbd;
  }
  const file = process.env.DB_PATH ?? path.join(process.cwd(), "data", "designs.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  console.log(`[db] SQLite database: ${file}`);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  globalForDb.__dbdSchema = SCHEMA_VERSION;
  globalForDb.__dbd = db;
  return db;
}

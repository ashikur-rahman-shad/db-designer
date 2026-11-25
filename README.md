# DB Designer

A drawDB-style database designer built with Next.js, SQLite and an atomic component architecture.

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # unit tests
npm run build
```

Data is stored in `data/designs.db` (override with `DB_PATH`). **Your designs live only in that file** (plus its `-wal`/`-shm` side files):
don't delete the `data/` folder, and back it up if the designs matter. The dev server never resets it; restarting keeps your data. Requires Node 20+ (native `better-sqlite3`).

- `/` – list / create / edit / delete / import designs
- `/designs/[id]` – ER editor. *File* → export SQL / JSON, import; *View* → full / logical; *Settings* → corner radius etc.

Docs: [JSON protocol (for people and AI)](docs/JSON_PROTOCOL.md) · [requirements](docs/REQUIREMENTS.md) · [architecture](docs/ARCHITECTURE.md) · [SQL comment protocol](docs/SQL_COMMENT_PROTOCOL.md)

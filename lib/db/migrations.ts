import type Database from "better-sqlite3";

interface Migration {
  id: number;
  name: string;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  {
    id: 1,
    name: "add_session_listening_ports",
    up: (db) => {
      db.exec(
        "ALTER TABLE sessions ADD COLUMN listening_ports TEXT NOT NULL DEFAULT '[]'"
      );
    },
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db
      .prepare("SELECT id FROM _migrations")
      .all()
      .map((r) => (r as { id: number }).id)
  );

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;

    try {
      migration.up(db);
      db.prepare("INSERT INTO _migrations (id, name) VALUES (?, ?)").run(
        migration.id,
        migration.name
      );
      console.log(`Migration ${migration.id}: ${migration.name} applied`);
    } catch (error) {
      console.error(
        `Migration ${migration.id}: ${migration.name} failed:`,
        error
      );
      throw error;
    }
  }
}

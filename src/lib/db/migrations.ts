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
  {
    id: 2,
    name: "drop_project_tables",
    up: (db) => {
      db.exec(`
        DROP TABLE IF EXISTS project_repositories;
        DROP TABLE IF EXISTS project_dev_servers;
        DROP TABLE IF EXISTS projects;
        DROP TABLE IF EXISTS groups;
        DROP INDEX IF EXISTS idx_sessions_project;
        DROP INDEX IF EXISTS idx_sessions_group;
        DROP INDEX IF EXISTS idx_project_dev_servers_project;
        DROP INDEX IF EXISTS idx_project_repositories_project;
      `);
    },
  },
  {
    id: 3,
    name: "sanitize_claude_session_ids",
    up: (db) => {
      db.exec(`
        UPDATE sessions
        SET claude_session_id = NULL
        WHERE claude_session_id IS NOT NULL
          AND claude_session_id = id;
      `);
    },
  },
  {
    id: 4,
    name: "drop_unused_session_columns",
    up: (db) => {
      const columns = db
        .prepare("PRAGMA table_info(sessions)")
        .all()
        .map((r) => (r as { name: string }).name);

      const toDrop = [
        "pr_url",
        "pr_number",
        "pr_status",
        "listening_ports",
        "group_path",
      ];

      for (const col of toDrop) {
        if (columns.includes(col)) {
          db.exec(`ALTER TABLE sessions DROP COLUMN ${col};`);
        }
      }
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

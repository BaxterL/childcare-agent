import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { migrations } from "./migrations.js";

export type DB = Database.Database;

/** Open (creating if needed) the knowledge database and bring it up to date. */
export function openDatabase(dbPath: string): DB {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: DB): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let index = current; index < migrations.length; index += 1) {
    const sql = migrations[index];
    if (sql === undefined) continue;
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${index + 1}`);
    })();
  }
}

/** Parse a SQLite 0/1 integer column into a boolean. */
export function toBool(value: number): boolean {
  return value === 1;
}

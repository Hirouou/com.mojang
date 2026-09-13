import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Single writer. Acknowledged commands and their dedupe results commit together. */
export function openWarStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS war (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
  const read = db.prepare('SELECT data FROM war WHERE id=1');
  const write = db.prepare('INSERT INTO war(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data');
  return {
    load: () => { const row = read.get(); return row ? JSON.parse(row.data) : null; },
    save: state => write.run(JSON.stringify(state)),
    close: () => db.close(),
  };
}

import { DatabaseSync } from 'node:sqlite';
let handle = null;
function wrap(db) {
  return {
    async execAsync(sql) { db.exec(sql); },
    async runAsync(sql, ...a) { const r = db.prepare(sql).run(...a); return { changes: Number(r.changes ?? 0), lastInsertRowId: 0 }; },
    async getAllAsync(sql, ...a) { return db.prepare(sql).all(...a); },
    async getFirstAsync(sql, ...a) { return db.prepare(sql).get(...a) ?? null; },
    async withTransactionAsync(fn) { db.exec('BEGIN'); try { await fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
    async closeAsync() {},
  };
}
export async function openDatabaseAsync() { if (!handle) handle = wrap(new DatabaseSync(':memory:')); return handle; }
export async function deleteDatabaseAsync() { handle = null; }

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The store keeps its "schema is ready" promise at module scope, so each test
// imports its own copy. A shared instance would let one test's success leak
// into the next and hide a caching bug.
let counter = 0;
const freshStore = () => import(`../worker/store.js?case=${++counter}`);

/** Minimal stand-in for the D1 binding: records DDL, can fail a chosen statement. */
function fakeDb({ failOn = null, times = 1 } = {}) {
  const ran = [];
  let remaining = times;
  return {
    ran,
    prepare(sql) {
      const statement = {
        bind: () => statement,
        async run() {
          if (failOn && sql.includes(failOn) && remaining > 0) {
            remaining -= 1;
            throw new Error('transient D1 error');
          }
          ran.push(sql);
          return { success: true };
        },
        async first() {
          return null;
        },
        async all() {
          return { results: [] };
        },
      };
      return statement;
    },
  };
}

test('ensureSchema creates every table and index, exactly once', async () => {
  const { ensureSchema } = await freshStore();
  const db = fakeDb();

  await ensureSchema(db);
  await ensureSchema(db); // memoized: a second request must not repeat the DDL

  assert.equal(db.ran.length, 6, 'expected 6 DDL statements from one bootstrap');

  for (const statement of db.ran) {
    assert.match(statement, /IF NOT EXISTS/, `not idempotent: ${statement.slice(0, 40)}`);
  }
  const tables = db.ran.filter((sql) => sql.includes('CREATE TABLE')).map((sql) => sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1]);
  assert.deepEqual(tables.sort(), ['domain_cache', 'leads', 'projects', 'subscribers']);
  const indexes = db.ran.filter((sql) => sql.includes('CREATE INDEX'));
  assert.equal(indexes.length, 2, 'both indexes must be created');
});

test('a failed bootstrap is retried rather than cached', async () => {
  const { ensureSchema } = await freshStore();
  const db = fakeDb({ failOn: 'CREATE TABLE IF NOT EXISTS leads' });

  await assert.rejects(() => ensureSchema(db), /transient D1 error/);
  // It stops at the failing statement rather than pressing on regardless.
  assert.ok(db.ran.length > 0 && db.ran.length < 6, `the failing attempt ran ${db.ran.length} statements`);

  // The isolate must not be wedged for its whole lifetime by one transient error.
  db.ran.length = 0;
  await ensureSchema(db);
  assert.equal(db.ran.length, 6, 'the retry must complete the full schema');

  // And once it does succeed, the result is memoized.
  db.ran.length = 0;
  await ensureSchema(db);
  assert.equal(db.ran.length, 0, 'a successful bootstrap must not be repeated');
});

test('every table the store queries is created by the bootstrap', async () => {
  const { ensureSchema } = await freshStore();
  const db = fakeDb();
  await ensureSchema(db);

  const created = new Set(
    db.ran.filter((sql) => sql.includes('CREATE TABLE')).map((sql) => sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1]),
  );

  // Read the queries out of the source rather than trusting the DDL list, so a
  // new query against an un-created table fails here instead of in production.
  const raw = await readFile(new URL('../worker/store.js', import.meta.url), 'utf8');
  // Drop comments first: English prose contains words like "from" that would
  // otherwise be read as table names and fail this test for no reason.
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const referenced = new Set();
  for (const match of source.matchAll(/\b(?:FROM|INTO|UPDATE)\s+([a-z_][a-z0-9_]*)/gi)) {
    referenced.add(match[1].toLowerCase());
  }
  // `UPDATE subscribers SET ...` and friends; drop SQL keywords and the DDL text.
  for (const keyword of ['excluded', 'set', 'values', 'conflict']) referenced.delete(keyword);

  assert.ok(referenced.size >= 4, `expected to find the query tables, saw ${[...referenced].join(', ')}`);
  for (const table of referenced) {
    assert.ok(created.has(table), `store.js queries "${table}" but the bootstrap never creates it`);
  }
});

test('createStore still prefers D1 and falls back to the local store', async () => {
  const { createStore } = await freshStore();
  const db = fakeDb();

  const withD1 = createStore({ DB: db });
  assert.equal(typeof withD1.getProject, 'function');
  // A D1Store is wired straight to the binding; the local fallback ignores it.
  await withD1.getProject('missing');
  assert.deepEqual(db.ran, [], 'reading is not the store bootstrap’s job');

  const local = createStore({});
  assert.notStrictEqual(local, withD1, 'no DB binding must fall back to a local store');
  assert.equal(typeof local.getProject, 'function');
});

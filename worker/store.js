// Storage. One interface, two implementations:
//   * D1Store   — Cloudflare D1 in production (see worker/schema.sql)
//   * LocalStore — in-process map + optional JSON file for local development
//
// Nothing here touches Node APIs at module scope, so the Worker bundle stays
// workerd-compatible; the local file handle is injected by the dev server.

const now = () => Date.now();
const id = () => crypto.randomUUID();

// Schema, kept in step with worker/schema.sql.
//
// The tables are created on first use instead of by an out-of-band migration
// run, so a brand-new database works with no separate SQL step. Every statement
// is IF NOT EXISTS, which makes this idempotent and safe to repeat per isolate.
// schema.sql stays the canonical copy for anyone applying it by hand with
// `wrangler d1 execute`.
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS projects (
     id         TEXT PRIMARY KEY,
     name       TEXT NOT NULL,
     edit_token TEXT NOT NULL,
     payload    TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS leads (
     id         TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     email      TEXT NOT NULL,
     name       TEXT,
     message    TEXT NOT NULL,
     source     TEXT,
     created_at INTEGER NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS leads_project_idx ON leads (project_id, created_at DESC)',
  `CREATE TABLE IF NOT EXISTS subscribers (
     id            TEXT PRIMARY KEY,
     project_id    TEXT NOT NULL,
     email         TEXT NOT NULL,
     status        TEXT NOT NULL,
     confirm_token TEXT,
     source        TEXT,
     created_at    INTEGER NOT NULL,
     confirmed_at  INTEGER,
     UNIQUE (project_id, email)
   )`,
  'CREATE INDEX IF NOT EXISTS subscribers_project_idx ON subscribers (project_id, status, created_at DESC)',
  `CREATE TABLE IF NOT EXISTS domain_cache (
     domain     TEXT PRIMARY KEY,
     available  INTEGER,
     evidence   TEXT,
     checked_at INTEGER NOT NULL
   )`,
];

let schemaReady = null;

/**
 * Create the D1 tables once per isolate.
 *
 * The promise is shared so concurrent requests do not race the same DDL, and a
 * failure is not cached: the next request retries rather than wedging the
 * isolate for its whole lifetime on one transient D1 error.
 */
export function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const statement of SCHEMA_STATEMENTS) {
        await db.prepare(statement).run();
      }
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

function token(bytes = 24) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export { id, token };

class D1Store {
  constructor(db) {
    this.db = db;
  }

  async getProject(projectId) {
    return this.db.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first();
  }

  async putProject(row) {
    await this.db
      .prepare(
        `INSERT INTO projects (id, name, edit_token, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, name = excluded.name, updated_at = excluded.updated_at`,
      )
      .bind(row.id, row.name, row.edit_token, row.payload, row.created_at, row.updated_at)
      .run();
  }

  async listProjects(limit = 50) {
    const result = await this.db
      .prepare('SELECT id, name, created_at, updated_at FROM projects ORDER BY updated_at DESC LIMIT ?')
      .bind(limit)
      .all();
    return result.results || [];
  }

  /**
   * Remove a project and the data its website collected.
   *
   * The edit token is the only key to the inbox and the two CSVs, so deleting the
   * project without its leads would leave rows nobody could ever read again —
   * personal data kept past the point anyone could act on it.
   */
  async deleteProject(projectId) {
    await this.db.prepare('DELETE FROM leads WHERE project_id = ?').bind(projectId).run();
    await this.db.prepare('DELETE FROM subscribers WHERE project_id = ?').bind(projectId).run();
    await this.db.prepare('DELETE FROM projects WHERE id = ?').bind(projectId).run();
  }

  async addLead(row) {
    await this.db
      .prepare('INSERT INTO leads (id, project_id, email, name, message, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(row.id, row.project_id, row.email, row.name, row.message, row.source, row.created_at)
      .run();
  }

  async listLeads(projectId, limit = 200) {
    const result = await this.db
      .prepare('SELECT * FROM leads WHERE project_id = ? ORDER BY created_at DESC LIMIT ?')
      .bind(projectId, limit)
      .all();
    return result.results || [];
  }

  async countLeadsSince(projectId, since) {
    const row = await this.db
      .prepare('SELECT COUNT(*) AS total FROM leads WHERE project_id = ? AND created_at > ?')
      .bind(projectId, since)
      .first();
    return row ? row.total : 0;
  }

  async addSubscriber(row) {
    await this.db
      .prepare(
        `INSERT INTO subscribers (id, project_id, email, status, confirm_token, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(project_id, email) DO UPDATE SET status = excluded.status, confirm_token = excluded.confirm_token`,
      )
      .bind(row.id, row.project_id, row.email, row.status, row.confirm_token, row.source, row.created_at)
      .run();
  }

  async getSubscriberByToken(confirmToken) {
    return this.db.prepare('SELECT * FROM subscribers WHERE confirm_token = ?').bind(confirmToken).first();
  }

  async getSubscriberByEmail(projectId, email) {
    return this.db.prepare('SELECT * FROM subscribers WHERE project_id = ? AND email = ?').bind(projectId, email).first();
  }

  async setSubscriberStatus(subscriberId, status, extra = {}) {
    await this.db
      .prepare('UPDATE subscribers SET status = ?, confirmed_at = ? WHERE id = ?')
      .bind(status, extra.confirmedAt ?? null, subscriberId)
      .run();
  }

  async listSubscribers(projectId, limit = 1000) {
    const result = await this.db
      .prepare('SELECT email, status, source, created_at, confirmed_at FROM subscribers WHERE project_id = ? ORDER BY created_at DESC LIMIT ?')
      .bind(projectId, limit)
      .all();
    return result.results || [];
  }

  async getDomainCache(domain) {
    return this.db.prepare('SELECT * FROM domain_cache WHERE domain = ?').bind(domain).first();
  }

  async setDomainCache(entry) {
    await this.db
      .prepare(
        `INSERT INTO domain_cache (domain, available, evidence, checked_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(domain) DO UPDATE SET available = excluded.available, evidence = excluded.evidence, checked_at = excluded.checked_at`,
      )
      .bind(entry.domain, entry.available, entry.evidence, entry.checked_at)
      .run();
  }
}

class LocalStore {
  constructor(options = {}) {
    this.data = { projects: {}, leads: [], subscribers: [], domainCache: {} };
    this.filePath = options.filePath || null;
    this.fs = options.fs || null;
    this.loaded = this.#load();
    this.writeQueue = Promise.resolve();
  }

  async #load() {
    if (!this.fs || !this.filePath) return;
    try {
      const text = await this.fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(text);
      this.data = {
        projects: parsed.projects || {},
        leads: parsed.leads || [],
        subscribers: parsed.subscribers || [],
        domainCache: parsed.domainCache || {},
      };
    } catch {
      /* first run */
    }
  }

  #persist() {
    if (!this.fs || !this.filePath) return;
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        await this.fs.mkdir(this.fs.dir, { recursive: true });
        await this.fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
      } catch {
        /* local persistence is best-effort */
      }
    });
  }

  async getProject(projectId) {
    await this.loaded;
    return this.data.projects[projectId] || null;
  }

  async putProject(row) {
    await this.loaded;
    this.data.projects[row.id] = row;
    this.#persist();
  }

  async deleteProject(projectId) {
    await this.loaded;
    delete this.data.projects[projectId];
    this.data.leads = this.data.leads.filter((row) => row.project_id !== projectId);
    this.data.subscribers = this.data.subscribers.filter((row) => row.project_id !== projectId);
    this.#persist();
  }

  async listProjects(limit = 50) {
    await this.loaded;
    return Object.values(this.data.projects)
      .sort((a, b) => b.updated_at - a.updated_at)
      .slice(0, limit)
      .map((row) => ({ id: row.id, name: row.name, created_at: row.created_at, updated_at: row.updated_at }));
  }

  async addLead(row) {
    await this.loaded;
    this.data.leads.push(row);
    this.#persist();
  }

  async listLeads(projectId, limit = 200) {
    await this.loaded;
    return this.data.leads.filter((row) => row.project_id === projectId).sort((a, b) => b.created_at - a.created_at).slice(0, limit);
  }

  async countLeadsSince(projectId, since) {
    await this.loaded;
    return this.data.leads.filter((row) => row.project_id === projectId && row.created_at > since).length;
  }

  async addSubscriber(row) {
    await this.loaded;
    const existing = this.data.subscribers.find((item) => item.project_id === row.project_id && item.email === row.email);
    if (existing) {
      Object.assign(existing, { status: row.status, confirm_token: row.confirm_token });
    } else {
      this.data.subscribers.push(row);
    }
    this.#persist();
  }

  async getSubscriberByToken(confirmToken) {
    await this.loaded;
    return this.data.subscribers.find((row) => row.confirm_token === confirmToken) || null;
  }

  async getSubscriberByEmail(projectId, email) {
    await this.loaded;
    return this.data.subscribers.find((row) => row.project_id === projectId && row.email === email) || null;
  }

  async setSubscriberStatus(subscriberId, status, extra = {}) {
    await this.loaded;
    const row = this.data.subscribers.find((item) => item.id === subscriberId);
    if (row) {
      row.status = status;
      row.confirmed_at = extra.confirmedAt ?? null;
    }
    this.#persist();
  }

  async listSubscribers(projectId, limit = 1000) {
    await this.loaded;
    return this.data.subscribers
      .filter((row) => row.project_id === projectId)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit)
      .map(({ email, status, source, created_at, confirmed_at }) => ({ email, status, source, created_at, confirmed_at }));
  }

  async getDomainCache(domain) {
    await this.loaded;
    return this.data.domainCache[domain] || null;
  }

  async setDomainCache(entry) {
    await this.loaded;
    this.data.domainCache[entry.domain] = entry;
    this.#persist();
  }
}

// The local store must survive across requests — a fresh map per request would
// silently drop everything between the project POST and the follow-up GET.
const localStores = new WeakMap();
let standaloneStore = null;

function localStore() {
  const fs = globalThis.__BLUEPRINT_FS__ || null;
  const filePath = fs && fs.dir ? `${fs.dir}/blueprint.json` : null;
  return new LocalStore({ fs, filePath });
}

export function createStore(env) {
  if (env && env.DB && typeof env.DB.prepare === 'function') return new D1Store(env.DB);
  if (env && typeof env === 'object') {
    if (!localStores.has(env)) localStores.set(env, localStore());
    return localStores.get(env);
  }
  if (!standaloneStore) standaloneStore = localStore();
  return standaloneStore;
}

export function timestamp() {
  return now();
}

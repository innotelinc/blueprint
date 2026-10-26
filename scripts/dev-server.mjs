// Local development server.
//
// Serves public/ as static assets and dispatches every /api/* request to the
// real Worker fetch handler, so local development exercises the same routing,
// validation and storage code that runs in production. The ASSETS binding is
// implemented here with the filesystem; in production the platform provides it.
//
//   node scripts/dev-server.mjs [--port 8787]
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/index.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLIC_DIR = join(ROOT, 'public');
const DATA_DIR = join(ROOT, '.data');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

async function loadVars() {
  const vars = {};
  for (const file of ['.dev.vars', '.env']) {
    try {
      const text = await readFile(join(ROOT, file), 'utf8');
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        vars[key] = value;
      }
    } catch {
      /* file is optional */
    }
  }
  return vars;
}

// A secret may be written as a reference — `vault://<mount>/<path>#<field>` —
// instead of a literal, so a local value points at the estate's Vault rather
// than holding a copy of the secret. This is the same convention Cerulean's own
// .env uses (`TECHNITIUM_TOKEN=vault://cerulean/technitium#token`). A reference
// that cannot be resolved is dropped with a warning, so whatever it backed
// reports itself as unconfigured instead of failing later at call time.
const VAULT_REF = /^vault:\/\/([^#]+)(?:#(.+))?$/;

async function resolveVaultRefs(vars) {
  const refs = Object.entries(vars).filter(([, value]) => VAULT_REF.test(String(value)));
  if (!refs.length) return vars;

  const addr = String(vars.VAULT_ADDR || '').replace(/\/+$/, '');
  let token = String(vars.VAULT_TOKEN || '').trim();
  if (!token && vars.VAULT_TOKEN_FILE) {
    try {
      token = (await readFile(resolve(ROOT, vars.VAULT_TOKEN_FILE), 'utf8')).trim();
    } catch {
      /* reported by the branch below */
    }
  }
  if (!addr || !token) {
    for (const [key] of refs) delete vars[key];
    console.warn(
      `dev-server: ${refs.length} vault:// reference(s) left unresolved — set VAULT_ADDR and VAULT_TOKEN or VAULT_TOKEN_FILE.`,
    );
    return vars;
  }

  for (const [key, ref] of refs) {
    const [, path, field] = String(ref).match(VAULT_REF);
    const [mount, ...rest] = path.split('/');
    try {
      const response = await fetch(`${addr}/v1/${mount}/data/${rest.join('/')}`, {
        headers: { 'x-vault-token': token },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      const data = body?.data?.data ?? {};
      // `vault://<path>` without `#field` means the secret's first value.
      const value = field ? data[field] : Object.values(data)[0];
      if (typeof value !== 'string' || !value) {
        throw new Error(`no value for ${field ? `#${field}` : 'the first field'}`);
      }
      vars[key] = value;
    } catch (error) {
      delete vars[key];
      console.warn(`dev-server: could not resolve ${key} from vault (${error.message}).`);
    }
  }
  return vars;
}

// Mirrors `assets.not_found_handling: single-page-application` in wrangler.jsonc.
async function serveAsset(request) {
  const url = new URL(request.url);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';

  const target = resolve(join(PUBLIC_DIR, pathname));
  if (!target.startsWith(PUBLIC_DIR + sep) && target !== PUBLIC_DIR) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const info = await stat(target);
    if (info.isDirectory()) return serveAsset(new Request(new URL(pathname + '/index.html', url)));
    const body = await readFile(target);
    return new Response(body, {
      headers: {
        'content-type': MIME[extname(target)] || 'application/octet-stream',
        'content-length': String(body.byteLength),
      },
    });
  } catch {
    // Static miss on a client route falls back to the app shell.
    if (!extname(pathname)) {
      const shell = await readFile(join(PUBLIC_DIR, 'index.html'));
      return new Response(shell, { headers: { 'content-type': MIME['.html'] } });
    }
    return new Response('Not found', { status: 404 });
  }
}

const args = parseArgs(process.argv.slice(2));
const port = Number(args.port || process.env.PORT || 8787);
// Loopback by default: on a laptop the app must not be reachable from the
// network. A host that serves it to the LAN passes --host 0.0.0.0 explicitly,
// or leaves the default and puts a reverse proxy in front of it.
const host = args.host || process.env.HOST || '127.0.0.1';

// The local store persists to .data/blueprint.json instead of D1.
globalThis.__BLUEPRINT_FS__ = { readFile, writeFile, mkdir, dir: DATA_DIR };

const env = {
  ...(await resolveVaultRefs(await loadVars())),
  ASSETS: { fetch: (request) => serveAsset(request) },
};

const server = createServer(async (req, res) => {
  const started = Date.now();
  try {
    const url = new URL(req.url, `http://${req.headers.host || `localhost:${port}`}`);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;

    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
    });

    const response = await worker.fetch(request, env, { waitUntil() {}, passThroughOnException() {} });
    const buf = Buffer.from(await response.arrayBuffer());
    const headers = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    // Without this the browser heuristically caches app.js and app.css, so an
    // edit appears to do nothing until the cache is bypassed by hand.
    if (!headers['cache-control']) headers['cache-control'] = 'no-store';
    res.writeHead(response.status, headers);
    res.end(req.method === 'HEAD' ? undefined : buf);

    if (url.pathname.startsWith('/api/')) {
      console.log(`${response.status} ${req.method} ${url.pathname}${url.search} ${Date.now() - started}ms`);
    }
  } catch (error) {
    console.error('dev-server error:', error);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'dev_server_error', message: String(error && error.message) }));
  }
});

server.listen(port, host, () => {
  const address = server.address();
  console.log(`Blueprint dev server listening on http://${host}:${address.port}`);
  console.log(`Static root: ${PUBLIC_DIR}`);
  console.log(`Persistent data: ${join(DATA_DIR, 'blueprint.json')}`);
});

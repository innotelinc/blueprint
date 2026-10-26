import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker/index.js';
import { checkDomain, checkHandle, validDomain } from '../worker/domain.js';
import { describeProvider, sendEmail, confirmEmail } from '../worker/email.js';
import { aiStatus, writePositioning, sanitizePositioning, buildPositioningPrompt, MAX_POSITIONING } from '../worker/ai.js';
import { oasisStatus, oasisPlan, provisionOasis } from '../worker/oasis.js';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const ASSETS = new Map([['/index.html', '<!doctype html><html><body>app shell</body></html>']]);

function makeEnv(overrides = {}) {
  return {
    ASSETS: {
      async fetch(request) {
        const url = new URL(request.url);
        const body = ASSETS.get(url.pathname);
        if (!body) return new Response('Not found', { status: 404 });
        return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      },
    },
    ...overrides,
  };
}

const CTX = { waitUntil() {}, passThroughOnException() {} };

function call(path, options = {}) {
  const { env = makeEnv(), method = 'GET', body, headers = {}, ip = '203.0.113.1' } = options;
  const request = new Request(`https://blueprint.test${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), 'cf-connecting-ip': ip, ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return worker.fetch(request, env, CTX);
}

/** Stubbed upstream so tests never touch the network. */
function stubFetch(routes) {
  return async (url) => {
    const target = typeof url === 'string' ? url : url.url;
    for (const [pattern, response] of routes) {
      if (target.includes(pattern)) {
        return typeof response === 'function' ? response(target) : response;
      }
    }
    return new Response('not stubbed: ' + target, { status: 500 });
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

async function createProject(tag, env = makeEnv()) {
  const response = await call('/api/projects', {
    method: 'POST',
    ip: `198.51.100.${tag}`,
    env,
    headers: { origin: 'https://blueprint.test' },
    body: { intake: { name: 'Northwind', industry: 'b2b-saas' }, chosenLogoId: 'mark-slice', checklistDone: ['brand-0'] },
  });
  return { response, payload: await response.json() };
}

// ---------------------------------------------------------------------------
// Health, config, static
// ---------------------------------------------------------------------------

test('health reports the runtime configuration', async () => {
  const response = await call('/api/health');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.storage, 'local');
  assert.equal(body.email, null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('config exposes providers, platforms and limits without leaking secrets', async () => {
  const env = makeEnv({ AI_BASE_URL: 'https://ai.example/v1', AI_API_KEY: 'secret-key', AI_MODEL: 'test-model', RESEND_API_KEY: 're_123', EMAIL_FROM: 'hi@example.com', EMAIL_PROVIDER: 'resend' });
  const response = await call('/api/config', { env });
  const body = await response.json();
  const serialized = JSON.stringify(body);
  assert.equal(body.ai.configured, true);
  assert.equal(body.ai.model, 'test-model');
  assert.equal(body.email.key, 'resend');
  assert.equal(body.email.configured, true);
  assert.ok(body.handlePlatforms.includes('github'));
  assert.ok(body.limits.domainsPerRequest > 0);
  assert.ok(!serialized.includes('secret-key'), 'API key leaked into the config response');
  assert.ok(!serialized.includes('re_123'), 'email key leaked into the config response');
});

test('unknown static paths fall back to the app shell, real files do not', async () => {
  const shell = await call('/some/client/route');
  assert.equal(shell.status, 200);
  assert.ok((await shell.text()).includes('app shell'));

  const asset = await call('/index.html');
  assert.equal(asset.status, 200);
});

test('unknown api routes return a helpful 404', async () => {
  const response = await call('/api/nope');
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error, 'not_found');
});

// ---------------------------------------------------------------------------
// Domain checks
// ---------------------------------------------------------------------------

test('validDomain rejects junk and accepts real names', () => {
  assert.ok(validDomain('northwind.com'));
  assert.ok(validDomain('get-northwind.co.uk'));
  assert.ok(!validDomain('northwind'));
  assert.ok(!validDomain('northwind .com'));
  assert.ok(!validDomain('http://northwind.com'));
  assert.ok(!validDomain('-northwind.com'));
});

test('checkDomain combines RDAP and DNS into an honest verdict', async () => {
  const available = await checkDomain('free-name.com', {
    fetchImpl: stubFetch([
      ['verisign.com', new Response('', { status: 404 })],
      ['rdap.org', new Response('', { status: 404 })],
      ['cloudflare-dns.com', jsonResponse({ Status: 3 })],
    ]),
  });
  assert.equal(available.available, true);
  assert.equal(available.confidence, 'high');
  assert.equal(available.evidence.length, 2);

  const taken = await checkDomain('google.com', {
    fetchImpl: stubFetch([
      ['verisign.com', new Response('{"ldhName":"google.com"}', { status: 200 })],
      ['rdap.org', new Response('{"ldhName":"google.com"}', { status: 200 })],
      ['cloudflare-dns.com', jsonResponse({ Status: 0, Answer: [{ type: 2, data: 'ns1.google.com' }] })],
    ]),
  });
  assert.equal(taken.available, false);

  const unknown = await checkDomain('maybe.com', {
    fetchImpl: stubFetch([
      ['verisign.com', new Response('', { status: 429 })],
      ['rdap.org', new Response('', { status: 429 })],
      ['cloudflare-dns.com', new Response('', { status: 502 })],
    ]),
  });
  assert.equal(unknown.available, null, 'inconclusive lookups must not be guessed');
  assert.equal(unknown.confidence, 'none');

  const partial = await checkDomain('partial.com', {
    fetchImpl: stubFetch([
      ['verisign.com', new Response('', { status: 404 })],
      ['rdap.org', new Response('', { status: 404 })],
      ['cloudflare-dns.com', new Response('', { status: 500 })],
    ]),
  });
  assert.equal(partial.available, true);
  assert.equal(partial.confidence, 'medium');
});

test('registry RDAP is tried before the shared bootstrap service', async () => {
  const requested = [];
  const result = await checkDomain('example.com', {
    fetchImpl: async (url) => {
      requested.push(String(url));
      if (String(url).includes('rdap.verisign.com')) {
        return jsonResponse({ ldhName: 'EXAMPLE.COM', handle: '2336799_DOMAIN_COM-VRSN' });
      }
      if (String(url).includes('cloudflare-dns.com')) return jsonResponse({ Status: 0, Answer: [{ type: 2, data: 'a.iana-servers.net' }] });
      throw new Error(`unexpected request: ${url}`);
    },
  });
  assert.equal(result.available, false);
  assert.equal(result.confidence, 'high');
  assert.ok(requested.some((url) => url.includes('rdap.verisign.com/com/v1')), 'the registry endpoint was not tried');
  assert.ok(!requested.some((url) => url.includes('rdap.org')), 'bootstrap was used even though the registry answered');
  assert.match(result.evidence[0], /RDAP \(com\)/);

  // An empty 200 body must not be read as a registration.
  const empty = await checkDomain('example.com', {
    fetchImpl: async (url) => {
      if (String(url).includes('rdap.verisign.com')) return jsonResponse({});
      if (String(url).includes('rdap.org')) return new Response('', { status: 404 });
      return jsonResponse({ Status: 3 });
    },
  });
  assert.equal(empty.available, true, 'an empty registry answer should fall through to the next signal');

  // Unknown TLDs fall back to the bootstrap service.
  const fallback = await checkDomain('example.zz', {
    fetchImpl: async (url) => {
      if (String(url).includes('rdap.org')) return new Response('', { status: 404 });
      return jsonResponse({ Status: 3 });
    },
  });
  assert.equal(fallback.available, true);
});

test('handle probes only run against allow-listed platforms', async () => {
  const available = await checkHandle('github', 'northwind', { fetchImpl: stubFetch([['github.com', new Response('', { status: 404 })]]) });
  assert.equal(available.state, 'available');

  const taken = await checkHandle('github', 'nodejs', { fetchImpl: stubFetch([['github.com', new Response('', { status: 200 })]]) });
  assert.equal(taken.state, 'taken');

  const blocked = await checkHandle('instagram', 'northwind', { fetchImpl: stubFetch([]) });
  assert.equal(blocked.state, 'unverifiable');

  // A hostile handle cannot escape the allow-listed host.
  let requested = null;
  await checkHandle('github', '../../evil.com/x', {
    fetchImpl: async (url) => {
      requested = String(url);
      return new Response('', { status: 404 });
    },
  });
  const probed = new URL(requested);
  assert.equal(probed.hostname, 'github.com', `probe escaped the allow-list: ${requested}`);
  assert.equal(probed.protocol, 'https:');
});

test('POST /api/domains/check validates input and returns results', async () => {
  const env = makeEnv({
    __FETCH__: stubFetch([
      ['verisign.com', new Response('', { status: 404 })],
      ['rdap.org', new Response('', { status: 404 })],
      ['cloudflare-dns.com', jsonResponse({ Status: 3 })],
    ]),
  });
  const response = await call('/api/domains/check', { method: 'POST', env, ip: '203.0.113.40', body: { domains: ['northwind.com', 'not a domain', 'northwind.io'] } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.results.length, 2, 'invalid domains should be dropped');
  assert.ok(body.results.every((result) => result.available === true));

  const empty = await call('/api/domains/check', { method: 'POST', env, ip: '203.0.113.41', body: { domains: [] } });
  assert.equal(empty.status, 400);
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

test('projects round-trip with an edit token gate', async () => {
  const env = makeEnv();
  const { response, payload } = await createProject(10, env);
  assert.equal(response.status, 200);
  assert.match(payload.id, /^[a-f0-9-]{36}$/);
  assert.equal(payload.editToken.length, 48);

  const fetched = await call(`/api/projects/${payload.id}`, { env });
  assert.equal(fetched.status, 200);
  const stored = await fetched.json();
  assert.equal(stored.name, 'Northwind');
  assert.equal(stored.payload.intake.industry, 'b2b-saas');
  assert.equal(stored.payload.chosenLogoId, 'mark-slice');
  assert.deepEqual(stored.payload.checklistDone, ['brand-0']);
  assert.ok(!('edit_token' in stored), 'the edit token must never be returned by a GET');

  const wrongToken = await call(`/api/projects/${payload.id}`, {
    method: 'PUT',
    env,
    ip: '198.51.100.11',
    headers: { origin: 'https://blueprint.test', 'x-edit-token': 'nope' },
    body: { intake: { name: 'Hijacked' } },
  });
  assert.equal(wrongToken.status, 403);

  const update = await call(`/api/projects/${payload.id}`, {
    method: 'PUT',
    env,
    ip: '198.51.100.12',
    headers: { origin: 'https://blueprint.test', 'x-edit-token': payload.editToken },
    body: { intake: { name: 'Northwind', industry: 'fintech' }, notes: { brand: 'approved' } },
  });
  assert.equal(update.status, 200);

  const reread = await (await call(`/api/projects/${payload.id}`, { env })).json();
  assert.equal(reread.payload.intake.industry, 'fintech');
  assert.equal(reread.payload.notes.brand, 'approved');
});

test('a project is renamed by the business name on save, and can be removed', async () => {
  const env = makeEnv();
  const { payload } = await createProject(31, env);

  // The name is what the picker shows and what the next save looks up, so a
  // renamed company must rename the project rather than leave the old one.
  const rename = await call(`/api/projects/${payload.id}`, {
    method: 'PUT',
    env,
    ip: '198.51.100.31',
    headers: { origin: 'https://blueprint.test', 'x-edit-token': payload.editToken },
    body: { intake: { name: 'Lumen Labs', industry: 'b2b-saas' } },
  });
  assert.equal(rename.status, 200);
  assert.equal((await rename.json()).name, 'Lumen Labs');
  const stored = await (await call(`/api/projects/${payload.id}`, { env })).json();
  assert.equal(stored.name, 'Lumen Labs');

  // Removing is the same gate as editing: without the token it is refused, so a
  // stray id cannot delete somebody's project.
  const noToken = await call(`/api/projects/${payload.id}`, {
    method: 'DELETE',
    env,
    ip: '198.51.100.32',
    headers: { origin: 'https://blueprint.test' },
  });
  assert.equal(noToken.status, 403);

  const removed = await call(`/api/projects/${payload.id}`, {
    method: 'DELETE',
    env,
    ip: '198.51.100.33',
    headers: { origin: 'https://blueprint.test', 'x-edit-token': payload.editToken },
  });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).name, 'Lumen Labs');

  const gone = await call(`/api/projects/${payload.id}`, { env });
  assert.equal(gone.status, 404);
});

test('project writes are same-origin only and payloads are sanitized', async () => {
  const env = makeEnv();
  const crossOrigin = await call('/api/projects', {
    method: 'POST',
    env,
    ip: '198.51.100.20',
    headers: { origin: 'https://evil.example' },
    body: { intake: { name: 'Evil' } },
  });
  assert.equal(crossOrigin.status, 403);

  const smuggled = await call('/api/projects', {
    method: 'POST',
    env,
    ip: '198.51.100.21',
    headers: { origin: 'https://blueprint.test' },
    body: { intake: { name: 'Northwind' }, secret: 'should not persist', edit_token: 'attacker-chosen', checklistDone: ['a', 'b'], notes: { ok: 'yes' } },
  });
  assert.equal(smuggled.status, 200);
  const created = await smuggled.json();
  const stored = await (await call(`/api/projects/${created.id}`, { env })).json();
  assert.ok(!('secret' in stored.payload), 'unknown keys leaked into storage');
  assert.ok(!('edit_token' in stored.payload), 'a client-chosen edit token was accepted');
  assert.ok(stored.payload.notes.ok === 'yes');
});

test('oversized project payloads are rejected', async () => {
  const huge = { intake: { name: 'Northwind', junk: 'x'.repeat(200_000) } };
  const response = await call('/api/projects', {
    method: 'POST',
    ip: '198.51.100.30',
    headers: { origin: 'https://blueprint.test' },
    body: huge,
  });
  assert.equal(response.status, 413);
});

// ---------------------------------------------------------------------------
// Contact form
// ---------------------------------------------------------------------------

test('contact form stores a lead and is CORS-open for customer websites', async () => {
  const env = makeEnv();
  const { payload } = await createProject(40, env);

  const response = await call('/api/leads', {
    method: 'POST',
    env,
    ip: '203.0.113.60',
    headers: { origin: 'https://customer-site.example' },
    body: { projectId: payload.id, name: 'Dana Reed', email: 'Dana@Example.com', company: 'Reed Ltd', message: 'We need this by Q3 — can we talk?', source: 'contact' },
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  const result = await response.json();
  assert.ok(result.id);

  const csv = await call(`/api/projects/${payload.id}/leads.csv?token=${payload.editToken}`, { env });
  assert.equal(csv.status, 200);
  const text = await csv.text();
  assert.ok(text.startsWith('created_at,name,email,company,source,message'));
  assert.ok(text.includes('dana@example.com'), 'email should be normalized to lower case');
  assert.ok(text.includes('We need this by Q3'), 'message missing from the export');
});

test('contact form rejects invalid input and swallows honeypot submissions', async () => {
  const env = makeEnv();
  const { payload } = await createProject(41, env);

  const badEmail = await call('/api/leads', { method: 'POST', env, ip: '203.0.113.61', body: { projectId: payload.id, email: 'not-an-email', message: 'hello there' } });
  assert.equal(badEmail.status, 400);
  assert.equal((await badEmail.json()).error, 'invalid_email');

  const shortMessage = await call('/api/leads', { method: 'POST', env, ip: '203.0.113.62', body: { projectId: payload.id, email: 'a@b.co', message: 'hi' } });
  assert.equal(shortMessage.status, 400);

  const noProject = await call('/api/leads', { method: 'POST', env, ip: '203.0.113.63', body: { email: 'a@b.co', message: 'hello there' } });
  assert.equal(noProject.status, 400);

  const honeypot = await call('/api/leads', { method: 'POST', env, ip: '203.0.113.64', body: { projectId: payload.id, email: 'bot@spam.example', message: 'buy cheap things', website: 'http://spam.example' } });
  assert.equal(honeypot.status, 200);
  assert.equal((await honeypot.json()).ignored, true);

  const csv = await (await call(`/api/projects/${payload.id}/leads.csv?token=${payload.editToken}`, { env })).text();
  assert.ok(!csv.includes('bot@spam.example'), 'honeypot submission was stored');
});

test('contact form is rate limited per IP and per project', async () => {
  const env = makeEnv();
  const { payload } = await createProject(42, env);

  const statuses = [];
  for (let i = 0; i < 8; i += 1) {
    const response = await call('/api/leads', {
      method: 'POST',
      env,
      ip: '203.0.113.70',
      body: { projectId: payload.id, email: `person${i}@example.com`, message: 'Please send details about pricing and availability.' },
    });
    statuses.push(response.status);
  }
  assert.ok(statuses.includes(429), `expected a rate limit, got ${statuses.join(',')}`);
  assert.equal(statuses[0], 201);
});

test('lead exports require the project edit token', async () => {
  const env = makeEnv();
  const { payload } = await createProject(43, env);
  const response = await call(`/api/projects/${payload.id}/leads.csv`, { env });
  assert.equal(response.status, 403);
  assert.match((await response.json()).message, /edit token/i);
});

test('the founder inbox renders collected data and is token gated', async () => {
  const env = makeEnv();
  const { payload } = await createProject(44, env);
  await call('/api/leads', { method: 'POST', env, ip: '203.0.113.80', body: { projectId: payload.id, name: 'Sam', email: 'sam@example.com', message: 'Interested in a demo next week.' } });
  await call('/api/subscribers', { method: 'POST', env, ip: '203.0.113.81', body: { projectId: payload.id, email: 'sam@example.com' } });

  const denied = await call(`/api/projects/${payload.id}/inbox`, { env });
  assert.equal(denied.status, 403);

  const ok = await call(`/api/projects/${payload.id}/inbox?token=${payload.editToken}`, { env });
  assert.equal(ok.status, 200);
  const html = await ok.text();
  assert.ok(html.includes('Interested in a demo next week.'));
  assert.ok(html.includes('sam@example.com'));
  assert.ok(html.includes('Enquiries (1)'));
  assert.ok(html.includes('Subscribers (1)'));
  assert.ok(ok.headers.get('content-security-policy').includes("default-src 'none'"));
});

test('inbox escapes hostile content', async () => {
  const env = makeEnv();
  const { payload } = await createProject(45, env);
  await call('/api/leads', {
    method: 'POST',
    env,
    ip: '203.0.113.82',
    body: { projectId: payload.id, name: '<script>alert(1)</script>', email: 'x@example.com', message: '<img src=x onerror=alert(1)> please help' },
  });
  const html = await (await call(`/api/projects/${payload.id}/inbox?token=${payload.editToken}`, { env })).text();
  assert.ok(!html.includes('<script>alert(1)</script>'), 'script tag was not escaped in the inbox');
  assert.ok(!html.includes('<img src=x onerror='), 'image handler was not escaped in the inbox');
  assert.ok(html.includes('&lt;script&gt;'), 'escape did not run at all');
});

// ---------------------------------------------------------------------------
// Newsletter
// ---------------------------------------------------------------------------

test('newsletter runs a real double opt-in flow', async () => {
  const env = makeEnv();
  const { payload } = await createProject(50, env);

  const signup = await call('/api/subscribers', {
    method: 'POST',
    env,
    ip: '203.0.113.90',
    headers: { origin: 'https://customer-site.example' },
    body: { projectId: payload.id, email: 'reader@example.com', source: 'blog' },
  });
  assert.equal(signup.status, 201);
  const signupBody = await signup.json();
  assert.equal(signupBody.ok, true);
  assert.equal(signupBody.delivered, false, 'capture mode should be reported honestly');
  assert.ok(signupBody.confirmUrl.includes('/api/subscribers/confirm?token='), 'capture mode must still return a working link');

  const token = new URL(signupBody.confirmUrl).searchParams.get('token');

  const beforeConfirm = await (await call(`/api/projects/${payload.id}/subscribers.csv?token=${payload.editToken}`, { env })).text();
  assert.ok(beforeConfirm.includes('pending'), 'subscriber should be pending before confirmation');

  const confirm = await call(`/api/subscribers/confirm?token=${token}`, { env, ip: '203.0.113.91' });
  assert.equal(confirm.status, 200);
  assert.ok((await confirm.text()).includes('Subscription confirmed'));

  const afterConfirm = await (await call(`/api/projects/${payload.id}/subscribers.csv?token=${payload.editToken}`, { env })).text();
  assert.ok(afterConfirm.includes('confirmed'));
  assert.ok(!afterConfirm.includes('pending'));

  const repeat = await call(`/api/subscribers/confirm?token=${token}`, { env, ip: '203.0.113.92' });
  assert.ok((await repeat.text()).includes('already subscribed'));

  const unsubscribe = await call(`/api/unsubscribe?token=${token}`, { env, ip: '203.0.113.93' });
  assert.equal(unsubscribe.status, 200);
  assert.ok((await unsubscribe.text()).includes('unsubscribed'));
  const afterUnsubscribe = await (await call(`/api/projects/${payload.id}/subscribers.csv?token=${payload.editToken}`, { env })).text();
  assert.ok(afterUnsubscribe.includes('unsubscribed'));
});

test('newsletter rejects bad input and bogus tokens', async () => {
  const env = makeEnv();
  const { payload } = await createProject(51, env);

  const badEmail = await call('/api/subscribers', { method: 'POST', env, ip: '203.0.113.95', body: { projectId: payload.id, email: 'nope' } });
  assert.equal(badEmail.status, 400);

  const noProject = await call('/api/subscribers', { method: 'POST', env, ip: '203.0.113.96', body: { email: 'a@b.co' } });
  assert.equal(noProject.status, 400);

  const bogus = await call('/api/subscribers/confirm?token=deadbeef', { env, ip: '203.0.113.97' });
  assert.equal(bogus.status, 200);
  assert.ok((await bogus.text()).includes('expired'));

  const honeypot = await call('/api/subscribers', { method: 'POST', env, ip: '203.0.113.98', body: { projectId: payload.id, email: 'bot@spam.example', website: 'x' } });
  assert.equal((await honeypot.json()).ignored, true);
});

test('duplicate signups update the existing subscriber instead of duplicating', async () => {
  const env = makeEnv();
  const { payload } = await createProject(52, env);
  await call('/api/subscribers', { method: 'POST', env, ip: '203.0.113.99', body: { projectId: payload.id, email: 'dup@example.com', source: 'footer' } });
  await call('/api/subscribers', { method: 'POST', env, ip: '203.0.113.99', body: { projectId: payload.id, email: 'dup@example.com', source: 'blog' } });
  const csv = await (await call(`/api/projects/${payload.id}/subscribers.csv?token=${payload.editToken}`, { env })).text();
  assert.equal(csv.split('\n').filter((line) => line.includes('dup@example.com')).length, 1);
});

// ---------------------------------------------------------------------------
// Email providers
// ---------------------------------------------------------------------------

test('email capture mode is explicit and never pretends to deliver', async () => {
  const info = describeProvider({});
  assert.equal(info.configured, false);
  assert.equal(info.label, 'Capture mode');
  const result = await sendEmail({}, { to: 'a@b.co', subject: 's', html: 'h', text: 't' });
  assert.equal(result.delivered, false);
  assert.equal(result.reason, 'not-configured');

  const halfConfigured = describeProvider({ EMAIL_PROVIDER: 'resend' });
  assert.equal(halfConfigured.configured, false);
  assert.match(halfConfigured.note, /missing credentials/i);
});

test('configured provider posts the expected payload', async () => {
  const env = { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test', EMAIL_FROM: 'hello@example.com' };
  let captured = null;
  const result = await sendEmail(env, { to: 'a@b.co', subject: 'Hi', html: '<p>hi</p>', text: 'hi' }, {
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 });
    },
  });
  assert.equal(result.delivered, true);
  assert.equal(result.id, 'msg_1');
  assert.equal(captured.url, 'https://api.resend.com/emails');
  const body = JSON.parse(captured.init.body);
  assert.equal(body.from, 'hello@example.com');
  assert.deepEqual(body.to, ['a@b.co']);
  assert.equal(captured.init.headers.authorization, 'Bearer re_test');
});

test('confirmation email contains the link and the unsubscribe promise', () => {
  const email = confirmEmail({ projectName: 'Northwind', confirmUrl: 'https://x.test/api/subscribers/confirm?token=abc' });
  assert.ok(email.subject.includes('Northwind'));
  assert.ok(email.html.includes('https://x.test/api/subscribers/confirm?token=abc'));
  assert.ok(email.text.includes('If you did not sign up'));
});

// ---------------------------------------------------------------------------
// Positioning — the one thing the model writes
// ---------------------------------------------------------------------------

test('positioning is optional and says so clearly when unconfigured', async () => {
  assert.equal(aiStatus({}).configured, false);
  assert.equal(aiStatus({ AI_BASE_URL: 'https://ai.example/v1' }).configured, false);
  assert.equal(aiStatus({ AI_BASE_URL: 'https://ai.example/v1', AI_API_KEY: 'k' }).configured, true);

  const response = await call('/api/ai/positioning', {
    method: 'POST',
    ip: '203.0.113.110',
    headers: { origin: 'https://blueprint.test' },
    body: { context: { name: 'Northwind' } },
  });
  assert.equal(response.status, 501);
  assert.equal((await response.json()).error, 'ai_not_configured');

  const crossOrigin = await call('/api/ai/positioning', {
    method: 'POST',
    ip: '203.0.113.111',
    headers: { origin: 'https://evil.example' },
    body: { context: { name: 'Northwind' } },
  });
  assert.equal(crossOrigin.status, 403);

  // The old per-section rewrite is gone: there is one job, not a menu of them.
  const removed = await call('/api/ai/enhance', {
    method: 'POST',
    ip: '203.0.113.113',
    headers: { origin: 'https://blueprint.test' },
    body: { section: 'tagline' },
  });
  assert.notEqual(removed.status, 200, 'the rewrite endpoint should no longer be served');
});

test('the prompt carries the intake and forbids invented facts', () => {
  const messages = buildPositioningPrompt({
    name: 'Northwind',
    oneLiner: 'reconciles supplier invoices',
    industry: 'B2B SaaS',
    audience: 'operations and finance leads at mid-market companies',
    archetype: 'Sage',
    tone: 'calm',
    values: ['Plain speaking'],
  });
  assert.equal(messages[0].role, 'system');
  const user = messages[1].content;
  assert.match(user, /Northwind/);
  assert.match(user, /reconciles supplier invoices/);
  assert.match(user, /operations and finance leads/);
  assert.match(user, /Plain speaking/);
  assert.match(user, /Never invent statistics/);
  assert.match(user, /revolutionary/, 'the ban on hype words should name them');
});

test('the statement is written through the gateway and returned as data', async () => {
  let captured = null;
  const result = await writePositioning(
    { AI_BASE_URL: 'https://ai.example/v1/', AI_API_KEY: 'k', AI_MODEL: 'm' },
    { name: 'Northwind', oneLiner: 'a platform' },
    {
      fetchImpl: async (url, init) => {
        captured = { url, init };
        return jsonResponse({ model: 'm', choices: [{ message: { content: 'For operators who reconcile by hand, Northwind is the ledger that does it for them.' } }] });
      },
    },
  );
  assert.equal(captured.url, 'https://ai.example/v1/chat/completions');
  assert.equal(captured.init.headers.authorization, 'Bearer k');
  assert.equal(JSON.parse(captured.init.body).model, 'm');
  assert.equal(result.model, 'm');
  assert.match(result.text, /^For operators/);
});

test('model output is sanitized before it can reach the page or a file', () => {
  const dirty = '```markdown\n# For operators who reconcile by hand\n**Unlike spreadsheets**, <script>alert(1)</script>we do it without the overhead.\n```';
  const clean = sanitizePositioning(dirty);
  assert.ok(!/<[a-z/]/i.test(clean), 'markup survived sanitizing');
  assert.ok(!clean.includes('```'), 'a code fence survived sanitizing');
  assert.ok(!clean.includes('**'), 'emphasis markers survived sanitizing');
  assert.ok(!clean.includes('#'), 'a heading marker survived sanitizing');
  assert.match(clean, /For operators who reconcile by hand/);
  assert.match(clean, /we do it without the overhead/);
  assert.equal(sanitizePositioning('x'.repeat(MAX_POSITIONING * 3)).length, MAX_POSITIONING, 'output is not length-capped');
});

test('positioning failures surface as upstream errors, not silent successes', async () => {
  await assert.rejects(
    () =>
      writePositioning({ AI_BASE_URL: 'https://ai.example/v1', AI_API_KEY: 'k' }, {}, {
        fetchImpl: async () => new Response('nope', { status: 500 }),
      }),
    /returned 500/,
  );
  await assert.rejects(
    () =>
      writePositioning({ AI_BASE_URL: 'https://ai.example/v1', AI_API_KEY: 'k' }, {}, {
        fetchImpl: async () => jsonResponse({ choices: [{ message: { content: '' } }] }),
      }),
    /empty response/,
  );
});

// ---------------------------------------------------------------------------
// Oasis mail provisioning
// ---------------------------------------------------------------------------

test('oasis says exactly which half is configured', () => {
  const none = oasisStatus({});
  assert.equal(none.configured, false);
  assert.equal(none.server, 'Stalwart');
  assert.match(none.note, /does not create anything/i);

  const half = oasisStatus({ CERULEAN_API_TOKEN: 'ceru_x' });
  assert.equal(half.configured, false, 'DNS without a mail server is not provisionable');
  assert.equal(half.dns.configured, true);
  assert.equal(half.mail.configured, false);
  assert.match(half.note, /Partially configured/);

  const full = oasisStatus({ CERULEAN_API_TOKEN: 'ceru_x', OASIS_ADMIN_TOKEN: 't' });
  assert.equal(full.configured, true);
  assert.equal(full.webmail, 'https://mail.innotel.us');
});

test('the plan names every step, in order, and claims nothing', () => {
  const plan = oasisPlan({
    domain: 'northwind.com',
    mailboxes: [{ address: 'hello@northwind.com' }, { address: 'bill@northwind.com' }],
    records: [{ type: 'MX', name: '@', value: 'mail.innotel.us' }],
  });
  assert.deepEqual(
    plan.steps.map((entry) => entry.id),
    ['zone', 'dns', 'tenant', 'mail-domain', 'mailboxes'],
  );
  assert.ok(plan.steps.every((entry) => entry.status === 'planned'), 'a plan must not claim anything was applied');
  assert.equal(plan.mailboxCount, 2);
  assert.match(plan.steps[1].detail, /MX @ → mail\.innotel\.us/);
});

test('an unconfigured deployment returns the plan and touches nothing', async () => {
  let touched = false;
  const result = await provisionOasis(
    {},
    { domain: 'northwind.com', mailboxes: [{ address: 'hello@northwind.com' }], records: [] },
    {
      apply: true,
      fetchImpl: async () => {
        touched = true;
        return new Response('{}');
      },
    },
  );
  assert.equal(touched, false, 'an unconfigured deployment must not reach the network');
  assert.equal(result.applied, false);
  assert.equal(result.configured, false);
  assert.ok(result.steps.every((entry) => entry.status === 'planned'));
});

/** Stubs both APIs and records every call, so ordering and payloads are visible. */
function oasisStub(calls) {
  return async (url, init = {}) => {
    const method = init.method || 'GET';
    calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null, headers: init.headers || {} });
    if (url.endsWith('/api/service/domains') && method === 'GET') return jsonResponse({ domains: [] });
    if (url.endsWith('/api/service/domains')) return jsonResponse({ id: 1 }, 201);
    if (url.includes('/api/service/dns/records') && method === 'GET') return jsonResponse({ records: [] });
    if (url.includes('/api/service/dns/records')) return jsonResponse({}, 201);
    if (url.includes('/jmap/')) {
      const method_ = init.body ? JSON.parse(init.body).methodCalls[0][0] : 'x:None';
      const create = init.body ? JSON.parse(init.body).methodCalls[0][1].create : {};
      return jsonResponse({ methodResponses: [[method_, { created: { [Object.keys(create)[0]]: { id: 'obj-1' } } }]] });
    }
    throw new Error(`unstubbed ${method} ${url}`);
  };
}

test('a configured run creates the zone, the records, the tenant and the mailboxes, in that order', async () => {
  const calls = [];
  const env = {
    CERULEAN_API_URL: 'https://cerulean.test',
    CERULEAN_API_TOKEN: 'ceru_x',
    OASIS_JMAP_URL: 'https://mail.test/jmap/',
    OASIS_ADMIN_TOKEN: 'admin-token',
    OASIS_JMAP_ACCOUNT_ID: 'acc1',
  };
  const result = await provisionOasis(
    env,
    {
      domain: 'northwind.com',
      mailboxes: [
        { address: 'hello@northwind.com', purpose: 'Public' },
        { address: 'billing@northwind.com', purpose: 'Invoices' },
      ],
      records: [
        { type: 'MX', name: '@', value: 'mail.innotel.us', priority: 10 },
        { type: 'TXT', name: '@', value: 'v=spf1 include:spf.mailjet.com ~all' },
      ],
    },
    { apply: true, fetchImpl: oasisStub(calls) },
  );

  assert.equal(result.applied, true);
  assert.deepEqual(
    result.steps.map((entry) => entry.status),
    ['applied', 'applied', 'applied', 'applied', 'applied'],
  );

  // The credential must never appear in a plan, a step or an error message.
  assert.ok(!JSON.stringify(result).includes('ceru_x'));
  assert.ok(!JSON.stringify(result).includes('admin-token'));

  // Every Cerulean call carries the service key, and the zone is registered
  // before any record is written into it.
  const cerulean = calls.filter((entry) => entry.url.startsWith('https://cerulean.test'));
  assert.ok(cerulean.every((entry) => entry.headers.authorization === 'Bearer ceru_x'));
  assert.equal(cerulean[0].method, 'GET');
  assert.deepEqual(cerulean[1], { url: 'https://cerulean.test/api/service/domains', method: 'POST', body: { name: 'northwind.com' }, headers: { accept: 'application/json', authorization: 'Bearer ceru_x', 'content-type': 'application/json' } });

  // An MX without its priority is an unroutable record, so it must be sent.
  const mx = calls.find((entry) => entry.body?.type === 'MX');
  assert.equal(mx.body.priority, 10);
  assert.equal(mx.body.name, '@', 'records go in zone-relative, as Technitium expects');
  assert.equal(mx.body.zone, 'northwind.com');

  // Three JMAP set calls — tenant, domain, then one call for both mailboxes.
  const jmap = calls.filter((entry) => entry.url.includes('/jmap/'));
  assert.deepEqual(
    jmap.map((entry) => entry.body.methodCalls[0][0]),
    ['x:Tenant/set', 'x:Domain/set', 'x:Account/set'],
  );
  assert.ok(jmap.every((entry) => entry.headers.authorization === 'Bearer admin-token'));
  // The mailboxes are created against the domain object this run just created,
  // not against a bare name.
  assert.equal(Object.values(jmap[2].body.methodCalls[0][1].create)[0].domainId, 'obj-1');
});

test('a rejected Stalwart write fails the step instead of reporting success', async () => {
  const calls = [];
  const env = {
    CERULEAN_API_URL: 'https://cerulean.test',
    CERULEAN_API_TOKEN: 'ceru_x',
    OASIS_JMAP_URL: 'https://mail.test/jmap/',
    OASIS_ADMIN_TOKEN: 'admin-token',
    OASIS_JMAP_ACCOUNT_ID: 'acc1',
  };
  const result = await provisionOasis(
    env,
    { domain: 'northwind.com', mailboxes: [{ address: 'hello@northwind.com' }], records: [] },
    {
      apply: true,
      fetchImpl: async (url, init = {}) => {
        if (url.includes('/jmap/')) {
          const method = JSON.parse(init.body).methodCalls[0][0];
          // A 200 that created nothing is still a failure.
          return jsonResponse({ methodResponses: [[method, { notCreated: { tenant: { type: 'invalidArguments', description: 'name already in use' } } }]] });
        }
        return oasisStub(calls)(url, init);
      },
    },
  );
  assert.equal(result.applied, false);
  assert.equal(result.failed, true);
  assert.match(result.error.message, /name already in use/);
  const statuses = Object.fromEntries(result.steps.map((entry) => [entry.id, entry.status]));
  assert.equal(statuses.tenant, 'failed');
  assert.equal(statuses['mail-domain'], undefined, 'the run must stop at the first failure');
});

test('the mail route validates everything a client sends before it is applied', async () => {
  const env = makeEnv({ CERULEAN_API_TOKEN: 'ceru_x', OASIS_ADMIN_TOKEN: 't', OASIS_JMAP_ACCOUNT_ID: 'acc1' });
  const ok = { domain: 'northwind.com', mailboxes: [{ address: 'hello@northwind.com', purpose: 'Public' }], records: [{ type: 'MX', name: '@', value: 'mail.innotel.us', priority: 10 }] };

  // Cross-origin writes are refused, like every other mutating route.
  const crossOrigin = await call('/api/mail/provision', {
    method: 'POST', env, ip: '203.0.113.120', headers: { origin: 'https://evil.example' }, body: ok,
  });
  assert.equal(crossOrigin.status, 403);

  // A mailbox on someone else's domain is the attack this route has to refuse.
  const foreign = await call('/api/mail/provision', {
    method: 'POST', env, ip: '203.0.113.121', headers: { origin: 'https://blueprint.test' },
    body: { ...ok, mailboxes: [{ address: 'root@someone-else.com' }] },
  });
  assert.equal(foreign.status, 400);
  assert.match((await foreign.json()).message, /must be an address on northwind\.com/);

  const badType = await call('/api/mail/provision', {
    method: 'POST', env, ip: '203.0.113.122', headers: { origin: 'https://blueprint.test' },
    body: { ...ok, records: [{ type: 'NS', name: 'northwind.com', value: 'evil.example' }] },
  });
  assert.equal(badType.status, 400);

  const noDomain = await call('/api/mail/provision', {
    method: 'POST', env, ip: '203.0.113.123', headers: { origin: 'https://blueprint.test' },
    body: { ...ok, domain: 'not a domain' },
  });
  assert.equal(noDomain.status, 400);
});

test('the mail route plans without applying when Oasis is not configured', async () => {
  const response = await call('/api/mail/provision', {
    method: 'POST',
    ip: '203.0.113.124',
    headers: { origin: 'https://blueprint.test' },
    body: {
      domain: 'northwind.com',
      mailboxes: [{ address: 'hello@northwind.com', purpose: 'Public' }],
      records: [{ type: 'MX', name: '@', value: 'mail.innotel.us', priority: 10 }],
      apply: true,
    },
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.applied, false, 'an unconfigured deployment must never report an apply');
  assert.equal(data.configured, false);
  assert.equal(data.plan.steps.length, 5);
  assert.match(data.note, /does not create anything/i);
});

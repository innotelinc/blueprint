// Blueprint API worker.
//
// Serves the static generator from the ASSETS binding and handles the routes
// the browser cannot do itself: registry lookups, cross-origin form posts with
// persistence, double opt-in email and the optional AI rewrite.
//
// Design notes worth keeping:
//  * The generation engine runs in the browser. The server stores only the
//    intake and light user state, so projects stay tiny and cannot drift.
//  * Public write endpoints (leads, subscribers) accept cross-origin posts
//    because they are meant to be embedded in customer websites. They are
//    honeypotted, validated and rate limited.
//  * Everything that reads or edits project data requires the project's edit
//    token. Nothing is authorized by project id alone.
import { createStore, ensureSchema, id as newId, token as newToken, timestamp } from './store.js';
import { checkDomains, checkHandle, validDomain, SUPPORTED_HANDLE_PLATFORMS } from './domain.js';
import { describeProvider, sendEmail, confirmEmail, leadNotification } from './email.js';
import { aiStatus, writePositioning } from './ai.js';
import { oasisStatus, oasisPlan, provisionOasis } from './oasis.js';

const ENGINE_VERSION = '0.1.0';
const LIMITS = {
  domainsPerRequest: 25,
  handlesPerRequest: 12,
  bodyBytes: 32 * 1024,
  projectBytes: 128 * 1024,
  messageMax: 5000,
  emailMax: 254,
  leadsPerProjectPerHour: 20,
  leadsPerIpPerHour: 5,
  subscribersPerProjectPerHour: 500,
  aiPerHour: 40,
  mailProvisionPerHour: 6,
  mailRecords: 20,
  mailboxes: 20,
};

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS, ...headers },
  });
}

function csvResponse(rows, filename) {
  return new Response(rows, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
      ...SECURITY_HEADERS,
    },
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'self'",
      ...SECURITY_HEADERS,
    },
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function originHeaders(request, { allowAny = false } = {}) {
  const origin = request.headers.get('origin');
  if (allowAny) {
    return {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
    };
  }
  if (!origin) return {};
  try {
    const requestHost = new URL(request.url).host;
    if (new URL(origin).host === requestHost) {
      return {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
        'access-control-allow-headers': 'content-type, x-edit-token',
        'access-control-max-age': '600',
        vary: 'origin',
      };
    }
  } catch {
    /* malformed origin */
  }
  return {};
}

function isSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // same-origin fetches from the app shell omit Origin
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

const buckets = new Map();

/** Fixed-window limiter. Best effort per isolate; D1 counts back it up. */
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  bucket.count += 1;
  if (bucket.count > limit) return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  return { allowed: true, remaining: limit - bucket.count };
}

function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

async function readJson(request, maxBytes) {
  const text = await request.text();
  if (text.length > maxBytes) {
    const error = new Error('Request body is too large.');
    error.status = 413;
    throw error;
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.status = 400;
    throw error;
  }
}

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length < 5 || email.length > LIMITS.emailMax || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

function cleanText(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim()
    .slice(0, max);
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function handle(request, env, ctx) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith('/api/')) return serveStatic(request, env);

  // D1 tables are created on first use so a fresh database needs no separate
  // migration run before it can serve traffic.
  if (env?.DB) await ensureSchema(env.DB);

  const store = createStore(env);
  const ip = clientIp(request);

  if (request.method === 'OPTIONS') {
    const isPublicWrite = url.pathname === '/api/leads' || url.pathname === '/api/subscribers';
    return new Response(null, { status: 204, headers: originHeaders(request, { allowAny: isPublicWrite }) });
  }

  const segments = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const [first, second, third] = segments;

  // --- Health and configuration -------------------------------------------
  if (first === 'health') {
    return json({
      ok: true,
      engine: ENGINE_VERSION,
      time: new Date().toISOString(),
      storage: env.DB ? 'd1' : 'local',
      ai: aiStatus(env).configured,
      email: describeProvider(env).key,
      mail: oasisStatus(env).configured,
    });
  }

  if (first === 'config' && request.method === 'GET') {
    return json({
      engine: ENGINE_VERSION,
      ai: aiStatus(env),
      email: describeProvider(env),
      mail: oasisStatus(env),
      handlePlatforms: SUPPORTED_HANDLE_PLATFORMS,
      limits: {
        domainsPerRequest: LIMITS.domainsPerRequest,
        handlesPerRequest: LIMITS.handlesPerRequest,
        messageMax: LIMITS.messageMax,
      },
    });
  }

  // --- Domain availability -------------------------------------------------
  if (first === 'domains' && second === 'check' && request.method === 'POST') {
    const limit = rateLimit(`domains:${ip}`, 30, 60_000);
    if (!limit.allowed) return json({ error: 'rate_limited', message: 'Too many lookups. Try again shortly.' }, 429, originHeaders(request));
    const body = await readJson(request, 8 * 1024);
    const requested = Array.isArray(body.domains) ? body.domains.filter(validDomain).slice(0, LIMITS.domainsPerRequest) : [];
    if (!requested.length) return json({ error: 'no_domains', message: 'Send at least one valid domain name.' }, 400, originHeaders(request));

    const results = await checkDomains(requested, { fetchImpl: optionsFor(env) });
    const now = Date.now();
    if (ctx?.waitUntil) {
      ctx.waitUntil(
        Promise.all(results.map((result) => store.setDomainCache({ domain: result.domain, available: result.available === null ? null : result.available ? 1 : 0, evidence: JSON.stringify(result.evidence), checked_at: now }))).catch(() => {}),
      );
    }
    return json({ results, checkedAt: new Date(now).toISOString() }, 200, originHeaders(request));
  }

  // --- Social handle probes ------------------------------------------------
  if (first === 'handles' && second === 'check' && request.method === 'POST') {
    const limit = rateLimit(`handles:${ip}`, 20, 60_000);
    if (!limit.allowed) return json({ error: 'rate_limited', message: 'Too many checks. Try again shortly.' }, 429, originHeaders(request));
    const body = await readJson(request, 8 * 1024);
    const requested = (Array.isArray(body.handles) ? body.handles : [])
      .filter((entry) => entry && typeof entry.platform === 'string' && typeof entry.handle === 'string')
      .slice(0, LIMITS.handlesPerRequest);

    const results = [];
    for (const entry of requested) {
      results.push(await checkHandle(entry.platform, entry.handle, { fetchImpl: optionsFor(env) }));
      await sleep(150); // stay polite to platforms that rate-limit hard
    }
    return json({ results }, 200, originHeaders(request));
  }

  // --- Projects ------------------------------------------------------------
  if (first === 'projects') {
    if (!second && request.method === 'POST') {
      if (!isSameOrigin(request)) return json({ error: 'forbidden', message: 'Cross-origin writes are not allowed.' }, 403);
      const limit = rateLimit(`project-create:${ip}`, 20, 60 * 60 * 1000);
      if (!limit.allowed) return json({ error: 'rate_limited', message: 'Too many projects saved from this address.' }, 429);
      const body = await readJson(request, LIMITS.projectBytes);
      const intake = body.intake && typeof body.intake === 'object' ? body.intake : null;
      if (!intake) badRequest('A project needs an intake.');
      const payload = cleanPayload(body);
      const projectId = typeof body.id === 'string' && /^[a-f0-9-]{36}$/.test(body.id) ? body.id : newId();
      const editToken = newToken(24);
      const now = timestamp();
      const existing = await store.getProject(projectId);
      await store.putProject({
        id: projectId,
        name: cleanText(intake.name, 60) || 'Untitled',
        edit_token: editToken,
        payload: JSON.stringify(payload),
        created_at: existing ? existing.created_at : now,
        updated_at: now,
      });
      return json({ id: projectId, editToken, savedAt: new Date(now).toISOString() });
    }

    if (second && !third && request.method === 'GET') {
      const project = await store.getProject(second);
      if (!project) return json({ error: 'not_found', message: 'No project with that id.' }, 404);
      return json({
        id: project.id,
        name: project.name,
        payload: JSON.parse(project.payload),
        createdAt: new Date(project.created_at).toISOString(),
        updatedAt: new Date(project.updated_at).toISOString(),
      });
    }

    if (second && !third && request.method === 'PUT') {
      if (!isSameOrigin(request)) return json({ error: 'forbidden', message: 'Cross-origin writes are not allowed.' }, 403);
      const project = await store.getProject(second);
      if (!project) return json({ error: 'not_found' }, 404);
      if (request.headers.get('x-edit-token') !== project.edit_token) {
        await sleep(120); // slow down token guessing
        return json({ error: 'forbidden', message: 'Missing or invalid edit token for this project.' }, 403);
      }
      const body = await readJson(request, LIMITS.projectBytes);
      const payload = cleanPayload(body);
      // The saved name follows the business: a founder who renames the company and
      // presses save has renamed the project, and a list that still says the old
      // name is how the wrong project gets restored.
      const renamed = cleanText(payload.intake?.name, 60) || project.name;
      await store.putProject({ ...project, name: renamed, payload: JSON.stringify(payload), updated_at: timestamp() });
      return json({ id: project.id, name: renamed, savedAt: new Date().toISOString() });
    }

    if (second && !third && request.method === 'DELETE') {
      if (!isSameOrigin(request)) return json({ error: 'forbidden', message: 'Cross-origin writes are not allowed.' }, 403);
      const project = await store.getProject(second);
      if (!project) return json({ error: 'not_found', message: 'No project with that id.' }, 404);
      if (request.headers.get('x-edit-token') !== project.edit_token) {
        await sleep(120);
        return json({ error: 'forbidden', message: 'Missing or invalid edit token for this project.' }, 403);
      }
      await store.deleteProject(project.id);
      return json({ ok: true, id: project.id, name: project.name });
    }

    // Data the founder collects from their own website.
    if (second && third && third.endsWith('.csv') && request.method === 'GET') {
      const project = await store.getProject(second);
      if (!project) return json({ error: 'not_found' }, 404);
      if (url.searchParams.get('token') !== project.edit_token) return json({ error: 'forbidden', message: 'Add the project edit token to export this data.' }, 403);

      if (third === 'leads.csv') {
        const rows = await store.listLeads(second, 1000);
        const header = 'created_at,name,email,company,source,message\n';
        const body = rows
          .map((row) => [new Date(row.created_at).toISOString(), row.name, row.email, row.company || '', row.source || '', row.message].map(csvCell).join(','))
          .join('\n');
        return csvResponse(header + body, `${project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-leads.csv`);
      }
      if (third === 'subscribers.csv') {
        const rows = await store.listSubscribers(second, 5000);
        const header = 'email,status,source,created_at,confirmed_at\n';
        const body = rows
          .map((row) => [row.email, row.status, row.source || '', new Date(row.created_at).toISOString(), row.confirmed_at ? new Date(row.confirmed_at).toISOString() : ''].map(csvCell).join(','))
          .join('\n');
        return csvResponse(header + body, `${project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-subscribers.csv`);
      }
    }

    if (second && third === 'inbox' && request.method === 'GET') {
      const project = await store.getProject(second);
      if (!project) return html('<h1>Project not found</h1>', 404);
      if (url.searchParams.get('token') !== project.edit_token) return html('<h1>Add ?token=… to view this inbox</h1>', 403);
      return html(renderInbox(project, await store.listLeads(second, 200), await store.listSubscribers(second, 500)));
    }
  }

  // --- Contact form (public, cross-origin by design) -----------------------
  if (first === 'leads' && request.method === 'POST') {
    const body = await readJson(request, LIMITS.bodyBytes);
    if (body.website) return json({ ok: true, ignored: true }, 200, originHeaders(request, { allowAny: true })); // honeypot

    const email = cleanEmail(body.email);
    const message = cleanText(body.message, LIMITS.messageMax);
    const projectId = cleanText(body.projectId, 64);
    if (!email) return json({ error: 'invalid_email', message: 'That email address does not look right.' }, 400, originHeaders(request, { allowAny: true }));
    if (message.length < 5) return json({ error: 'invalid_message', message: 'Please include a short message.' }, 400, originHeaders(request, { allowAny: true }));
    if (!projectId) return json({ error: 'missing_project', message: 'This form is not connected to a project yet.' }, 400, originHeaders(request, { allowAny: true }));

    const ipLimit = rateLimit(`lead-ip:${ip}`, LIMITS.leadsPerIpPerHour, 60 * 60 * 1000);
    if (!ipLimit.allowed) return json({ error: 'rate_limited', message: 'Too many messages from this address. Try again later.' }, 429, originHeaders(request, { allowAny: true }));
    const recent = await store.countLeadsSince(projectId, Date.now() - 60 * 60 * 1000);
    if (recent >= LIMITS.leadsPerProjectPerHour) {
      return json({ error: 'rate_limited', message: 'This form is receiving a lot of messages right now. Please email us directly.' }, 429, originHeaders(request, { allowAny: true }));
    }

    const lead = {
      id: newId(),
      project_id: projectId,
      email,
      name: cleanText(body.name, 120),
      company: cleanText(body.company, 120),
      message,
      source: cleanText(body.source, 40) || 'website',
      created_at: Date.now(),
    };
    await store.addLead(lead);

    // Notify the founder only at an address the operator configured — never at
    // an address supplied by the public form, which would be a spam relay.
    const project = await store.getProject(projectId);
    let notified = { delivered: false, provider: null, reason: 'no-recipient' };
    const recipient = env.LEAD_NOTIFY_TO || null;
    if (recipient && project) {
      const message1 = leadNotification({
        projectName: project.name,
        lead,
        adminUrl: `${url.origin}/api/projects/${projectId}/inbox?token=${project.edit_token}`,
      });
      notified = await sendEmail(env, { to: recipient, ...message1, replyTo: email }, { fetchImpl: optionsFor(env) });
    }

    return json({ ok: true, id: lead.id, notified: notified.delivered }, 201, originHeaders(request, { allowAny: true }));
  }

  // --- Newsletter with double opt-in --------------------------------------
  if (first === 'subscribers') {
    if (second === 'confirm' && request.method === 'GET') {
      const confirmToken = cleanText(url.searchParams.get('token'), 128);
      const subscriber = confirmToken ? await store.getSubscriberByToken(confirmToken) : null;
      if (!subscriber) return html(renderStatusPage('That link has expired', 'We could not find a pending subscription for this link. Sign up again and we will send a fresh one.', false));
      if (subscriber.status === 'confirmed') {
        return html(renderStatusPage('You are already subscribed', 'Nothing else to do — you are on the list.', true));
      }
      await store.setSubscriberStatus(subscriber.id, 'confirmed', { confirmedAt: Date.now() });
      return html(renderStatusPage('Subscription confirmed', 'You are on the list. Expect one useful email a month, and an unsubscribe link in every one.', true));
    }

    if (request.method === 'POST') {
      const body = await readJson(request, LIMITS.bodyBytes);
      if (body.website) return json({ ok: true, ignored: true }, 200, originHeaders(request, { allowAny: true })); // honeypot

      const email = cleanEmail(body.email);
      const projectId = cleanText(body.projectId, 64);
      if (!email) return json({ error: 'invalid_email', message: 'That email address does not look right.' }, 400, originHeaders(request, { allowAny: true }));
      if (!projectId) return json({ error: 'missing_project', message: 'This form is not connected to a project yet.' }, 400, originHeaders(request, { allowAny: true }));

      const limit = rateLimit(`subscribe:${ip}`, 10, 60 * 60 * 1000);
      if (!limit.allowed) return json({ error: 'rate_limited', message: 'Too many attempts. Try again later.' }, 429, originHeaders(request, { allowAny: true }));
      const recent = (await store.listSubscribers(projectId, 2000)).filter((row) => row.created_at > Date.now() - 60 * 60 * 1000).length;
      if (recent >= LIMITS.subscribersPerProjectPerHour) {
        return json({ error: 'rate_limited', message: 'This list is growing fast right now. Try again in an hour.' }, 429, originHeaders(request, { allowAny: true }));
      }

      const project = await store.getProject(projectId);
      const confirmToken = newToken(24);
      await store.addSubscriber({
        id: newId(),
        project_id: projectId,
        email,
        status: 'pending',
        confirm_token: confirmToken,
        source: cleanText(body.source, 40) || 'website',
        created_at: Date.now(),
      });

      const confirmUrl = `${url.origin}/api/subscribers/confirm?token=${confirmToken}`;
      const confirmation = confirmEmail({
        projectName: project?.name || 'the newsletter',
        confirmUrl,
        brandColor: cleanText(body.brandColor, 9) || '#2563eb',
      });
      const sent = await sendEmail(env, { to: email, ...confirmation }, { fetchImpl: optionsFor(env) });

      return json(
        {
          ok: true,
          delivered: sent.delivered,
          // In capture mode (no provider configured) the link is returned so the
          // flow can be tested end to end without a vendor account.
          confirmUrl: sent.delivered ? undefined : confirmUrl,
          note: sent.delivered ? 'Check your inbox for the confirmation link.' : 'Confirmation email is in capture mode — the link below still works.',
        },
        201,
        originHeaders(request, { allowAny: true }),
      );
    }
  }

  if (first === 'unsubscribe' && request.method === 'GET') {
    const unsubscribeToken = cleanText(url.searchParams.get('token'), 128);
    const subscriber = unsubscribeToken ? await store.getSubscriberByToken(unsubscribeToken) : null;
    if (subscriber) await store.setSubscriberStatus(subscriber.id, 'unsubscribed');
    return html(renderStatusPage('You are unsubscribed', 'No further emails will be sent to this address. If this was a mistake, you can subscribe again on the site.', true));
  }

  // --- The positioning statement, written automatically --------------------
  // There is no rewrite button and no per-section endpoint: the model's only
  // job is the positioning statement, which the app requests once per generate.
  if (first === 'ai' && second === 'positioning' && request.method === 'POST') {
    if (!isSameOrigin(request)) return json({ error: 'forbidden' }, 403);
    const limit = rateLimit(`ai:${ip}`, LIMITS.aiPerHour, 60 * 60 * 1000);
    if (!limit.allowed) return json({ error: 'rate_limited', message: 'You have hit the positioning limit for this hour.' }, 429);

    const status = aiStatus(env);
    if (!status.configured) return json({ error: 'ai_not_configured', message: status.note }, 501);

    const body = await readJson(request, 8 * 1024);
    const context = body.context && typeof body.context === 'object' ? body.context : {};
    try {
      const result = await writePositioning(
        env,
        {
          name: cleanText(context.name, 80),
          oneLiner: cleanText(context.oneLiner, 300),
          industry: cleanText(context.industry, 80),
          audience: cleanText(context.audience, 200),
          archetype: cleanText(context.archetype, 60),
          tone: cleanText(context.tone, 60),
          values: Array.isArray(context.values) ? context.values.slice(0, 5).map((value) => cleanText(value, 80)) : [],
        },
        { fetchImpl: optionsFor(env) },
      );
      return json({ ok: true, section: 'positioning', text: result.text, model: result.model });
    } catch (error) {
      return json({ error: error.code || 'ai_failed', message: error.message }, error.code === 'ai_not_configured' ? 501 : 502);
    }
  }

  // --- Oasis mailbox provisioning ------------------------------------------
  // The plan is always returned. `apply` asks for it to actually be carried out,
  // and only ever runs when Oasis is configured; otherwise this is a dry run and
  // says so instead of reporting a provisioning that did not happen.
  if (first === 'mail' && second === 'provision' && request.method === 'POST') {
    if (!isSameOrigin(request)) return json({ error: 'forbidden', message: 'Cross-origin writes are not allowed.' }, 403);
    const limit = rateLimit(`mail:${ip}`, LIMITS.mailProvisionPerHour, 60 * 60 * 1000);
    if (!limit.allowed) return json({ error: 'rate_limited', message: 'Too many provisioning requests. Try again shortly.' }, 429);

    const body = await readJson(request, 16 * 1024);
    const request_ = cleanMailRequest(body);
    const status = oasisStatus(env);
    const plan = oasisPlan({ domain: request_.domain, mailboxes: request_.mailboxes, records: request_.records, status });

    if (!request_.apply || !status.configured) {
      return json({ ok: true, applied: false, configured: status.configured, plan, note: status.note });
    }

    try {
      const result = await provisionOasis(env, request_, { apply: true, fetchImpl: optionsFor(env) });
      return json({ ok: !result.failed, ...result, plan }, result.failed ? 502 : 200);
    } catch (error) {
      return json({ ok: false, applied: false, error: error.code || 'oasis_failed', message: error.message, plan }, 502);
    }
  }

  return json({ error: 'not_found', message: `No route for ${request.method} ${url.pathname}` }, 404, originHeaders(request));
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Only these keys are persisted, so a client cannot smuggle arbitrary data in. */
function cleanPayload(body) {
  const source = body.payload && typeof body.payload === 'object' ? body.payload : body;
  const notes = {};
  if (source.notes && typeof source.notes === 'object') {
    for (const [key, value] of Object.entries(source.notes).slice(0, 40)) {
      notes[cleanText(key, 40)] = cleanText(value, 2000);
    }
  }
  return {
    intake: source.intake && typeof source.intake === 'object' ? JSON.parse(JSON.stringify(source.intake).slice(0, 20000)) : {},
    chosenLogoId: cleanText(source.chosenLogoId, 40),
    checklistDone: Array.isArray(source.checklistDone) ? source.checklistDone.slice(0, 200).map((item) => cleanText(item, 80)) : [],
    notes,
    updatedAt: new Date().toISOString(),
  };
}

const MAIL_RECORD_TYPES = new Set(['MX', 'TXT', 'CNAME', 'A']);
const MAIL_LOCAL_PART = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/**
 * The Oasis provisioning request, narrowed to what the provisioner will accept.
 *
 * The plan is computed in the browser by the same engine that renders it, so the
 * domain, the mailboxes and the records arrive from the client. They are
 * therefore all re-validated here: a mailbox must be a plain address on the
 * domain being provisioned (nothing may create a user on someone else's domain),
 * and a record must be an allow-listed type with bounded, printable values.
 */
function cleanMailRequest(body) {
  const source = body && typeof body === 'object' ? body : {};
  const domain = String(source.domain || '').trim().toLowerCase();
  if (!validDomain(domain)) badRequest('Provisioning needs a valid domain.');

  const givenMailboxes = Array.isArray(source.mailboxes) ? source.mailboxes : [];
  if (!givenMailboxes.length) badRequest('A tenant needs at least one mailbox.');
  const mailboxes = givenMailboxes.slice(0, LIMITS.mailboxes).map((entry) => {
    const raw = typeof entry === 'string' ? entry : entry?.address;
    const address = String(raw || '').trim().toLowerCase();
    const [local, ...rest] = address.split('@');
    const host = rest.join('@');
    if (!local || host !== domain || !MAIL_LOCAL_PART.test(local)) {
      badRequest(`Refusing to create “${address || '(empty)'}” — a mailbox must be an address on ${domain}.`);
    }
    return {
      address,
      purpose: cleanText(typeof entry === 'object' ? entry?.purpose : '', 300),
      owner: cleanText(typeof entry === 'object' ? entry?.owner : '', 80),
    };
  });

  const givenRecords = Array.isArray(source.records) ? source.records : [];
  const records = givenRecords.slice(0, LIMITS.mailRecords).map((entry) => {
    const type = String(entry?.type || '').toUpperCase();
    if (!MAIL_RECORD_TYPES.has(type)) badRequest(`Unsupported mail record type “${type || '(empty)'}”.`);
    const name = cleanText(entry?.name, 253).toLowerCase();
    const value = cleanText(entry?.value, 255);
    if (!name) badRequest('Every mail record needs a name.');
    if (!value) badRequest('Every mail record needs a value.');
    const priority = entry?.priority === undefined ? undefined : Math.max(0, Math.min(65535, Math.round(Number(entry.priority) || 0)));
    return { type, name, value, ...(priority === undefined ? {} : { priority }), ttl: Math.max(60, Math.min(86400, Math.round(Number(entry?.ttl) || 3600))) };
  });

  return { domain, mailboxes, records, apply: source.apply === true };
}

function optionsFor(env) {
  return env.__FETCH__ || fetch;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function renderStatusPage(title, body, positive) {
  const color = positive ? '#16a34a' : '#b45309';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0e14;color:#e8eaed;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;padding:24px">
  <main style="max-width:520px;background:#141822;border:1px solid #232936;border-radius:16px;padding:32px">
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${color}">Blueprint.</p>
    <h1 style="margin:0 0 12px;font-size:22px">${escapeHtml(title)}</h1>
    <p style="margin:0;color:#9aa3b2;line-height:1.6">${escapeHtml(body)}</p>
  </main>
</body></html>`;
}

function renderInbox(project, leads, subscribers) {
  const leadRows = leads
    .map(
      (lead) => `<tr><td>${escapeHtml(new Date(lead.created_at).toLocaleString('en-US'))}</td><td>${escapeHtml(lead.name || '—')}<br><span class="muted">${escapeHtml(lead.email)}</span></td><td>${escapeHtml(lead.company || '—')}</td><td class="msg">${escapeHtml(lead.message)}</td></tr>`,
    )
    .join('');
  const subscriberRows = subscribers
    .map(
      (row) => `<tr><td>${escapeHtml(row.email)}</td><td>${escapeHtml(row.status)}</td><td>${escapeHtml(row.source || '—')}</td><td>${escapeHtml(new Date(row.created_at).toLocaleDateString('en-US'))}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(project.name)} — inbox</title></head>
<body style="margin:0;background:#0b0e14;color:#e8eaed;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
<style>
  body { padding:32px 20px; }
  .wrap { max-width:1040px; margin:0 auto; }
  h1 { font-size:24px; margin:0 0 4px; }
  h2 { font-size:15px; text-transform:uppercase; letter-spacing:.08em; color:#9aa3b2; margin:32px 0 12px; }
  table { width:100%; border-collapse:collapse; background:#141822; border:1px solid #232936; border-radius:12px; overflow:hidden; }
  th, td { text-align:left; padding:12px 14px; border-bottom:1px solid #232936; font-size:14px; vertical-align:top; }
  th { background:#1a2030; font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:#9aa3b2; }
  tr:last-child td { border-bottom:none; }
  .muted { color:#9aa3b2; font-size:12px; }
  .msg { white-space:pre-wrap; max-width:460px; }
  a { color:#7aa2ff; }
  .empty { padding:20px; background:#141822; border:1px solid #232936; border-radius:12px; color:#9aa3b2; }
</style>
<div class="wrap">
  <h1>${escapeHtml(project.name)}</h1>
  <p class="muted">Everything your website forms collected. Exports: <a href="/api/projects/${escapeHtml(project.id)}/leads.csv?token=${escapeHtml(project.edit_token)}">leads.csv</a> · <a href="/api/projects/${escapeHtml(project.id)}/subscribers.csv?token=${escapeHtml(project.edit_token)}">subscribers.csv</a></p>
  <h2>Enquiries (${leads.length})</h2>
  ${leads.length ? `<table><thead><tr><th>Received</th><th>From</th><th>Company</th><th>Message</th></tr></thead><tbody>${leadRows}</tbody></table>` : '<div class="empty">No enquiries yet.</div>'}
  <h2>Subscribers (${subscribers.length})</h2>
  ${subscribers.length ? `<table><thead><tr><th>Email</th><th>Status</th><th>Source</th><th>Joined</th></tr></thead><tbody>${subscriberRows}</tbody></table>` : '<div class="empty">No subscribers yet.</div>'}
</div>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Static assets
// ---------------------------------------------------------------------------

async function serveStatic(request, env) {
  if (!env || !env.ASSETS || typeof env.ASSETS.fetch !== 'function') {
    return new Response('Not found', { status: 404, headers: SECURITY_HEADERS });
  }
  const response = await env.ASSETS.fetch(request);
  const url = new URL(request.url);

  if (response.status === 404 && (request.method === 'GET' || request.method === 'HEAD') && !/\.[a-z0-9]{1,8}$/i.test(url.pathname)) {
    const shell = await env.ASSETS.fetch(new Request(new URL('/index.html', url), { headers: request.headers }));
    if (shell.status === 200) {
      return new Response(shell.body, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8', ...SECURITY_HEADERS },
      });
    }
  }

  if ((response.headers.get('content-type') || '').includes('text/html')) {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  }
  return response;
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handle(request, env, ctx);
    } catch (error) {
      const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
      if (status === 500) console.error('[blueprint] unhandled error:', error?.message || 'unknown');
      return json({ error: status === 500 ? 'server_error' : 'bad_request', message: status === 500 ? 'Something went wrong on our side. Nothing was lost — retry in a moment.' : error.message }, status);
    }
  },
};

export { LIMITS };

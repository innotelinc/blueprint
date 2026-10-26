// Oasis — Innotel's hosted mailbox service.
//
// Blueprint's default answer to "what email address do I put on the site?" is
// not a checklist: it is working mailboxes. Oasis is Innotel's own service —
// mailboxes live on Innotel's Stalwart server at mail.innotel.us — and two APIs
// do the work:
//
//   * Cerulean, the estate's control plane, publishes the client's mail domain
//     and its records into DNS. Its service bridge (`/api/service/domains`,
//     `/api/service/dns/records`) is zone-addressed and takes a Bearer service
//     key (`ceru_…`, scopes `domains` and `dns`). Only the service path space is
//     reachable unattended; the signed-in space is browser-only.
//
//   * Stalwart owns the tenant, the mail domain and the mailboxes. Its REST
//     surface (api/v1/openapi.yml) is deliberately small — login, discovery,
//     schema, telemetry — because configuration and data are managed over JMAP
//     (`POST /jmap/`). So the tenant, the domain and each account are created as
//     JMAP objects with an administrative principal, not with REST calls.
//
// Nothing here runs unless it is configured. With no credentials the module
// returns the ordered plan it *would* execute — the same contract the
// outbound-email layer uses for capture mode — rather than reporting a
// provisioning that never happened. Never log a key or a token.

const DEFAULT_CERULEAN_URL = 'https://cerulean.innotel.us';
const DEFAULT_JMAP_URL = 'https://mail.innotel.us/jmap/';

/** Stalwart's management objects live outside the core JMAP capabilities. */
const JMAP_USING = ['urn:ietf:params:jmap:core', 'urn:stalwart:jmap'];

export function oasisStatus(env) {
  const cerulean = Boolean(env.CERULEAN_API_TOKEN && (env.CERULEAN_API_URL || DEFAULT_CERULEAN_URL));
  const stalwart = Boolean(env.OASIS_ADMIN_TOKEN && (env.OASIS_JMAP_URL || DEFAULT_JMAP_URL));
  const configured = cerulean && stalwart;
  return {
    key: 'oasis',
    label: 'Oasis (Innotel)',
    operator: 'Innotel',
    server: 'Stalwart',
    webmail: env.OASIS_JMAP_URL ? String(env.OASIS_JMAP_URL).replace(/\/jmap\/?$/, '') : 'https://mail.innotel.us',
    dns: { via: 'Cerulean', configured: cerulean },
    mail: { via: 'Stalwart', configured: stalwart },
    configured,
    note: configured
      ? 'New companies get a Stalwart tenant, their mail domain and their mailboxes, with DNS published through Cerulean.'
      : cerulean || stalwart
        ? 'Partially configured — the Oasis provisioning plan is generated but nothing is created until both Cerulean and the Stalwart admin token are set.'
        : 'No Oasis credentials configured. Blueprint still generates the full mailbox and DNS plan; it just does not create anything.',
  };
}

/** Where a step runs, so a plan is readable without knowing the stack. */
const VIA = { cerulean: 'Cerulean', stalwart: 'Stalwart (JMAP)' };

function step(id, title, via, status, detail) {
  return { id, title, via: VIA[via] || via, status, detail };
}

/**
 * The ordered plan, without contacting anything.
 * @returns {{steps: Array, webmail: string, domain: string}}
 */
export function oasisPlan({ domain, mailboxes = [], records = [], status }) {
  const mailboxList = mailboxes.map((box) => box.address);
  const steps = [
    step('zone', `Register the ${domain} zone with Cerulean`, 'cerulean', 'planned', `Cerulean creates and tracks the zone so the records below land somewhere that is watched.`),
    step(
      'dns',
      `Publish ${records.length} mail records for ${domain}`,
      'cerulean',
      'planned',
      records.map((record) => `${record.type} ${record.name} → ${record.value}`).join(' · ') || 'MX, SPF, DKIM and DMARC',
    ),
    step('tenant', `Create the ${domain} tenant`, 'stalwart', 'planned', 'The tenant is the client’s own boundary: its own accounts, domains and quotas, isolated from every other Oasis customer.'),
    step('mail-domain', `Bind ${domain} to the tenant`, 'stalwart', 'planned', 'Stalwart only accepts mail for a domain it knows about and that the tenant owns.'),
    step('mailboxes', `Create ${mailboxList.length} mailboxes`, 'stalwart', 'planned', mailboxList.join(', ')),
  ];
  return {
    domain,
    webmail: status?.webmail || 'https://mail.innotel.us',
    steps,
    mailboxCount: mailboxList.length,
  };
}

// ---------------------------------------------------------------------------
// Cerulean — the mail domain and its records
// ---------------------------------------------------------------------------

async function ceruleanCall(env, path, method, body, fetchImpl) {
  const base = String(env.CERULEAN_API_URL || DEFAULT_CERULEAN_URL).replace(/\/+$/, '');
  const response = await fetchImpl(`${base}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${env.CERULEAN_API_TOKEN}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = typeof payload?.error === 'string' ? payload.error : `HTTP ${response.status}`;
    const error = new Error(`Cerulean refused ${method} ${path}: ${reason}.`);
    error.code = 'cerulean_error';
    throw error;
  }
  return payload;
}

async function ensureZone(env, zone, fetchImpl) {
  const listed = await ceruleanCall(env, '/api/service/domains', 'GET', null, fetchImpl);
  const zones = Array.isArray(listed) ? listed : listed?.domains || [];
  const existing = zones.find((entry) => String(entry?.name || '').replace(/\.$/, '').toLowerCase() === zone.toLowerCase());
  if (existing) return { status: 'skipped', detail: `Zone ${zone} is already registered (id ${existing.id ?? '—'}).` };
  await ceruleanCall(env, '/api/service/domains', 'POST', { name: zone }, fetchImpl);
  return { status: 'applied', detail: `Registered zone ${zone} with Cerulean.` };
}

/** Technitium's create call wants a zone-relative name; its reads are FQDNs. */
function zoneRelative(name, zone) {
  const suffix = `.${zone.replace(/\.$/, '').toLowerCase()}`;
  const full = String(name).replace(/\.$/, '').toLowerCase();
  return full.endsWith(suffix) ? full.slice(0, -suffix.length) : full;
}

async function publishRecords(env, zone, records, fetchImpl) {
  const listed = await ceruleanCall(env, `/api/service/dns/records?zone=${encodeURIComponent(zone)}`, 'GET', null, fetchImpl);
  const existing = Array.isArray(listed) ? listed : listed?.records || [];
  const has = (record) =>
    existing.some(
      (entry) =>
        String(entry?.name || '').replace(/\.$/, '').toLowerCase() === String(record.name).replace(/\.$/, '').toLowerCase() &&
        String(entry?.type || '').toUpperCase() === record.type.toUpperCase() &&
        String(entry?.rData ?? entry?.value ?? '').replace(/\.$/, '').toLowerCase() === String(record.value).replace(/\.$/, '').toLowerCase(),
    );

  const created = [];
  const already = [];
  for (const record of records) {
    if (has(record)) {
      already.push(record);
      continue;
    }
    await ceruleanCall(
      env,
      '/api/service/dns/records',
      'POST',
      {
        zone,
        type: record.type,
        name: zoneRelative(record.name, zone),
        value: record.value,
        ttl: record.ttl ?? 300,
        // MX is the one record type where the exchange alone is not enough.
        ...(record.priority === undefined ? {} : { priority: record.priority }),
      },
      fetchImpl,
    );
    created.push(record);
  }
  return {
    status: created.length ? 'applied' : 'skipped',
    created,
    already,
    detail:
      created.length || already.length
        ? `${created.length} record(s) created, ${already.length} already correct.`
        : 'No mail records to publish.',
  };
}

// ---------------------------------------------------------------------------
// Stalwart — the tenant, the mail domain and the mailboxes
// ---------------------------------------------------------------------------

function jmapUrl(env) {
  return String(env.OASIS_JMAP_URL || DEFAULT_JMAP_URL);
}

/**
 * One JMAP round trip. Stalwart answers per-method, so a failure can be a
 * `notCreated`/`notUpdated` inside a 200 response — that is read as a failure
 * here, because a 200 that created nothing is not success.
 */
async function jmapCall(env, methodCalls, fetchImpl) {
  const response = await fetchImpl(jmapUrl(env), {
    method: 'POST',
    headers: { authorization: `Bearer ${env.OASIS_ADMIN_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ using: JMAP_USING, methodCalls }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`Stalwart refused the management call (HTTP ${response.status}).`);
    error.code = 'stalwart_error';
    throw error;
  }
  const replies = payload?.methodResponses || [];
  for (const [, result] of replies) {
    const failure = result?.notCreated || result?.notUpdated || result?.notDestroyed;
    if (failure) {
      const first = Object.values(failure)[0];
      const error = new Error(`Stalwart did not apply the change: ${first?.description || first?.type || 'unknown reason'}.`);
      error.code = 'stalwart_rejected';
      throw error;
    }
  }
  return replies;
}

/** The admin account the management calls are made against. */
function adminAccountId(env) {
  if (!env.OASIS_JMAP_ACCOUNT_ID) {
    const error = new Error('OASIS_JMAP_ACCOUNT_ID is not set, so Stalwart has no account to create objects under.');
    error.code = 'oasis_account_unset';
    throw error;
  }
  return env.OASIS_JMAP_ACCOUNT_ID;
}

/** The id the server assigned to the object a `set` call created. */
function createdId(replies, creationId) {
  for (const [, result] of replies) {
    const id = result?.created?.[creationId]?.id;
    if (id) return id;
  }
  return null;
}

async function createTenant(env, { domain, fetchImpl }) {
  const accountId = adminAccountId(env);
  const name = domain.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const quotas = {};
  const gigabytes = Number(env.OASIS_TENANT_QUOTA_GB);
  if (Number.isFinite(gigabytes) && gigabytes > 0) quotas.maxDiskQuota = Math.round(gigabytes * 1024 * 1024 * 1024);
  const replies = await jmapCall(
    env,
    [['x:Tenant/set', { accountId, create: { tenant: { name, ...(Object.keys(quotas).length ? { quotas } : {}) } } }, 'c0']],
    fetchImpl,
  );
  return {
    status: 'applied',
    id: createdId(replies, 'tenant'),
    detail: `Created tenant “${name}”${Object.keys(quotas).length ? ` with a ${gigabytes} GB quota` : ''}.`,
  };
}

async function createMailDomain(env, { domain, tenantId, fetchImpl }) {
  const accountId = adminAccountId(env);
  const replies = await jmapCall(
    env,
    [['x:Domain/set', { accountId, create: { domain: { name: domain, ...(tenantId ? { memberTenantId: tenantId } : {}) } } }, 'c0']],
    fetchImpl,
  );
  return { status: 'applied', id: createdId(replies, 'domain'), detail: `Bound ${domain} to the tenant.` };
}

async function createMailboxes(env, { domain, domainId, mailboxes, fetchImpl }) {
  const accountId = adminAccountId(env);
  const create = {};
  mailboxes.forEach((box, index) => {
    const local = String(box.address).split('@')[0];
    create[`mailbox${index}`] = {
      name: local,
      // The mailbox must belong to the domain object this account was just
      // created against; a bare name would leave it unaddressable.
      ...(domainId ? { domainId } : {}),
      description: box.purpose,
    };
  });
  if (!Object.keys(create).length) return { status: 'skipped', detail: 'No mailboxes to create.' };
  await jmapCall(env, [['x:Account/set', { accountId, create }, 'c0']], fetchImpl);
  return { status: 'applied', detail: `Created ${Object.keys(create).length} mailbox(es) on ${domain}.` };
}

// ---------------------------------------------------------------------------
// The provisioner
// ---------------------------------------------------------------------------

/**
 * Provision (or plan) an Oasis tenant for a new company.
 *
 * @param {object} env
 * @param {object} input
 * @param {string} input.domain          the company's primary domain
 * @param {Array}  input.mailboxes       the mailbox plan's `boxes`
 * @param {Array}  input.records         the DNS records from `dnsPlan()`
 * @param {object} [options]
 * @param {boolean} [options.apply]      false (default) plans only
 * @param {Function} [options.fetchImpl] injected for tests
 * @returns {Promise<{applied: boolean, configured: boolean, steps: Array, webmail: string, domain: string}>}
 */
export async function provisionOasis(env, input, options = {}) {
  const status = oasisStatus(env);
  const apply = Boolean(options.apply) && status.configured;
  const fetchImpl = options.fetchImpl || fetch;
  const plan = oasisPlan({ ...input, status });
  const steps = [];
  const zone = String(input.domain || '').split('.').slice(-2).join('.') || input.domain;

  // Planning mode: nothing is contacted, so every step stays `planned`.
  if (!apply) {
    return { applied: false, configured: status.configured, domain: input.domain, webmail: plan.webmail, steps: plan.steps, note: status.note };
  }

  // Results a later step depends on (the tenant and domain object ids).
  const results = {};
  const run = async (id, via, work) => {
    try {
      const result = await work();
      if (result && result.id) results[id] = result.id;
      steps.push(step(id, plan.steps.find((entry) => entry.id === id)?.title || id, via, result.status, result.detail));
      return result;
    } catch (error) {
      steps.push(step(id, plan.steps.find((entry) => entry.id === id)?.title || id, via, 'failed', error.message));
      // Stop at the first failure: a half-built tenant is worse than none.
      throw Object.assign(error, { steps });
    }
  };

  try {
    await run('zone', 'cerulean', () => ensureZone(env, zone, fetchImpl));
    await run('dns', 'cerulean', () => publishRecords(env, zone, input.records || [], fetchImpl));
    await run('tenant', 'stalwart', () => createTenant(env, { domain: input.domain, fetchImpl }));
    await run('mail-domain', 'stalwart', () => createMailDomain(env, { domain: input.domain, tenantId: results.tenant, fetchImpl }));
    await run('mailboxes', 'stalwart', () =>
      createMailboxes(env, { domain: input.domain, domainId: results['mail-domain'], mailboxes: input.mailboxes || [], fetchImpl }),
    );
  } catch (error) {
    return { applied: false, configured: true, domain: input.domain, webmail: plan.webmail, steps: error.steps || steps, failed: true, error: { code: error.code || 'oasis_failed', message: error.message } };
  }

  return { applied: true, configured: true, domain: input.domain, webmail: plan.webmail, steps };
}

// Domain availability and social-handle probes.
//
// These run server-side because RDAP and DNS-over-HTTPS responses are not
// reliably CORS-enabled, and because a Worker can cache results.
//
// Honesty rule: registries throttle and rate-limit. When a lookup is
// inconclusive we return `available: null` rather than guessing, and the UI
// shows it as "check at the registrar".

const DOMAIN_PATTERN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

// Only these hosts may be probed. The URL is built from this table, never from
// client input, which removes any server-side request forgery surface.
const HANDLE_PROBES = {
  github: (handle) => `https://github.com/${handle}`,
  producthunt: (handle) => `https://www.producthunt.com/products/${handle}`,
  bluesky: (handle) => `https://bsky.app/profile/${handle}`,
};

export function validDomain(domain) {
  return typeof domain === 'string' && DOMAIN_PATTERN.test(domain.toLowerCase());
}

// Registries that serve RDAP directly. Answering the registry itself removes a
// redirect hop and is far more reliable than the shared bootstrap service.
// Only endpoints that were verified to answer authoritatively are listed.
const RDAP_REGISTRIES = {
  com: 'https://rdap.verisign.com/com/v1/domain/',
  net: 'https://rdap.verisign.com/net/v1/domain/',
  org: 'https://rdap.publicinterestregistry.org/rdap/domain/',
  io: 'https://rdap.identitydigital.services/rdap/domain/',
  info: 'https://rdap.identitydigital.services/rdap/domain/',
  uk: 'https://rdap.nominet.uk/uk/domain/',
};

function registryEndpoint(domain) {
  const tld = domain.slice(domain.lastIndexOf('.') + 1).toLowerCase();
  const base = RDAP_REGISTRIES[tld];
  return base ? { url: `${base}${encodeURIComponent(domain)}`, label: tld } : null;
}

async function rdapAt(url, label, fetchImpl) {
  try {
    const response = await fetchImpl(url, { headers: { accept: 'application/rdap+json, application/json' }, redirect: 'follow' });
    if (response.status === 404) return { registered: false, evidence: `RDAP (${label}): no registration record (404)` };
    if (response.status === 200) {
      const data = await response.json().catch(() => null);
      // Guard against a registry that answers 200 with an empty body.
      if (data && (data.ldhName || data.handle || data.entities)) {
        return { registered: true, evidence: `RDAP (${label}): registration record exists` };
      }
      return { registered: null, evidence: `RDAP (${label}): answered 200 without a record` };
    }
    if (response.status === 429) return { registered: null, evidence: `RDAP (${label}): rate limited (429)` };
    return { registered: null, evidence: `RDAP (${label}): inconclusive (${response.status})` };
  } catch (error) {
    return { registered: null, evidence: `RDAP (${label}): request failed (${error?.name || 'error'})` };
  }
}

async function rdap(domain, fetchImpl) {
  const direct = registryEndpoint(domain);
  if (direct) {
    const result = await rdapAt(direct.url, direct.label, fetchImpl);
    if (result.registered !== null) return result;
  }
  return rdapAt(`https://rdap.org/domain/${encodeURIComponent(domain)}`, 'bootstrap', fetchImpl);
}

async function dnsNs(domain, fetchImpl) {
  try {
    const response = await fetchImpl(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`, {
      headers: { accept: 'application/dns-json' },
    });
    if (!response.ok) return { delegated: null, evidence: `DNS: query failed (${response.status})` };
    const data = await response.json();
    const answers = Array.isArray(data.Answer) ? data.Answer.filter((record) => record.type === 2) : [];
    if (answers.length) return { delegated: true, evidence: `DNS: ${answers.length} NS record(s) published` };
    const status = data.Status;
    if (status === 3) return { delegated: false, evidence: 'DNS: NXDOMAIN, the zone does not exist' };
    return { delegated: false, evidence: `DNS: no NS records (status ${status})` };
  } catch (error) {
    return { delegated: null, evidence: `DNS: request failed (${error?.name || 'error'})` };
  }
}

/**
 * Check a single domain across two independent signals.
 * @returns {Promise<{domain: string, available: boolean|null, confidence: string, evidence: string[]}>}
 */
export async function checkDomain(domain, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const normalized = String(domain || '').toLowerCase().trim();
  if (!validDomain(normalized)) {
    return { domain: normalized, available: null, confidence: 'invalid', evidence: ['Not a valid domain name'] };
  }

  const [rdapResult, dnsResult] = await Promise.all([rdap(normalized, fetchImpl), dnsNs(normalized, fetchImpl)]);
  const evidence = [rdapResult.evidence, dnsResult.evidence];

  if (rdapResult.registered === false && dnsResult.delegated === false) {
    return { domain: normalized, available: true, confidence: 'high', evidence };
  }
  if (rdapResult.registered === true || dnsResult.delegated === true) {
    return { domain: normalized, available: false, confidence: 'high', evidence };
  }
  if (rdapResult.registered === null && dnsResult.delegated === null) {
    return { domain: normalized, available: null, confidence: 'none', evidence };
  }
  // One signal says free, the other could not answer.
  const freeish = rdapResult.registered === false || dnsResult.delegated === false;
  return {
    domain: normalized,
    available: freeish ? true : null,
    confidence: 'medium',
    evidence: [...evidence, 'Only one registry signal answered — confirm at the registrar.'],
  };
}

export async function checkDomains(domains, options = {}) {
  const list = Array.from(new Set((domains || []).map((domain) => String(domain || '').toLowerCase().trim()).filter(Boolean))).slice(0, 25);
  const results = [];
  // Small concurrency window keeps us polite to public registries.
  const windowSize = options.concurrency || 4;
  for (let start = 0; start < list.length; start += windowSize) {
    const batch = list.slice(start, start + windowSize);
    const settled = await Promise.all(batch.map((domain) => checkDomain(domain, options)));
    results.push(...settled);
  }
  return results;
}

/** Probe a social profile URL that we constructed ourselves. */
export async function checkHandle(platform, handle, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const build = HANDLE_PROBES[platform];
  if (!build) {
    return { platform, handle, state: 'unverifiable', evidence: 'This platform blocks automated checks.' };
  }
  const safe = String(handle || '').replace(/[^A-Za-z0-9._-]/g, '');
  if (!safe) return { platform, handle, state: 'unverifiable', evidence: 'Invalid handle.' };

  try {
    const response = await fetchImpl(build(safe), {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': 'Blueprint-HandleCheck/1.0 (+https://blueprint.example)', accept: 'text/html' },
    });
    if (response.status === 404) return { platform, handle: safe, state: 'available', evidence: 'Profile URL returns 404.' };
    if (response.status === 200) return { platform, handle: safe, state: 'taken', evidence: 'A profile exists at this handle.' };
    if (response.status === 429 || response.status === 403) {
      return { platform, handle: safe, state: 'unverifiable', evidence: `Platform refused the check (${response.status}).` };
    }
    return { platform, handle: safe, state: 'unverifiable', evidence: `Unexpected response (${response.status}).` };
  } catch (error) {
    return { platform, handle: safe, state: 'unverifiable', evidence: `Probe failed (${error?.name || 'error'}).` };
  }
}

export const SUPPORTED_HANDLE_PLATFORMS = Object.keys(HANDLE_PROBES);

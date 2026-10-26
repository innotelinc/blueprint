// Domains: ranked name candidates, DNS records and the steps to get a real URL
// live. Availability lookups themselves run server-side (see worker/domain.js)
// because RDAP and DNS-over-HTTPS are not reliably CORS-enabled.
import { seedFor, compact, slugify, unique } from './rng.js';

const TLD_LABELS = {
  com: 'The default. People type it without thinking.',
  io: 'Accepted by technical buyers; priced higher than .com.',
  ai: 'Signals AI; renewals are expensive and several registries are restrictive.',
  app: 'Enforces HTTPS, which is fine for a product but blocks nothing.',
  dev: 'Enforces HTTPS and is popular with developer tools.',
  co: 'Short and credible, but easy to mistype as .com.',
  sh: 'Favourite of developer tools; quirky for consumer brands.',
  studio: 'Literal for a design or production studio.',
  agency: 'Literal for a marketing or digital agency.',
  shop: 'Signals commerce and gives no SEO benefit over .com.',
  store: 'Same as .shop — use only if the brand is retail-first.',
  supply: 'Niche but memorable for a product brand.',
  finance: 'Restricted: requires a verified financial license or registration.',
  bank: 'Restricted: requires regulatory verification.',
  care: 'Signals healthcare; check provider-directory requirements first.',
  health: 'Healthcare signaling with no hard restriction.',
  org: 'Expected for nonprofits; adds credibility for civic projects.',
  ngo: 'Restricted and rarely worth the friction.',
  org: 'Nonprofit standard.',
  academy: 'Good for education brands; not restricted.',
  school: 'Longer and less professional-looking than .academy.',
  market: 'Literal for a marketplace.',
  services: 'Literal and local — fine for a service business.',
  pro: 'Widely recognised; renewal is higher than .com.',
  biz: 'Cheap but reads as low-trust to most buyers.',
  design: 'Literal for a design studio.',
  club: 'Community signaling, popular with paid memberships.',
  cn: 'Use only if China is a primary market.',
};

const PREFIXES = [
  { prefix: 'get', why: 'The classic verb-first form — you say the domain aloud in an ad and it sticks.' },
  { prefix: 'try', why: 'Lowers commitment: “try” reads as low-risk to a first-time visitor.' },
  { prefix: 'use', why: 'Suggests it is a tool people adopt rather than a service they hire.' },
  { prefix: 'join', why: 'Signals community or membership — strong for cohorts and marketplaces.' },
  { prefix: 'hello', why: 'Human and warm; good when the brand is the only differentiator.' },
  { prefix: 'the', why: 'Useful when the bare name is taken and the brand is already verbal.' },
];

const SUFFIXES = [
  { suffix: 'hq', why: 'Reads as the company behind the product, not just one app.' },
  { suffix: 'labs', why: 'Signals research and craft; leaves room for multiple products.' },
  { suffix: 'app', why: 'Obvious for a consumer app — sets expectations correctly.' },
  { suffix: 'ai', why: 'Only use if AI is genuinely core, not decorative.' },
  { suffix: 'works', why: 'Suggests a body of work or an agency.' },
  { suffix: 'flow', why: 'Suggests process and motion for a workflow product.' },
  { suffix: 'kit', why: 'Suggests a bundle of tools — friendly and concrete.' },
  { suffix: 'ly', why: 'Short, modern, and easy to say; the space is crowded.' },
];

/**
 * Generate and rank domain candidates. Ranking is a heuristic: the platform
 * cannot know what will feel right to the founder, so every candidate carries
 * the reason it exists and its trade-off.
 */
export function domainCandidates(identity, profile, options = {}) {
  const rand = seedFor(identity.name, 'domains');
  const base = identity.analysis.compact;
  const slug = slugify(identity.name);
  const industryTlds = profile.tldOrder || ['com', 'io', 'ai', 'co'];
  const limit = options.limit || 14;

  const entries = [];
  const push = (domain, strategy, why, penalty = 0) => {
    if (!domain || domain.length > 45) return;
    if (entries.some((entry) => entry.domain === domain)) return;
    const tld = domain.slice(domain.lastIndexOf('.') + 1);
    entries.push({ domain, tld, strategy, why, penalty });
  };

  industryTlds.forEach((tld, index) => {
    push(`${base}.${tld}`, 'exact name', `Your exact name on .${tld}.`, index === 0 ? 0 : index * 0.6);
  });

  rand.sample(PREFIXES, 3).forEach(({ prefix, why }) => {
    push(`${prefix}${base}.com`, 'prefixed', why, 1.2);
  });

  rand.sample(SUFFIXES, 2).forEach(({ suffix, why }) => {
    push(`${base}${suffix}.com`, 'suffixed', why, 1.4);
  });

  push(`${slug}.co`, 'hyphenated', 'Keeps the words readable in a URL; expect people to miss the hyphen when typing.', 2.6);
  push(`${base}${profile.categoryWord}.com`, 'keyword', `Contains “${profile.categoryWord}”, which helps recall in a crowded category.`, 2.2);
  push(`${base}.${industryTlds[1] || 'io'}`, 'exact name', 'Second-choice TLD for a technical audience.', 1);
  push(`${base}.net`, 'exact name', 'Legacy TLD with no SEO benefit and weak brand recall.', 3);

  const ranked = entries
    .map((entry) => {
      const lengthPenalty = Math.max(0, entry.domain.length - 16) * 0.18;
      const score = Math.max(1, 100 - entry.penalty * 9 - lengthPenalty * 10);
      return { ...entry, score: Math.round(score), tldNote: TLD_LABELS[entry.tld] || 'No specific signal.' };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    base,
    slug,
    primary: `${base}.com`,
    ranked,
    registrarSteps: [
      'Search the exact domain at two registrars and compare the first-year and renewal price — the gap is often 3x.',
      'Register for at least two years. A domain that expires in 11 months looks like a project, not a company.',
      'Turn on registrar-level transfer lock, DNSSEC and two-factor authentication immediately after purchase.',
      'Register the .com, the matching .co, and the obvious typo variants, then redirect them all to the primary.',
      'Buy the trademark-safe variants you care about before you announce — squatters watch launch posts.',
    ],
    note: 'Availability is checked live where a registry publishes data (RDAP/DNS). Treat every result as a strong hint and confirm at checkout — registries throttle bulk lookups.',
  };
}

//
// Mail providers. `oasis` is Innotel's own hosted service and the default:
// mailboxes live on Innotel's Stalwart server at mail.innotel.us, and the
// records below are published into your zone for you, because Oasis provisions
// the mail domain and the tenant through Cerulean rather than asking you to add
// MX records by hand. The values mirror the estate's live zone (MX
// mail.innotel.us, the DKIM selector `mail`, SPF through the estate relay).
//
// The other entries stay available as plain "you-do-it-yourself" alternatives.
const DNS_PROVIDERS = {
  oasis: {
    label: 'Oasis (Innotel)',
    operator: 'Innotel',
    server: 'Stalwart',
    managed: true,
    homepage: 'https://mail.innotel.us',
    mx: [{ type: 'MX', name: '@', value: 'mail.innotel.us', priority: 10, ttl: 3600 }],
    spf: 'v=spf1 include:spf.mailjet.com ip4:73.68.203.71 ~all',
    dkimSelector: 'mail',
    extra: [
      { type: 'CNAME', name: 'mail', value: 'mail.innotel.us', ttl: 3600 },
      { type: 'CNAME', name: 'autoconfig', value: 'mail.innotel.us', ttl: 3600 },
      { type: 'CNAME', name: 'autodiscover', value: 'mail.innotel.us', ttl: 3600 },
    ],
    docs: 'https://mail.innotel.us',
    summary: 'Mailboxes on Innotel’s Stalwart server. Oasis creates the tenant, the mail domain and the users through Cerulean, so you get working addresses without installing anything or opening a per-seat vendor account.',
  },
  'google-workspace': {
    label: 'Google Workspace',
    mx: [
      { type: 'MX', name: '@', value: 'smtp.google.com', priority: 1, ttl: 3600 },
    ],
    spf: 'v=spf1 include:_spf.google.com include:amazonses.com ~all',
    dkimSelector: 'google',
    extra: [
      { type: 'TXT', name: '@', value: 'google-site-verification=<value from the Workspace admin console>', ttl: 3600 },
    ],
    docs: 'https://support.google.com/a/answer/140034',
    summary: 'The default for a company that already lives in Google. Per-seat pricing, and you add the records yourself.',
  },
  'microsoft-365': {
    label: 'Microsoft 365',
    mx: [{ type: 'MX', name: '@', value: '<your-tenant>.mail.protection.outlook.com', priority: 0, ttl: 3600 }],
    spf: 'v=spf1 include:spf.protection.outlook.com -all',
    dkimSelector: 'selector1',
    extra: [
      { type: 'CNAME', name: 'autodiscover', value: 'autodiscover.outlook.com', ttl: 3600 },
    ],
    docs: 'https://learn.microsoft.com/microsoft-365/admin/get-help-with-domains/create-dns-records-at-any-dns-hosting-provider',
    summary: 'Right choice when your buyers expect Outlook invites and Teams. Heavier administration.',
  },
  'cloudflare-routing': {
    label: 'Cloudflare Email Routing (free forwarding)',
    mx: [
      { type: 'MX', name: '@', value: 'route1.mx.cloudflare.net', priority: 22, ttl: 3600 },
      { type: 'MX', name: '@', value: 'route2.mx.cloudflare.net', priority: 33, ttl: 3600 },
      { type: 'MX', name: '@', value: 'route3.mx.cloudflare.net', priority: 48, ttl: 3600 },
    ],
    spf: 'v=spf1 include:_spf.mx.cloudflare.net ~all',
    dkimSelector: null,
    extra: [],
    docs: 'https://developers.cloudflare.com/email-routing/',
    summary: 'Forwards hello@ and support@ to an address you already read. No sending, no multi-user mailboxes.',
  },
};

/**
 * Build the DNS record set for a new domain: website, email and the
 * authentication records that keep mail out of spam folders.
 */
export function dnsPlan(domain, options = {}) {
  const providerKey = options.mailProvider || 'oasis';
  const provider = DNS_PROVIDERS[providerKey] || DNS_PROVIDERS.oasis;
  const host = options.host || 'example.pages.dev';

  const records = [
    { type: 'A', name: '@', value: options.rootIp || '192.0.2.1', ttl: 300, purpose: 'Root domain — replace with your host’s apex IP or use the CNAME flattening your host provides.' },
    { type: 'CNAME', name: 'www', value: host, ttl: 300, purpose: 'www subdomain, pointed at your host.' },
    { type: 'CNAME', name: '@', value: host, ttl: 300, purpose: 'If your DNS provider supports ALIAS/flattening, point the apex here instead of the A record.' },
    ...provider.mx.map((record) => ({ ...record, purpose: `Inbound mail via ${provider.label}.` })),
    { type: 'TXT', name: '@', value: provider.spf, ttl: 3600, purpose: 'SPF: only these servers may send as your domain.' },
    ...(provider.dkimSelector
      ? [{
          type: 'TXT',
          name: `${provider.dkimSelector}._domainkey`,
          value: 'v=DKIM1; k=rsa; p=<public key your mail provider issues for this domain>',
          ttl: 3600,
          purpose: 'DKIM: cryptographically signs your outgoing mail so receivers can verify it was not altered.',
        }]
      : []),
    { type: 'TXT', name: '_dmarc', value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; pct=100; adkim=s; aspf=s`, ttl: 3600, purpose: 'DMARC: tells receivers what to do with mail that fails authentication. Start at p=none, then move to quarantine.' },
    { type: 'TXT', name: '@', value: `stripe-verification=<value>, or your payment provider's token`, ttl: 3600, purpose: 'Domain verification for payment and analytics providers.' },
    { type: 'CNAME', name: 'app', value: host, ttl: 300, purpose: 'Convention: the product lives at app.yourdomain.com and the marketing site at the apex.' },
    { type: 'CNAME', name: 'status', value: '<your status page target>', ttl: 300, purpose: 'Keep a status page from day one; it is the cheapest trust signal you can buy.' },
  ];

  if (provider.extra) records.push(...provider.extra.map((record) => ({ ...record, purpose: `Required by ${provider.label}.` })));

  return {
    provider: providerKey,
    providerLabel: provider.label,
    providerDocs: provider.docs,
    managed: Boolean(provider.managed),
    records,
    order: [
      'Point the domain at your host first and confirm HTTPS works before touching mail records.',
      'Add SPF and DKIM, send a test to a Gmail and an Outlook address, then publish DMARC at p=none.',
      'Watch your DMARC reports for two weeks, then tighten to p=quarantine.',
      'Never send marketing email from your root domain — use a subdomain so a bad campaign cannot poison transactional deliverability.',
    ],
    propagation: 'Most records resolve within minutes; allow up to 48 hours for the TTL to expire everywhere. Use dig +short to check.',
  };
}

/**
 * The mail subset of a DNS plan, in publish order.
 *
 * This is what Oasis needs to put in the zone: the MX, the SPF and DKIM TXT
 * records, DMARC, and the client-autoconfiguration aliases. The website records
 * in the same plan (A, www, app, status) are deliberately excluded — mail
 * provisioning should never touch where the site is served from.
 */
export function mailRecords(dns) {
  const isMail = (record) =>
    record.type === 'MX' ||
    record.name === '_dmarc' ||
    (record.type === 'TXT' && record.name === '@' && /^v=spf1/i.test(String(record.value))) ||
    (record.type === 'TXT' && String(record.name).endsWith('_domainkey')) ||
    (record.type === 'CNAME' && ['mail', 'autoconfig', 'autodiscover'].includes(record.name));
  return (dns?.records || []).filter(isMail).map(({ type, name, value, ttl, priority }) => ({
    type,
    name,
    value,
    ttl,
    ...(priority === undefined ? {} : { priority }),
  }));
}

export const MAIL_PROVIDERS = Object.entries(DNS_PROVIDERS).map(([key, value]) => ({
  key,
  label: value.label,
  docs: value.docs,
  managed: Boolean(value.managed),
  operator: value.operator || null,
  server: value.server || null,
  homepage: value.homepage || null,
  summary: value.summary || '',
}));

/** The provider Blueprint provisions for you when nothing else is chosen. */
export const DEFAULT_MAIL_PROVIDER = 'oasis';

export function mailProviderInfo(key) {
  return MAIL_PROVIDERS.find((provider) => provider.key === key) || MAIL_PROVIDERS[0];
}

/** Mailbox layout: which address handles what, and who owns it. */
export function mailboxPlan(identity, domain, options = {}) {
  const person = options.founder || 'founder';
  const local = slugify(person.split(' ')[0] || 'founder');
  const boxes = [
    { address: `hello@${domain}`, purpose: 'Public, printed, on the site. Goes to more than one person so it never sits unread.', owner: 'Shared' },
    { address: `${local}@${domain}`, purpose: 'Your personal address. Use it in investor updates and cold outreach.', owner: person },
    { address: `support@${domain}`, purpose: 'Customer questions. Route to a shared inbox with a first-response target.', owner: 'Shared' },
    { address: `billing@${domain}`, purpose: 'Invoices, receipts and payment issues — keep this separate from support.', owner: 'Shared' },
    { address: `press@${domain}`, purpose: 'Media and podcast requests. Check it weekly, not daily.', owner: 'Founder' },
    { address: `security@${domain}`, purpose: 'Vulnerability reports. Required if you publish a security page or handle payments.', owner: 'Founder' },
    { address: `legal@${domain}`, purpose: 'Contracts, notices and DMCA. Forward it to your lawyer so nothing is lost.', owner: 'Counsel' },
    { address: `no-reply@mail.${domain}`, purpose: 'Transactional sending only. Never monitored — always include a real reply-to.', owner: 'System' },
    { address: `dmarc@${domain}`, purpose: 'Aggregate authentication reports from DMARC.', owner: 'System' },
  ];
  const rules = [
    'Never use info@ — it signals a company that has not thought about who answers.',
    'Every automated email replies-to a monitored address.',
    'Set an out-of-office that names a real person and a date, not a promise.',
    'Publish a page listing your addresses; it reduces misdirected email.',
    'Enable two-factor on every mailbox on day one and disable password-only app access.',
  ];

  const provider = mailProviderInfo(options.mailProvider);
  if (provider.managed) {
    rules.push(
      `These mailboxes are created for you by ${provider.label} on its ${provider.server} server — the tenant is yours, so you administer users without running mail infrastructure.`,
    );
  }

  return {
    boxes,
    rules,
    provider: provider.key,
    providerLabel: provider.label,
    operator: provider.operator,
    server: provider.server,
    managed: provider.managed,
    webmail: provider.homepage,
    provisioned: provider.managed,
  };
}

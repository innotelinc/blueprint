import test from 'node:test';
import assert from 'node:assert/strict';

import { hashString, makeRng, escapeHtml, contrastRatio, readableOn, slugify, titleCase } from '../public/lib/rng.js';
import { analyzeName, buildIdentity } from '../public/lib/naming.js';
import { buildBrand, MARKS } from '../public/lib/brand.js';
import { domainCandidates, dnsPlan, mailboxPlan } from '../public/lib/domains.js';
import { buildSocialKit, handleMatrix } from '../public/lib/social.js';
import { generateSite } from '../public/lib/site.js';
import { buildCompany } from '../public/lib/company.js';
import { buildMarketing } from '../public/lib/marketing.js';
import { createZip, readZipDirectory, readZipEntry, crc32 } from '../public/lib/zip.js';
import { generateCompany, normalizeIntake, applyPositioningStatement } from '../public/lib/index.js';
import { PLAN_HORIZON_MONTHS, MODEL_ASSUMPTIONS, blendedArpu, runModel } from '../public/lib/businessplan.js';
import { INDUSTRIES, PLATFORMS, AUDIENCES, MARKET_RESEARCH } from '../public/lib/presets.js';

// ---------------------------------------------------------------------------
// Logo marks
// ---------------------------------------------------------------------------

const MARK_COLORS = { primary: '#2563eb', accent: '#f97316', paper: '#ffffff', onPrimary: '#ffffff', fontStack: 'X' };

/** The model rounds to cents, so the tests compare against the same rounding. */
const round2 = (value) => Math.round(value * 100) / 100;

// A mark that overflows the 96x96 field is clipped by every consumer of it and
// cannot be fixed downstream, so the geometry is checked here, for all of them.
test('every logo mark stays inside its own 96x96 field', () => {
  for (const [key, entry] of Object.entries(MARKS)) {
    const svg = entry.build(makeRng(hashString(key)), MARK_COLORS);
    assert.ok(svg.length > 20, `${key} drew nothing`);
    assert.ok(!/NaN|undefined/.test(svg), `${key} produced an invalid number`);
    assert.ok(/<(path|circle|rect|ellipse|line)\s/.test(svg), `${key} produced no shapes`);

    // Pull out every coordinate and radius, whichever element it lives on.
    const numbers = [
      ...svg.matchAll(/\sd="([^"]+)"/g),
    ].flatMap((match) => [...match[1].matchAll(/-?\d+(?:\.\d+)?/g)].map((n) => Number(n[0])));
    numbers.push(
      ...[...svg.matchAll(/(?:cx|cy|x|y|x1|y1|x2|y2|width|height|rx|ry)="(-?[\d.]+)"/g)].map((m) => Number(m[1])),
    );
    for (const value of numbers) {
      assert.ok(value >= -1 && value <= 97, `${key} draws at ${value}, outside its 96x96 field`);
    }

    // Nothing hairline: at 16px a 4-unit stroke is about 0.7px, which is the
    // thinnest that still holds together.
    for (const match of svg.matchAll(/stroke-width="([\d.]+)"/g)) {
      assert.ok(Number(match[1]) >= 4, `${key} strokes at ${match[1]}, which disappears at favicon size`);
    }
  }
});

// The library has to be usable by every industry the intake offers. A mark whose
// `industries` names an industry that does not exist is dead weight, and an
// industry with too few marks is a company being shown the same logo as everyone
// else in its category — both are silent defects, so both are checked.
test('the mark library covers every industry, and names only real ones', () => {
  const real = new Set(Object.keys(INDUSTRIES));
  for (const [key, entry] of Object.entries(MARKS)) {
    for (const industry of entry.industries) {
      assert.ok(real.has(industry), `mark ${key} claims unknown industry ${industry}`);
    }
    assert.ok(entry.industries.length >= 2, `mark ${key} fits fewer than two industries`);
  }
  for (const industry of real) {
    const offering = Object.entries(MARKS).filter(([, entry]) => entry.industries.includes(industry));
    assert.ok(offering.length >= 8, `only ${offering.length} marks fit ${industry}, so companies in it look alike`);
  }
});

// A mark is only offered by industry in combination with an archetype, so the
// two axes have to be independently meaningful: an industry filter that ignores
// the archetype defeats the point of declaring `fits` at all.
test('every mark is reachable, and industry outranks archetype', () => {
  const names = ['Northwind', 'Lumen', 'Cobalt', 'Harbor', 'Verdant', 'Kestrel', 'Obsidian', 'Marrow', 'Solstice', 'Quarry'];
  const tones = ['bold', 'calm', 'warm', 'sharp', 'playful', 'premium'];
  const seen = new Set();
  const perIndustry = new Map();

  for (const industry of Object.keys(INDUSTRIES)) {
    perIndustry.set(industry, new Set());
    for (const name of names) {
      for (const tone of tones) {
        const intake = normalizeIntake({ name, industry, tone });
        const brand = buildBrand(intake, buildIdentity(intake));
        assert.equal(brand.concepts.length, 3, `${industry}/${tone} did not offer three directions`);
        for (const concept of brand.concepts) {
          seen.add(concept.id);
          if (concept.id.startsWith('mark-')) perIndustry.get(industry).add(concept.id);
        }
      }
    }
  }

  const unreachable = Object.keys(MARKS).filter((key) => !seen.has(`mark-${key}`));
  assert.deepEqual(unreachable, [], 'marks that no intake can ever be offered');

  for (const [industry, set] of perIndustry) {
    assert.ok(set.size >= 4, `${industry} was offered only ${set.size} symbol directions across 60 samples`);
  }

  // The leading direction must suit the industry, not merely the archetype.
  const intake = normalizeIntake({ name: 'Northwind', industry: 'fintech', tone: 'bold' });
  const leading = buildBrand(intake, buildIdentity(intake)).concepts[0].id.replace('mark-', '');
  assert.ok(MARKS[leading].industries.includes('fintech'), `the leading direction for fintech (${leading}) does not fit fintech`);
});

// Two picks from the same silhouette family read as one option at favicon size,
// which is exactly the choice this is supposed to save the founder from making.
test('the two symbol directions never come from the same silhouette family', () => {
  const families = {
    radial: ['slice', 'orbit', 'node', 'bloom', 'aperture', 'spark', 'lattice'],
    linear: ['stack', 'flow', 'tide', 'strata', 'cascade', 'spine', 'parcel'],
    mass: ['peak', 'keystone', 'prism', 'shield', 'kite'],
    figure: ['beacon', 'dial', 'bough', 'horizon', 'compass'],
  };
  const familyOf = (key) => Object.entries(families).find(([, keys]) => keys.includes(key))?.[0];
  assert.ok(Object.values(families).flat().length === Object.keys(MARKS).length, 'the family list must cover every mark');

  for (const industry of Object.keys(INDUSTRIES)) {
    for (const tone of ['bold', 'calm', 'sharp']) {
      const intake = normalizeIntake({ name: 'Northwind Atlas', industry, tone });
      const brand = buildBrand(intake, buildIdentity(intake));
      const [first, second] = brand.concepts.map((concept) => concept.id.replace('mark-', ''));
      assert.notEqual(familyOf(first), familyOf(second), `${industry}/${tone} offered two ${familyOf(first)} marks`);
    }
  }
});

// The two abstract directions are chosen by archetype fit, so the same intake
// has to keep producing the same pair — a different pair on every reload would
// make the choice meaningless.
test('the two symbol directions are chosen by archetype and stay reproducible', () => {
  const intake = normalizeIntake({ name: 'Northwind', industry: 'b2b-saas', tone: 'calm' });
  const identity = buildIdentity(intake);
  const first = buildBrand({ ...intake, name: 'Northwind' }, identity);
  const again = buildBrand({ ...intake, name: 'Northwind' }, identity);
  const ids = first.concepts.map((concept) => concept.id);

  assert.equal(ids.length, 3, 'a founder chooses between three directions');
  assert.deepEqual(ids, again.concepts.map((concept) => concept.id), 'the same intake must offer the same pair');
  assert.equal(ids[2], 'monogram', 'the monogram is always the third direction');

  const symbols = ids.slice(0, 2).map((id) => id.replace('mark-', ''));
  assert.equal(new Set(symbols).size, 2, 'the two symbol directions must be different marks');
  for (const key of symbols) assert.ok(MARKS[key], `${key} is not in the mark library`);
  const archetype = identity.archetype.key;
  assert.ok(
    symbols.some((key) => MARKS[key].fits.includes(archetype)),
    `neither direction suits the ${archetype} archetype, so the fit rule is not being applied`,
  );
});

// Target audience is a dropdown, so every entry must resolve to copy the engine
// can actually use, and an unknown value must not destroy the intake.
test('the audience dropdown resolves to a label, and unknown values survive', () => {
  const chosen = normalizeIntake({ name: 'Northwind', audience: 'ops-finance' });
  const entry = AUDIENCES.find((item) => item.key === 'ops-finance');
  assert.equal(chosen.audience, entry.label, 'a key should resolve to its label');
  assert.equal(chosen.audienceKey, 'ops-finance');

  const inferred = normalizeIntake({ name: 'Northwind', audience: 'auto' });
  assert.equal(inferred.audience, '', 'the auto option means "infer it"');

  const legacy = normalizeIntake({ name: 'Northwind', audience: 'the person who signs the cheque' });
  assert.equal(legacy.audience, 'the person who signs the cheque', 'free text from an older project must not be dropped');
});

// Oasis is the default, and it is the only provider that promises provisioning.
test('Oasis is the default mail provider and the managed one', () => {
  const defaulted = normalizeIntake({ name: 'Northwind' });
  assert.equal(defaulted.mailProvider, 'oasis');
  const plan = dnsPlan('northwind.com', { mailProvider: defaulted.mailProvider });
  assert.equal(plan.managed, true);
  const mx = plan.records.find((record) => record.type === 'MX');
  assert.equal(mx.value, 'mail.innotel.us');
  // The DKIM selector must match the one the estate actually publishes.
  assert.ok(plan.records.some((record) => record.name === 'mail._domainkey'));
  assert.ok(plan.records.some((record) => /^v=spf1/.test(record.value)));
  assert.ok(plan.records.some((record) => record.name === '_dmarc'));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** Minimal well-formedness check: balanced tags, no raw < inside attributes. */
function assertWellFormed(markup, label) {
  const tagPattern = /<\/?([a-zA-Z][\w:.-]*)([^>]*?)(\/?)>/g;
  const stack = [];
  let match;
  while ((match = tagPattern.exec(markup)) !== null) {
    const [full, name, attrs, selfClose] = match;
    assert.ok(!attrs.includes('<'), `${label}: raw "<" inside the attributes of <${name}>`);
    if (full.startsWith('</')) {
      const open = stack.pop();
      assert.equal(open, name, `${label}: </${name}> closes <${open}>`);
    } else if (!selfClose && !VOID_TAGS.has(name.toLowerCase())) {
      stack.push(name);
    }
  }
  assert.deepEqual(stack, [], `${label}: unclosed tags ${stack.join(', ')}`);
}

function assertNoUnfilledSlots(text, label) {
  // `{{first_name}}` style merge fields are intentional in email templates.
  const scrubbed = String(text).replace(/\{\{\s*\w+\s*\}\}/g, '');
  const unresolved = scrubbed.match(/\{[a-z][a-z0-9_]*\}/gi) || [];
  assert.deepEqual(unresolved, [], `${label}: unfilled template slots ${unresolved.join(', ')}`);
}

const SAMPLES = [
  { name: 'Northwind', industry: 'b2b-saas', tone: 'calm', founder: 'Ada Lovelace', state: 'DE' },
  { name: 'Brightloom', industry: 'consumer-app', tone: 'playful', founder: 'Sam Ortiz', state: 'CA', cofounders: 1 },
  { name: 'Ledgerly', industry: 'fintech', tone: 'premium', founder: 'Rina Patel', state: 'NY' },
  { name: 'Wildgrove Outfitters', industry: 'ecommerce', tone: 'warm', founder: 'Jo Kim', state: 'CO' },
  { name: 'Quietwave', industry: 'health', tone: 'calm', founder: 'Dr Amara Cole', state: 'WA' },
];

// ---------------------------------------------------------------------------
// rng
// ---------------------------------------------------------------------------

test('hashString is stable and well distributed', () => {
  assert.equal(hashString('northwind'), hashString('northwind'));
  assert.notEqual(hashString('northwind'), hashString('northwind '));
  const seen = new Set();
  for (let i = 0; i < 500; i += 1) seen.add(hashString(`name-${i}`));
  assert.equal(seen.size, 500, 'hashes of distinct inputs collide');
});

test('makeRng is deterministic for a seed and varies between seeds', () => {
  const a = makeRng('seed');
  const b = makeRng('seed');
  const c = makeRng('other');
  const seqA = Array.from({ length: 8 }, () => a.next());
  const seqB = Array.from({ length: 8 }, () => b.next());
  const seqC = Array.from({ length: 8 }, () => c.next());
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  assert.ok(seqA.every((value) => value >= 0 && value < 1));
});

test('rng helpers stay in range', () => {
  const rng = makeRng('range');
  for (let i = 0; i < 200; i += 1) {
    const pick = rng.pick(['a', 'b', 'c']);
    assert.ok(['a', 'b', 'c'].includes(pick));
    assert.ok(rng.int(5) < 5);
    const sample = rng.sample([1, 2, 3, 4, 5], 3);
    assert.equal(sample.length, 3);
    assert.equal(new Set(sample).size, 3, 'sample returned duplicates');
  }
});

test('escapeHtml neutralizes every dangerous character', () => {
  assert.equal(escapeHtml(`<img src=x onerror="alert('x')">&`), '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;');
});

test('color helpers produce valid contrasts', () => {
  assert.equal(contrastRatio('#ffffff', '#000000').toFixed(0), '21');
  assert.equal(readableOn('#ffffff'), '#0b0e14');
  assert.equal(readableOn('#000000'), '#ffffff');
});

test('slugify and titleCase handle real input', () => {
  assert.equal(slugify('Northwind & Co. Ltd'), 'northwind-co-ltd');
  assert.equal(titleCase('northwind labs'), 'Northwind Labs');
  assert.equal(titleCase('iOS bridge'), 'iOS Bridge');
});

// ---------------------------------------------------------------------------
// naming
// ---------------------------------------------------------------------------

test('analyzeName scores a name out of 100 with actionable notes', () => {
  const analysis = analyzeName('Northwind');
  assert.equal(analysis.displayName, 'Northwind');
  assert.equal(analysis.initials, 'N');
  assert.ok(analysis.scores.overall > 0 && analysis.scores.overall <= 100);
  assert.equal(analysis.scores.parts.length, 5);
  for (const part of analysis.scores.parts) {
    assert.ok(part.score >= 0 && part.score <= 100, `${part.key} out of range`);
    assert.ok(part.note.length > 10, `${part.key} has no note`);
  }
  assert.ok(analysis.sayIt.includes('-'), 'no pronunciation hint');
});

test('analyzeName flags spelling risk honestly', () => {
  const risky = analyzeName('Cephann');
  assert.ok(risky.flags.length >= 1, 'expected ambiguity flags for a name with c/ph/double-n');
  assert.ok(risky.scores.parts.find((part) => part.key === 'spell').score < 100);
});

test('buildIdentity fills every template slot', () => {
  for (const sample of SAMPLES) {
    const identity = buildIdentity(normalizeIntake(sample));
    assert.ok(identity.taglines.length >= 6, `${sample.name} produced too few taglines`);
    for (const tagline of identity.taglines) assertNoUnfilledSlots(tagline.text, `${sample.name} tagline`);
    assertNoUnfilledSlots(identity.mission, `${sample.name} mission`);
    assertNoUnfilledSlots(identity.vision, `${sample.name} vision`);
    assertNoUnfilledSlots(identity.positioning, `${sample.name} positioning`);
    assertNoUnfilledSlots(identity.elevatorPitch, `${sample.name} pitch`);
    assert.equal(identity.values.length, 4);
    assert.ok(identity.screening.length >= 5, 'screening checks missing');

    // Guard the copy regressions that would be visible on the homepage: a noun
    // phrase dropped in without a verb, or two stacked relative clauses.
    assert.ok(
      identity.oneLiner.split(' — ').length === 2 || / that (delivers|gives|helps|turns|makes) /.test(identity.oneLiner),
      `${sample.name}: one-liner does not connect the company to a benefit`,
    );
    assert.match(identity.elevatorPitch, / (gives you|delivers|helps) /, `${sample.name}: elevator pitch has no connecting verb`);
    // Short-form copy must not stack two relative clauses; long-form prose may.
    for (const text of [identity.oneLiner, ...identity.taglines.map((tagline) => tagline.text)]) {
      assert.ok((text.match(/\bthat\b/g) || []).length <= 1, `${sample.name}: stacked relative clauses in "${text}"`);
    }
    // A slot name leaking through as literal text ("Category, crafted") is the
    // failure mode of a case-sensitive template lookup, so guard it directly.
    const copy = [
      identity.oneLiner,
      identity.elevatorPitch,
      identity.mission,
      identity.vision,
      identity.positioning,
      identity.boilerplates.long,
      ...identity.taglines.map((tagline) => tagline.text),
      ...identity.values.map((value) => value.statement),
    ].join(' ');
    for (const leaked of ['Category', 'Audience', 'Thing', 'Outcome', 'Problem', 'Alt', 'Buyer', 'CategoryWord']) {
      assert.ok(!new RegExp(`(^|[^a-z])${leaked}([^a-z]|$)`).test(copy), `${sample.name}: slot name "${leaked}" leaked into the copy`);
    }
  }
});

// ---------------------------------------------------------------------------
// brand
// ---------------------------------------------------------------------------

test('palette produces valid hex colors and a real contrast audit', () => {
  for (const sample of SAMPLES) {
    const intake = normalizeIntake(sample);
    const identity = buildIdentity(intake);
    const brand = buildBrand(intake, identity);
    for (const [key, value] of Object.entries(brand.palette.swatches)) {
      assert.match(value.hex, /^#[0-9a-f]{6}$/, `${sample.name} swatch ${key} is not a hex color`);
    }
    assert.match(brand.palette.ink, /^#[0-9a-f]{6}$/);
    assert.ok(brand.palette.checks.length >= 5);
    for (const check of brand.palette.checks) {
      assert.ok(check.ratio > 0 && check.ratio <= 21);
      assert.ok(['AAA', 'AA', 'AA-large', 'fail'].includes(check.grade));
    }
    // Text on the primary color must always be legible.
    const onPrimary = brand.palette.checks.find((check) => check.usage === 'Text on the primary color');
    assert.ok(onPrimary.ratio >= 4.5, `${sample.name}: primary color fails AA for text (${onPrimary.ratio})`);
  }
});

test('every generated SVG is well-formed and self-describing', () => {
  for (const sample of SAMPLES) {
    const intake = normalizeIntake(sample);
    const identity = buildIdentity(intake);
    const brand = buildBrand(intake, identity);
    const svgs = {
      ...brand.logo,
      'social-card': brand.og,
      'card-front': brand.card.front,
      'card-back': brand.card.back,
      icon: brand.chosen.variants.icon,
      horizontal: brand.chosen.variants.horizontal,
      stacked: brand.chosen.variants.stacked,
      appIcon: brand.chosen.variants.appIcon,
      favicon: brand.chosen.variants.favicon,
      mono: brand.chosen.variants.mono,
    };
    for (const [key, svg] of Object.entries(svgs)) {
      const label = `${sample.name}/${key}`;
      assert.ok(svg.startsWith('<svg'), `${label}: does not start with <svg`);
      assert.ok(svg.trimEnd().endsWith('</svg>'), `${label}: does not end with </svg>`);
      assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'), `${label}: missing xmlns`);
      assertWellFormed(svg, label);
      assert.ok(!svg.includes('undefined'), `${label}: contains "undefined"`);
      assert.ok(!svg.includes('NaN'), `${label}: contains NaN`);
    }
  }
});

test('logo concepts are distinct directions', () => {
  const intake = normalizeIntake({ name: 'Northwind', industry: 'b2b-saas' });
  const identity = buildIdentity(intake);
  const brand = buildBrand(intake, identity);
  assert.equal(brand.concepts.length, 3);
  const ids = new Set(brand.concepts.map((concept) => concept.id));
  assert.equal(ids.size, 3);
  for (const concept of brand.concepts) {
    assert.ok(concept.idea.length > 40, `${concept.id} has no rationale`);
    assert.ok(concept.variants.horizontal.includes('Northwind'));
  }
});

test('typography ships real stacks and a complete scale', () => {
  const intake = normalizeIntake({ name: 'Northwind' });
  const identity = buildIdentity(intake);
  const brand = buildBrand(intake, identity);
  assert.ok(brand.typography.stacks.heading.includes('system-ui'));
  assert.ok(brand.typography.googleHref.startsWith('https://fonts.googleapis.com/css2'));
  assert.equal(brand.typography.scale.length, 9);
  assert.ok(brand.typography.rules.length >= 5);
});

// ---------------------------------------------------------------------------
// domains, mail, social
// ---------------------------------------------------------------------------

test('domain candidates are ranked, unique and explain themselves', () => {
  const intake = normalizeIntake({ name: 'Northwind', industry: 'b2b-saas' });
  const identity = buildIdentity(intake);
  const domains = domainCandidates(identity, identity.profile);
  assert.equal(domains.primary, 'northwind.com');
  assert.ok(domains.ranked.length >= 8);
  const seen = new Set();
  for (const entry of domains.ranked) {
    assert.ok(!seen.has(entry.domain), `duplicate candidate ${entry.domain}`);
    seen.add(entry.domain);
    assert.match(entry.domain, /^[a-z0-9.-]+\.[a-z]{2,}$/);
    assert.ok(entry.why.length > 10, `${entry.domain} has no rationale`);
    assert.ok(entry.score > 0 && entry.score <= 100);
  }
  const scores = domains.ranked.map((entry) => entry.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a), 'candidates are not sorted by score');
  assert.ok(domains.ranked[0].domain.endsWith('.com'), 'best candidate should be a .com');
});

test('DNS plan covers web, mail and authentication records', () => {
  const dns = dnsPlan('northwind.com', { mailProvider: 'google-workspace' });
  const types = dns.records.map((record) => record.type);
  assert.ok(types.includes('A') && types.includes('CNAME') && types.includes('MX') && types.includes('TXT'));
  assert.ok(dns.records.some((record) => record.value.startsWith('v=spf1')), 'SPF record missing');
  assert.ok(dns.records.some((record) => record.name === '_dmarc' && record.value.startsWith('v=DMARC1')), 'DMARC record missing');
  assert.ok(dns.records.every((record) => record.purpose && record.purpose.length > 5));
});

test('mailbox plan avoids info@ and assigns owners', () => {
  const intake = normalizeIntake({ name: 'Northwind', founder: 'Ada Lovelace' });
  const identity = buildIdentity(intake);
  const mailboxes = mailboxPlan(identity, 'northwind.com', { founder: 'Ada Lovelace' });
  const addresses = mailboxes.boxes.map((box) => box.address);
  assert.ok(addresses.includes('hello@northwind.com'));
  assert.ok(addresses.includes('ada@northwind.com'));
  assert.ok(!addresses.some((address) => address.startsWith('info@')));
  assert.ok(mailboxes.boxes.every((box) => box.purpose && box.owner));
});

test('social handles respect each platform’s own rules', () => {
  for (const sample of SAMPLES) {
    const intake = normalizeIntake(sample);
    const identity = buildIdentity(intake);
    const matrix = handleMatrix(identity);
    assert.equal(matrix.length, PLATFORMS.length);
    for (const entry of matrix) {
      const platform = PLATFORMS.find((item) => item.key === entry.platform);
      assert.ok(entry.handle.length <= platform.handleMax, `${sample.name}/${entry.platform}: handle too long`);
      assert.match(entry.handle, new RegExp(platform.handlePattern), `${sample.name}/${entry.platform}: "${entry.handle}" violates ${platform.handlePattern}`);
      assert.ok(entry.profileUrl.startsWith('https://'));
    }
  }
});

test('bios are truncated to platform limits with assets sized correctly', () => {
  const intake = normalizeIntake({ name: 'Wildgrove Outfitters', industry: 'ecommerce' });
  const identity = buildIdentity(intake);
  const brand = buildBrand(intake, identity);
  const social = buildSocialKit(intake, identity, brand);
  for (const profile of social.profiles) {
    assert.ok(profile.bioLength <= profile.bioMax, `${profile.platform}: bio exceeds ${profile.bioMax}`);
    assert.ok(profile.assets.avatar.includes('<svg'));
    if (profile.assets.banner) assert.ok(profile.assets.banner.includes('<svg'));
  }
  assert.equal(social.calendar.days.length, 30);
  const days = social.calendar.days.map((day) => day.day);
  assert.deepEqual(days, Array.from({ length: 30 }, (_, index) => index + 1));
  assert.ok(social.bioLink.includes('<html'));
});

// ---------------------------------------------------------------------------
// marketing
// ---------------------------------------------------------------------------

test('pricing has three coherent tiers and no unfilled slots', () => {
  for (const sample of SAMPLES) {
    const intake = normalizeIntake(sample);
    const identity = buildIdentity(intake);
    const brand = buildBrand(intake, identity);
    const marketing = buildMarketing(intake, identity, brand);
    assert.equal(marketing.pricing.tiers.length, 3);
    const highlighted = marketing.pricing.tiers.filter((tier) => tier.highlighted);
    assert.equal(highlighted.length, 1, 'exactly one tier should be the recommended one');
    for (const tier of marketing.pricing.tiers) {
      assert.ok(tier.price.startsWith('$') || tier.price === 'Free');
      assert.ok(tier.features.length >= 4);
      assert.ok(tier.limits.length > 20);
      assertNoUnfilledSlots(tier.tagline, `${sample.name} tier ${tier.name}`);
    }
    assert.equal(marketing.gtm.calendar.length, 12);
    assert.equal(marketing.launch.runbook.length >= 12, true);
  }
});

// ---------------------------------------------------------------------------
// Business plan and its financial model
// ---------------------------------------------------------------------------

// The projection is the part of a plan a reader will try to falsify, so the
// arithmetic is checked directly: each row must be reproducible from the row
// above it, and the summary must agree with the last row it summarises.
test('every month of the model follows from the month before it', () => {
  const plan = generateCompany({ name: 'Northwind', industry: 'b2b-saas' }).businessPlan;
  assert.equal(plan.base.months.length, PLAN_HORIZON_MONTHS);

  const a = plan.base.assumptions;
  assert.equal(a.arpuMonthly, plan.arpu, 'the run does not carry the price it was run with');
  let previousCash = plan.base.summary.startingCash;
  let previousAccounts = null;

  for (const row of plan.base.months) {
    assert.equal(row.revenue, round2(row.payingCustomers * a.arpuMonthly), `${row.label}: revenue is not paying customers × price`);
    assert.equal(row.infra, round2(row.activeCustomers * a.infraPerActive), `${row.label}: infrastructure is not per account`);
    assert.equal(row.support, round2(row.activeCustomers * a.supportPerActive), `${row.label}: support is not per account`);
    assert.equal(row.grossProfit, round2(row.revenue - row.infra - row.support), `${row.label}: gross profit does not subtract cost of goods`);
    assert.equal(row.opex, row.payroll + row.marketing + row.tooling + row.admin, `${row.label}: opex is not the sum of its parts`);
    assert.equal(row.netCash, round2(row.grossProfit - row.opex), `${row.label}: net cash is not gross profit minus opex`);
    assert.equal(row.cash, round2(previousCash + row.netCash), `${row.label}: cash does not carry forward`);
    assert.equal(
      row.cumulative,
      round2((row.month > 1 ? plan.base.months[row.month - 2].cumulative : 0) + row.netCash),
      `${row.label}: cumulative cash does not follow from the month before it`,
    );
    assert.equal(row.payingCustomers, Math.round(row.activeCustomers * a.payingShare), `${row.label}: paying customers do not follow the paying share`);

    // Accounts move by additions minus churn. Month one starts from the founder's
    // own first accounts rather than from last month, so the base is seeded the
    // same way the model seeds it.
    const startBase = previousAccounts ?? Math.max(0, Math.round(a.organicPerMonth * 1.5));
    assert.equal(row.churnedAccounts, Math.round(startBase * a.churn), `${row.label}: churn is not a rate on the active base`);
    const expected = startBase + row.newAccounts - row.churnedAccounts;
    assert.equal(row.activeCustomers, Math.max(0, expected), `${row.label}: the account base does not follow from the previous month`);

    for (const [field, value] of Object.entries(row)) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), `${row.label}.${field} is not a finite number`);
    }
    previousCash = row.cash;
    previousAccounts = row.activeCustomers;
  }

  const last = plan.base.months[plan.base.months.length - 1];
  assert.equal(plan.base.summary.mrrMonthEnd, last.revenue, 'MRR does not match the last month');
  assert.equal(plan.base.summary.arrMonthEnd, round2(last.revenue * 12), 'ARR is not twelve times MRR');
  assert.equal(plan.base.summary.cashMonthEnd, last.cash, 'the cash summary does not match the last month');
  assert.equal(plan.base.summary.accountsMonthEnd, last.activeCustomers);
});

// A model that compounds without bound produces billion-dollar revenue in year
// three, which is a modelling artefact rather than a plan. The market ceiling and
// the taper are what stop it, so they are asserted rather than assumed.
test('growth tapers at the market ceiling instead of compounding without bound', () => {
  for (const industry of Object.keys(INDUSTRIES)) {
    const plan = generateCompany({ name: 'Northwind', industry }).businessPlan;
    const s = plan.base.summary;
    assert.ok(s.marketAccounts > 0, `${industry} has no market ceiling`);
    assert.ok(
      s.accountsMonthEnd <= s.marketAccounts,
      `${industry} passed its market ceiling (${s.accountsMonthEnd} > ${s.marketAccounts})`,
    );
    assert.ok(s.marketPct >= 0 && s.marketPct <= 1, `${industry} reports an impossible market penetration`);
    // Sanity on the shape of the output: a gross margin outside this band means
    // the cost assumptions and the price are inconsistent with each other.
    assert.ok(s.grossMargin >= 0 && s.grossMargin <= 1, `${industry} has a negative or impossible gross margin`);
    assert.ok(s.ltvToCac > 0, `${industry} has no LTV:CAC ratio`);
    assert.ok(s.paybackMonths > 0, `${industry} has no CAC payback`);
  }
});

// The scenarios are the same model with shifted inputs, so their ordering is a
// property of the model rather than a coincidence of the numbers.
test('scenarios are ordered, funded, and differ only in their inputs', () => {
  const plan = generateCompany({ name: 'Northwind', industry: 'b2b-saas' }).businessPlan;
  const byKey = Object.fromEntries(plan.scenarios.map((entry) => [entry.key, entry]));
  assert.deepEqual(Object.keys(byKey).sort(), ['ambitious', 'base', 'conservative']);
  assert.ok(
    byKey.conservative.arrMonthEnd < byKey.base.arrMonthEnd && byKey.base.arrMonthEnd < byKey.ambitious.arrMonthEnd,
    'the scenarios are not ordered conservative < base < ambitious',
  );
  // Every scenario runs on the same amount raised: changing the money and the
  // assumptions at once would make the comparison meaningless.
  assert.equal(byKey.base.arrMonthEnd, plan.base.summary.arrMonthEnd, 'the base scenario and the base run disagree');
  for (const entry of plan.scenarios) {
    assert.ok(entry.payingCustomersMonthEnd >= 0 && entry.cashMonthEnd >= -1, `${entry.key} is not a survivable plan`);
  }
});

// The funding requirement is a property of the plan, not of how much is asked
// for: nothing in the model reads the raise, so the deepest cumulative position
// must be identical whether the plan is funded or not. This invariant is what
// makes the requirement checkable — an earlier version scaled spending off the
// raise, and its "you need X more" was quietly wrong.
test('the funding requirement does not depend on the amount raised', () => {
  for (const industry of ['b2b-saas', 'fintech', 'nonprofit', 'consumer-app']) {
    const small = generateCompany({ name: 'Northwind', industry, raiseAmount: 50_000 }).businessPlan;
    const large = generateCompany({ name: 'Northwind', industry, raiseAmount: 5_000_000 }).businessPlan;
    assert.equal(
      small.funding.required,
      large.funding.required,
      `${industry}: the funding requirement changed with the size of the round`,
    );
    assert.equal(small.base.summary.cumulativeLow, large.base.summary.cumulativeLow, `${industry}: the cash curve moved`);
    // And the funded plan really is funded, row by row.
    assert.ok(large.base.months.every((row) => row.cash >= 0), `${industry}: a funded plan still dips below zero`);
    assert.equal(large.funding.verified, true, `${industry}: the documented run does not satisfy its own requirement`);
    assert.ok(large.base.summary.minCash >= 0, `${industry}: a funded plan reports a negative cash trough`);
  }
});

// The ask is the number a reader will act on, so it is checked against the cash
// curve it claims to fund.
test('the funding ask covers the plan it is generated around', () => {
  for (const industry of ['b2b-saas', 'fintech', 'local-service', 'consumer-app']) {
    const plan = generateCompany({ name: 'Northwind', industry }).businessPlan;
    const f = plan.funding;
    assert.ok(f.requested > 0, `${industry} asks for nothing`);
    assert.ok(f.required > 0, `${industry} reports no funding requirement`);
    if (f.funded) {
      assert.ok(f.requested >= f.required, `${industry} is funded for less than it needs`);
      assert.ok(f.peakDrawdown >= 0, `${industry} is funded, so its cash should never go negative`);
    } else {
      assert.ok(f.recommended > f.asked, `${industry} is underfunded but does not raise the recommendation`);
      assert.ok(f.shortfall === f.recommended - f.asked, `${industry} reports an inconsistent shortfall`);
    }
    // The plan that is actually documented must survive its own horizon.
    assert.ok(
      plan.base.months.every((row) => row.cash >= -1),
      `${industry} documents a plan that runs out of cash`,
    );
    const dollars = f.useOfFunds.buckets.reduce((sum, bucket) => sum + bucket.dollars, 0);
    assert.equal(dollars, f.requested, `${industry}: use of funds does not add up to the ask`);
    const shares = f.useOfFunds.buckets.reduce((sum, bucket) => sum + bucket.share, 0);
    assert.ok(Math.abs(shares - 100) < 0.6, `${industry}: use-of-funds shares do not add up to 100 (got ${shares})`);
    // The panel and the document both render this object directly, so every
    // number they show has to be present and finite. A missing field used to
    // surface as "$NaN" in the funding table, which no other test caught.
    for (const key of ['requested', 'required', 'trough', 'buffer', 'monthlyBurn', 'peakDrawdown']) {
      assert.equal(typeof f[key], 'number', `${industry}: funding.${key} is missing, so the panel renders $NaN`);
    }
    for (const [key, value] of Object.entries(f)) {
      if (typeof value === 'number') {
        assert.ok(Number.isFinite(value), `${industry}: funding.${key} is not a finite number`);
      }
    }
  }
});

// An entered amount must be respected rather than silently overridden, and the
// sizing must be reported alongside it.
test('an entered raise is used as the amount under test', () => {
  const asked = generateCompany({ name: 'Northwind', industry: 'b2b-saas', raiseAmount: 750_000 }).businessPlan;
  assert.equal(asked.funding.asked, 750_000, 'the entered amount was not used as the amount under test');
  assert.equal(asked.funding.entered, true);
  // Too small to fund the plan, so the document is generated around the size the
  // plan needs and the shortfall is reported rather than hidden.
  assert.equal(asked.funding.funded, false);
  assert.ok(asked.funding.recommended > 750_000);
  assert.equal(asked.funding.requested, asked.funding.recommended);
  assert.ok(asked.base.months.every((row) => row.cash >= -1), 'the documented plan runs out of cash');

  const generous = generateCompany({ name: 'Northwind', industry: 'b2b-saas', raiseAmount: 8_000_000 }).businessPlan;
  assert.equal(generous.funding.asked, 8_000_000);
  assert.equal(generous.funding.funded, true, 'a generous round should fund the plan');
  assert.ok(generous.funding.surplus > 0, 'a generous round should leave a reserve');

  // A round the plan cannot deploy should say so. The spend plan is fixed, so the
  // surplus buys nothing in the model, and a document that implies otherwise is
  // selling the reader a bigger story than the tables support.
  const funding = generous.sections.find((section) => section.id === 'funding').paragraphs.join(' ');
  assert.ok(
    generous.funding.surplus > generous.funding.required,
    'this fixture no longer asks for far more than the plan consumes',
  );
  assert.ok(/more than the plan can deploy/.test(funding), 'an oversized round is not called out');
});

// "Beyond this horizon" is not an answer a reader can act on. Where break-even is
// missed, the plan has to report how far off it is in the reader's own terms: a
// monthly gap, and the customer count at the modelled price that would close it.
test('a plan that misses break-even says by how much and what would close it', () => {
  let sawReached = false;
  let sawMissed = false;

  for (const industry of Object.keys(INDUSTRIES)) {
    const plan = generateCompany({ name: 'Northwind', industry }).businessPlan;
    const be = plan.breakEven;
    assert.equal(typeof be.reached, 'boolean', `${industry}: the plan carries no break-even diagnosis`);
    assert.equal(be.monthEnd, PLAN_HORIZON_MONTHS, `${industry}: the diagnosis reads the wrong month`);
    assert.ok(be.note.length > 40, `${industry}: the break-even note says nothing`);
    assert.ok(be.detail.length > 80, `${industry}: the financial section has no break-even arithmetic`);
    assert.notEqual(be.note, be.detail, `${industry}: the same paragraph is repeated in two sections`);

    if (be.reached) {
      sawReached = true;
      assert.equal(be.month, plan.base.summary.breakEvenMonth, `${industry}: the diagnosis disagrees with the model`);
      assert.equal(be.gap, 0, `${industry}: a plan that breaks even still reports a gap`);
      continue;
    }

    sawMissed = true;
    const last = plan.base.months[be.monthEnd - 1];
    assert.equal(be.gap, round2(last.opex - last.grossProfit), `${industry}: the gap is not the terminal shortfall`);
    assert.ok(be.gap > 0, `${industry}: a plan missing break-even must still be losing money at the horizon`);
    assert.equal(be.grossProfit, last.grossProfit, `${industry}: the diagnosis quotes a different gross profit`);
    assert.equal(be.payingCustomersAtEnd, last.payingCustomers, `${industry}: the diagnosis quotes a different customer count`);
    // The prescription has to be a real one: more customers than the plan ends
    // with, at the price the plan already uses.
    assert.ok(be.payingCustomersNeeded > last.payingCustomers, `${industry}: the diagnosis asks for fewer customers than the plan reaches`);
    assert.ok(be.accountsNeeded >= be.payingCustomersNeeded, `${industry}: the account count is below the paying count`);
    // And it reaches the reader: the summary is the section people stop after.
    const summary = plan.sections[0].paragraphs.join(' ');
    assert.ok(summary.includes('break-even'), `${industry}: the executive summary does not disclose the miss`);
    const financial = plan.sections.find((section) => section.id === 'financial-plan').paragraphs.join(' ');
    assert.ok(/break-even/i.test(financial), `${industry}: the financial plan does not disclose the miss`);
  }

  assert.ok(sawReached, 'no industry broke even inside the horizon, so that branch is untested');
  assert.ok(sawMissed, 'every industry broke even, so the missing-break-even branch is untested');
});

// The model is pure, so the plan has to be reproducible from the intake alone —
// the same rule the rest of the engine follows.
test('the plan is deterministic and industry-specific', () => {
  const once = generateCompany({ name: 'Northwind', industry: 'health' }).businessPlan;
  const twice = generateCompany({ name: 'Northwind', industry: 'health' }).businessPlan;
  const a = JSON.stringify({ ...once, generatedAt: null });
  const b = JSON.stringify({ ...twice, generatedAt: null });
  assert.equal(a, b, 'the same intake produced two different plans');

  const fintech = generateCompany({ name: 'Northwind', industry: 'fintech' }).businessPlan;
  assert.notEqual(fintech.arpu, once.arpu, 'two industries share a blended price');
  assert.notEqual(fintech.base.summary.grossMargin, once.base.summary.grossMargin, 'two industries share a gross margin');
  assert.notEqual(
    fintech.assumptions.lines.length,
    0,
  );
  // Every assumption must say how to replace it, or the plan is unverifiable.
  for (const line of fintech.assumptions.lines) {
    assert.ok(line.label && line.value && line.basis, `an assumption line is incomplete: ${JSON.stringify(line)}`);
    assert.ok(line.verify && line.verify.length > 10, `${line.label} has no way to verify it`);
  }
});

// The document is what most readers will actually see, so it has to exist, carry
// the plan's own sections, and be honest about what it is.
test('the plan documents ship with the bundle and carry their own caveats', () => {
  const project = generateCompany({ name: 'Northwind', industry: 'fintech' });
  const paths = project.bundle.files.map((file) => file.path);
  for (const path of [
    'business-plan/business-plan.md',
    'business-plan/assumptions.md',
    'business-plan/financial-model.csv',
    'business-plan/scenarios.csv',
    'business-plan/sensitivity.csv',
    'business-plan/use-of-funds.csv',
    'business-plan/hiring-plan.csv',
  ]) {
    assert.ok(paths.includes(path), `the bundle is missing ${path}`);
  }

  const doc = project.bundle.files.find((file) => file.path === 'business-plan/business-plan.md').content;
  for (const section of project.businessPlan.sections) {
    assert.ok(doc.includes(`## ${section.heading}`), `the document is missing the ${section.heading} section`);
  }
  assert.ok(/not a forecast/i.test(doc), 'the document does not say it is not a forecast');
  assert.ok(/verify/i.test(doc), 'the document does not tell the reader how to verify the assumptions');
  assert.ok(!/NaN|undefined|\[object/.test(doc), 'the document contains an unfilled value');

  const model = project.bundle.files
    .find((file) => file.path === 'business-plan/financial-model.csv')
    .content.split('\n')
    .filter((line) => line.trim().length);
  assert.equal(model.length, PLAN_HORIZON_MONTHS + 1, 'the financial model CSV does not have one row per month plus a header');
  assert.equal(model[0].split(',').length, 17, 'the financial model CSV header changed shape');
  assert.ok(model.every((line) => !/NaN|undefined/.test(line)), 'the CSV contains an unfilled value');
});

// Adopting a written positioning statement has to rebuild the plan too: the
// document quotes the statement in its own opening paragraph.
test('the plan is rebuilt when a positioning statement is adopted', () => {
  const project = generateCompany({ name: 'Northwind', industry: 'b2b-saas' });
  const statement = 'For operations leaders who need one record of work, Northwind is a platform that consolidates operational data.';
  applyPositioningStatement(project, statement);
  assert.equal(project.businessPlan.sections[0].paragraphs[0].includes('consolidates operational data'), true);
  const doc = project.bundle.files.find((file) => file.path === 'business-plan/business-plan.md').content;
  assert.ok(doc.includes('consolidates operational data'), 'the exported plan kept the old statement');
});

// Market research has to be a function of the industry. A generic document with
// the category noun swapped is worse than none, because it reads as researched.
test('market research is industry-specific and says where to verify it', () => {
  const categories = new Set();
  const docs = new Map();

  for (const industry of Object.keys(INDUSTRIES)) {
    const intake = normalizeIntake({ name: 'Northwind', industry });
    const identity = buildIdentity(intake);
    const marketing = buildMarketing(intake, identity, buildBrand(intake, identity));
    const r = marketing.research;

    assert.ok(r, `${industry} produced no market research`);
    assert.equal(r.industry, INDUSTRIES[industry].label, `${industry} reported the wrong industry`);
    assert.ok(r.competitorShapes.length >= 3, `${industry} names too few competitor shapes`);
    assert.ok(r.demandSignals.length >= 3, `${industry} lists too few demand signals`);
    assert.ok(r.whereToReadItYourself.length >= 3, `${industry} cites too few sources`);
    assert.ok(r.howItIsBought.triggers.length >= 3, `${industry} lists too few buying triggers`);
    assert.ok(r.objections.length >= 2, `${industry} anticipates too few objections`);
    assert.ok(r.beachhead.wedge.length > 15 && r.beachhead.expansion.length > 15, `${industry} has no beachhead`);

    // Every competitor is described as a shape with a trade-off, never a name:
    // a generated name list is stale the day it ships.
    for (const shape of r.competitorShapes) {
      assert.ok(shape.shape && shape.whatTheyWinOn && shape.whereTheyLose && shape.counter, `${industry} has an incomplete competitor shape`);
    }
    // Every number the reader might act on carries the source to check it.
    for (const benchmark of r.planningBenchmarks) {
      assert.ok(benchmark.metric && benchmark.band, `${industry} has an unnamed benchmark`);
      assert.ok(benchmark.verify && benchmark.verify.length > 10, `${industry} states a benchmark with no way to verify it`);
    }
    for (const entry of r.objections) {
      assert.ok(entry.objection && entry.answer, `${industry} has an unanswered objection`);
    }
    categories.add(r.analystCategory);
    assertNoUnfilledSlots(JSON.stringify(r), `${industry} research`);
  }

  // Two industries may share a label by accident; they must not share a document.
  assert.equal(categories.size, Object.keys(INDUSTRIES).length, 'two industries claim the same analyst category');
});

// The research has to survive the round trip into the downloadable bundle, and
// the two industries must not export the same file.
test('the market research document is written per industry', () => {
  const docFor = (industry) => {
    const project = generateCompany({ name: 'Northwind', industry });
    const entry = project.bundle.files.find((file) => file.path === 'marketing/market-research.md');
    assert.ok(entry, `${industry} has no market-research.md in the bundle`);
    return entry.content;
  };

  const fintech = docFor('fintech');
  const health = docFor('health');
  assert.notEqual(fintech, health, 'two industries exported the same research');
  assert.ok(fintech.includes('payment infrastructure'), 'the fintech document does not describe the fintech market');
  assert.ok(health.includes('health services'), 'the health document does not describe the health market');
  for (const doc of [fintech, health]) {
    assert.ok(!/NaN|undefined|\[object/.test(doc), 'the research document contains an unfilled value');
    assert.ok(doc.includes('Verify against'), 'the research document dropped its verification column');
  }
});

// Regression: adopting a model-written positioning statement used to rebuild the
// bundle through a hand-rolled context and throw, leaving the statement on
// screen while the exports still carried the old one.
test('adopting a written positioning statement rebuilds site, bundle and checklist', () => {
  const project = generateCompany({ name: 'Northwind', industry: 'b2b-saas' });
  const statement = 'For operations leaders who need one record of work, Northwind is a platform that consolidates operational data. Unlike spreadsheets, we keep decisions in one system.';
  const before = project.bundle.manifest.counts.files;

  applyPositioningStatement(project, statement);

  assert.equal(project.identity.positioning, statement, 'the statement was not adopted');
  assert.ok(JSON.stringify(project.site).includes('consolidates operational data'), 'the site kept the old statement');
  assert.ok(JSON.stringify(project.bundle).includes('consolidates operational data'), 'the bundle kept the old statement');
  assert.equal(project.bundle.manifest.counts.files, before, 'the file count changed when only prose changed');
  assert.ok(project.checklist.length > 10, 'the launch console was not rebuilt');
  // An empty statement must be a no-op rather than wiping the engine's copy.
  applyPositioningStatement(project, '   ');
  assert.equal(project.identity.positioning, statement);
});

test('launch copy is written for real people', () => {
  const intake = normalizeIntake({ name: 'Ledgerly', industry: 'fintech', founder: 'Rina Patel' });
  const identity = buildIdentity(intake);
  const brand = buildBrand(intake, identity);
  const marketing = buildMarketing(intake, identity, brand);
  const copy = {
    bio: marketing.launchCopy.emailAnnouncement.body,
    hn: marketing.launchCopy.hackerNews.body,
    ph: marketing.launchCopy.productHunt.description,
    x: marketing.launchCopy.x.thread.join('\n'),
    linkedin: marketing.launchCopy.linkedin.post,
    press: marketing.pressRelease.body.join('\n'),
  };
  for (const [key, text] of Object.entries(copy)) {
    assertNoUnfilledSlots(text, `launch copy ${key}`);
    assert.ok(text.length > 120, `${key} is suspiciously short`);
    assert.ok(!text.includes('undefined'), `${key} contains undefined`);
  }
  assert.equal(marketing.coldEmail.sequence.length, 4);
  assert.ok(marketing.seo.pillars.length >= 3);
});

// ---------------------------------------------------------------------------
// company / legal
// ---------------------------------------------------------------------------

test('entity recommendation adapts to the intake', () => {
  const raising = normalizeIntake({ name: 'Northwind', raising: true });
  const raisingCompany = buildCompany(raising, buildIdentity(raising));
  assert.equal(raisingCompany.recommendation.entity.key, 'de-c-corp');
  assert.ok(raisingCompany.recommendation.why.length > 40);

  const bootstrapped = normalizeIntake({ name: 'Cedar & Pine', industry: 'local-service', raising: false, state: 'TX' });
  const bootstrappedCompany = buildCompany(bootstrapped, buildIdentity(bootstrapped));
  assert.equal(bootstrappedCompany.recommendation.entity.key, 'home-llc');
  assert.equal(bootstrappedCompany.recommendation.formationState, 'TX');
  assert.equal(bootstrappedCompany.recommendation.needsForeignQualification, false);
});

test('formation paperwork is complete and honest about its limits', () => {
  const intake = normalizeIntake({ name: 'Northwind', founder: 'Ada Lovelace', raising: true, state: 'CA' });
  const identity = buildIdentity(intake);
  const company = buildCompany(intake, identity);

  const certificate = company.documents['legal/01-formation-filing.md'];
  assert.ok(certificate.includes('CERTIFICATE OF INCORPORATION'));
  assert.ok(certificate.includes('10,000,000 shares of common stock'));
  assert.ok(certificate.includes('Not legal advice'));
  assert.ok(certificate.includes('Ada Lovelace'));

  const ip = company.documents['legal/05-ip-assignment.md'];
  assert.ok(ip.includes('Schedule A'), 'IP assignment must include a prior-inventions schedule');
  assert.ok(/non-compete|non-compet/i.test(ip), 'IP assignment should flag non-compete limits');

  const election = company.documents['legal/06-83b-election.md'];
  assert.ok(election.includes('30 days'));
  assert.ok(election.includes('certified post'));

  const bank = company.documents['legal/08-bank-packet.md'];
  assert.ok(bank.includes('USA PATRIOT Act'), 'bank packet must explain why it cannot be automated');
  assert.ok(bank.includes('CP575'));
  assert.ok(company.bank.providers.length >= 5);
  assert.ok(company.bank.checklist.length >= 6);
  assert.ok(company.bank.sequence.length >= 5);
});

test('EIN packet pre-fills the SS-4 and states the eligibility rule', () => {
  const intake = normalizeIntake({ name: 'Northwind', founder: 'Ada Lovelace', raising: true });
  const company = buildCompany(intake, buildIdentity(intake));
  const lines = company.ein.fields.map((field) => field.line);
  for (const required of ['1', '7a', '7b', '9a', '10', '11', '12', '16']) {
    assert.ok(lines.includes(required), `SS-4 line ${required} missing`);
  }
  assert.equal(company.ein.fields.find((field) => field.line === '1').value, 'Northwind, Inc.');
  assert.ok(company.ein.routes.length === 3);
  assert.ok(company.ein.onlineBlockers.some((line) => /SSN|ITIN/.test(line)));
  assert.ok(company.documents['legal/07-ein-packet.md'].includes('irs.gov'));
  assert.ok(company.ein.afterApproval.length >= 4);
});

test('compliance calendar produces dated, importable obligations', () => {
  const intake = normalizeIntake({ name: 'Northwind', raising: true, state: 'DE', formationDate: '2026-01-10' });
  const company = buildCompany(intake, buildIdentity(intake));
  assert.ok(company.compliance.dates.length >= 8);
  for (const entry of company.compliance.dates) {
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/, `bad date ${entry.date}`);
    assert.ok(entry.label && entry.detail);
  }
  const election = company.compliance.dates.find((entry) => entry.label.includes('83(b)'));
  assert.equal(election.date, '2026-02-09', '83(b) must be exactly 30 days after issuance');
  const delawareReport = company.compliance.dates.find((entry) => entry.label.includes('annual report'));
  assert.equal(delawareReport.date, '2027-03-01', 'Delaware annual report is due 1 March');
  const ics = company.compliance.calendar;
  assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('BEGIN:VEVENT') && ics.includes('END:VCALENDAR'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 4);
});

test('cap table is internally consistent', () => {
  const intake = normalizeIntake({ name: 'Northwind', raising: true, cofounders: 2 });
  const company = buildCompany(intake, buildIdentity(intake));
  const rows = company.capTable.rows;
  assert.equal(rows.length, 4, 'two co-founders plus pool');
  const allocated = rows.reduce((sum, row) => sum + Number(row.shares.replace(/[^0-9]/g, '')), 0);
  assert.ok(allocated <= 10_000_000, `allocated ${allocated} exceeds authorized shares`);
  assert.ok(company.capTable.csv.split('\n')[0].includes('Holder'));
  assert.ok(company.capTable.guidance.some((line) => /vest/i.test(line)));
});

test('trademark screening suggests classes and official links', () => {
  const intake = normalizeIntake({ name: 'Ledgerly', industry: 'fintech' });
  const company = buildCompany(intake, buildIdentity(intake));
  assert.ok(company.trademark.classes.some((entry) => entry.code === 36), 'fintech should include class 36');
  assert.ok(company.trademark.links.every((link) => link.href.startsWith('https://')));
  assert.ok(company.trademark.note.includes('trademark'));
});

// ---------------------------------------------------------------------------
// website
// ---------------------------------------------------------------------------

test('site generator emits a complete, well-formed, escaped website', () => {
  for (const sample of SAMPLES) {
    const intake = normalizeIntake(sample);
    const identity = buildIdentity(intake);
    const brand = buildBrand(intake, identity);
    const marketing = buildMarketing(intake, identity, brand);
    const site = generateSite(intake, { identity, brand, marketing });

    const required = [
      'index.html',
      'pricing.html',
      'about.html',
      'contact.html',
      'blog/index.html',
      'privacy.html',
      'terms.html',
      '404.html',
      'css/brand.css',
      'css/styles.css',
      'js/main.js',
      'robots.txt',
      'sitemap.xml',
      'site.webmanifest',
      'favicon.svg',
      'og.svg',
      'README.md',
      'DEPLOY.md',
      '_headers',
    ];
    for (const file of required) assert.ok(site.files[file], `${sample.name}: missing ${file}`);

    for (const [name, content] of Object.entries(site.files)) {
      if (name.endsWith('.html')) assertWellFormed(content, `${sample.name}/${name}`);
      assert.ok(content.length > 40, `${sample.name}/${name} is empty`);
    }

    const home = site.files['index.html'];
    assert.ok(home.includes(identity.primaryTagline), 'hero tagline missing');
    assert.ok(home.includes('data-blueprint-form="lead"') === false, 'home should not have the lead form');
    assert.ok(site.files['contact.html'].includes('data-blueprint-form="lead"'), 'contact form missing');
    assert.ok(home.includes('data-blueprint-form="subscribe"'), 'newsletter form missing');
    assert.ok(home.includes('application/ld+json'), 'JSON-LD missing');
    assert.ok(site.files['sitemap.xml'].includes('<urlset'), 'sitemap malformed');
    assert.ok(site.files['robots.txt'].includes('Sitemap:'));
  }
});

test('generated pages cannot be used for HTML injection', () => {
  const hostile = normalizeIntake({
    name: '</title><script>alert(1)</script>',
    founder: '"><img src=x onerror=alert(1)>',
    audience: '<svg onload=alert(1)>',
    industry: 'b2b-saas',
  });
  const identity = buildIdentity(hostile);
  const brand = buildBrand(hostile, identity);
  const marketing = buildMarketing(hostile, identity, brand);
  const site = generateSite(hostile, { identity, brand, marketing });
  // Only markup files can execute anything; Markdown and JSON notes may
  // legitimately contain the raw characters.
  const markup = Object.entries(site.files)
    .filter(([name]) => /\.(html|svg|xml)$/.test(name))
    .map(([, content]) => content)
    .join('\n');
  assert.ok(!markup.includes('<script>alert(1)</script>'), 'script tag from the name leaked into the markup');
  assert.ok(!markup.includes('<img src=x onerror='), 'image handler from the founder name leaked into the markup');
  assert.ok(!markup.includes('<svg onload='), 'svg handler from the audience leaked into the markup');
  const joined = Object.values(site.files).join('\n');
  assert.ok(joined.includes('&lt;script&gt;'), 'hostile input was dropped instead of escaped');
  // SVG assets must be escaped too.
  assert.ok(!brand.og.includes('<script'), 'OG card contains raw script markup');
  assertWellFormed(brand.og, 'og card under hostile input');
});

// ---------------------------------------------------------------------------
// zip
// ---------------------------------------------------------------------------

test('zip writer produces a readable archive with correct metadata', async () => {
  const entries = [
    { name: 'README.md', data: '# Hello\n'.repeat(40) },
    { name: 'nested/dir/file.txt', data: 'a'.repeat(5000) },
    { name: 'empty.txt', data: '' },
    { name: 'unicode-✓-name.txt', data: 'unicode payload' },
  ];
  const zip = await createZip(entries);
  assert.ok(zip instanceof Uint8Array);
  assert.equal(String.fromCharCode(zip[0], zip[1]), 'PK');

  const directory = readZipDirectory(zip);
  assert.equal(directory.length, entries.length);
  assert.deepEqual(
    directory.map((entry) => entry.name).sort(),
    entries.map((entry) => entry.name).sort(),
  );

  for (const entry of directory) {
    assert.ok([0, 8].includes(entry.method), `unexpected compression method ${entry.method}`);
    if (entry.method === 8) continue;
    const content = readZipEntry(zip, entry.name);
    const original = entries.find((item) => item.name === entry.name).data;
    assert.equal(new TextDecoder().decode(content), original);
  }

  // The compressible entry must actually be compressed.
  const big = directory.find((entry) => entry.name === 'nested/dir/file.txt');
  assert.ok(big.compressedSize < big.uncompressedSize, 'deflate did not reduce size');
});

test('crc32 matches known values', () => {
  const encoder = new TextEncoder();
  assert.equal(crc32(encoder.encode('')), 0);
  assert.equal(crc32(encoder.encode('123456789')), 0xcbf43926);
});

// ---------------------------------------------------------------------------
// full project
// ---------------------------------------------------------------------------

test('generateCompany produces a complete, deterministic project', () => {
  const project = generateCompany({ name: 'Northwind', industry: 'b2b-saas', founder: 'Ada Lovelace' });
  const again = generateCompany({ name: 'Northwind', industry: 'b2b-saas', founder: 'Ada Lovelace' });

  assert.equal(project.summary.name, 'Northwind');
  assert.equal(project.summary.domain, 'northwind.com');
  assert.ok(project.bundle.manifest.counts.files > 50, `bundle only has ${project.bundle.manifest.counts.files} files`);
  assert.ok(project.checklist.length > 30, `launch console only has ${project.checklist.length} steps`);

  // Determinism: regenerating the same intake must produce identical artifacts.
  assert.equal(project.brand.palette.primary, again.brand.palette.primary);
  assert.equal(project.brand.chosen.id, again.brand.chosen.id);
  assert.equal(project.identity.primaryTagline, again.identity.primaryTagline);
  assert.deepEqual(
    project.bundle.files.map((file) => file.path),
    again.bundle.files.map((file) => file.path),
  );
  assert.equal(project.site.files['index.html'], again.site.files['index.html']);

  // Different names must not collide.
  const other = generateCompany({ name: 'Brightloom', industry: 'consumer-app' });
  assert.notEqual(project.brand.palette.primary, other.brand.palette.primary);

  // No duplicate paths, no unfilled slots anywhere in the bundle.
  const paths = project.bundle.files.map((file) => file.path);
  assert.equal(new Set(paths).size, paths.length, 'duplicate file paths in the bundle');
  for (const file of project.bundle.files) {
    assert.ok(!file.content.includes('undefined'), `${file.path} contains undefined`);
    assert.ok(!file.content.includes('[object Object]'), `${file.path} contains [object Object]`);
  }
});

test('every industry preset generates a coherent company', () => {
  for (const [key, profile] of Object.entries(INDUSTRIES)) {
    const project = generateCompany({ name: `${profile.label.split(' ')[0]}labs`, industry: key, founder: 'Test Founder' });
    assert.equal(project.intake.industry, key);
    assert.ok(project.identity.oneLiner.includes(profile.category), `${key}: one-liner misses the category`);
    assert.ok(project.site.files['index.html'].length > 4000, `${key}: home page looks empty`);
    assert.ok(project.marketing.pricing.tiers.length === 3, `${key}: pricing incomplete`);
    assert.ok(project.bundle.files.length > 50, `${key}: bundle incomplete`);
  }
});

// Templates concatenate slots ("a {category}"), so a/an agreement needs a check.
// This scans the whole project *including every generated file* — a leak fixed in
// one module used to survive into marketing/launch-kit.md, which is built later.
test('generated prose uses correct a/an agreement, including in generated files', () => {
  const collect = (value, out = []) => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach((entry) => collect(entry, out));
    else if (value && typeof value === 'object') Object.values(value).forEach((entry) => collect(entry, out));
    return out;
  };
  // "Attached as Schedule A is ..." is a noun, not an article, so probe only for
  // the pattern a template would actually get wrong.
  const ENGLISH_EXCEPTIONS = /^(one|once|university|unicorn)$/i;
  const needsAn = (word) =>
    /^(hour|honest|honour|honor|heir)$/i.test(word) ||
    /^(a|e|i|o)/i.test(word) && !/^(one|once)/i.test(word) ||
    /^(AI|API|EIN|LLC|MVP|SEO|HR|LLM|SaaS)\b/.test(word);

  // Markup is not prose: an SVG path's `A` command and `<a href>` tags produce
  // phantom "articles" once tags are stripped, so such strings are skipped whole.
  const looksLikeMarkup = (text) => /<\s*[A-Za-z!/?]/.test(text);
  const flatten = (text) => String(text).replace(/\s+/g, ' ').trim();

  const problems = new Set();
  const check = (article, word) => {
    const isAn = article.toLowerCase() === 'an';
    if (isAn && ENGLISH_EXCEPTIONS.test(word)) problems.add(`${article} ${word}`);
    if (!isAn && needsAn(word)) problems.add(`${article} ${word}`);
  };

  for (const [key, profile] of Object.entries(INDUSTRIES)) {
    const project = generateCompany({ name: `${profile.label.split(' ')[0]}labs`, industry: key, founder: 'Test Founder' });
    const corpus = [...collect(project), ...project.bundle.files.map((file) => file.content)];
    for (const line of corpus) {
      if (looksLikeMarkup(line)) continue;
      const text = flatten(line);
      // A lowercase article anywhere in the sentence, and a capitalized one only at
      // a sentence start — "Schedule A is" is a label, but ". A AI platform" is a bug.
      for (const hit of text.matchAll(/\b(an|a)\s+([A-Za-z][\w'-]*)/g)) check(hit[1], hit[2]);
      for (const hit of text.matchAll(/(?:^|[.!?:]\s)(An|A)\s+([A-Za-z][\w'-]*)/g)) check(hit[1], hit[2]);
    }
  }
  assert.deepEqual([...problems], [], `a/an agreement problems: ${[...problems].join(', ')}`);
});

test('normalizeIntake defends against malformed input', () => {
  const intake = normalizeIntake({ name: 'x'.repeat(200), cofounders: 99, employees: -5, state: 'california', tone: 'nope', industry: 'unknown industry', valuation: 'abc' });
  assert.equal(intake.name.length, 60);
  assert.equal(intake.cofounders, 6);
  assert.equal(intake.employees, 0);
  assert.equal(intake.state, 'CA');
  assert.equal(intake.tone, 'calm');
  assert.equal(intake.industry, 'b2b-saas');
  assert.ok(intake.valuation > 0);
});

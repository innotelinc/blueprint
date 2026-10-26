// Naming: analysis, scoring, archetype selection and the identity layer
// (taglines, mission, vision, values, voice).
import { seedFor, compact, slugify, titleCase, unique, fixArticlesDeep } from './rng.js';
import { ARCHETYPES, INDUSTRIES, TONES } from './presets.js';

const AMBIGUOUS = [
  { pattern: /c[ei]/, note: 'a "c" before e or i can read as /s/ (city) or /k/ (cinch) — plan to spell it aloud' },
  { pattern: /ph/, note: '"ph" can be heard as /f/ or /p-h/, so expect phone spelling questions' },
  { pattern: /(.)\1/, note: 'a doubled letter is the single most misheard feature in a company name' },
  { pattern: /gh/, note: '"gh" is silent, hard or /f/ depending on the word' },
  { pattern: /x/, note: '"x" is often heard as "ks", "z" or dropped entirely' },
  { pattern: /qu/, note: '"qu" needs a clear following vowel or callers drop it' },
  { pattern: /(ai|ea|ie|ou|ue)$/, note: 'a trailing vowel pair is commonly misspelled by ear' },
];

const SOLID_PREFIXES = ['get', 'use', 'try', 'go', 'join', 'hey', 'with'];
const SOLID_SUFFIXES = ['ly', 'ify', 'hq', 'labs', 'works', 'base', 'flow', 'kit', 'stack'];

function syllables(text) {
  const word = String(text).toLowerCase().replace(/[^a-z]/g, '');
  if (!word) return 0;
  const groups = word
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
    .match(/[aeiouy]{1,2}/g);
  return groups ? Math.max(1, groups.length) : 1;
}

/** A readable hyphenated guess at where the name breaks, e.g. "North-win-dow". */
function syllabify(text) {
  const word = String(text).replace(/\s+/g, '');
  if (word.length < 3) return word;
  const chars = word.split('');
  const out = [];
  let chunk = '';
  for (let i = 0; i < chars.length; i += 1) {
    chunk += chars[i];
    const isVowel = /[aeiouy]/i.test(chars[i]);
    const nextIsVowel = i + 1 < chars.length && /[aeiouy]/i.test(chars[i + 1]);
    const boundary = isVowel && !nextIsVowel && chunk.length >= 2;
    if (boundary && i < chars.length - 2) {
      out.push(chunk);
      chunk = '';
    }
  }
  if (chunk) {
    if (out.length && chunk.length === 1) out[out.length - 1] += chunk;
    else out.push(chunk);
  }
  return out.join('-');
}

/** Letters beyond the 10 most common in English signal a distinctive name. */
function distinctiveness(letters) {
  const common = 'etaoinshrd';
  const counts = {};
  for (const char of letters) counts[char] = (counts[char] || 0) + 1;
  const total = letters.length || 1;
  const rareShare = Object.entries(counts)
    .filter(([char]) => !common.includes(char))
    .reduce((sum, [, count]) => sum + count, 0) / total;
  // Unusual two- and three-letter runs read as invented rather than generic.
  const invented = (letters.match(/[qxzjkv]|[bcdfghjklmnpqrstvwxz]{3}/g) || []).length;
  return Math.round(Math.min(100, 35 + rareShare * 70 + invented * 6));
}

function scoreLabel(score) {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'strong';
  if (score >= 55) return 'workable';
  if (score >= 40) return 'weak';
  return 'risky';
}

/** Deterministic analysis of a name: scores plus concrete, actionable notes. */
export function analyzeName(raw) {
  const display = titleCase(String(raw || '').trim());
  const clean = display.replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const wordList = clean.split(' ').filter(Boolean);
  const letters = clean.replace(/[^A-Za-z]/g, '').toLowerCase();
  const initials = wordList.map((word) => word[0]).join('').slice(0, 3).toUpperCase();
  const syl = syllables(clean);
  const vowels = (letters.match(/[aeiouy]/g) || []).length;
  const vowelShare = vowels / Math.max(1, letters.length);
  const runs = letters.match(/[^aeiouy]+/g) || [];
  const longestRun = runs.reduce((max, run) => Math.max(max, run.length), 0);
  const flags = unique(AMBIGUOUS.filter((entry) => entry.pattern.test(letters)).map((entry) => entry.note));

  const lengthScore = (() => {
    if (letters.length >= 4 && letters.length <= 9) return 100;
    if (letters.length === 3 || letters.length <= 12) return 78;
    if (letters.length === 2 || letters.length <= 15) return 52;
    return 28;
  })();

  const speakScore = Math.max(
    15,
    Math.min(100, 100 - Math.max(0, longestRun - 2) * 14 - (vowelShare < 0.25 ? 18 : 0) - (vowelShare > 0.6 ? 12 : 0)),
  );

  const memoryScore = Math.max(20, Math.min(100, 100 - Math.abs(2.5 - syl) * 16 + (/(a|o|y|i)$/i.test(letters) ? 8 : 0)));

  const spellScore = Math.max(20, Math.min(100, 100 - flags.length * 13 - (/[qwzxj]/.test(letters) ? 8 : 0)));

  const distinctScore = distinctiveness(letters);

  const parts = [
    {
      key: 'length',
      label: 'Length',
      score: lengthScore,
      note: `${letters.length} letters, ${syl} syllable${syl === 1 ? '' : 's'}. ${
        lengthScore >= 70 ? 'Comfortable to type and remember.' : 'Long names get shortened by customers — decide your nickname now.'
      }`,
    },
    {
      key: 'speak',
      label: 'Pronounceability',
      score: speakScore,
      note: `Longest consonant run is ${longestRun}. Say it as ${syllabify(clean)}. Test it on a phone call before you commit.`,
    },
    {
      key: 'memory',
      label: 'Memorability',
      score: memoryScore,
      note:
        syl >= 2 && syl <= 4
          ? 'Sits in the sweet spot most people can recall after hearing it once.'
          : syl < 2
            ? 'Very short names are memorable but crowded — expect trademark conflicts.'
            : 'More than four syllables is a lot to ask of a first-time listener.',
    },
    {
      key: 'spell',
      label: 'Spelling safety',
      score: spellScore,
      note: flags.length ? flags[0] : 'No obvious sound-to-letter traps in the name itself.',
    },
    {
      key: 'distinct',
      label: 'Distinctiveness',
      score: distinctScore,
      note:
        distinctScore >= 70
          ? 'Letter mix is uncommon, which helps trademark and search results.'
          : 'Reads like a normal English word — you will compete with existing search results.',
    },
  ];

  const overall = Math.round(parts.reduce((sum, part) => sum + part.score, 0) / parts.length);

  return {
    input: String(raw || '').trim(),
    displayName: display,
    words: wordList,
    initials,
    slug: slugify(display),
    compact: compact(display),
    letters: clean,
    length: clean.length,
    syllables: syl,
    sayIt: syllabify(display),
    flags,
    scores: { overall, label: scoreLabel(overall), parts },
    // Ideas for what to say when you answer the phone or introduce yourself.
    phoneTest: [
      `“Hi, this is ${unique([wordList[0]])[0] || display} — like the ${letters.slice(0, 4)} in ${letters.slice(0, 4).toUpperCase()}?”`,
      `Spell it back: ${clean.toUpperCase().split('').join('-')}`,
    ],
  };
}

/** Pick the brand archetype from explicit tone, or deterministically from the name. */
export function archetypeFor(name, toneKey) {
  const tone = TONES[toneKey] || null;
  if (tone) {
    const candidates = ARCHETYPES.filter((entry) => tone.archetypes.includes(entry.key));
    if (candidates.length) {
      return seedFor(name, 'archetype').pick(candidates);
    }
  }
  return seedFor(name, 'archetype-fallback').pick(ARCHETYPES);
}

// Fills {slots} while leaving {{merge_fields}} intact. Lookups are case-aware
// so a pattern can write {Category} at the start of a sentence and still get the
// value, rather than the literal word "Category".
function resolveSlot(key, slots) {
  if (slots[key] !== undefined) return String(slots[key]);
  const lower = key.charAt(0).toLowerCase() + key.slice(1);
  if (slots[lower] !== undefined) {
    const value = String(slots[lower]);
    return key.charAt(0) === key.charAt(0).toUpperCase() ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  }
  return null;
}

function fill(pattern, slots) {
  return String(pattern).replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (match, merge, slot) => {
    if (merge) return match;
    return resolveSlot(slot, slots) ?? slot;
  });
}

/** Resolve an industry key (or free text) into a preset profile with sane fallbacks. */
export function industryProfile(keyOrLabel) {
  if (keyOrLabel && INDUSTRIES[keyOrLabel]) return { key: keyOrLabel, ...INDUSTRIES[keyOrLabel] };
  const needle = String(keyOrLabel || '').toLowerCase();
  const match = Object.entries(INDUSTRIES).find(
    ([key, value]) => key.includes(needle) || value.label.toLowerCase() === needle || needle.includes(value.label.toLowerCase()),
  );
  if (match) return { key: match[0], ...match[1] };
  return { key: 'b2b-saas', ...INDUSTRIES['b2b-saas'] };
}

const TAGLINE_STYLES = [
  { style: 'outcome', label: 'Outcome-led', useFor: 'Homepage hero, paid ads', weight: 3 },
  { style: 'category', label: 'Category-defining', useFor: 'Pitch deck title, PR boilerplate', weight: 2 },
  { style: 'audience', label: 'Audience-led', useFor: 'Landing page subhead, social bio', weight: 2 },
  { style: 'contrarian', label: 'Contrarian', useFor: 'Launch post, billboard, merch', weight: 1.5 },
  { style: 'descriptive', label: 'Descriptive', useFor: 'App store subtitle, directory listings', weight: 2.5 },
  { style: 'playful', label: 'Playful', useFor: 'Social bio, stickers, 404 page', weight: 1 },
];

/**
 * Build the identity layer: everything a founder needs to describe the company
 * consistently, derived from the name, industry and tone.
 */
export function buildIdentity(intake) {
  const name = String(intake.name || '').trim();
  const analysis = analyzeName(name);
  const profile = industryProfile(intake.industry);
  const toneKey = intake.tone && TONES[intake.tone] ? intake.tone : null;
  const archetype = archetypeFor(name, toneKey);
  const tone = TONES[toneKey] || seedFor(name, 'tone').pick(Object.values(TONES));
  const rand = seedFor(name, 'identity');
  const audience = String(intake.audience || '').trim() || profile.buyer;
  const slots = {
    name: analysis.displayName,
    category: profile.category,
    categoryWord: profile.categoryWord,
    categoryPlural: profile.categoryPlural || profile.category,
    thing: profile.thing,
    audience,
    buyer: profile.buyer,
    alt: profile.alt,
    problem: profile.problem,
    outcome: profile.outcome,
  };

  const patterns = unique([...archetype.taglinePatterns, ...archTemplates(profile)]);
  const taglines = patterns.slice(0, 9).map((pattern, index) => {
    const style = TAGLINE_STYLES[index % TAGLINE_STYLES.length];
    return { text: fill(pattern, slots), style: style.style, styleLabel: style.label, useFor: style.useFor };
  });

  const legalForm = intake.entity === 'llc' || intake.entity === 'home-llc' || intake.entity === 'de-llc' ? 'LLC' : 'Inc.';
  const legalName = legalForm === 'LLC' ? `${analysis.displayName} LLC` : `${analysis.displayName}, Inc.`;

  const values = rand
    .sample(valueBank(archetype.key), 4)
    .map((value) => ({ name: value.name, statement: fill(value.statement, slots) }));

  const doSay = unique([
    ...profile.proof.slice(0, 3).map((item) => `Prove claims with specifics: “${item}”.`),
    `Name the customer every time: “${audience}”.`,
    `Use ${archetype.voice[0]} language and short sentences.`,
  ]);
  const dontSay = unique([
    ...archetype.avoid.map((item) => `Avoid ${item}.`),
    'Avoid “revolutionary”, “world-class”, “cutting-edge” — they are unverifiable and discounted by readers.',
    'Never claim a metric you cannot source.',
  ]);

  return fixArticlesDeep({
    name: analysis.displayName,
    legalName,
    legalForm,
    dba: analysis.displayName,
    slug: analysis.slug,
    monogram: analysis.initials || analysis.displayName.slice(0, 2).toUpperCase(),
    analysis,
    archetype,
    profile,
    tone: { key: toneKey || 'derived', label: TONES[toneKey]?.label || `${archetype.name} voice`, ...tone },
    primaryTagline: taglines[0]?.text || `${analysis.displayName} for ${audience}`,
    taglines,
    oneLiner: fill('{name} is a {category} for {audience} — {outcome}.', slots),
    elevatorPitch: `${analysis.displayName} is a ${profile.category} for ${audience}. Today, ${profile.problem}. ${analysis.displayName} gives you ${profile.outcome} — without the usual ${profile.alt} overhead.`,
    mission: fill(rand.pick(missionBank()), slots),
    vision: fill(rand.pick(visionBank()), slots),
    promise: fill(rand.pick(promiseBank()), slots),
    // The outcome clause deliberately does not follow "who need": an industry's
    // buyer phrase often already contains "who need" (agency: "founders who need
    // outcomes, not headcount"), and several outcomes are gerunds ("shipping AI
    // features in days"), so a verb phrase there reads as a broken sentence in
    // both directions. Stated after the dash, any outcome fits.
    positioning: fill('For {audience}, {name} is the {categoryWord} that delivers it — {outcome}, without the {alt} overhead.', slots),
    values,
    boilerplates: {
      short: `${analysis.displayName} is a ${profile.category} for ${audience}.`,
      medium: `${analysis.displayName} helps ${audience} ${profile.outcome}. Founded in ${new Date().getFullYear()}, the team builds ${profile.categoryWord} that replaces ${profile.alt}.`,
      long: `${analysis.displayName} is a ${profile.category} built for ${audience}. The problem is familiar: ${profile.problem}. ${analysis.displayName} exists to ${profile.outcome}. Where ${profile.alt} forces trade-offs, ${analysis.displayName} is designed around ${archetype.promise.toLowerCase()} — ${archetype.voice.join(', ')} — and priced as ${profile.pricingModel}.`,
    },
    voice: {
      principles: [
        `${archetype.name} archetype: lead with ${archetype.promise.toLowerCase()}.`,
        `Tone: ${archetype.voice.join(', ')}.`,
        `Energy ${Math.round((tone.energy ?? 0.5) * 100)}/100, formality ${Math.round((tone.formality ?? 0.5) * 100)}/100.`,
        'Write at a 9th-grade reading level; short sentences beat clever ones.',
      ],
      doSay,
      dontSay,
      samples: {
        heroHeadline: taglines[0]?.text,
        pushNotification: rand.pick(notificationBank()).replace(/\{(\w+)\}/g, (_, k) => slots[k] ?? k),
        errorMessage: 'That didn’t save. Your work is still here — retry and we’ll pick up where we left off.',
        emptyState: `Nothing here yet. ${fill('Add your first {thing} to see it appear.', slots)}`,
        emailSubject: taglines[1]?.text || `A faster way to ${profile.thing}`,
        apology: `We got this wrong and we’re sorry. Here’s exactly what happened, what we’re doing, and when you’ll hear from us next.`,
        socialBio: `${taglines[3]?.text || taglines[0]?.text} · ${profile.categoryWord} for ${audience}`,
      },
    },
    alternates: buildAlternates(analysis, profile, rand),
    screening: screeningChecks(analysis, intake),
  });
}

function archTemplates(profile) {
  return [
    `The {categoryWord} for {audience}`,
    `{outcome}`,
    `Everything {audience} needs. Nothing they don’t.`,
    `Stop paying for {alt}`,
    `{Category}, minus the ceremony`,
    `Built for the way {audience} actually work`,
  ];
}

function missionBank() {
  return [
    'To give {audience} the {categoryWord} they deserve — one that delivers {outcome}.',
    'To make {audience} expect {outcome}, not the exception.',
    'To remove {problem} from the working day of every {audience} we serve.',
    'To build {categoryWord} that treats {audience} as capable adults.',
  ];
}

function visionBank() {
  return [
    'A world where {audience} never have to think about {problem} again.',
    'The default {categoryWord} for {audience} in every market where we operate.',
    'Ten thousand teams running on {name} because it is simply better.',
    'A category defined by outcomes instead of feature lists.',
  ];
}

function promiseBank() {
  return [
    'We ship weekly, publish our roadmap, and never quietly change pricing.',
    'If it does not save you time in the first week, we will refund it.',
    'No lock-in: your data exports in full, in an open format, on demand.',
    'Plain-language pricing, no sales call required.',
  ];
}

function notificationBank() {
  return ['Your {thing} is ready.', 'Two minutes to save an hour on {thing}?', 'Heads up: your {thing} needs a look.'];
}

function valueBank(archetypeKey) {
  const bank = {
    sage: [
      { name: 'Evidence over opinion', statement: 'We show our working. Every claim is linked to data a customer can inspect.' },
      { name: 'Plain language', statement: 'If it cannot be explained to {audience} in one sentence, the product is not finished.' },
      { name: 'No dark patterns', statement: 'Cancelling is as easy as signing up, and we never sell customer data.' },
      { name: 'Write it down', statement: 'Decisions live in a document, not in someone’s memory, so the reasoning survives the people who made it.' },
    ],
    creator: [
      { name: 'Taste is a feature', statement: 'Craft is not decoration. We sweat {thing} until it feels obvious.' },
      { name: 'Ship in public', statement: 'Small releases every week, written up honestly, win or lose.' },
      { name: 'Opinionated defaults', statement: 'We pick a good default so {audience} can get moving, and let you change it.' },
      { name: 'Show the work', statement: 'We share the sketch, the trade-off and the version we rejected, because that is where the craft is.' },
    ],
    hero: [
      { name: 'Momentum beats perfection', statement: 'We ship the version that helps {audience} today, then improve it in the open.' },
      { name: 'Own the outcome', statement: 'We measure ourselves on whether {audience} succeed, not on tickets closed.' },
      { name: 'Direct feedback', statement: 'Say the hard thing early, to customers and to each other.' },
      { name: 'No heroics', statement: 'If a launch needs an all-nighter, the plan was wrong. We fix the plan, not the sleep.' },
    ],
    explorer: [
      { name: 'Curiosity first', statement: 'We try the unusual option before defaulting to the familiar one.' },
      { name: 'Stay adaptable', statement: 'Plans are hypotheses about {audience}. We change them when the evidence does.' },
      { name: 'Show the map', statement: 'We publish what we know, what we do not know, and what we are testing next.' },
      { name: 'Kill things early', statement: 'Projects that cannot show evidence in two weeks get stopped, and we say so out loud.' },
    ],
    caregiver: [
      { name: 'Assume good faith', statement: 'Our defaults protect {audience} first, including when it costs us money.' },
      { name: 'No fine print', statement: 'Pricing, limits and data use are stated in the same place you sign up.' },
      { name: 'Human support', statement: 'A named person answers, with authority to actually fix the problem.' },
      { name: 'Leave people better off', statement: 'If a customer leaves, they leave with their data, a clear handover and no bad taste.' },
    ],
    ruler: [
      { name: 'Standards, not slogans', statement: 'We hold the bar on reliability, security and accuracy, and publish the results.' },
      { name: 'Structured clarity', statement: 'Every commitment has an owner and a date.' },
      { name: 'Long-horizon decisions', statement: 'We choose the option that still makes sense when we are ten times the size.' },
      { name: 'Measure, then decide', statement: 'No strategy survives contact with the numbers, so we get the numbers first.' },
    ],
  };
  return bank[archetypeKey] || bank.sage;
}

function buildAlternates(analysis, profile, rand) {
  const base = analysis.displayName;
  const compactBase = analysis.compact;
  const candidates = [
    { name: `${base}${rand.pick(SOLID_SUFFIXES)}`, why: 'Suffix signals software and keeps the root recognisable.' },
    { name: `${rand.pick(SOLID_PREFIXES)}${titleCase(compactBase)}`, why: 'Prefix form is short, verbal and easy to say on a call.' },
    { name: `${titleCase(compactBase)}${rand.pick(SOLID_SUFFIXES)}`, why: 'Drop the space for a tighter, more ownable mark.' },
    { name: `${base} ${profile.categoryWord}`, why: 'Descriptive companion name for SEO and directory listings.' },
    { name: `${base} Collective`, why: 'Signals a community or studio rather than a product.' },
  ];
  return rand.shuffle(candidates).slice(0, 4).map((candidate) => ({
    ...candidate,
    domainHint: `${compact(candidate.name)}.com`,
    risk:
      candidate.name.length > 14
        ? 'Longer name — check that it fits a 15-character social handle.'
        : 'Verify against USPTO and your state registry before using.',
  }));
}

function screeningChecks(analysis, intake) {
  const query = encodeURIComponent(analysis.displayName);
  return [
    {
      check: 'USPTO trademark search',
      why: 'A federal registration is the only thing that gives you nationwide rights to the mark.',
      link: `https://tmsearch.uspto.gov/search/search-information?q=${query}`,
    },
    {
      check: 'Common-law and marketplace search',
      why: 'Unregistered users still have rights in the markets they operate in.',
      link: `https://www.google.com/search?q=${query}`,
    },
    {
      check: 'State business registry',
      why: 'Your formation state will reject a name that is too similar to an existing entity.',
      link: (intake && intake.stateLink) || 'https://www.google.com/search?q=secretary+of+state+business+entity+search',
    },
    {
      check: 'App store names',
      why: 'You cannot use a name that duplicates another app, and store names are locked once approved.',
      link: `https://apps.apple.com/search?term=${query}`,
    },
    {
      check: 'Social handles',
      why: 'Inconsistent handles split your audience and look abandoned.',
      link: `https://namechk.com/${analysis.slug}`,
    },
    {
      check: 'Domain availability',
      why: 'The .com is the default trust signal; a poor alternative costs you word-of-mouth traffic.',
      link: `https://www.namecheap.com/domains/registration/results/?domain=${analysis.compact}`,
    },
    {
      check: 'Screen the name in other languages',
      why: 'A name can be rude or unpronounceable in a market you plan to enter.',
      link: `https://www.google.com/search?q=%22${query}%22+meaning+translation`,
    },
  ];
}

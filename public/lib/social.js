// Social: handle strategy, per-platform bios and display names, profile and
// banner assets, a 30-day content calendar with drafted posts, and a
// link-in-bio page.
import { seedFor, compact, slugify, truncate, escapeHtml as h } from './rng.js';
import { PLATFORMS } from './presets.js';
import { buildSocialAvatar, buildSocialBanner } from './brand.js';

/** Handles that are valid for a platform's own rules. */
export function handleFor(identity, platform, variant = 0) {
  const base = compact(identity.name);
  const candidates = [
    base,
    slugify(identity.name),
    `${base}hq`,
    `${base}.co`,
    base.replace(/[aeiou]/g, '').slice(0, 14) || base,
    `${base}${new Date().getFullYear().toString().slice(2)}`,
    identity.monogram.toLowerCase() === base ? `${base}app` : identity.monogram.toLowerCase(),
  ].filter(Boolean);
  const pick = candidates[Math.min(variant, candidates.length - 1)];
  const max = platform.handleMax;
  if (pick.length <= max) return pick;
  // Too long for this platform: trim, keeping the first syllable intact.
  return pick.slice(0, max).replace(/[-._]$/, '');
}

export function validateHandle(platform, handle) {
  const pattern = new RegExp(platform.handlePattern);
  if (!pattern.test(handle)) {
    return { ok: false, reason: `${platform.name} requires handle characters matching ${platform.handlePattern}.` };
  }
  if (handle.length > platform.handleMax) {
    return { ok: false, reason: `${platform.name} allows ${platform.handleMax} characters and "${handle}" is ${handle.length}.` };
  }
  return { ok: true };
}

/**
 * Build the full handle plan. Availability is intentionally marked as
 * "unverified" here — the API layer probes what it can, and anything the
 * platform blocks is labeled so nobody believes a guess.
 */
export function handleMatrix(identity) {
  return PLATFORMS.map((platform) => {
    const handle = handleFor(identity, platform);
    const validation = validateHandle(platform, handle);
    return {
      platform: platform.key,
      name: platform.name,
      handle,
      url: platform.profileUrl(handle),
      signupUrl: platform.signupUrl,
      profileUrl: platform.profileUrl(handle),
      length: handle.length,
      maxLength: platform.handleMax,
      valid: validation.ok,
      validationNote: validation.ok ? null : validation.reason,
      automated: platform.automation,
      note: platform.notes,
      priority: priorityFor(platform.key),
    };
  });
}

function priorityFor(key) {
  const order = ['linkedin', 'x', 'github', 'producthunt', 'youtube', 'instagram', 'bluesky', 'tiktok', 'reddit', 'facebook', 'threads', 'discord'];
  const index = order.indexOf(key);
  return index === -1 ? 'later' : index <= 2 ? 'launch week' : index <= 5 ? 'first month' : 'when you have content to fill it';
}

export function bioFor(identity, platform, profile) {
  const tagline = identity.taglines[0]?.text || identity.primaryTagline;
  const outcome = profile.outcome;
  const compactBio = {
    x: `${tagline} · ${outcome}`,
    linkedin: `${identity.name} helps ${profile.buyer} get ${outcome}. ${identity.boilerplates.short} Built ${/open source/i.test(profile.label) ? 'in the open' : 'by operators'}.`,
    instagram: `${tagline}\n${outcome}\n👇 try it free`,
    facebook: `${identity.boilerplates.short} ${identity.promise}`,
    tiktok: `${tagline} 👋 ${profile.thing} made easier`,
    youtube: `${identity.boilerplates.short} Weekly walkthroughs, honest benchmarks and the occasional post-mortem.`,
    github: `${identity.boilerplates.short} Issues and PRs welcome.`,
    producthunt: `${tagline}. ${outcome}. Ask us anything in the comments.`,
    threads: `${tagline}\nbuilding ${identity.name} in public`,
    bluesky: `${tagline} · ${profile.category}`,
    reddit: `Building ${identity.name}. Here to learn, not to spam.`,
    discord: `${identity.name} community — support, roadmap and early access.`,
  }[platform.key];

  const bio = compactBio || tagline;
  return {
    text: truncate(bio, platform.bioMax),
    length: truncate(bio, platform.bioMax).length,
    max: platform.bioMax,
    truncated: bio.length > platform.bioMax,
    displayName: truncate(identity.name, platform.nameMax || 60),
  };
}

export function buildSocialKit(intake, identity, brand) {
  const profile = identity.profile;
  const rand = seedFor(intake.name, 'social');
  const handles = handleMatrix(identity);

  const profiles = handleMatrix(identity).map((entry) => {
    const platform = PLATFORMS.find((item) => item.key === entry.platform);
    const bio = bioFor(identity, platform, profile);
    const assets = {
      avatar: buildSocialAvatar(brand.chosen.variants.icon, brand.palette, platform.avatar[0] || 400),
      avatarSize: platform.avatar,
    };
    if (platform.banner[1] > 0) {
      assets.banner = buildSocialBanner(identity, brand.palette, brand.typography, platform.banner[0], platform.banner[1]);
      assets.bannerSize = platform.banner;
    }
    return {
      ...entry,
      displayName: bio.displayName,
      bio: bio.text,
      bioLength: bio.length,
      bioMax: bio.max,
      bioTruncated: bio.truncated,
      assets,
      firstPost: null,
    };
  });

  const pillars = [
    { key: 'educate', name: 'Teach the problem', ratio: '40%', why: 'Builds reach with people who have the problem but have not started looking for a fix.' },
    { key: 'prove', name: 'Show the proof', ratio: '25%', why: 'Detractors say the outcome is impossible. Proof is the answer.' },
    { key: 'product', name: 'Show the product', ratio: '15%', why: 'Short demos convert. Settings tours do not.' },
    { key: 'opinion', name: 'Take a position', ratio: '10%', why: 'Nothing spreads without a point of view, and it filters out bad-fit followers.' },
    { key: 'human', name: 'Show the humans', ratio: '10%', why: 'Founder-led accounts outperform brand accounts; people follow people.' },
  ];

  return {
    handles,
    profiles,
    pillars,
    hashtags: hashtagsFor(identity, profile),
    calendar: contentCalendar(intake, identity, profile, rand),
    bioLink: bioLinkPage(intake, identity, brand),
    setupOrder: [
      { step: 1, task: 'LinkedIn company page', why: 'Where B2B buyers check that you are real. Create it from a personal profile older than a week.' },
      { step: 2, task: 'X account', why: 'Fastest channel for founder-led reach and product announcements.' },
      { step: 3, task: 'Github organization', why: 'Even closed-source teams get credibility and free CI from an org.' },
      { step: 4, task: 'Product Hunt profile', why: 'Reserve the slug weeks before launch; it cannot be renamed later.' },
      { step: 5, task: 'YouTube channel', why: 'Own your video distribution instead of renting it from a social feed.' },
      { step: 6, task: 'Instagram / TikTok', why: 'Only if your buyer actually spends time there. Check before you commit.' },
    ],
    rules: [
      'Claim the same handle everywhere, even on platforms you will not use yet.',
      'Use the same avatar crop and the same one-line bio everywhere except where character limits force a cut.',
      'Never buy followers or engagement. It destroys the only metric that matters and is detectable.',
      'Post from a real person’s account for the first year, and amplify from the brand account.',
      'Reply to every comment for the first thousand followers. That is the whole growth strategy.',
      'Do not cross-post identical copy. Rewrite the hook for each platform’s culture.',
    ],
  };
}

function hashtagsFor(identity, profile) {
  const base = [
    `#${compact(identity.name)}`,
    `#${profile.categoryWord.replace(/[^a-z0-9]/gi, '')}`,
    '#buildinpublic',
    '#founders',
    '#startups',
  ];
  const byIndustry = {
    'b2b-saas': ['#saas', '#b2b', '#productled', '#devtools'],
    'consumer-app': ['#appstore', '#mobiledev', '#productivity'],
    fintech: ['#fintech', '#payments', '#banking'],
    health: ['#digitalhealth', '#healthtech', '#patientcare'],
    education: ['#edtech', '#learning', '#careers'],
    ecommerce: ['#dtc', '#ecommerce', '#shopify'],
    agency: ['#agency', '#design', '#marketing'],
    marketplace: ['#marketplace', '#gigeconomy'],
    'ai-tool': ['#ai', '#llm', '#devtools'],
    nonprofit: ['#nonprofit', '#socialimpact', '#volunteers'],
    'local-service': ['#smallbusiness', '#localservice'],
  }[profile.key] || ['#software', '#growth'];
  return {
    permanent: base,
    industry: byIndustry,
    note: 'Use three to five tags maximum on LinkedIn and Instagram, and one or two on X. Hashtag stuffing reduces reach.',
  };
}

const HOOKS = [
  'Nobody talks about the part of {thing} that actually costs you money.',
  '{audience}: here is the 60-second version of what took us a year to learn about {thing}.',
  'We deleted {alt} from our stack and nothing broke. Here is what happened.',
  'The most expensive sentence in {categoryWord} is “we have always done it this way”.',
  'I asked 20 people how they handle {thing}. Eleven described the same workaround, and none of them had noticed.',
  'Unpopular opinion: most {categoryWord} problems are process problems wearing an IT costume.',
  'Three screenshots that show why {thing} takes a week instead of an hour.',
  'If your {thing} needs a spreadsheet to explain it, the spreadsheet is the problem.',
  'The fastest way to fix {problem}: stop automating the part that was already fine.',
  'We shipped a boring update this week and it was the most valuable thing we have done all quarter.',
  'Getting {outcome} should not require a conference room and a consultant.',
  'What we got wrong in our first six months, with numbers.',
];

const FORMATS = [
  { key: 'text', name: 'Short text post', platformFit: ['linkedin', 'x', 'threads', 'bluesky'], length: '80–200 words' },
  { key: 'thread', name: 'Thread (4–6 posts)', platformFit: ['x', 'threads', 'bluesky'], length: 'One idea per post' },
  { key: 'carousel', name: 'Carousel or document', platformFit: ['linkedin', 'instagram'], length: '6–10 slides' },
  { key: 'demo', name: 'Screen capture clip', platformFit: ['x', 'youtube', 'tiktok', 'instagram'], length: '30–60 seconds' },
  { key: 'question', name: 'Question to the audience', platformFit: ['linkedin', 'x', 'reddit'], length: 'One sentence' },
  { key: 'case', name: 'Mini case study', platformFit: ['linkedin', 'youtube'], length: '150–300 words' },
];

function contentCalendar(intake, identity, profile, rand) {
  const slots = {
    name: identity.name,
    audience: String(intake.audience || '').trim() || profile.buyer,
    thing: profile.thing,
    categoryWord: profile.categoryWord,
    categoryPlural: profile.categoryPlural || profile.category,
    alt: profile.alt,
    problem: profile.problem,
    outcome: profile.outcome,
  };
  const fill = (template) =>
    String(template).replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (match, merge, slot) => {
      if (merge) return match;
      if (slots[slot] !== undefined) return slots[slot];
      const lower = slot.charAt(0).toLowerCase() + slot.slice(1);
      if (slots[lower] === undefined) return slot;
      const value = String(slots[lower]);
      return slot.charAt(0) === slot.charAt(0).toUpperCase() ? value.charAt(0).toUpperCase() + value.slice(1) : value;
    });
  const weekFocus = [
    'Establish the problem',
    'Show your working',
    'Invite participation',
    'Prove the outcome',
  ];

  const days = [];
  for (let day = 1; day <= 30; day += 1) {
    const pillar = rand.weighted([
      ['educate', 40],
      ['prove', 25],
      ['product', 15],
      ['opinion', 10],
      ['human', 10],
    ]);
    const format = rand.pick(FORMATS.filter((item) => item.platformFit.length >= 2));
    const platform = rand.pick(format.platformFit);
    const hook = fill(rand.pick(HOOKS));
    const body = bodyFor(pillar, format, { ...slots, hook }, rand);
    days.push({
      day,
      week: Math.ceil(day / 7.5),
      weekFocus: weekFocus[Math.min(3, Math.floor((day - 1) / 7.5))],
      platform,
      pillar,
      format: format.name,
      formatLength: format.length,
      hook,
      body,
      cta: rand.pick([
        `Free tier, no card: {{site}}`,
        'Reply with your setup and I will tell you what I would change.',
        `Link in bio if you want to try it on your own ${profile.thing}.`,
        'Ask me anything in the comments — I answer every one.',
      ]),
      hashtags: rand.sample(hashtagsFor(identity, profile).industry, 2),
    });
  }
  return {
    days,
    cadence: [
      'Post five times a week on one platform before adding a second.',
      'Batch-create on Monday, schedule the week, engage daily for 20 minutes.',
      'Repurpose the best performer of each week into a longer blog post.',
      'Review every Friday: which hook got replies, not just likes.',
    ],
    measurement: [
      { metric: 'Reply rate', why: 'Replies and DMs are intent. Likes are vanity.' },
      { metric: 'Profile-to-site click rate', why: 'Tells you whether the bio is doing its job.' },
      { metric: 'Follower quality', why: 'Track how many followers match your ICP, not how many you have.' },
      { metric: 'Signups per platform', why: 'Kill the channel that produces nothing but applause.' },
    ],
  };
}

function bodyFor(pillar, format, slots, rand) {
  const openers = {
    educate: [`Here is the short version of what we learned about ${slots.thing}:`, `Most teams get ${slots.thing} wrong in the same three ways.`],
    prove: [`We measured it. Here is the before and after.`, `Concrete numbers, from a real team, over 12 weeks.`],
    product: [`Thirty seconds of the workflow, no narration:`, `The part people ask about most:`],
    opinion: [`I will say the unpopular thing:`, `A take that costs me some leads:`],
    human: [`What this week actually looked like behind the scenes:`, `A mistake worth publishing:`],
  }[pillar];

  const middles = {
    educate: [
      `1. The workaround everyone builds first.\n2. The step that looks essential and is not.\n3. The measurement nobody sets up until it is too late.`,
      `The trap: optimizing the step that was already fast because it is the easiest one to automate.`,
    ],
    prove: [
      `Before: three people, two days a week, one spreadsheet nobody trusted.\nAfter: automated, with a weekly digest.\nThe change that mattered was not the software.`,
      `Cycle time dropped from nine days to two. We changed one handoff and defined what "done" means.`,
    ],
    product: [`Screenshot one: the input. Screenshot two: the result. Screenshot three: the audit trail that makes it defensible.`],
    opinion: [`Most ${slots.categoryWord} buyers do not need more features. They need fewer places to look.`],
    human: [`We shipped something small and unglamorous this week. It removed about an hour a day for our users, which beats any feature we announced this year.`],
  }[pillar];

  const closers = [`If this is your problem, tell me how you handle it today — I am collecting approaches.`, `Happy to share the template we use, free, no email required.`];

  return [`${rand.pick(openers)}`, `${rand.pick(middles)}`, `${rand.pick(closers)}`].join('\n\n');
}

function bioLinkPage(intake, identity, brand) {
  const links = [
    { label: `Try ${identity.name} free`, href: `https://${identity.analysis.compact}.com` },
    { label: 'Pricing', href: `https://${identity.analysis.compact}.com/pricing.html` },
    { label: 'How it works', href: `https://${identity.analysis.compact}.com/#how` },
    { label: `Written by the founder`, href: `https://${identity.analysis.compact}.com/blog/` },
    { label: 'Talk to us', href: `mailto:hello@${identity.analysis.compact}.com` },
  ];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(identity.name)} — links</title>
<meta name="description" content="${h(identity.primaryTagline)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${h(brand.typography.googleHref)}">
<style>
${brand.palette.css}
:root { --font-heading: ${brand.typography.stacks.heading}; --font-body: ${brand.typography.stacks.body}; }
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 2rem 1.25rem;
  font-family: var(--font-body); color: var(--ink); background: var(--paper);
  background-image: ${brand.palette.gradients.mesh};
}
main { width: min(460px, 100%); text-align: center; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 2rem 1.5rem; box-shadow: 0 30px 60px -40px rgba(0,0,0,.45); }
.avatar { width: 96px; height: 96px; margin: 0 auto 1rem; }
h1 { font-family: var(--font-heading); font-size: 1.35rem; margin: 0 0 .35rem; }
p { color: var(--ink-muted); margin: 0 0 1.5rem; }
ul { list-style: none; padding: 0; margin: 0; display: grid; gap: .6rem; }
a.link {
  display: block; padding: .85rem 1rem; border-radius: 12px; border: 1px solid var(--line);
  background: var(--paper); color: var(--ink); text-decoration: none; font-weight: 600; font-size: .95rem;
  transition: transform .12s ease, border-color .15s ease;
}
a.link:hover { transform: translateY(-1px); border-color: var(--brand-primary); color: var(--brand-primary-text); }
a.link.primary { background: var(--brand-primary); color: var(--on-primary); border-color: transparent; }
footer { margin-top: 1.5rem; font-size: .8rem; color: var(--ink-subtle); }
</style>
</head>
<body>
<main>
  <div class="card">
    <div class="avatar">${brand.chosen.variants.icon}</div>
    <h1>${h(identity.name)}</h1>
    <p>${h(identity.primaryTagline)}</p>
    <ul>
${links.map((link, index) => `      <li><a class="link${index === 0 ? ' primary' : ''}" href="${h(link.href)}">${h(link.label)}</a></li>`).join('\n')}
    </ul>
  </div>
  <footer>${h(identity.boilerplates.short)}</footer>
</main>
</body>
</html>
`;
}

/** Request payload for the availability probe. */
export function handleProbeRequests(matrix, limit = 6) {
  const checkable = matrix.filter((entry) => entry.automated === 'checkable' && entry.valid).slice(0, limit);
  return checkable.map((entry) => ({ platform: entry.platform, handle: entry.handle, url: entry.profileUrl }));
}

export const SOCIAL_ASSET_SPECS = PLATFORMS.map((platform) => ({
  platform: platform.name,
  avatar: `${platform.avatar[0]}×${platform.avatar[0]}px`,
  banner: platform.banner[1] ? `${platform.banner[0]}×${platform.banner[1]}px` : '—',
  bioLimit: platform.bioMax,
  handleLimit: platform.handleMax,
}));

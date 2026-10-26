// Marketing: positioning, ICP, pricing, channel plan, a 12-week go-to-market
// calendar, launch-day runbook, launch copy, outbound sequences and SEO.
//
// Every section is a function of the industry profile, never of a generic
// template: the channel plan, the price bands, the objections and the market
// research all come from `identity.profile` and `MARKET_RESEARCH`, so a fintech
// and a local service business do not receive the same advice with different
// nouns substituted.
import { seedFor, unique, truncate, withArticles } from './rng.js';
import { MARKET_RESEARCH } from './presets.js';

function resolveSlot(key, slots) {
  if (slots[key] !== undefined) return String(slots[key]);
  const lower = key.charAt(0).toLowerCase() + key.slice(1);
  if (slots[lower] !== undefined) {
    const value = String(slots[lower]);
    return key.charAt(0) === key.charAt(0).toUpperCase() ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  }
  return null;
}

// Fills {slots} while leaving {{merge_fields}} intact for the email provider.
// Every slot-phrase in this module goes through here, so it is also the one place
// that has to repair a/an agreement: templates read "a {category}", which becomes
// "a AI platform" the moment the category starts with a vowel.
function fill(template, slots) {
  const text = String(template).replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (match, merge, slot) => {
    if (merge) return match;
    return resolveSlot(slot, slots) ?? slot;
  });
  return withArticles(text);
}

function slotsFor(identity, profile, intake) {
  return {
    name: identity.name,
    legalName: identity.legalName,
    category: profile.category,
    categoryWord: profile.categoryWord,
    categoryPlural: profile.categoryPlural || profile.category,
    thing: profile.thing,
    audience: String(intake.audience || '').trim() || profile.buyer,
    buyer: profile.buyer,
    alt: profile.alt,
    problem: profile.problem,
    outcome: profile.outcome,
    tagline: identity.primaryTagline,
    founder: intake.founder || 'the founder',
    model: profile.pricingModel,
  };
}

function pricePoints(profile, rand) {
  const presets = {
    'per-seat subscription with a usage-based tier': [29, 99, 399],
    'freemium with an annual subscription': [0, 9, 29],
    'monthly retainer or fixed-scope sprints': [2500, 6500, 15000],
    'direct-to-consumer with bundle discounts and a subscription refill': [0, 39, 89],
    'interchange or per-transaction fee with a platform fee': [0, 499, 1999],
    'membership plus insurance-billable visits': [0, 49, 149],
    'per-cohort tuition with income-share or employer sponsorship': [0, 1490, 3900],
    'take rate on transactions plus a subscription for supply': [0, 99, 499],
    'usage-based with a generous developer tier': [0, 49, 299],
    memberships: [0, 15, 75],
    'flat-rate jobs plus a maintenance plan': [0, 149, 399],
  };
  const base = presets[profile.pricingModel] || [0, 49, 199];
  return base.map((value, index) => {
    if (value === 0) return 0;
    const jitter = index === 1 ? rand.range(0.9, 1.1) : rand.range(0.95, 1.05);
    const rounded = Math.round((value * jitter) / 5) * 5;
    return rounded;
  });
}

/**
 * Market research for this industry, turned into something a founder can act on.
 *
 * Deliberately built from shapes and sources rather than named competitors and
 * invented figures: `competitorShapes` stays true as the market churns, and every
 * benchmark carries the source you must verify it against. Anything a generator
 * asserts about your market without evidence is worse than saying nothing.
 */
function buildResearch(identity, intake, rand) {
  const profile = identity.profile;
  const research = MARKET_RESEARCH[profile.key] || MARKET_RESEARCH['b2b-saas'];
  const audience = String(intake.audience || '').trim() || profile.buyer;
  const start = rand.pick(research.buyerTriggers);

  return {
    industry: profile.label,
    analystCategory: research.analystCategory,
    // The one-sentence version of what market this is, so the rest of the
    // document has a defined subject.
    definition: `${identity.name} competes in ${research.analystCategory}, selling to ${audience}.`,
    howItIsBought: {
      firstRealTrigger: start,
      triggers: research.buyerTriggers,
      note: 'A trigger is what turns a passive audience into a buying one. Sell to the trigger, not to the demographic.',
    },
    competitorShapes: research.competitorShapes.map((entry) => ({
      shape: entry.shape,
      whatTheyWinOn: entry.wins,
      whereTheyLose: entry.loses,
      // Answering "why you" is the whole job of positioning, so each shape gets
      // the counter you would use rather than leaving the reader to invent one.
      counter: `Against ${entry.shape.toLowerCase()}: own ${entry.loses.split(',')[0].replace(/^ /, '')} in public, with evidence.`,
    })),
    competitorNote:
      'These are the shapes of competitor you will meet, not a fixed list of names: the named market changes every quarter and a generated list goes stale the day it ships. Find the names that match each shape in the sources below.',
    demandSignals: research.demandSignals,
    demandNote: 'Demand must be measurable before it is investable. These are the readings that tell you a market exists rather than a story about one.',
    whereToReadItYourself: research.sources,
    planningBenchmarks: research.benchmarks,
    benchmarkNote:
      'Planning ranges, not facts about your company. Each one carries the source you must verify it against before you price, hire or spend against it.',
    objections: research.objections,
    beachhead: {
      wedge: research.wedge,
      whyNow: `Start with ${research.wedge}. ${audience} will recognise the problem in one sentence, which is the only way a first market compounds.`,
      expansion: research.expansion,
    },
    // The reading list is short on purpose: five sources you will actually open
    // beats thirty you will bookmark.
    firstWeek: [
      `Read the ${research.sources[0].name} pages on the three closest competitors and copy their customers\u2019 exact words into a file.`,
      `Search ${profile.keywords[0]} on the two biggest platforms in ${research.sources[0].where.split(',')[0]} and record what is already being sold at what price.`,
      `Write down the ${research.buyerTriggers.length} triggers above and mark which ones you have actually seen or heard this month.`,
      `Pick the one demand signal you can measure without spending money, and measure it for a week before building anything new.`,
    ],
  };
}

export function buildMarketing(intake, identity, brand) {
  const rand = seedFor(intake.name, 'marketing');
  const profile = identity.profile;
  const slots = slotsFor(identity, profile, intake);
  const [free, mid, high] = pricePoints(profile, rand);
  const priceFormat = (value) => (value === 0 ? 'Free' : `$${value.toLocaleString('en-US')}`);
  const period = [free, mid, high][2] > 1000 ? '/mo' : '/mo';

  const tiers = [
    {
      key: 'entry',
      name: free === 0 ? 'Starter' : 'Solo',
      price: priceFormat(free),
      billing: free === 0 ? 'Free forever' : 'per month, billed annually',
      tagline: free === 0 ? 'Prove it works before you pay anything.' : 'For one person with one problem to solve.',
      features: [
        free === 0 ? '1 active project' : '1 seat',
        'Core workflow',
        `${profile.proof[0] || 'Standard support'}`,
        'Community support',
      ],
      limits: 'Designed to be genuinely useful, not a 14-day tease — it is your best acquisition channel.',
      cta: free === 0 ? 'Start free' : 'Start now',
      // The recommended tier is always the middle one; a highlighted entry tier
      // pulls buyers toward the cheapest plan and hurts expansion revenue.
      highlighted: false,
    },
    {
      key: 'core',
      name: 'Team',
      price: priceFormat(mid),
      billing: `${period}, billed annually`,
      tagline: 'Where most customers should land.',
      features: [
        'Up to 10 seats',
        `${profile.proof[1] || 'Priority support'}`,
        'Integrations and API access',
        'Role-based permissions',
        'Onboarding session',
      ],
      limits: 'Price this against the cost of the problem, never against a competitor’s price list.',
      cta: 'Start 14-day trial',
      highlighted: true,
    },
    {
      key: 'scale',
      name: high > 1000 ? 'Custom' : 'Business',
      price: priceFormat(high),
      billing: high > 1000 ? 'annual agreement' : `${period}, billed annually`,
      tagline: 'For buyers with procurement, security reviews and a real budget.',
      features: [
        `${profile.proof[0] || 'SSO'}`,
        'SLA and uptime commitment',
        'Named account team',
        'Security review support',
        'Custom terms and invoicing',
      ],
      limits: 'Expect two to six weeks of sales cycle. Do not discount; reduce scope instead.',
      cta: 'Talk to us',
      highlighted: false,
    },
  ];

  const channels = [
    { channel: 'Founder-led content', why: `Cheapest distribution that compounds. Your ${profile.category} is new, so the founder is the story.`, effort: 'High', impact: 'High', firstStep: `Publish one teardown a week of how ${slots.audience} handle ${slots.problem}.`, metric: 'Qualified site sessions per week' },
    { channel: 'Search and comparison pages', why: 'Captures people already looking for a fix, and keeps working after you stop writing.', effort: 'Medium', impact: 'High', firstStep: 'Publish the three pillar pages plus a comparison against your top three alternatives.', metric: 'Non-branded organic sessions' },
    { channel: 'Product-led free tier', why: 'Lets buyers experience the outcome before talking to sales.', effort: 'Medium', impact: 'High', firstStep: 'Remove the credit card wall for the entry tier and instrument activation.', metric: 'Activation rate (first value within 7 days)' },
    { channel: 'Partnerships and integrations', why: 'Borrows trust from tools your buyers already run.', effort: 'Medium', impact: 'Medium', firstStep: `Ship one integration with ${profile.integrations[0]} and co-announce it.`, metric: 'Referral signups' },
    { channel: 'Communities and forums', why: 'Where your buyers complain in public — the highest-intent listening post you have.', effort: 'Low', impact: 'Medium', firstStep: 'Answer ten questions a week without linking your product.', metric: 'Mentions and DM requests' },
    { channel: 'Paid acquisition', why: 'Only once you know the unit economics; paid amplifies a working funnel and bankrupts a broken one.', effort: 'Medium', impact: 'Conditional', firstStep: 'Spend $50/day on the single best-performing organic message for 14 days.', metric: 'CAC payback under 12 months' },
    { channel: 'Outbound (email + calls)', why: 'Works when the buyer list is small, expensive and identifiable.', effort: 'High', impact: 'Medium', firstStep: 'Build a 200-account list and send a teardown, not a pitch.', metric: 'Meetings booked per 100 sends' },
    { channel: 'Launch platforms (Product Hunt, HN, directories)', why: 'A one-day spike that becomes permanent validation and a backlink.', effort: 'Low', impact: 'Medium', firstStep: 'Reserve your listing and line up 20 people who will genuinely try it.', metric: 'Upvotes, signups, and retained users 30 days later' },
  ];

  const weeks = [
    { week: 1, focus: 'Foundations', deliverables: ['Brand kit and website live', 'Domain, email and DNS authenticated', 'Analytics and event tracking installed', 'Define activation metric'] },
    { week: 2, focus: 'Narrative', deliverables: ['Positioning and pricing decided', 'Three pillar pages drafted', 'First founder post published', '10 customer conversations booked'] },
    { week: 3, focus: 'Proof', deliverables: ['Run 10 problem interviews', 'Write up two findings publicly', 'Publish comparison page', 'Set up waitlist + double opt-in'] },
    { week: 4, focus: 'Private beta', deliverables: ['Invite 20 design partners', 'Instrument onboarding to first value', 'Weekly release notes cadence started', '3 testimonials captured'] },
    { week: 5, focus: 'Funnel', deliverables: ['Rewrite hero from interview language', 'Add pricing page with annual toggle', 'Ship contact + demo flow', 'Publish first case study'] },
    { week: 6, focus: 'Distribution', deliverables: ['Ship the first integration', 'List on 5 relevant directories', 'Start a weekly newsletter', 'Test one paid channel at $50/day'] },
    { week: 7, focus: 'Conversion', deliverables: ['A/B the primary CTA', 'Add exit-intent or in-app upgrade prompt', 'Fix the top three drop-off steps', 'Introduce annual pricing incentive'] },
    { week: 8, focus: 'Retention', deliverables: ['Set up lifecycle emails (day 1/3/7/14)', 'Publish a getting-started guide', 'Measure week-4 retention by cohort', 'Interview 5 churned users'] },
    { week: 9, focus: 'Launch prep', deliverables: ['Write launch copy and press release', 'Prepare 20 launch-day supporters', 'Record a 60-second demo', 'Stress-test the signup path'] },
    { week: 10, focus: 'Launch', deliverables: ['Publish on Product Hunt and HN', 'Email the list with a specific ask', 'Reply to every comment within an hour', 'Publish a behind-the-scenes post-mortem'] },
    { week: 11, focus: 'Capitalise', deliverables: ['Convert launch traffic with a follow-up sequence', 'Publish the launch numbers publicly', 'Ship the top requested feature', 'Approach 3 podcast hosts'] },
    { week: 12, focus: 'Compounding', deliverables: ['Double down on the best channel', 'Cut the two worst channels', 'Set next-quarter targets', 'Write an investor or board update'] },
  ];

  const launchCopy = {
    productHunt: {
      tagline: truncate(fill('{name} — {outcome}', slots), 60),
      description: fill(
        'Hey Product Hunt 👋 We built {name} because {problem}.\n\n{name} is {a_category} for {audience}. You get {outcome} — no consultants, no six-week onboarding.\n\nWhat makes it different:\n• {proof1}\n• {proof2}\n• {proof3}\n\nWe are a small team and we will be in the comments all day. Ask us anything — including the awkward questions about pricing and data.',
        { ...slots, a_category: slots.category, proof1: profile.proof[0], proof2: profile.proof[1], proof3: profile.proof[2] },
      ),
      firstComment: fill(
        'Founder here. The honest version: we started {name} after watching {audience} burn days on {problem}. We spent the first three months shipping the boring parts — {proof1} — because that is what actually gets adopted.\n\nFree tier is real and not time-limited. If it does not save you time in a week, tell me why in the comments and I will refund you either way.',
        { ...slots, proof1: (profile.proof[0] || '').toLowerCase() },
      ),
      checklist: [
        'Reserve the product page two weeks ahead; names are first-come.',
        'Upload a 60-second silent-screen-capture demo — it outperforms narration.',
        'Line up 20 real users to try it, not upvote for you. Coordinated voting is detectable and penalized.',
        'Block 9am–6pm Pacific for comments; the first three hours decide your ranking.',
        'Have a status page and a support address ready before the traffic arrives.',
      ],
    },
    hackerNews: {
      title: `Show HN: ${identity.name} – ${truncate(profile.outcome, 60)}`,
      body: fill(
        'Hi HN — I built {name} because {problem}.\n\nIt is {a_category} for {audience}. {proof1}, and you can try it without a card.\n\nTechnical notes people usually ask about:\n• Stack and hosting decisions, and why.\n• What I would rebuild if I started today.\n• The parts that are still ugly.\n\nHappy to answer anything, including what does not work yet.',
        { ...slots, proof1: profile.proof[0], a_category: slots.category },
      ),
      rules: [
        'Post Tuesday–Thursday, 8–10am Eastern.',
        'Never ask for upvotes — it gets the post penalized.',
        'Answer the harshest technical criticism first and concede what is true.',
        'Do not edit the title after posting.',
      ],
    },
    x: {
      thread: [
        fill('We are launching {name} today.\n\n{problem}\n\nHere is what we built instead 🧵', slots),
        fill('{name} is {a_category} for {audience}.\n\nOutcome: {outcome}.', { ...slots, a_category: slots.category }),
        `Why now: the tooling finally exists to do this properly, and buyers have stopped accepting workarounds.`,
        fill('What we are NOT:\n• {alt}\n• a feature of someone else’s platform\n• a 12-month implementation project', slots),
        fill('We are giving away the entry tier permanently. If it does not earn its place in a week, cancel and tell me why.', slots),
        'Ask me anything in the replies. I will answer every one today.',
      ],
    },
    linkedin: {
      post: fill(
        'I quit solving {problem} the hard way this year.\n\nMy co-founders and I kept meeting {audience} with the same story: they know the fix, but the tools force {alt} on them.\n\nSo we built {name}: {tagline}.\n\nWe are opening it up today.\n\nIf you are one of the {audience} I described, I would like to send you access personally — comment or DM.\n\n#startup #{categoryhash} #buildinpublic',
        { ...slots, categoryhash: slots.categoryWord.replace(/[^a-z]/gi, '') },
      ),
    },
    reddit: {
      subreddits: unique([profile.label, 'startups', 'SaaS', 'Entrepreneur', 'smallbusiness']).slice(0, 3),
      template: fill(
        'Title: I spent a year on {problem} — here is everything we learned (and the tool we built)\n\nBody: Long post. No pitch in the first half.\n\n1) The three things that actually cause {problem}.\n2) What we tried that failed, with numbers.\n3) What worked.\n4) If you want the template we used, it is free, no email required.\n\nHappy to answer questions in the comments all day.',
        slots,
      ),
      warning: 'Lead with the free help. Subreddits remove posts that read as ads, and bans are permanent and tied to your account.',
    },
    emailAnnouncement: {
      subject: fill('{name} is live', slots),
      body: fill(
        'Hi {{first_name}},\n\nYou asked to hear when {name} was ready. It is.\n\n{tagline}\n\nWhat it does: {outcome}, for {audience}.\n\n👉 {{cta_url}}\n\nOne favor: hit reply and tell me the one thing that would make this obviously worth paying for. I read every reply.\n\n— {founder}',
        slots,
      ),
      rules: ['Send to a warmed list before the launch post, not after.', 'One link, one ask.', 'Segment engaged subscribers for a second follow-up 72 hours later.'],
    },
  };

  const coldEmail = {
    rules: [
      'Two sentences of research before you write the first line.',
      'Never open with "I hope this finds you well". Open with their problem, not your product.',
      'One ask per email. Ask for a reaction, not a meeting.',
      'Under 90 words. If it does not fit on a phone screen, it will not be read.',
      'Send from your personal address, never a no-reply or a marketing domain.',
      'Stop after four touches. Nobody changes their mind on touch nine.',
    ],
    sequence: [
      {
        day: 1,
        subject: fill('{name} — a quick observation about {categoryWord}', slots),
        body: fill('Hi {{first_name}},\n\nI noticed {{specific_trigger}} — which usually means {{inferred_problem}}.\n\nWe built {name} so you get {outcome}, without the {alt} overhead.\n\nWorth a look? I will send a two-minute teardown of your setup, no pitch.\n\n— {founder}', slots),
      },
      {
        day: 4,
        subject: 'Re: the teardown',
        body: fill('Hi {{first_name}},\n\nHere is the teardown I mentioned — three things I would change first, and the one I would leave alone.\n\nNo strings. If it is useful, reply and I will show you how {name} does it in about ten minutes.', slots),
      },
      {
        day: 9,
        subject: fill('{audience} at {{company}} — one number', slots),
        body: fill('Hi {{first_name}},\n\nQuick one: teams like yours usually lose about {{hours}} hours a week to {problem}. At {{rate}} that is {{cost}} a year.\n\nThat is the number we exist to delete. Want the worksheet we use to calculate it?', slots),
      },
      {
        day: 16,
        subject: 'Closing the loop',
        body: fill('Hi {{first_name}},\n\nNot the right time, or not the right problem — either is a fine answer. I will stop here so your inbox stays clean.\n\nIf it becomes a priority, everything is at {{site}} and there is a free tier.', slots),
      },
    ],
  };

  const ads = {
    angles: [
      { angle: 'Time saved', headline: fill('{outcome}', slots), primaryText: fill('Stop losing {{hours}} hours a week to {problem}. {name} does it in the background.', slots), cta: 'Start free' },
      { angle: 'Cost of the status quo', headline: 'The real cost of doing nothing', primaryText: fill('{alt} looks free until you count the hours. {name} pays for itself in a month.', slots), cta: 'See the maths' },
      {
        angle: 'Social proof',
        headline: fill('Why {audience} switched', slots),
        primaryText: fill('{proof1} and {proof2}. See how teams like yours run on {name}.', {
          ...slots,
          proof1: profile.proof[0],
          proof2: profile.proof[1],
        }),
        cta: 'Read the case study',
      },
      { angle: 'Risk reversal', headline: 'Free, and not for 14 days', primaryText: fill('The entry tier is free permanently. If {name} does not earn its place, cancel and tell us why.', slots), cta: 'Try it now' },
      { angle: 'Contrarian', headline: fill('You do not need {alt}', slots), primaryText: fill('Everyone is selling you more software. {name} is the one you turn off once a week because it already did the work.', slots), cta: 'Find out how' },
    ],
    testing: [
      'Test one variable at a time: headline, then creative, then audience.',
      'Budget at least 50 conversions per variant before calling a winner.',
      'Track to the activation event, not the click or the signup.',
      'Refresh creative every three weeks — fatigue looks like a targeting problem but rarely is.',
    ],
  };

  const seo = {
    pillars: [
      {
        title: fill('The complete guide to {categoryPlural} for {audience}', slots),
        intent: 'Informational',
        keywords: unique([...profile.keywords, `best ${slots.categoryWord}`, `${slots.categoryWord} for ${slots.buyer}`]).slice(0, 6),
        outline: ['What the problem actually costs', 'The four approaches people try', 'How to choose, with a decision table', 'Implementation checklist', 'Common mistakes', 'Tools and templates'],
      },
      {
        title: fill('{name} vs {alt}: an honest comparison', slots),
        intent: 'Commercial',
        keywords: [`${slots.categoryWord} comparison`, `alternatives to ${slots.alt}`, `${slots.categoryWord} pricing`],
        outline: ['Who each option is for', 'Feature comparison table', 'Pricing comparison with real scenarios', 'Migration path', 'Where the alternative wins'],
      },
      {
        title: fill('How {audience} get to {outcome} in 90 days', slots),
        intent: 'Commercial',
        keywords: [`how to ${slots.outcome}`, `${slots.categoryWord} implementation`, `${slots.categoryWord} roi`],
        outline: ['The 90-day plan week by week', 'What to measure at each stage', 'Templates you can copy', 'Case study with numbers'],
      },
    ],
    quickWins: [
      'Claim and complete your Google Business Profile — it is free real estate even for software.',
      'Write a 40-word meta description that names the audience and the outcome.',
      'Add FAQ schema to your pricing page; it wins the "people also ask" box.',
      'Publish one page per integration partner — these convert far above blog posts.',
      'Get listed in the directories your buyers actually use, and keep the NAP details identical.',
      'Fix your LCP under 2.5s before investing in content; speed is the cheapest ranking factor.',
    ],
  };

  const pressRelease = {
    headline: fill('{name} launches to help {audience} get {outcome}', slots),
    dateline: `${intake.city || 'Remote'} — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
    body: [
      fill('{name}, a {category} for {audience}, today announced the general availability of its platform. The company was founded to address a persistent problem: {problem}.', slots),
      fill('{name} gives {audience} {outcome}, replacing {alt} with a single system that works from day one.', slots),
      fill('“We kept meeting {audience} who had accepted {problem} as normal,” said {founder}, founder of {name}. “It is not normal, it is expensive. We built the thing we wished existed.”', slots),
      fill('{name} is available today, with a free entry tier and paid plans starting at {mid}/month.', { ...slots, mid: priceFormat(mid) }),
    ],
    boilerplate: identity.boilerplates.medium,
    contact: 'Press enquiries: press@<your-domain> — interviews available on request.',
    formatRules: [
      'Lead with the news, not the company history.',
      'Quote a human, not a marketing line.',
      'Include one number a journalist can verify.',
      'Keep it under 400 words and send it before 10am in the reporter’s timezone.',
    ],
  };

  const investorOnePager = {
    sections: [
      { heading: 'Company', body: fill('{name} — {category} for {audience}.', slots) },
      { heading: 'Problem', body: fill('{problem}. The cost is hidden but real: hours, errors and stalled decisions.', slots) },
      { heading: 'Solution', body: fill('{name} delivers {outcome}, sold as {model}.', slots) },
      { heading: 'Why now', body: 'Buyer expectations have changed and the infrastructure to build this cheaply only recently existed.' },
      { heading: 'Market', body: 'Size it bottom-up: (number of buyers) × (annual contract value). Do not quote analyst TAMs — investors discount them.' },
      { heading: 'Traction', body: 'List the four numbers that matter: revenue, growth rate, retention and pipeline. Be specific and dated.' },
      { heading: 'Business model', body: `${profile.pricingModel.charAt(0).toUpperCase()}${profile.pricingModel.slice(1)}. Gross margin: state it.` },
      { heading: 'Go to market', body: channels.slice(0, 2).map((channel) => channel.channel).join(' plus ') + '.' },
      { heading: 'Competition', body: fill('{alt} on one side, doing nothing on the other. We win on {tagline}.', slots) },
      { heading: 'Team', body: `${intake.founder || '[Founder]'}, plus the two hires that unlock the next stage.` },
      { heading: 'The ask', body: 'Amount, use of funds in three buckets, and the milestone it buys. Name the milestone, not the runway.' },
    ],
    rules: [
      'One page means one page. Attach the deck, do not inline it.',
      'Every claim needs a source or a date.',
      'Never state a projection without the assumption behind it.',
    ],
  };

  const pitchDeck = {
    slides: [
      { n: 1, title: 'Title', say: fill('{name} — {tagline}. One line, the amount you are raising, and your name.', slots) },
      { n: 2, title: 'The problem', say: 'Told through one named customer and one specific number. No industry charts here.' },
      { n: 3, title: 'Why now', say: 'What changed in the last 24 months that makes this possible today and impossible three years ago.' },
      { n: 4, title: 'The product', say: 'Three screenshots, one sentence each. Show the moment of value, not the settings page.' },
      { n: 5, title: 'Traction', say: 'One chart, up and to the right, with a clear label. If growth is uneven, explain the step change.' },
      { n: 6, title: 'Business model', say: 'Price, motion, gross margin, and the path from one customer to $1M.' },
      { n: 7, title: 'Market', say: 'Bottom-up sizing with your assumptions visible on the slide.' },
      { n: 8, title: 'Go to market', say: 'The two channels that work and the metric that proves it.' },
      { n: 9, title: 'Competition', say: 'A 2x2 or a table. Be generous about competitors, then show the axis you own.' },
      { n: 10, title: 'Team', say: 'Why this team, with one credential each that is not a job title.' },
      { n: 11, title: 'Financials', say: 'Actuals plus 18 months of forecast. State the assumptions in the notes.' },
      { n: 12, title: 'The ask', say: 'Amount, milestone it buys, and the next-round milestones. Then stop talking.' },
    ],
    rules: ['Under 12 words per slide.', 'One idea per slide, one chart per idea.', 'Rehearse to 90 seconds per slide, then cut to 11 minutes total.'],
  };

  const metrics = {
    northStar: 'Weekly active accounts that reach the first value moment (activation), not signups.',
    supporting: [
      { metric: 'Activation rate', target: '40% within 7 days', why: 'Predicts retention better than any top-of-funnel number.' },
      { metric: 'Week-4 retention', target: '60% of activated accounts', why: 'Below this, every marketing dollar is being poured into a leaky bucket.' },
      { metric: 'CAC payback', target: 'Under 12 months', why: 'Keeps you fundable and forces pricing discipline.' },
      { metric: 'Qualified pipeline', target: '20% of trials', why: 'The honest measure of whether the positioning works.' },
    ],
    guardrails: ['Support first-response time under 4 business hours', 'Gross margin above 70%', 'Zero customer-visible security incidents', 'Net revenue retention above 100%'],
    cadence: ['Friday: one-page weekly update to the team and investors, shipped, learned, blocked.', 'Monthly: cohort retention review.', 'Quarterly: pricing and positioning review with three customer interviews.'],
  };

  const budget = {
    lean: [
      { item: 'Domain + email (2 seats)', cost: '$15–30/mo', note: 'Non-negotiable. Do this before anything else.' },
      { item: 'Hosting and database', cost: '$0–25/mo', note: 'Free tiers carry a pre-revenue company comfortably.' },
      { item: 'Design and brand', cost: '$0', note: 'Use the kit this platform generated.' },
      { item: 'Legal (formation + founder docs)', cost: '$500–2,500 one-off', note: 'Higher if you have co-founders or raise immediately.' },
      { item: 'Tools and analytics', cost: '$0–50/mo', note: 'Pick ones you will still use at $1M ARR.' },
    ],
    growth: [
      { item: 'Paid acquisition test', cost: '$1,500/mo', note: 'Only after activation and retention are measured.' },
      { item: 'Content or designer retainer', cost: '$2,000–6,000/mo', note: 'Buys back founder hours for sales and hiring.' },
      { item: 'Events and sponsorships', cost: '$5,000+ per event', note: 'Highest cost per lead unless your buyers are all in one room.' },
      { item: 'Contractor sales support', cost: '$3,000–8,000/mo', note: 'Only if a repeatable sales motion already exists.' },
    ],
  };

  return {
    slots,
    research: buildResearch(identity, intake, rand),
    icp: {
      primary: {
        who: slots.audience,
        trigger: `They just hit a scaling wall with ${profile.thing} and the workaround stopped working.`,
        pains: [profile.problem, 'The workaround costs more every month it survives', 'No one owns the outcome end to end'],
        objections: ['“We can build this ourselves”', '“Our current process is good enough”', '“We do not have budget this quarter”', '“Security will never approve”'],
        whereToFindThem: unique([...profile.channels.slice(0, 3), 'LinkedIn search on job titles, not companies', 'Industry Slack and Discord communities']).slice(0, 5),
        disqualifiers: ['Under 5 people with no dedicated owner', 'Cannot adopt new software this year', 'Wants a bespoke build, not a product'],
      },
      secondary: {
        who: `Adjacent teams inside the same accounts — ${profile.buyer.split(' and ')[0]}.`,
        trigger: 'Already bought the primary product and now needs it to work across the org.',
        pains: ['Duplicate tooling and inconsistent data', 'Procurement wants one vendor, not five'],
        objections: ['“We would rather consolidate on what we have”'],
        whereToFindThem: ['Existing customer accounts', 'Integration partner directories'],
        disqualifiers: ['Buying cycles over 9 months'],
      },
    },
    messaging: {
      house: [
        { layer: 'Category', statement: `${identity.name} is ${profile.category} for ${slots.audience}.` },
        { layer: 'Problem', statement: profile.problem.charAt(0).toUpperCase() + profile.problem.slice(1) + '.' },
        { layer: 'Outcome', statement: `The result: ${profile.outcome}.` },
        { layer: 'Proof', statement: profile.proof.join(' · ') },
        { layer: 'Differentiation', statement: `Unlike ${profile.alt}, we do this without the overhead.` },
        { layer: 'Only-we', statement: identity.promise },
      ],
      valueProps: [
        { headline: 'Start in minutes, not quarters', support: 'No implementation partner, no data migration project, no six-week onboarding.' },
        { headline: fill('Built for {audience}', slots), support: `Every default reflects how ${slots.audience} actually work, including the awkward edge cases.` },
        { headline: 'Proof, not promises', support: profile.proof.join(' · ') },
        { headline: 'Priced so you can say yes', support: `Entry tier is free and stays free. Paid plans start at ${priceFormat(mid)}${period}.` },
      ],
    },
    pricing: {
      model: profile.pricingModel,
      currency: 'USD',
      // The raw monthly prices behind the formatted tiers. The business plan's
      // financial model is built from these, so the projection and the pricing
      // page can never quote different numbers.
      points: [free, mid, high],
      tiers,
      rationale: [
        'Three tiers. A fourth always creates a support burden and a decision nobody makes.',
        'Anchor the top tier deliberately high so the middle tier reads as reasonable.',
        'Give away the entry tier permanently — a trial that expires teaches nothing.',
        'Raise prices when you hit 85% conversion on demos, not when you feel braver.',
        'Never discount without removing scope; a discount tells every future buyer the list price is fiction.',
      ],
      notes: [
        'Annual billing should save the customer roughly two months and give you cash up front.',
        'Publish pricing. “Contact sales” only on the top tier.',
        'State what happens when someone exceeds their limits — overage, or a polite block.',
      ],
    },
    channels,
    gtm: { calendar: weeks, phaseNote: 'Weeks 1–4 build the asset, 5–8 build the funnel, 9–12 spend the attention you earned.' },
    launch: {
      runbook: [
        { t: 'T-14', task: 'Reserve your Product Hunt listing and lock the name and tagline.' },
        { t: 'T-14', task: 'List 20 humans who will genuinely try it and tell them the date.' },
        { t: 'T-10', task: 'Freeze feature scope. Only bug fixes from here.' },
        { t: 'T-7', task: 'Record the 60-second demo. Silent, captioned, 1080p.' },
        { t: 'T-5', task: 'Send a pre-announcement to your list: “we launch on Tuesday, here is what to expect”.' },
        { t: 'T-3', task: 'Load-test signup with 20x expected traffic. Fix the slowest step.' },
        { t: 'T-1', task: 'Write the launch-day replies in advance: pricing, security, roadmap, “isn’t this just X?”.' },
        { t: 'T-1', task: 'Sleep. The launch is a two-day sport.' },
        { t: 'Launch, 00:01 PT', task: 'Publish Product Hunt, then the HN post, then X, then LinkedIn, one hour apart.' },
        { t: 'Launch, 9:00–18:00 PT', task: 'Reply to every comment within one hour. Ignore analytics until tomorrow.' },
        { t: 'T+1', task: 'Email everyone who signed up with the single most valuable thing you know.' },
        { t: 'T+3', task: 'Publish the numbers, including what underperformed.' },
        { t: 'T+7', task: 'Interview five new users; ship the fix for the most common complaint.' },
      ],
      distribution: ['Product Hunt', 'Hacker News (Show HN)', 'X and LinkedIn', 'Reddit communities', 'Indie hacker and niche newsletters', 'Relevant Slack and Discord communities', 'Podcast pitch (5 shows)', 'Directory listings'],
    },
    launchCopy,
    coldEmail,
    ads,
    seo,
    pressRelease,
    investorOnePager,
    pitchDeck,
    metrics,
    budget,
    checklist: [
      'Positioning sentence agreed and written down in one place.',
      'Pricing published with an annual option.',
      'Analytics installed and the activation event defined before launch.',
      'Email list with double opt-in and a welcome sequence.',
      '20 supporters briefed with the exact date and link.',
      'Support inbox monitored with a stated response target.',
      'Status page live before you need it.',
      'One-page investor update template ready for Friday.',
    ],
  };
}

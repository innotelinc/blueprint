// Export: assembles every generated artifact into one download-ready bundle,
// plus the CSV and Markdown files that make the output usable outside the app.
import { createZip, humanBytes } from './zip.js';

function csv(rows) {
  return `${rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell === undefined || cell === null ? '' : String(cell);
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(','),
    )
    .join('\n')}\n`;
}

function table(headers, rows) {
  return [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export function brandGuidelines(ctx) {
  const { identity, brand } = ctx;
  return `# ${identity.name} — brand guidelines

> ${identity.primaryTagline}

**Archetype:** ${identity.archetype.name} — leads with ${identity.archetype.promise.toLowerCase()}
**Tone:** ${identity.tone.label} (energy ${Math.round((identity.tone.energy ?? 0.5) * 100)}/100, formality ${Math.round((identity.tone.formality ?? 0.5) * 100)}/100)

## The mark

We generated ${brand.concepts.length} directions. Use **${brand.chosen.name}** as the primary logo.

${brand.concepts
  .map(
    (concept, index) => `### ${index + 1}. ${concept.name} (${concept.kind})
${concept.idea}

*Best for:* ${concept.bestFor}
Files: logo-icon.svg, logo-horizontal.svg, logo-stacked.svg, logo-monochrome.svg`,
  )
  .join('\n\n')}

## Color

| Swatch | Hex | Role | Usage |
| --- | --- | --- | --- |
${brand.palette.swatches.map((swatch) => `| ${swatch.name} | \`${swatch.hex}\` | ${swatch.role} | ${swatch.usage} |`).join('\n')}

Harmony: **${brand.palette.harmony}** · base hue ${brand.palette.baseHue}°

Gradients:
${Object.entries(brand.palette.gradients)
  .map(([name, value]) => `- \`${name}\`: \`${value}\``)
  .join('\n')}

### Contrast audit (WCAG 2.1)

| Pair | Ratio | Grade |
| --- | --- | --- |
${brand.palette.checks.map((check) => `| ${check.usage} | ${check.ratio}:1 | ${check.grade} |`).join('\n')}

${brand.palette.checks.some((check) => check.grade === 'fail')
  ? '> **Action required:** at least one pairing fails WCAG AA. Use the provided `--brand-primary-text` token instead of the raw primary color for text, and never place small text on the accent.'
  : '> All audited pairings meet WCAG AA or better. Keep it that way: run a contrast checker whenever you add a color.'}

## Typography

**${brand.typography.pair.heading}** for headings · **${brand.typography.pair.body}** for body · **${brand.typography.pair.mono}** for code and figures.

\`\`\`html
<link rel="stylesheet" href="${brand.typography.googleHref}">
\`\`\`

| Token | Size | Line height | Weight | Use for |
| --- | --- | --- | --- | --- |
${brand.typography.scale.map((step) => `| ${step.name} | ${step.size}px | ${step.lineHeight} | ${step.weight} | ${step.usage} |`).join('\n')}

### Typography rules
${brand.typography.rules.map((rule) => `- ${rule}`).join('\n')}

## Logo rules
${brand.rules.map((rule) => `- ${rule}`).join('\n')}

### Never
${brand.misuse.map((rule) => `- ${rule}`).join('\n')}

## Voice
${identity.voice.principles.map((rule) => `- ${rule}`).join('\n')}

**Say:**
${identity.voice.doSay.map((rule) => `- ${rule}`).join('\n')}

**Avoid:**
${identity.voice.dontSay.map((rule) => `- ${rule}`).join('\n')}

### In practice
${Object.entries(identity.voice.samples)
  .map(([key, value]) => `- **${key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}:** ${value}`)
  .join('\n')}

## Taglines
| Tagline | Style | Use for |
| --- | --- | --- |
${identity.taglines.map((tagline) => `| ${tagline.text} | ${tagline.styleLabel} | ${tagline.useFor} |`).join('\n')}
`;
}

function domainPlan(ctx) {
  const { identity, domains, brand } = ctx;
  return `# Domain and DNS plan

## Candidates, ranked

| # | Domain | Strategy | Score | Why | TLD signal |
| --- | --- | --- | --- | --- | --- |
${domains.ranked.map((entry, index) => `| ${index + 1} | \`${entry.domain}\` | ${entry.strategy} | ${entry.score} | ${entry.why} | ${entry.tldNote} |`).join('\n')}

## Registrar steps
${domains.registrarSteps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

> ${domains.note}

## DNS records

Provider target: **${ctx.dns.providerLabel}** ([docs](${ctx.dns.providerDocs}))

${table(['Type', 'Name', 'Value', 'TTL', 'Purpose'], ctx.dns.records.map((record) => [record.type, record.name, `\`${String(record.value).replace(/\|/g, '\\|')}\``, String(record.ttl), record.purpose]))}

## Order of operations
${ctx.dns.order.map((step, index) => `${index + 1}. ${step}`).join('\n')}

> ${ctx.dns.propagation}

## Email addresses

| Address | Purpose | Owner |
| --- | --- | --- |
${ctx.mailboxes.boxes.map((box) => `| \`${box.address}\` | ${box.purpose} | ${box.owner} |`).join('\n')}

### Mailbox rules
${ctx.mailboxes.rules.map((rule) => `- ${rule}`).join('\n')}

## Name screening
${identity.screening.map((item) => `- **${item.check}** — ${item.why}${item.link ? ` ([open](${item.link}))` : ''}`).join('\n')}
`;
}

function marketingPlaybook(ctx) {
  const { identity, marketing } = ctx;
  const profile = identity.profile;
  const m = marketing;
  return `# ${identity.name} — go-to-market playbook

## Positioning
> ${identity.positioning}

**One-liner:** ${identity.oneLiner}

| Layer | Statement |
| --- | --- |
${m.messaging.house.map((layer) => `| ${layer.layer} | ${layer.statement} |`).join('\n')}

## Ideal customer

### Primary
- **Who:** ${m.icp.primary.who}
- **Trigger:** ${m.icp.primary.trigger}
- **Where to find them:** ${m.icp.primary.whereToFindThem.join(' · ')}
- **Disqualify when:** ${m.icp.primary.disqualifiers.join(' · ')}

**Pains**
${m.icp.primary.pains.map((pain) => `- ${pain}`).join('\n')}

**Objections and the honest answer**
| Objection | Answer |
| --- | --- |
| ${m.icp.primary.objections[0]} | Then build a narrow version and let them compare the two on the same task. |
| ${m.icp.primary.objections[1]} | Quantify the cost of the workaround — the status quo is never free. |
| ${m.icp.primary.objections[2]} | Offer a paid pilot or a quarter-end option; do not give the product away. |
| ${m.icp.primary.objections[3]} | Send the security documentation before the trial, not after the objection. |

### Secondary
${m.icp.secondary.who} — ${m.icp.secondary.trigger}

## Value propositions
${m.messaging.valueProps.map((prop) => `### ${prop.headline}\n${prop.support}`).join('\n\n')}

## Pricing
Model: **${m.pricing.model}**

| Tier | Price | Billing | For | CTA |
| --- | --- | --- | --- | --- |
${m.pricing.tiers.map((tier) => `| ${tier.name} | ${tier.price} | ${tier.billing} | ${tier.tagline} | ${tier.cta} |`).join('\n')}

### Principles
${m.pricing.rationale.map((rule) => `- ${rule}`).join('\n')}

### Notes
${m.pricing.notes.map((note) => `- ${note}`).join('\n')}

## Channels

| Channel | Effort | Impact | First step | Metric |
| --- | --- | --- | --- | --- |
${m.channels.map((channel) => `| ${channel.channel} | ${channel.effort} | ${channel.impact} | ${channel.firstStep} | ${channel.metric} |`).join('\n')}

## 12-week plan

${m.gtm.calendar
  .map(
    (week) => `### Week ${week.week} — ${week.focus}
${week.deliverables.map((item) => `- [ ] ${item}`).join('\n')}`,
  )
  .join('\n\n')}

> ${m.gtm.phaseNote}

## Metrics

**North star:** ${m.metrics.northStar}

| Metric | Target | Why |
| --- | --- | --- |
${m.metrics.supporting.map((metric) => `| ${metric.metric} | ${metric.target} | ${metric.why} |`).join('\n')}

**Guardrails:** ${m.metrics.guardrails.join(' · ')}

**Cadence**
${m.metrics.cadence.map((item) => `- ${item}`).join('\n')}

## Budget

### Lean (first 90 days)
${m.budget.lean.map((item) => `- **${item.item}** — ${item.cost}. ${item.note}`).join('\n')}

### Growth
${m.budget.growth.map((item) => `- **${item.item}** — ${item.cost}. ${item.note}`).join('\n')}

## Launch checklist
${m.checklist.map((item) => `- [ ] ${item}`).join('\n')}

## Product details worth knowing
${profile.proof.map((item) => `- ${item}`).join('\n')}
`;
}

function launchKit(ctx) {
  const { identity, marketing } = ctx;
  const l = marketing.launchCopy;
  return `# Launch kit

## Launch-day runbook

| When | Task |
| --- | --- |
${marketing.launch.runbook.map((item) => `| **${item.t}** | ${item.task} |`).join('\n')}

Channels: ${marketing.launch.distribution.join(' · ')}

## Product Hunt

**Tagline:** ${l.productHunt.tagline}

\`\`\`
${l.productHunt.description}
\`\`\`

**First comment**
\`\`\`
${l.productHunt.firstComment}
\`\`\`

**Checklist**
${l.productHunt.checklist.map((item) => `- [ ] ${item}`).join('\n')}

## Hacker News

**Title:** ${l.hackerNews.title}

\`\`\`
${l.hackerNews.body}
\`\`\`

${l.hackerNews.rules.map((rule) => `- ${rule}`).join('\n')}

## X thread
${l.x.thread.map((post, index) => `${index + 1}. ${post}`).join('\n\n')}

## LinkedIn post

\`\`\`
${l.linkedin.post}
\`\`\`

## Reddit

Target communities: ${l.reddit.subreddits.join(', ')}

\`\`\`
${l.reddit.template}
\`\`\`

> ${l.reddit.warning}

## Announcement email

**Subject:** ${l.emailAnnouncement.subject}

\`\`\`
${l.emailAnnouncement.body}
\`\`\`

${l.emailAnnouncement.rules.map((rule) => `- ${rule}`).join('\n')}

## Press release

**${marketing.pressRelease.headline}**

${marketing.pressRelease.dateline}

${marketing.pressRelease.body.map((para) => `${para}\n`).join('\n')}

**About ${identity.name}**
${marketing.pressRelease.boilerplate}

${marketing.pressRelease.contact}

Format rules:
${marketing.pressRelease.formatRules.map((rule) => `- ${rule}`).join('\n')}
`;
}

/**
 * The market research document.
 *
 * Written so a founder can act on it in a week and so nobody can mistake it for
 * verified market data: competitor shapes instead of a name list, planning
 * ranges instead of asserted statistics, and a named source next to every claim
 * they are expected to check.
 */
export function marketResearchDoc(ctx) {
  const { marketing, identity, intake } = ctx;
  const r = marketing.research;
  const audience = String(intake.audience || '').trim() || identity.profile.buyer;
  return `# Market research — ${identity.name}

${r.definition}

> Two honesty rules govern this document. **No invented competitors:** the market is described as shapes of competitor, not a name list that goes stale. **No invented statistics:** every number below is a planning range, and each carries the source you must verify it against before you spend money on it.

## The category you are in

- **Analyst category:** ${r.analystCategory}
- **Buyer:** ${audience}
- **How it is bought:** ${r.howItIsBought.note}

## What makes someone buy now

A trigger is what converts a passive audience into a buying one. Sell to the trigger, not the demographic.

${r.howItIsBought.triggers.map((trigger) => `- ${trigger}`).join('\n')}

The one to lead with in your first campaign: **${r.howItIsBought.firstRealTrigger}**

## Who you are actually up against

${r.competitorNote}

| Shape | What they win on | Where they lose | Your counter |
| --- | --- | --- | --- |
${r.competitorShapes.map((shape) => `| **${shape.shape}** | ${shape.whatTheyWinOn} | ${shape.whereTheyLose} | ${shape.counter} |`).join('\n')}

## Demand signals to measure

${r.demandNote}

${r.demandSignals.map((signal) => `- ${signal}`).join('\n')}

## Where to read it yourself

${r.whereToReadItYourself.map((source) => `- **${source.name}** — ${source.where}\n  - Use it for: ${source.use}`).join('\n')}

## Planning ranges

${r.benchmarkNote}

| Metric | Planning range | Verify against |
| --- | --- | --- |
${r.planningBenchmarks.map((entry) => `| ${entry.metric} | ${entry.band} | ${entry.verify} |`).join('\n')}

## Objections you will hear, and the honest answer

${r.objections.map((entry) => `**“${entry.objection}”**\n\n${entry.answer}`).join('\n\n')}

## Your beachhead

**Wedge:** ${r.beachhead.wedge}

${r.beachhead.whyNow}

**Expansion, only after the wedge works:** ${r.beachhead.expansion}

## What to do in week one

${r.firstWeek.map((task, index) => `${index + 1}. ${task}`).join('\n')}
`;
}

function outboundKit(ctx) {
  const { marketing } = ctx;
  return `# Outbound and paid

## Cold email sequence

**Rules**
${marketing.coldEmail.rules.map((rule) => `- ${rule}`).join('\n')}

${marketing.coldEmail.sequence
  .map(
    (step) => `### Day ${step.day}
**Subject:** ${step.subject}

\`\`\`
${step.body}
\`\`\``,
  )
  .join('\n\n')}

## Ad angles

${marketing.ads.angles
  .map(
    (angle) => `### ${angle.angle}
- **Headline:** ${angle.headline}
- **Primary text:** ${angle.primaryText}
- **CTA:** ${angle.cta}`,
  )
  .join('\n\n')}

**Testing discipline**
${marketing.ads.testing.map((rule) => `- ${rule}`).join('\n')}

## SEO plan

${marketing.seo.pillars
  .map(
    (pillar) => `### ${pillar.title}
- **Intent:** ${pillar.intent}
- **Keywords:** ${pillar.keywords.join(', ')}
- **Outline:**
${pillar.outline.map((item) => `  - ${item}`).join('\n')}`,
  )
  .join('\n\n')}

**Quick wins**
${marketing.seo.quickWins.map((item) => `- ${item}`).join('\n')}
`;
}

function investorKit(ctx) {
  const { identity, marketing } = ctx;
  return `# Investor materials

## One-pager

**${identity.legalName}** — ${identity.primaryTagline}

${marketing.investorOnePager.sections.map((section) => `### ${section.heading}\n${section.body}`).join('\n\n')}

${marketing.investorOnePager.rules.map((rule) => `> ${rule}`).join('\n>\n')}

## Pitch deck outline

| # | Slide | What to say |
| --- | --- | --- |
${marketing.pitchDeck.slides.map((slide) => `| ${slide.n} | ${slide.title} | ${slide.say} |`).join('\n')}

${marketing.pitchDeck.rules.map((rule) => `- ${rule}`).join('\n')}
`;
}

function socialKitMarkdown(ctx) {
  const { identity, social } = ctx;
  return `# Social kit

## Handles and profiles

| Platform | Handle | Valid | Bio | Bio length | Priority | Automated check |
| --- | --- | --- | --- | --- | --- | --- |
${social.profiles
  .map(
    (profile) =>
      `| ${profile.name} | \`${profile.handle}\` | ${profile.valid ? 'yes' : 'no'} | ${profile.bio.replace(/\n/g, ' ')} | ${profile.bioLength}/${profile.bioMax} | ${profile.priority} | ${profile.automated} |`,
  )
  .join('\n')}

## What the checks mean
- **checkable** — a public profile URL returns a reliable 404 when the handle is free.
- **no-public-api** — the platform rate-limits unauthenticated requests. Treat the result as a hint.
- **blocked** — the platform blocks automated checks. Confirm inside the app.

${social.profiles
  .filter((profile) => !profile.valid)
  .map((profile) => `> ⚠️ **${profile.name}:** ${profile.validationNote}`)
  .join('\n>\n')}

## Set-up order
${social.setupOrder.map((item) => `${item.step}. **${item.task}** — ${item.why}`).join('\n')}

## Profile setup rules
${social.rules.map((rule) => `- ${rule}`).join('\n')}

## Content pillars
| Pillar | Share of posts | Why |
| --- | --- | --- |
${social.pillars.map((pillar) => `| ${pillar.name} | ${pillar.ratio} | ${pillar.why} |`).join('\n')}

## 30-day calendar
See \`content-calendar.csv\` for the schedule. Week 1 topics:
${social.calendar.days
  .slice(0, 7)
  .map((day) => `- **Day ${day.day} (${day.platform})** — ${day.hook}`)
  .join('\n')}

## Cadence and measurement
${social.calendar.cadence.map((item) => `- ${item}`).join('\n')}

| Metric | Why it matters |
| --- | --- |
${social.calendar.measurement.map((metric) => `| ${metric.metric} | ${metric.why} |`).join('\n')}

## Hashtags
- **Brand:** ${social.hashtags.permanent.join(' ')}
- **Industry:** ${social.hashtags.industry.join(' ')}

> ${social.hashtags.note}

## Asset sizes
| Platform | Avatar | Banner | Bio limit | Handle limit |
| --- | --- | --- | --- | --- |
${ctx.socialAssetSpecs.map((spec) => `| ${spec.platform} | ${spec.avatar} | ${spec.banner} | ${spec.bioLimit} | ${spec.handleLimit} |`).join('\n')}
`;
}

/**
 * The business plan document.
 *
 * Rendered from the same structures the on-screen panel reads, so the file and
 * the page cannot disagree. The honesty rules are stated up front rather than
 * buried: the model is arithmetic on named assumptions, and the numbers are
 * planning figures the reader is expected to replace.
 */
export function businessPlanDoc(ctx) {
  const { businessPlan: plan, identity, intake } = ctx;
  const f = plan.funding;
  const money = (value) => `$${Math.round(value).toLocaleString('en-US')}`;
  const base = plan.base.summary;

  const sectionMarkdown = plan.sections
    .map((section) => {
      const parts = [`## ${section.heading}`, '', ...section.paragraphs, ''];
      if (section.table) {
        const { title, headers, rows } = section.table;
        parts.push(`**${title}**`, '');
        parts.push(`| ${headers.join(' | ')} |`);
        parts.push(`| ${headers.map(() => '---').join(' | ')} |`);
        rows.forEach((row) => parts.push(`| ${row.join(' | ')} |`));
        parts.push('');
      }
      if (section.bullets && section.bullets.length) {
        section.bullets.forEach((bullet) => parts.push(`- ${bullet}`));
        parts.push('');
      }
      return parts.join('\n');
    })
    .join('\n');

  return `# Business plan — ${identity.name}

*Generated by Blueprint on ${new Date().toISOString().slice(0, 10)}. ${plan.horizonMonths}-month model, ${plan.industry}, all figures in USD.*

> **How to read this.** Every number here is arithmetic on the assumptions in the appendix, not a forecast. No figure is a fact about your business; each assumption names the source that replaces it with a real one. Change an input in the intake and the whole model — this document included — recomputes.

## Headline numbers

| | |
| --- | --- |
| Raise | ${money(f.requested)} ${f.funded ? '(funds the plan)' : `(plan needs ${money(f.recommended)})`} |
| ARR at month ${plan.horizonMonths} | ${money(base.arrMonthEnd)} |
| Paying customers | ${base.payingCustomersMonthEnd} of ${base.accountsMonthEnd} accounts |
| Gross margin | ${Math.round(base.grossMargin * 100)}% |
| LTV:CAC | ${base.ltvToCac ? `${base.ltvToCac}:1` : '—'} |
| CAC payback | ${base.paybackMonths ? `${base.paybackMonths} months` : '—'} |
| Break-even | ${base.breakEvenMonth ? `month ${base.breakEvenMonth}` : `beyond this horizon — ${money(plan.breakEven.gap)} a month short at month ${plan.breakEven.monthEnd}`} |
| Market reached | ${Math.round(base.marketPct * 100)}% of ${base.marketAccounts.toLocaleString('en-US')} accounts |

${sectionMarkdown}
## Milestones

| Month | Milestone | Why it matters | Check |
| --- | --- | --- | --- |
${plan.milestones.map((entry) => `| M${entry.at} | ${entry.milestone} | ${entry.detail} | ${entry.check} |`).join('\n')}

## Appendix A — assumptions

${plan.assumptions.note}

| Assumption | Value | Basis | Verify against |
| --- | --- | --- | --- |
${plan.assumptions.lines.map((line) => `| ${line.label} | ${line.value} | ${line.basis} | ${line.verify} |`).join('\n')}

## Appendix B — monthly model (base case)

Full series in \`financial-model.csv\`. Each row reads only the row above it, so any line can be checked by hand.

| Month | Accounts | Paying | Revenue | Gross profit | Opex | Net cash | Cash |
| --- | --- | --- | --- | --- | --- | --- | --- |
${plan.base.months
  .filter((row) => row.month % 3 === 0 || row.month === 1)
  .map(
    (row) =>
      `| ${row.label} | ${row.activeCustomers} | ${row.payingCustomers} | ${money(row.revenue)} | ${money(row.grossProfit)} | ${money(row.opex)} | ${money(row.netCash)} | ${money(row.cash)} |`,
  )
  .join('\n')}

## Appendix C — startup costs

| Item | Cost | Note |
| --- | --- | --- |
${plan.startupCosts.map((entry) => `| ${entry.item} | ${entry.cost} | ${entry.note} |`).join('\n')}

## Appendix D — terms

**Instrument.** ${f.terms.instrument}

**How much.** ${f.terms.range}

${f.terms.rules.map((rule) => `- ${rule}`).join('\n')}

> ${f.terms.profileNote}

---

Prepared for ${intake.founder || 'the founder'} · ${plan.context.legalName} · ${plan.context.domain}
`;
}

/** The assumptions appendix on its own, for a reader who only wants the inputs. */
export function planAssumptionsDoc(ctx) {
  const { businessPlan: plan, identity } = ctx;
  return `# Model assumptions — ${identity.name}

These are the inputs behind the financial model in \`business-plan.md\`. Every one is a planning figure with the source that replaces it, and the model recomputes from them.

| Assumption | Value | Basis | Verify against |
| --- | --- | --- | --- |
${plan.assumptions.lines.map((line) => `| ${line.label} | ${line.value} | ${line.basis} | ${line.verify} |`).join('\n')}

**Industry.** ${plan.assumptions.industry}

**The reading that replaces these.** ${plan.assumptions.verify}

## What the plan depends on most

${plan.sensitivity.note}

| Change | ARR at end | Effect |
| --- | --- | --- |
${plan.sensitivity.rows.map((row) => `| ${row.label} | $${Math.round(row.arrMonthEnd).toLocaleString('en-US')} | ${row.delta === 0 ? '—' : `${row.delta > 0 ? '+' : '−'}$${Math.abs(Math.round(row.delta)).toLocaleString('en-US')}`} |`).join('\n')}

## How the model works

1. Marketing spend wins accounts: (standing budget + reinvested revenue + capital deployed) ÷ cost per account.
2. Higher offers taper as the base approaches the market ceiling, so growth slows instead of compounding without bound.
3. Accounts churn monthly at the modelled rate; only the paying share produces revenue.
4. Infrastructure and support are charged to every active account, including the free ones.
5. Gross profit minus payroll, marketing and overhead gives net cash, and cash is carried forward month by month.

Nothing is forward-referenced: month N reads month N-1 and nothing else, which is why every row of \`financial-model.csv\` can be checked by hand.
`;
}

export function bundleReadme(ctx) {
  const { identity, intake, bundle } = ctx;
  return `# ${identity.name}

Everything a new company needs, generated from the name **“${identity.name}”** by Blueprint on ${new Date().toISOString().slice(0, 10)}.

> ${identity.primaryTagline}

${identity.boilerplates.long}

## What is in this bundle

| Folder | Contents |
| --- | --- |
| \`brand/\` | Logo files in every lockup, design tokens, social cards, business card, email signature, brand guidelines |
| \`website/\` | A complete deployable site: pages, blog, forms, SEO files, security headers, deploy guide |
| \`marketing/\` | GTM playbook, 12-week plan, launch kit, outbound sequences, ad angles, SEO plan, investor materials |
| \`social/\` | Handle plan, bios, avatars and banners per platform, 30-day content calendar, link-in-page |
| \`domains/\` | Ranked domain candidates, DNS records, mailbox plan, name screening |
| \`legal/\` | Draft formation documents, EIN packet, bank-ready packet, trademark screening, compliance calendar |
| \`checklists/\` | The launch console as a CSV you can import into any task tool |

**${bundle.counts.files} files, ${humanBytes(bundle.counts.bytes)} uncompressed.**

## Suggested order

1. Read \`brand/brand-guidelines.md\` and pick your logo direction.
2. Buy the domain from \`domains/domain-plan.md\` and set up email.
3. Deploy \`website/\` following \`website/DEPLOY.md\`.
4. Reserve your social handles using \`social/social-kit.md\`.
5. Start the \`marketing/gtm-playbook.md\` week 1 checklist.
6. Send \`legal/\` to a lawyer — start with \`legal/00-document-index.md\`.
7. Work through \`checklists/launch-console.csv\`.

## Honest notes

- **Not legal or tax advice.** The legal folder is a drafting aid. A lawyer must review anything before you file or sign it.
- **Filing, EINs and bank accounts need a human.** Regulated steps cannot be completed by software: the IRS requires a signature and identity checks, and banks must verify beneficial owners under the USA PATRIOT Act. This bundle prepares the packets so those steps take minutes instead of days.
- **Availability results are hints.** Registries throttle lookups; confirm at checkout.
- **Placeholders are deliberate.** Anywhere you see square brackets, that value needs you.
- Generated ${new Date().toISOString().slice(0, 10)} · intake: ${intake.industryLabel || intake.industry} · tone: ${intake.tone || 'derived'} · entity: ${ctx.company.recommendation.entity.label}
`;
}

// ---------------------------------------------------------------------------
// Bundle assembly
// ---------------------------------------------------------------------------

export function buildBundle(ctx) {
  const { brand, site, social, company, marketing } = ctx;
  const files = [];
  const add = (path, content) => {
    if (content === undefined || content === null) return;
    files.push({ path, content: typeof content === 'string' ? content : String(content) });
  };

  add('README.md', bundleReadme({ ...ctx, bundle: { counts: { files: 0, bytes: 0 } } }));

  // Brand
  add('brand/brand-guidelines.md', brandGuidelines(ctx));
  add('brand/design-tokens.css', brand.palette.css);
  add('brand/brand.json', JSON.stringify(brandJson(ctx), null, 2));
  Object.entries(brand.logo).forEach(([name, svg]) => add(`brand/${name}`, svg));
  add('brand/social-card.svg', brand.og);
  add('brand/business-card-front.svg', brand.card.front);
  add('brand/business-card-back.svg', brand.card.back);
  add('brand/email-signature.html', brand.emailSignature);
  brand.concepts.forEach((concept) => {
    add(`brand/concepts/${concept.id}-horizontal.svg`, concept.variants.horizontal);
    add(`brand/concepts/${concept.id}-stacked.svg`, concept.variants.stacked);
    add(`brand/concepts/${concept.id}-icon.svg`, concept.variants.icon);
  });

  // Website
  Object.entries(site.files).forEach(([name, content]) => add(`website/${name}`, content));

  // Business plan
  const plan = ctx.businessPlan;
  add('business-plan/business-plan.md', businessPlanDoc(ctx));
  add('business-plan/assumptions.md', planAssumptionsDoc(ctx));
  add(
    'business-plan/financial-model.csv',
    csv([
      ['month', 'label', 'active accounts', 'paying customers', 'new accounts', 'churned accounts', 'revenue', 'infrastructure', 'support', 'gross profit', 'payroll', 'marketing', 'tooling', 'admin', 'opex', 'net cash', 'cash'],
      ...plan.base.months.map((row) => [
        row.month,
        row.label,
        row.activeCustomers,
        row.payingCustomers,
        row.newAccounts,
        row.churnedAccounts,
        row.revenue,
        row.infra,
        row.support,
        row.grossProfit,
        row.payroll,
        row.marketing,
        row.tooling,
        row.admin,
        row.opex,
        row.netCash,
        row.cash,
      ]),
    ]),
  );
  add(
    'business-plan/scenarios.csv',
    csv([
      ['scenario', 'arr at end', 'mrr at end', 'paying customers', 'gross margin', 'break-even month', 'cash at end', 'peak drawdown'],
      ...plan.scenarios.map((entry) => [
        entry.label,
        entry.arrMonthEnd,
        entry.mrrMonthEnd,
        entry.payingCustomersMonthEnd,
        entry.grossMargin,
        entry.breakEvenMonth || '',
        entry.cashMonthEnd,
        entry.peakDrawdown,
      ]),
    ]),
  );
  add(
    'business-plan/sensitivity.csv',
    csv([
      ['change', 'arr at end', 'break-even month', 'cash at end', 'effect on arr'],
      ...plan.sensitivity.rows.map((row) => [
        row.label,
        row.arrMonthEnd,
        row.breakEvenMonth || '',
        row.cashMonthEnd,
        row.delta,
      ]),
    ]),
  );
  add(
    'business-plan/use-of-funds.csv',
    csv([
      ['bucket', 'share %', 'amount', 'why'],
      ...plan.funding.useOfFunds.buckets.map((bucket) => [bucket.label, bucket.share, bucket.dollars, bucket.why]),
    ]),
  );
  add(
    'business-plan/hiring-plan.csv',
    csv([
      ['month', 'role', 'annual planning figure', 'monthly burdened', 'note'],
      ...plan.hiring.map((entry) => [entry.label, entry.role, entry.annual, entry.monthly, entry.note]),
    ]),
  );

  // Marketing
  add('marketing/market-research.md', marketResearchDoc(ctx));
  add('marketing/gtm-playbook.md', marketingPlaybook(ctx));
  add('marketing/launch-kit.md', launchKit(ctx));
  add('marketing/outbound-and-ads.md', outboundKit(ctx));
  add('marketing/investor-materials.md', investorKit(ctx));
  add('marketing/gtm-calendar.csv', csv([['week', 'focus', 'deliverable', 'done'], ...marketing.gtm.calendar.flatMap((week) => week.deliverables.map((item) => [week.week, week.focus, item, 'no']))]));
  add(
    'marketing/keyword-plan.csv',
    csv([
      ['pillar', 'intent', 'keyword'],
      ...marketing.seo.pillars.flatMap((pillar) => pillar.keywords.map((keyword) => [pillar.title, pillar.intent, keyword])),
    ]),
  );
  add('marketing/launch-runbook.csv', csv([['when', 'task', 'done'], ...marketing.launch.runbook.map((item) => [item.t, item.task, 'no'])]));

  // Social
  add('social/social-kit.md', socialKitMarkdown(ctx));
  add('social/handles.json', JSON.stringify(social.handles, null, 2));
  add(
    'social/content-calendar.csv',
    csv([
      ['day', 'week', 'week focus', 'platform', 'pillar', 'format', 'hook', 'body', 'cta', 'hashtags'],
      ...social.calendar.days.map((day) => [
        day.day,
        day.week,
        day.weekFocus,
        day.platform,
        day.pillar,
        day.format,
        day.hook,
        day.body,
        day.cta,
        day.hashtags.join(' '),
      ]),
    ]),
  );
  add('social/bio-link-page.html', social.bioLink);
  social.profiles.forEach((profile) => {
    add(`social/assets/${profile.platform}-avatar.svg`, profile.assets.avatar);
    if (profile.assets.banner) add(`social/assets/${profile.platform}-banner.svg`, profile.assets.banner);
  });

  // Domains
  add('domains/domain-plan.md', domainPlan(ctx));
  add(
    'domains/dns-records.csv',
    csv([['type', 'name', 'value', 'ttl', 'purpose'], ...ctx.dns.records.map((record) => [record.type, record.name, record.value, record.ttl, record.purpose])]),
  );
  add(
    'domains/domain-candidates.csv',
    csv([['domain', 'strategy', 'score', 'reason', 'tld signal'], ...ctx.domains.ranked.map((entry) => [entry.domain, entry.strategy, entry.score, entry.why, entry.tldNote])]),
  );

  // Legal
  Object.entries(company.documents).forEach(([name, content]) => add(name, content));

  // Checklists
  add('checklists/launch-console.csv', csv([['phase', 'task', 'detail', 'link', 'done'], ...launchConsole(ctx).map((item) => [item.phase, item.task, item.detail, item.link || '', 'no'])]));

  const bytes = files.reduce((sum, file) => sum + new TextEncoder().encode(file.content).length, 0);
  const manifest = {
    generatedAt: new Date().toISOString(),
    generator: 'Blueprint',
    name: ctx.identity.name,
    legalName: ctx.identity.legalName,
    counts: { files: files.length, bytes },
    size: humanBytes(bytes),
    tree: files.map((file) => file.path),
  };

  // Patch the readme with the real counts now that they are known.
  const readmeIndex = files.findIndex((file) => file.path === 'README.md');
  files[readmeIndex].content = bundleReadme({ ...ctx, bundle: manifest });
  manifest.counts.bytes += new TextEncoder().encode(files[readmeIndex].content).length;

  return { files, manifest };
}

export async function zipBundle(bundle) {
  return createZip(bundle.files.map((file) => ({ name: file.path, data: file.content })));
}

export function brandJson(ctx) {
  const { identity, brand } = ctx;
  return {
    name: identity.name,
    legalName: identity.legalName,
    archetype: identity.archetype.name,
    taglines: identity.taglines.map((tagline) => tagline.text),
    colors: Object.fromEntries(brand.palette.swatches.map((swatch) => [swatch.name.toLowerCase().replace(/\s+/g, '-'), swatch.hex])),
    gradients: brand.palette.gradients,
    typography: {
      heading: brand.typography.pair.heading,
      body: brand.typography.pair.body,
      mono: brand.typography.pair.mono,
      googleHref: brand.typography.googleHref,
      scale: brand.typography.scale,
    },
    logo: { primary: brand.chosen.id, files: Object.keys(brand.logo) },
    voice: identity.voice,
    values: identity.values,
  };
}

/** The launch console: every actionable step across the whole project. */
export function launchConsole(ctx) {
  const { identity, company, marketing, social, domains, site, brand } = ctx;
  const items = [];
  const push = (phase, task, detail, link) => items.push({ phase, task, detail, link: link || null });

  push('Brand', 'Choose a logo direction', `Compare the ${brand.concepts.length} concepts and rename the chosen files to match your final pick.`, '#brand');
  push('Brand', 'Replace placeholder copy', 'Testimonials and customer quotes in the website are bracketed placeholders — swap in real ones.', '#website');
  push('Brand', 'Check the contrast audit', 'Every text/background pair was measured. Fix anything that fails WCAG AA before you publish.', '#brand');

  push('Domain', `Register ${domains.primary}`, 'Buy at least two years, then enable transfer lock, DNSSEC and two-factor.', '#domains');
  push('Domain', 'Add DNS records', 'Point the apex at your host, then add SPF, DKIM and DMARC before sending any mail.', '#domains');
  push('Domain', 'Set up mailboxes', 'Create hello@, support@, billing@ and your own address; never use info@.', '#email');

  push('Website', 'Deploy the site', 'Upload website/ to any static host and confirm HTTPS on both the apex and www.', '#website');
  push('Website', 'Connect the forms', 'Add your project id so contact and newsletter forms save to the API, or point them at your own endpoint.', '#website');
  push('Website', 'Submit the sitemap', 'Add sitemap.xml in Google Search Console and verify the property.', '#website');
  push('Website', 'Install analytics', 'Define the activation event before you spend anything on acquisition.', '#marketing');

  push('Email', 'Publish SPF, DKIM and DMARC', 'Start DMARC at p=none, watch reports for two weeks, then move to p=quarantine.', '#domains');
  push('Email', 'Write the welcome sequence', 'Three emails: confirmation, what to do first, and one proof point.', '#email');
  push('Email', 'Test the double opt-in', 'Subscribe yourself, confirm, then unsubscribe. Check all three paths work.', '#email');

  push('Social', 'Reserve handles', 'Claim the same handle everywhere, including platforms you will not use yet.', '#social');
  push('Social', 'Upload avatars and banners', 'Exports are sized per platform in social/assets.', '#social');
  push('Social', 'Schedule week one', 'The content calendar has 30 drafted posts. Start with five.', '#social');

  push('Marketing', 'Agree the positioning sentence', `Write it down once: ${identity.positioning}`, '#marketing');

  push('Plan', 'Replace the market ceiling', `The model caps the market at ${ctx.businessPlan.base.summary.marketAccounts.toLocaleString('en-US')} accounts and reaches ${Math.round(ctx.businessPlan.base.summary.marketPct * 100)}% of it. Count the buyers you can actually name and change that number first.`, '#plan');
  push('Plan', 'Check the three assumptions that matter', 'Price, churn and cost per account decide everything else. Replace each with your own data as it arrives.', '#plan');
  push('Plan', 'Confirm the funding ask', ctx.businessPlan.funding.funded ? `The ${ctx.businessPlan.funding.requested.toLocaleString('en-US')}-dollar ask funds the plan plus a three-month buffer.` : `The plan needs ${ctx.businessPlan.funding.recommended.toLocaleString('en-US')} dollars, which is more than the amount entered.`, '#plan');
  push('Plan', 'Walk the monthly model', 'Open financial-model.csv and check a row by hand against the row above it. If you cannot, the model is wrong.', '#plan');
  // A plan that never covers its own costs turns the raise into a countdown, so
  // the console asks for the decision now rather than at the point of no return.
  if (!ctx.businessPlan.breakEven.reached) {
    push('Plan', 'Choose the break-even path', `The model still runs ${ctx.businessPlan.breakEven.gap.toLocaleString('en-US')} dollars short in month ${ctx.businessPlan.breakEven.monthEnd}. Decide now whether that gap closes with price, cost base or a longer runway, and write the answer down.`, '#plan');
  }
  push('Marketing', 'Publish pricing', 'Three tiers with an annual option and a real free tier.', '#marketing');
  push('Marketing', 'Start the 12-week plan', 'Week 1 deliverables are in the GTM playbook.', '#marketing');
  push('Marketing', 'Book 10 customer interviews', 'The first ten conversations will change your messaging more than any tool.', '#marketing');

  push('Company', `File the ${company.recommendation.entity.label}`, company.recommendation.why, '#company');
  push('Company', 'Appoint a registered agent', 'Required in your formation state, and it keeps your home address out of public records.', '#company');
  push('Company', 'Get your EIN', 'Free from the IRS. The packet pre-fills every field of Form SS-4.', '#company');
  push('Company', 'Open the business bank account', 'Do it before the first payment arrives — commingling costs you the liability shield.', '#company');
  push('Company', 'Sign founder and IP documents', 'Every founder and contractor assigns IP before contributing work.', '#company');
  push('Company', 'File the 83(b) election', '30 days from stock issuance, by certified post. No extensions.', '#company');
  push('Company', 'Start the compliance calendar', 'Import compliance-calendar.ics so the annual report cannot surprise you.', '#company');
  push('Company', 'Screen the trademark', 'Search USPTO before you print anything, then file in the classes that matter.', '#company');

  push('Launch', 'Pick a launch date', 'Two weeks out. Put it somewhere public so you cannot drift.', '#marketing');
  push('Launch', 'Brief 20 supporters', 'Real users who will try it, not friends who will upvote.', '#marketing');
  push('Launch', 'Record the 60-second demo', 'Silent, captioned, 1080p. Show the moment of value, not the settings page.', '#marketing');
  push('Launch', 'Post and reply all day', 'Reply to every comment within an hour. Ignore analytics until tomorrow.', '#marketing');

  push('Measure', 'Define your north star', marketing.metrics.northStar, '#marketing');
  push('Measure', 'Set up the Friday update', 'One page: shipped, learned, blocked. Send it to the team and investors.', '#marketing');
  push('Measure', 'Review cohort retention monthly', 'If week-4 retention is under 60%, fix the product before spending on ads.', '#marketing');

  return items;
}

export function consoleCsv(ctx) {
  return csv([['phase', 'task', 'detail', 'link', 'done'], ...launchConsole(ctx).map((item) => [item.phase, item.task, item.detail, item.link || '', 'no'])]);
}

export function siteZipInput(site) {
  return Object.entries(site.files).map(([name, content]) => ({ name, data: content }));
}

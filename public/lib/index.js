// Blueprint engine entry point.
//
// One function turns a name and a short intake into a complete company:
// identity, brand kit, website, domain plan, email plan, social presence,
// go-to-market plan and the formation / EIN / banking / compliance packets.
//
// The engine is pure and deterministic: the same intake always produces the
// same company, which is why the server can store only the intake and rebuild
// everything else on demand.
import { buildIdentity, industryProfile } from './naming.js';
import { buildBrand } from './brand.js';
import { buildMarketing } from './marketing.js';
import { domainCandidates, dnsPlan, mailboxPlan, MAIL_PROVIDERS, DEFAULT_MAIL_PROVIDER } from './domains.js';
import { buildSocialKit, SOCIAL_ASSET_SPECS } from './social.js';
import { generateSite } from './site.js';
import { buildCompany } from './company.js';
import { buildBusinessPlan } from './businessplan.js';
import { buildBundle, launchConsole, brandJson, consoleCsv } from './export.js';
import { slugify } from './rng.js';
import { INDUSTRIES, TONES, AUDIENCES } from './presets.js';

export const ENGINE_VERSION = '0.1.0';

export const INDUSTRY_OPTIONS = Object.entries(INDUSTRIES).map(([key, value]) => ({ key, label: value.label }));
export const TONE_OPTIONS = Object.entries(TONES).map(([key, value]) => ({ key, label: value.label }));

/** Target-audience choices for the intake dropdown. `label` is what the engine writes with. */
export const AUDIENCE_OPTIONS = AUDIENCES.map(({ key, label, note }) => ({ key, label, note }));

/** Coerce anything the user typed into a complete, valid intake. */
export function normalizeIntake(raw = {}) {
  const name = String(raw.name || '').trim().slice(0, 60) || 'Northwind';
  const profile = industryProfile(raw.industry);
  const tone = TONES[raw.tone] ? raw.tone : 'calm';
  // The audience arrives as a dropdown key or as a label, and an older saved
  // project (or an API caller) may still send free text. Match either, and keep
  // whatever came in when it matches nothing rather than silently dropping it.
  const audienceRaw = String(raw.audience || '').trim();
  const audienceEntry = AUDIENCES.find(
    (entry) => entry.key === raw.audienceKey || entry.key === audienceRaw || (entry.label && entry.label === audienceRaw),
  );
  return {
    name,
    industry: profile.key,
    industryLabel: profile.label,
    industryInput: raw.industry || profile.label,
    tone,
    audience: (audienceEntry ? audienceEntry.label : audienceRaw).slice(0, 160),
    audienceKey: audienceEntry ? audienceEntry.key : audienceRaw ? 'custom' : 'auto',
    founder: String(raw.founder || '').trim().slice(0, 80),
    founderTitle: String(raw.founderTitle || 'Founder').trim().slice(0, 60),
    founderEmail: String(raw.founderEmail || '').trim().slice(0, 120),
    phone: String(raw.phone || '').trim().slice(0, 40),
    city: String(raw.city || '').trim().slice(0, 80),
    state: String(raw.state || 'DE').toUpperCase().slice(0, 2),
    entity: String(raw.entity || 'auto').toLowerCase(),
    raising: raw.raising === undefined ? true : raw.raising !== false && raw.raising !== 'no',
    cofounders: Math.max(0, Math.min(6, Number(raw.cofounders) || 0)),
    employees: Math.max(0, Math.min(5000, Number(raw.employees) || 0)),
    valuation: Math.max(0, Number(raw.valuation) || 8_500_000),
    formationDate: raw.formationDate || new Date().toISOString().slice(0, 10),
    mailProvider: MAIL_PROVIDERS.some((provider) => provider.key === raw.mailProvider) ? raw.mailProvider : DEFAULT_MAIL_PROVIDER,
    host: String(raw.host || 'example.pages.dev').trim().slice(0, 120),
    apiBase: String(raw.apiBase || '').trim().slice(0, 200),
    projectId: String(raw.projectId || '').trim().slice(0, 64),
    domain: raw.domain ? String(raw.domain).trim().toLowerCase().slice(0, 120) : '',
    oneLiner: String(raw.oneLiner || '').trim().slice(0, 200),
    // Zero means "let the plan size the raise from its own model", which is the
    // honest default: a founder who has not decided what to raise should be told
    // what the plan needs, not asked to guess.
    raiseAmount: Math.max(0, Math.min(50_000_000, Number(raw.raiseAmount) || 0)),
  };
}

/**
 * Generate the whole company.
 * @param {object} rawIntake
 * @returns {object} a fully populated project
 */
export function generateCompany(rawIntake = {}) {
  const intake = normalizeIntake(rawIntake);
  const generatedAt = new Date().toISOString();

  const identity = buildIdentity(intake);
  const brand = buildBrand(intake, identity);
  // Prose-bearing modules run their text through the article fixer at the point
  // each string is built (see the fill() helpers), never over a whole module:
  // running it across generated HTML would rewrite markup such as <a aria-label>
  // into <an aria-label>.
  const marketing = buildMarketing(intake, identity, brand);
  const domains = domainCandidates(identity, identity.profile);
  const primaryDomain = intake.domain || domains.primary;
  const dns = dnsPlan(primaryDomain, { mailProvider: intake.mailProvider, host: intake.host });
  const mailboxes = mailboxPlan(identity, primaryDomain, { founder: intake.founder || intake.name, mailProvider: intake.mailProvider });
  const social = buildSocialKit(intake, identity, brand);
  const site = generateSite(intake, { identity, brand, marketing });
  const company = buildCompany(intake, identity);
  const businessPlan = buildBusinessPlan({
    intake,
    identity,
    brand,
    marketing,
    domains: { ...domains, primaryDomain },
    dns,
    mailboxes,
    social,
    company,
  });

  const ctx = bundleContext({
    intake,
    identity,
    brand,
    marketing,
    domains,
    dns,
    mailboxes,
    social,
    site,
    company,
    businessPlan,
  });

  const bundle = buildBundle(ctx);
  const checklist = launchConsole(ctx);

  return {
    engine: ENGINE_VERSION,
    generatedAt,
    slug: slugify(intake.name),
    intake,
    summary: {
      name: identity.name,
      legalName: identity.legalName,
      tagline: identity.primaryTagline,
      domain: primaryDomain,
      entity: company.recommendation.entity.label,
      jurisdiction: company.recommendation.jurisdiction.name,
      industry: intake.industryLabel,
      archetype: identity.archetype.name,
      primaryColor: brand.palette.primary,
      accentColor: brand.palette.accent,
      fileCount: bundle.manifest.counts.files,
      bundleSize: bundle.manifest.size,
      checklistCount: checklist.length,
      arrAtHorizon: businessPlan.base.summary.arrMonthEnd,
      breakEvenMonth: businessPlan.base.summary.breakEvenMonth,
      fundingNeed: businessPlan.funding.recommended,
    },
    identity,
    brand,
    marketing,
    domains: { ...domains, primaryDomain },
    dns,
    mailboxes,
    social,
    site: { ...site, files: site.files },
    company,
    businessPlan,
    bundle,
    checklist,
  };
}

/**
 * Assemble the context every exporter expects. `socialAssetSpecs` is a module
 * constant rather than project state, so it has to be spliced in here — a bare
 * project object is not a valid context and must never be passed as one.
 */
function bundleContext(parts) {
  return { ...parts, socialAssetSpecs: SOCIAL_ASSET_SPECS };
}

/**
 * Rebuild the artifacts that embed the positioning statement after a model has
 * written one.
 *
 * Kept in the engine because only the engine knows the shape of the context the
 * exporters need. Rebuilding is cheap and it is the only way to keep the site,
 * the downloadable bundle and the launch console consistent with the statement
 * on screen — two artifacts disagreeing about what the company does is a real
 * bug, and a silent one.
 *
 * @param {object} project  a project from `generateCompany`, mutated in place
 * @param {string} text     the positioning statement to adopt
 * @returns {object} the same project, with the derived artifacts rebuilt
 */
export function applyPositioningStatement(project, text) {
  const statement = String(text || '').trim();
  if (!statement || !project?.identity || !project?.intake) return project;
  project.identity.positioning = statement;
  // Marketing is built from the identity and quotes the tagline, not the
  // statement, so it is already correct; the site and the bundle are what embed
  // the statement and must be rebuilt.
  project.site = generateSite(project.intake, {
    identity: project.identity,
    brand: project.brand,
    marketing: project.marketing,
  });
  // The plan quotes the positioning statement in its own narrative, so it is
  // rebuilt with everything else. A plan that contradicts the homepage is worse
  // than no plan.
  project.businessPlan = buildBusinessPlan({
    intake: project.intake,
    identity: project.identity,
    brand: project.brand,
    marketing: project.marketing,
    domains: project.domains,
    dns: project.dns,
    mailboxes: project.mailboxes,
    social: project.social,
    company: project.company,
  });
  const ctx = bundleContext({
    intake: project.intake,
    identity: project.identity,
    brand: project.brand,
    marketing: project.marketing,
    domains: project.domains,
    dns: project.dns,
    mailboxes: project.mailboxes,
    social: project.social,
    site: project.site,
    company: project.company,
    businessPlan: project.businessPlan,
  });
  project.bundle = buildBundle(ctx);
  project.checklist = launchConsole(ctx);
  project.summary.checklistCount = project.checklist.length;
  project.summary.fileCount = project.bundle.manifest.counts.files;
  project.summary.bundleSize = project.bundle.manifest.size;
  project.summary.arrAtHorizon = project.businessPlan.base.summary.arrMonthEnd;
  project.summary.breakEvenMonth = project.businessPlan.base.summary.breakEvenMonth;
  project.summary.fundingNeed = project.businessPlan.funding.recommended;
  return project;
}

/**
 * What actually gets persisted: the intake plus light user state. Everything
 * else is deterministic and rebuilt on load, which keeps stored projects small
 * and guarantees they never drift from the engine.
 */
export function persistable(project, extras = {}) {
  return {
    intake: project.intake,
    chosenLogoId: extras.chosenLogoId || project.brand.chosen.id,
    checklistDone: extras.checklistDone || [],
    notes: extras.notes || {},
    updatedAt: new Date().toISOString(),
  };
}

export function projectSummary(project) {
  return {
    slug: project.slug,
    name: project.identity.name,
    tagline: project.identity.primaryTagline,
    domain: project.summary.domain,
    industry: project.summary.industry,
    color: project.summary.primaryColor,
    files: project.summary.fileCount,
    generatedAt: project.generatedAt,
  };
}

export function exportCsv(ctx, kind) {
  if (kind === 'checklist') return consoleCsv(ctx);
  return null;
}

export { brandJson, launchConsole, buildBundle };

// Company: entity decision, formation paperwork, EIN application packet,
// bank-ready packet, trademark screening and the compliance calendar.
//
// IMPORTANT: everything here is a decision aid and a drafting assistant. It is
// not legal, tax or financial advice, and no document produced here has been
// reviewed by a lawyer or filed with any authority. Filing an entity, obtaining
// an EIN and opening a bank account are all regulated acts that require a
// human, a signature and identity verification — which is why Blueprint prepares
// the packets and hands you the exact official portal instead of pretending to
// automate them.
// (no runtime helpers needed beyond the presets)
import { BANK_PROVIDERS, COMPLIANCE_TASKS, ENTITY_TYPES, JURISDICTIONS } from './presets.js';
import { governmentForms } from './printforms.js';

const DISCLAIMER = `> **Not legal advice.** This document was drafted by software as a starting point for your
> lawyer to review and adapt. It has not been filed with any authority. Statutes differ by state
> and change over time — confirm every figure and deadline with the official source linked below
> before you rely on it.`;

function slugTitle(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function fmt(date) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}

const TRADEMARK_CLASSES = {
  'b2b-saas': [9, 42],
  'consumer-app': [9, 42],
  agency: [35, 42],
  ecommerce: [35, 25],
  fintech: [36, 9, 42],
  health: [44, 5, 42],
  education: [41, 9],
  marketplace: [35, 42, 39],
  'ai-tool': [9, 42],
  nonprofit: [36, 41],
  'local-service': [37, 35],
};

export function buildCompany(intake, identity) {
  const profile = identity.profile;
  const homeState = (intake.state || 'DE').toUpperCase();
  const home = JURISDICTIONS[homeState] || JURISDICTIONS.DE;
  const raising = intake.raising !== false && intake.raising !== 'no';
  const cofounders = Number(intake.cofounders || 0);
  const forming = new Date(intake.formationDate || Date.now());

  // --- Entity decision -----------------------------------------------------
  const recommendation = (() => {
    if (raising && (intake.entity === 'auto' || !intake.entity)) {
      return {
        key: 'de-c-corp',
        why: `You plan to raise outside capital or grant equity. Investors price Delaware C-Corp stock routinely; an LLC forces them to do work they will decline to do. ${
          cofounders > 0 ? `With ${cofounders + 1} founders you will also want a stock plan from day one.` : ''
        }`,
      };
    }
    if (intake.entity && intake.entity !== 'auto') {
      const match = ENTITY_TYPES.find((type) => type.key === intake.entity);
      if (match) return { key: match.key, why: `Selected by you. Confirm it still fits how you plan to fund and exit the business.` };
    }
    if (profile.key === 'local-service' || profile.key === 'agency' || profile.key === 'nonprofit') {
      return {
        key: 'home-llc',
        why: `Your customers are local and you are unlikely to raise venture capital. A single ${home.name} LLC keeps one filing, one annual report and pass-through tax treatment.`,
      };
    }
    return {
      key: 'home-llc',
      why: `No priced round planned, so the extra cost and formality of a Delaware entity buys you little today. Forming in ${home.name} avoids registering twice.`,
    };
  })();

  const chosenEntity = ENTITY_TYPES.find((type) => type.key === recommendation.key) || ENTITY_TYPES[1];
  const isCorp = chosenEntity.key.includes('corp');
  const formationState = chosenEntity.key.startsWith('de-') ? 'DE' : homeState;
  const formationJurisdiction = JURISDICTIONS[formationState] || home;
  const needsForeignQualification = formationState !== homeState;

  const jurisdictionRows = ['DE', ...Object.keys(JURISDICTIONS).filter((code) => code !== 'DE').slice(0, 5)].map((code) => {
    const entry = JURISDICTIONS[code];
    return {
      code,
      name: entry.name,
      llcFee: entry.llcFee,
      llcAnnual: entry.llcAnnual,
      corpFee: entry.corpFee,
      corpAnnual: entry.corpAnnual,
      timeline: entry.timeline,
      privacy: entry.privacy,
      notes: entry.notes,
      recommended: code === formationState,
      isHome: code === homeState,
    };
  });

  const filingSteps = [
    {
      step: 1,
      title: 'Confirm the name is available',
      detail: `Check the ${formationJurisdiction.name} registry for a conflicting entity, then reserve the name if you are not filing immediately. A name reservation is cheap insurance.`,
      cost: 'Included or a small reservation fee',
      time: 'Minutes',
      link: formationJurisdiction.portal,
      linkLabel: `${formationJurisdiction.name} business search`,
    },
    {
      step: 2,
      title: 'Appoint a registered agent',
      detail: `Every ${formationJurisdiction.name} entity needs a registered agent with a physical address in the state. Commercial agents run about $50–$300 a year and include the address. Using your own address publishes it forever.`,
      cost: '$0–300/yr',
      time: 'Minutes',
      link: 'https://www.google.com/search?q=registered+agent+service+comparison',
      linkLabel: 'Compare agents',
    },
    {
      step: 3,
      title: isCorp ? 'File the Certificate of Incorporation' : 'File the Articles of Organization',
      detail: `File online with the state. Attach the drafted document from this pack after your lawyer reviews it. Pay by card and save the confirmation page — banks ask for it.`,
      cost: isCorp ? `$${formationJurisdiction.corpFee}` : `$${formationJurisdiction.llcFee}`,
      time: formationJurisdiction.timeline,
      link: formationJurisdiction.fileUrl,
      linkLabel: `File in ${formationJurisdiction.name}`,
    },
    needsForeignQualification
      ? {
          step: 4,
          title: `Register as a foreign entity in ${home.name}`,
          detail: `Because you operate from ${home.name}, you must register there too. Expect another filing fee plus an annual report. Doing this late is the most common and most avoidable penalty a young company pays.`,
          cost: `$${home.llcFee}–${home.corpFee} + annual report`,
          time: home.timeline,
          link: home.portal,
          linkLabel: `${home.name} registry`,
        }
      : {
          step: 4,
          title: 'Adopt your governing documents',
          detail: isCorp ? 'Adopt bylaws, hold the organizational board meeting and issue founder stock.' : 'Sign the operating agreement — even as a single member, banks and investors ask for it.',
          cost: '$0 (draft included) or $500–2,500 with a lawyer',
          time: '1–2 hours',
          link: 'https://www.google.com/search?q=startup+lawyer+flat+fee+incorporation',
          linkLabel: 'Find a startup lawyer',
        },
    {
      step: 5,
      title: 'Get your EIN',
      detail: 'Free from the IRS, never pay a third party for it. Use the packet in this folder.',
      cost: '$0',
      time: 'Minutes online, or 4–8 weeks by mail',
      link: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online',
      linkLabel: 'IRS EIN assistant',
    },
    {
      step: 6,
      title: 'Open the business bank account',
      detail: 'Do this before you take a single payment. Commingling funds is the fastest way to lose the liability shield you just paid for.',
      cost: '$0 (watch monthly fees)',
      time: '1–10 business days of review',
      link: 'https://www.sba.gov/business-guide/launch-your-business/open-business-bank-account',
      linkLabel: 'SBA guidance',
    },
    {
      step: 7,
      title: 'Sign founder and IP documents',
      detail: 'Every founder assigns IP to the company and confirms confidentiality. Do it before the company has value, not after.',
      cost: '$0 (drafts included)',
      time: '1 hour',
      link: 'https://www.google.com/search?q=founder+IP+assignment+template+startup',
      linkLabel: 'Background reading',
    },
    {
      step: 8,
      title: 'Start the compliance calendar',
      detail: 'Import the calendar from this pack so the annual report and franchise tax cannot surprise you.',
      cost: '$0',
      time: '5 minutes',
      link: 'https://www.google.com/search?q=annual+report+deadline+delaware+corporation',
      linkLabel: 'Verify deadlines',
    },
  ];

  const totalFilingCost = (isCorp ? formationJurisdiction.corpFee : formationJurisdiction.llcFee) + (needsForeignQualification ? home.llcFee : 0);

  // --- EIN -----------------------------------------------------------------
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const ein = {
    number: null,
    note: 'The EIN itself is issued by the IRS only. This packet pre-fills every field of Form SS-4 so you can complete the online assistant in about five minutes.',
    eligibleForOnline: true,
    onlineBlockers: [
      'The responsible party needs a valid US Social Security Number, ITIN or EIN.',
      'A responsible party without one of those must apply by fax or post on Form SS-4.',
      'Only one EIN per responsible party per day is issued online.',
    ],
    fields: [
      { line: '1', label: 'Legal name of entity', value: identity.legalName },
      { line: '2', label: 'Trade name (if different)', value: identity.dba === identity.name ? 'Same as legal name' : identity.dba },
      { line: '3', label: 'Executor, administrator, trustee (estates only)', value: 'N/A' },
      { line: '4a', label: 'Mailing address', value: '[Street, City, State, ZIP]' },
      { line: '4b', label: 'Mailing address — if foreign', value: '[Country, province, postal code]' },
      { line: '5a', label: 'Street address (if different from mailing)', value: '[Registered agent or office address]' },
      { line: '5b', label: 'Foreign address (if applicable)', value: 'N/A' },
      { line: '6', label: 'County and state where principal business is located', value: `[County], ${home.name}` },
      {
        line: '7a',
        label: 'Responsible party — name',
        value: intake.founder || '[Founder legal name]',
        help: 'The responsible party is the person who controls the entity. It cannot be a company or a mailing service.',
      },
      {
        line: '7b',
        label: 'Responsible party — SSN, ITIN or EIN',
        value: '[SSN/ITIN — never send this by unencrypted email]',
        help: 'Required. If you do not have one, you must file by fax or post rather than online.',
      },
      { line: '8', label: 'Is this application for an IRA?', value: 'No' },
      {
        line: '9a',
        label: 'Type of entity',
        value: isCorp
          ? 'Corporation (check “Corporation” and, if you will elect S status, note the election date)'
          : chosenEntity.key.includes('llc')
            ? 'Limited liability company (LLC)'
            : 'Sole proprietor',
      },
      {
        line: '9b',
        label: 'LLC only — number of members',
        value: chosenEntity.key.includes('llc') ? (cofounders > 0 ? `${cofounders + 1} members` : '1 member') : 'N/A',
        help: 'A single-member LLC is a disregarded entity for federal tax; a multi-member LLC files as a partnership unless it elects otherwise.',
      },
      { line: '10', label: 'Reason for applying', value: 'Started new business' },
      { line: '11', label: 'Date business started or acquired', value: fmt(forming) },
      { line: '12', label: 'Closing month of accounting year', value: 'December' },
      { line: '13', label: 'Highest number of employees expected next 12 months', value: Number(intake.employees || 0) > 0 ? String(intake.employees) : '0 (founders only)' },
      { line: '14', label: 'Do you expect to pay wages?', value: Number(intake.employees || 0) > 0 ? 'Yes' : 'No — no employees at this time' },
      { line: '15', label: 'First date wages were paid', value: Number(intake.employees || 0) > 0 ? fmt(forming) : 'N/A' },
      { line: '16', label: 'Principal activity', value: `Software / ${profile.label}` },
      { line: '17', label: 'Describe the principal line of merchandise, services or products', value: `${profile.category} for ${profile.buyer}` },
      { line: '18', label: 'Is this application for an entity that previously had an EIN?', value: 'No' },
      { line: '19', label: 'Has the responsible party previously applied for an EIN?', value: 'No' },
    ],
    routes: [
      {
        name: 'Online (fastest)',
        eligible: 'Responsible party has a valid US SSN or ITIN and is the sole applicant today.',
        time: 'About 10 minutes; EIN issued immediately',
        how: 'Use the IRS EIN Assistant. You receive the letter (CP575) by post within two to four weeks, and can download the confirmation PDF straight away.',
        link: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online',
      },
      {
        name: 'Fax (Form SS-4)',
        eligible: 'No SSN/ITIN, or online assistant rejects the application.',
        time: 'About 4 business days; the IRS faxes the EIN back',
        how: 'Complete SS-4 and fax it to the number listed in the current SS-4 instructions for your location. Keep the fax transmission confirmation — it is the only proof you filed until the letter arrives.',
        link: 'https://www.irs.gov/forms-pubs/about-form-ss-4',
      },
      {
        name: 'Post (Form SS-4)',
        eligible: 'Always available, but slow. Required for some foreign applicants.',
        time: '4–8 weeks',
        how: 'Mail to the address in the current SS-4 instructions. Send it tracked and keep the receipt.',
        link: 'https://www.irs.gov/forms-pubs/about-form-ss-4',
      },
    ],
    afterApproval: [
      'Save both the CP575 confirmation letter and the 147c letter (request 147c if you ever lose the original).',
      'Banks want to see the letter that matches the exact legal name and address you applied with — mismatches cause rejection.',
      'Never share the EIN in public documents; it is a tax identifier, not a marketing detail.',
      'If you take payments as a sole proprietor first and incorporate later, the entity needs its own EIN.',
      'Business identity theft is common: freeze or monitor your IRS transcripts if you are ever unsure.',
    ],
  };

  // --- Banking -------------------------------------------------------------
  const bank = {
    reality: 'A business bank account cannot be opened programmatically. US banks must complete Customer Identification Program checks under the USA PATRIOT Act: verifying the entity, its beneficial owners, and the identity of the person opening the account. That means a human, government ID and often a live video call. Blueprint prepares the packet so the appointment takes twenty minutes instead of three frustrating days.',
    checklist: [
      { item: 'Filed formation certificate stamped by the state (or the state portal’s confirmation page)', why: 'Proves the entity legally exists.' },
      { item: 'EIN confirmation letter — CP575 or 147c', why: 'Must match your legal name and address exactly. Banks reject mismatches.' },
      { item: 'Operating agreement (LLC) or bylaws plus an initial board resolution (corporation)', why: 'Shows who is authorized to open and operate the account.' },
      { item: 'Government photo ID for every signatory', why: 'Name must match the formation documents.' },
      { item: 'Proof of business address', why: 'Lease, utility bill, or registered agent statement. A PO box is usually rejected.' },
      { item: 'Ownership and control information', why: 'Anyone owning 25% or more must be identified — the beneficial ownership rule.' },
      { item: 'Business license, permit or industry registration if your state requires one', why: 'Required for regulated activities, and sometimes for local services.' },
      { item: 'Website or a description of the business', why: 'Underwriters look for a real, describable business.' },
    ],
    sequence: [
      'Finish formation and wait for the stamped certificate — do not apply with a pending filing.',
      'Get the EIN and check the legal name matches your formation document character for character.',
      'Prepare a single PDF with the documents in the order listed above and name it clearly.',
      'Apply to one primary bank and one backup at the same time; underwriting is not first-come.',
      'Expect a 1–10 business day review for online banks, longer for a community bank.',
      'Once open, keep the opening deposit in the account and never run business spend through a personal card.',
      'Set up the accounting sync immediately so reconciliation is a habit, not a year-end project.',
    ],
    providers: BANK_PROVIDERS.map((provider) => ({ ...provider, match: matchProvider(provider, profile, intake) })),
    warnings: [
      'Never mix personal and business transactions — commingling is the single most common way founders lose their liability shield.',
      'Do not borrow the company’s money; record any founder loan in writing with a rate and a term.',
      'If a bank declines you, it is usually the business address or a name mismatch, not you. Fix the document and reapply.',
      'Read the fee schedule. “Free” accounts often charge for cash deposits, wires or falling below a balance.',
    ],
  };

  // --- Compliance ----------------------------------------------------------
  const annualDue = (() => {
    if (isCorp && formationState === 'DE') return new Date(forming.getFullYear() + 1, 2, 1);
    if (!isCorp && formationState === 'DE') return new Date(forming.getFullYear() + 1, 5, 1);
    return addDays(forming, 365);
  })();

  const compliance = {
    dates: [
      { date: iso(addDays(forming, 30)), label: '83(b) election deadline for founder stock', detail: 'Must be mailed within 30 days of the stock issuance. No extensions, ever.', critical: true },
      { date: iso(addDays(forming, 30)), label: 'Organisational board meeting and stock issuance', detail: 'Adopt bylaws, appoint officers, issue shares with vesting.', critical: false },
      { date: iso(addDays(forming, 30)), label: `Foreign qualification in ${home.name}`, detail: needsForeignQualification ? 'Required if you operate from your home state.' : 'Not needed — you formed in your home state.', critical: needsForeignQualification },
      { date: iso(addDays(forming, 90)), label: 'Beneficial ownership report (FinCEN) — check current status', detail: 'US-formed companies were exempted in 2025. Confirm the current rule before filing or ignoring it.', critical: false },
      { date: iso(addDays(forming, 60)), label: 'Open the business bank account', detail: 'Before any revenue hits.', critical: true },
      { date: iso(addDays(forming, 120)), label: 'Trademark screening complete', detail: 'Search TESS and file while the brand is still cheap to change.', critical: false },
      { date: iso(annualDue), label: isCorp ? `${formationJurisdiction.name} annual report and franchise tax` : `${formationJurisdiction.name} annual report`, detail: isCorp ? formationJurisdiction.corpAnnualNote : formationJurisdiction.llcAnnualNote, critical: true },
      { date: iso(addDays(forming, 365)), label: 'Registered agent renewal', detail: 'Lapse means losing good standing overnight.', critical: true },
      { date: iso(addDays(forming, 365)), label: 'Domain and email renewal', detail: 'Set auto-renew and a card that does not expire.', critical: false },
      { date: iso(addDays(forming, 365)), label: 'Insurance review', detail: 'General liability, cyber and any professional indemnity your contracts demand.', critical: false },
      { date: iso(addDays(forming, 548)), label: 'Annual minutes or written consent', detail: 'Corporations must document annual approval of actions. Investors check this in diligence.', critical: false },
    ],
    standing: COMPLIANCE_TASKS,
    calendar: ics(identity, [
      { date: addDays(forming, 30), summary: '83(b) election deadline (send by certified post)' },
      { date: addDays(forming, 60), summary: 'Business bank account opened' },
      { date: annualDue, summary: isCorp ? `${formationJurisdiction.name} annual report + franchise tax` : `${formationJurisdiction.name} annual report` },
      { date: addDays(forming, 365), summary: 'Registered agent + domain renewals' },
    ]),
  };

  // --- Cap table -----------------------------------------------------------
  const founderName = intake.founder || '[Founder 1]';
  // Issue from a defined founder block so the total can never exceed the
  // authorized share count: pool first, then an equal split between founders.
  const authorized = 10_000_000;
  const poolShares = raising ? 1_000_000 : 0;
  const founderBlock = 8_000_000 - poolShares;
  const perFounder = Math.floor(founderBlock / (cofounders + 1) / 10) * 10;
  const pct = (shares) => `${((shares / authorized) * 100).toFixed(1)}%`;
  const rows = [
    { holder: founderName, role: 'Founder / CEO', shares: String(perFounder), percent: pct(perFounder), vesting: '4 years, 1-year cliff', notes: '83(b) filed within 30 days' },
  ];
  if (cofounders > 0) {
    for (let index = 0; index < cofounders; index += 1) {
      rows.push({
        holder: `[Co-founder ${index + 1}]`,
        role: '[Role]',
        shares: String(perFounder),
        percent: pct(perFounder),
        vesting: '4 years, 1-year cliff',
        notes: 'Same vesting as everyone else — including the founders',
      });
    }
  }
  if (poolShares) {
    rows.push({
      holder: 'Employee option pool (reserved)',
      role: '—',
      shares: String(poolShares),
      percent: pct(poolShares),
      vesting: '4 years, 1-year cliff',
      notes: 'Size it now; enlarging it later dilutes founders instead of investors',
    });
  }

  const capTable = {
    totalShares: '10,000,000 authorized',
    pricePar: '$0.0001 par value',
    valuation: `At $${(intake.valuation || 8500000).toLocaleString('en-US')} post-money, each 1% is worth about $${Math.round((intake.valuation || 8500000) / 100).toLocaleString('en-US')}.`,
    rows,
    csv: csvTable(rows),
    guidance: [
      'Vest everything, including the founders’ stock. An unvested founder who leaves after three months should not own 30% of the company.',
      'Issue stock, never promise it. A verbal promise is a dispute waiting for a lawyer.',
      'Keep the cap table in one file from day one and reconcile it after every issuance.',
      'Do not give equity before there is a vesting schedule, a purchase agreement and an 83(b).',
      'Rough splits: equal or near-equal between committed co-founders, adjusted for a materially different opportunity cost.',
    ],
  };

  // --- Trademark -----------------------------------------------------------
  const classes = TRADEMARK_CLASSES[profile.key] || [9, 42];
  const trademark = {
    classes: classes.map((code) => ({ code, name: niceClassName(code) })),
    steps: [
      'Search the exact mark, then similar marks, in the USPTO database — including your classes and the two either side.',
      'Search the mark as a plain word and as a design. Search your state registry too; it catches local users.',
      'Check common-law use: Google, the app stores, and your industry’s directories.',
      'File with intent-to-use (1b) if you have not sold anything yet, or use-in-commerce (1a) if you have.',
      'Budget for the fee per class — each class is a separate fee, so file the classes you actually sell in.',
      'Set a reminder before the five-year and ten-year maintenance deadlines; a lapsed mark is worse than none.',
    ],
    links: [
      { label: 'USPTO trademark search (TESS)', href: `https://tmsearch.uspto.gov/search/search-information?q=${encodeURIComponent(identity.name)}` },
      { label: 'USPTO filing (TEAS)', href: 'https://www.uspto.gov/trademarks/apply' },
      { label: 'Trademark fee schedule', href: 'https://www.uspto.gov/trademarks/apply/trademark-fee-information' },
      { label: 'EUIPO (if you will trade in the EU)', href: 'https://euipo.europa.eu/ohimportal/en/apply-now' },
    ],
    note: 'A domain or a state registration gives you no trademark rights. Only use in commerce plus registration (federal, or common-law in your market) builds protection.',
  };

  const documents = buildDocuments({ intake, identity, profile, chosenEntity, isCorp, formationJurisdiction, home, ein, bank, compliance, capTable, trademark, founderName, forming });

  // Printable government forms. These are whole HTML documents rather than
  // markdown, so they ride in `documents` for the bundle but are listed
  // separately as `forms` for the UI, which opens them instead of rendering them.
  const forms = governmentForms(
    { intake, identity, company: { recommendation: { entity: chosenEntity, jurisdiction: formationJurisdiction } } },
    { entity: isCorp ? 'corp' : 'llc', state: formationState },
  );
  forms.forEach((form) => {
    documents[form.path] = form.html;
  });

  return {
    disclaimer: DISCLAIMER,
    recommendation: { ...recommendation, entity: chosenEntity, jurisdiction: formationJurisdiction, formationState, needsForeignQualification, homeState: home.name },
    entityOptions: ENTITY_TYPES,
    jurisdictions: jurisdictionRows,
    costEstimate: {
      filing: totalFilingCost,
      firstYearLow: totalFilingCost + 150,
      firstYearHigh: totalFilingCost + 2200,
      breakdown: [
        { item: `State filing fee (${formationJurisdiction.name})`, cost: `$${isCorp ? formationJurisdiction.corpFee : formationJurisdiction.llcFee}` },
        ...(needsForeignQualification ? [{ item: `Foreign qualification (${home.name})`, cost: `$${home.llcFee}–${home.corpFee}` }] : []),
        { item: 'Registered agent (annual)', cost: '$50–300' },
        { item: 'Lawyer review of formation + founder docs', cost: '$500–1,500' },
        { item: 'Franchise tax or annual report', cost: isCorp ? `$${formationJurisdiction.corpAnnual} minimum` : `$${formationJurisdiction.llcAnnual}` },
        { item: 'EIN', cost: '$0 (never pay a reseller)' },
      ],
      note: 'Do not skip the lawyer line if you have co-founders or intend to raise. It is the cheapest insurance in the whole launch.',
    },
    filingSteps,
    ein: { ...ein, fields: ein.fields.map((field) => ({ ...field, value: String(field.value) })) },
    bank,
    compliance,
    capTable,
    trademark,
    documents,
    forms: forms.map((form) => ({ id: form.id, path: form.path, title: form.title, description: form.description })),
    screening: identity.screening,
  };
}

function matchProvider(provider, profile, intake) {
  const reasons = [];
  if (/Mercury|Relay|Bluevine/.test(provider.name) && profile.key !== 'local-service') reasons.push('Popular with software companies and works without a branch visit.');
  if (/community bank/.test(provider.name) && (profile.key === 'local-service' || Number(intake.employees || 0) > 3)) reasons.push('You will handle cash or want a human for lending later.');
  if (provider.name === 'Brex' && intake.raising === true) reasons.push('Funded companies get better limits and no personal guarantee.');
  if (provider.name === 'Novo' && profile.key === 'agency') reasons.push('Built-in invoicing suits project work.');
  return reasons.join(' ') || 'Reasonable default if the others decline.';
}

function niceClassName(code) {
  return {
    5: 'Pharmaceuticals and health preparations',
    9: 'Software, apps and electronic devices',
    16: 'Printed matter and stationery',
    18: 'Leather goods and bags',
    25: 'Clothing and footwear',
    30: 'Coffee, tea and foodstuffs',
    35: 'Advertising, business management and retail services',
    36: 'Financial and insurance services',
    37: 'Construction, repair and installation services',
    39: 'Transport, travel and storage',
    41: 'Education, training and entertainment',
    42: 'Computer, scientific and technological services',
    43: 'Food and beverage services',
    44: 'Medical, veterinary and personal care services',
  }[code] || `Nice class ${code}`;
}

function csvTable(rows) {
  const header = 'Holder,Role,Shares,Percent,Vesting,Notes';
  const body = rows
    .map((row) => [row.holder, row.role, row.shares, row.percent, row.vesting, row.notes].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  return `${header}\n${body}\n`;
}

function ics(identity, events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Blueprint//Compliance//EN',
    `X-WR-CALNAME:${identity.name} compliance`,
  ];
  events.forEach((event, index) => {
    const date = iso(event.date).replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:blueprint-${index}-${slugTitle(identity.name)}@blueprint.local`,
      `DTSTAMP:${iso(new Date()).replace(/-/g, '')}T090000Z`,
      `DTSTART;VALUE=DATE:${date}`,
      `SUMMARY:${event.summary}`,
      `DESCRIPTION:Generated by Blueprint. Verify with the official source before relying on this date.`,
      'BEGIN:VALARM',
      'TRIGGER:-P14D',
      'ACTION:DISPLAY',
      `DESCRIPTION:Two weeks until: ${event.summary}`,
      'END:VALARM',
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------------------
// Document drafts
// ---------------------------------------------------------------------------

function buildDocuments(ctx) {
  const { intake, identity, profile, chosenEntity, isCorp, formationJurisdiction, home, ein, bank, compliance, capTable, trademark, founderName, forming } = ctx;
  const files = {};
  const header = (title) => `# ${title}\n\n**${identity.legalName}** · prepared ${fmt(new Date())} · Blueprint\n\n${DISCLAIMER}\n`;

  files['legal/00-document-index.md'] = `${header('Formation document index')}
Everything in this folder is a draft for review. Work through it in this order.

| # | Document | Who reviews it | When |
| --- | --- | --- | --- |
| 1 | [Certificate of Incorporation / Articles of Organization](01-formation-filing.md) | Lawyer | Before filing |
| 2 | [Bylaws outline / Operating agreement outline](02-governing-documents.md) | Lawyer | At formation |
| 3 | [Organisational board consent](03-organizational-consent.md) | Lawyer | Within 30 days |
| 4 | [Founder stock purchase and vesting](04-founder-stock.md) | Lawyer | Within 30 days |
| 5 | [Proprietary information and inventions assignment](05-ip-assignment.md) | Lawyer + each founder | Before work begins |
| 6 | [83(b) election checklist](06-83b-election.md) | You + tax adviser | Within 30 days of issuance |
| 7 | [EIN application packet](07-ein-packet.md) | You | Before banking |
| 8 | [Bank-ready packet](08-bank-packet.md) | You | Before banking |
| 9 | [Trademark screening](09-trademark.md) | You, then a lawyer files | Before you print anything |
| 10 | [Compliance calendar](10-compliance.md) | You | Day one |
| 11 | [Cap table](11-cap-table.md) | You + lawyer | At issuance |

**Sequencing that matters:** IP assignments before the first commit; 83(b) within the 30-day window; foreign qualification within the state's deadline; bank account before revenue.
`;

  if (isCorp) {
    files['legal/01-formation-filing.md'] = `${header(`Certificate of Incorporation — ${formationJurisdiction.name}`)}
> File this with the ${formationJurisdiction.name} Division of Corporations. Filing portal: ${formationJurisdiction.fileUrl}
> Estimated filing fee: **$${formationJurisdiction.corpFee}**. Turnaround: ${formationJurisdiction.timeline}.

**CERTIFICATE OF INCORPORATION OF ${identity.legalName.toUpperCase()}**

*The undersigned, being a natural person of full age and the incorporator, certifies as follows:*

**FIRST: Name.** The name of the corporation is ${identity.legalName}.

**SECOND: Registered office and agent.** The registered office of the corporation in the State of ${formationJurisdiction.name} is located at [street address of the registered agent], and the name of its registered agent at that address is [registered agent name].

**THIRD: Purpose.** The purpose of the corporation is to engage in any lawful act or activity for which corporations may be organized under the General Corporation Law of the State of ${formationJurisdiction.name}, including but not limited to: ${profile.category} and related software, data and consulting services.

**FOURTH: Authorized shares.** The total number of shares of stock which the corporation shall have authority to issue is **10,000,000 shares of common stock, each with a par value of $0.0001**. [Add a preferred class only when a priced round requires it.]

**FIFTH: Limitation of director liability.** To the fullest extent permitted by law, a director of the corporation shall not be personally liable to the corporation or its stockholders for monetary damages for breach of fiduciary duty as a director. This provision does not eliminate liability for (i) breach of the duty of loyalty, (ii) acts or omissions not in good faith or involving intentional misconduct or a knowing violation of law, (iii) unlawful distributions, or (iv) any transaction from which the director derived an improper personal benefit.

**SIXTH: Indemnification.** The corporation shall indemnify and advance expenses to its directors and officers to the fullest extent permitted by law, and may enter into individual indemnification agreements.

**SEVENTH: Duration and dissolution.** The corporation is to have perpetual existence. [Optional: include a "corporate opportunity" waiver so investors and directors may pursue other investments.]

**EIGHTH: Forum.** Unless the corporation consents in writing otherwise, the Court of Chancery of the State of ${formationJurisdiction.name} shall be the sole and exclusive forum for internal corporate claims.

**NINTH: Incorporator.** The name and mailing address of the incorporator is ${founderName}, [address].

*IN WITNESS WHEREOF, the incorporator has executed this certificate on ${fmt(forming)}.*

Signature: ______________________________  ${founderName}, Incorporator

---

### Before you file
- [ ] Every bracket above is filled and matches your EIN application exactly.
- [ ] Your lawyer has confirmed you are not accidentally agreeing to a provision you do not want.
- [ ] You have reserved the entity name, or accepted the risk that it is taken in the meantime.
`;
  } else {
    files['legal/01-formation-filing.md'] = `${header(`Articles of Organization — ${formationJurisdiction.name}`)}
> File with the ${formationJurisdiction.name} registry: ${formationJurisdiction.fileUrl}
> Estimated filing fee: **$${formationJurisdiction.llcFee}**. Turnaround: ${formationJurisdiction.timeline}.

**ARTICLES OF ORGANIZATION OF ${identity.legalName.toUpperCase()}**

**ARTICLE I — Name.** The name of the limited liability company is ${identity.legalName}.

**ARTICLE II — Duration.** The company shall have perpetual duration unless dissolved in accordance with law.

**ARTICLE III — Purpose.** The company is organized to transact any lawful business for which limited liability companies may be organized under the laws of the State of ${formationJurisdiction.name}, including ${profile.category} and related services.

**ARTICLE IV — Registered agent and principal office.** The registered agent is [name] at [street address], and the principal office of the company is [address].

**ARTICLE V — Management.** The company shall be **member-managed** unless the operating agreement provides otherwise. [Choosing manager-managed here removes members from apparent authority to bind the company — decide deliberately.]

**ARTICLE VI — Dissolution.** The company may be dissolved as provided in the operating agreement and applicable law.

*Executed on ${fmt(forming)}.*

Signature: ______________________________  ${founderName}, Organizer
`;
  }

  files['legal/02-governing-documents.md'] = `${header(isCorp ? 'Bylaws outline' : 'Operating agreement outline')}
${
  isCorp
    ? `Bylaws are the internal rulebook. You do not file them with the state, but investors, banks and auditors will ask for them.

**Articles to include**
1. **Offices** — principal office and registered office references.
2. **Stockholders** — annual meeting date, notice periods, quorum, record date, action by written consent, proxy mechanics.
3. **Board of directors** — number of directors, how they are elected and removed, vacancy filling, regular and special meetings, notice, quorum, telephonic participation, committees, compensation.
4. **Officers** — appointment, removal, authority of the CEO, president, treasurer and secretary; delegation limits.
5. **Indemnification** — mirror the certificate; specify advancement of expenses.
6. **Stock certificates** — whether shares are certificated, transfer restrictions, legends, lost-certificate procedure.
7. **Records and reports** — where records live, stockholder inspection rights and their limits.
8. **Amendments** — who can amend and with what vote.
9. **Fiscal year, corporate seal, emergency provisions** — including remote decision-making if directors are unreachable.
10. **Conflicts and corporate opportunity** — how board conflicts are disclosed and handled.`
    : `Unlike a corporation, an LLC is governed almost entirely by contract. A weak operating agreement is the most common cause of equity disputes in small companies.

**Sections to include**
1. **Formation and name** — statutory references and the company's principal office.
2. **Purpose and powers** — broad, with any regulated activity called out.
3. **Members and interests** — who owns what percentage, and how that translates to capital accounts.
4. **Capital contributions** — amounts, deadlines, and the consequences of failing to contribute.
5. **Distributions** — tax distributions, discretionary distributions, how profits and losses are allocated, and the order of payments on dissolution.
6. **Management** — member-managed or manager-managed, voting thresholds, who can sign contracts and open accounts, and what requires unanimous consent (hiring, borrowing, selling assets, admitting members).
7. **Transfer of interests** — right of first refusal, permitted transfers to estates and trusts, tag-along and drag-along rights, and valuation method for buyouts.
8. **Vesting and departures** — what happens to the interest of a member who leaves, dies or is disabled, and whether it vests over time.
9. **Tax matters** — partnership representative, elections, capital accounts, and compliance with the substantial economic effect regulations.
10. **Dispute resolution** — mediation first, then arbitration or the courts, and who pays fees.
11. **Dissolution** — triggers, winding-up process and creditor priority.
12. **Amendments** — required vote, and anti-amendment protections for minority members.`
}
`;
  files['legal/03-organizational-consent.md'] = `${header('Organisational consent — initial board and stockholder actions')}
> Adapt the format to your entity: a corporation acts by board and stockholder consent; an LLC acts by member consent. Adopt these actions at your first formal meeting and keep the signed originals with your formation documents.

**${isCorp ? 'ACTION BY WRITTEN CONSENT OF THE SOLE INCORPORATOR' : 'WRITTEN CONSENT OF THE SOLE MEMBER'}**

The undersigned, acting as ${isCorp ? 'sole incorporator' : 'sole member'} of ${identity.legalName}, adopts the following resolutions:

1. **Filed certificate / articles.** RESOLVED, that the certificate of incorporation (or articles of organization) filed with the State of ${formationJurisdiction.name} on [date] is ratified, approved and adopted.
2. **${isCorp ? 'Bylaws' : 'Operating agreement'}.** RESOLVED, that the ${isCorp ? 'bylaws' : 'operating agreement'} presented to the ${isCorp ? 'board' : 'member'} are adopted and shall govern the internal affairs of the company.
3. **Directors.** RESOLVED, that the following persons are elected as directors to serve until the first annual meeting: [names].
4. **Officers.** RESOLVED, that the following officers are appointed: [name] as [President/CEO], [name] as [Treasurer/CFO], [name] as [Secretary].
5. **Principal office and registered agent.** RESOLVED, that the principal office is [address] and that [agent] is appointed registered agent.
6. **EIN.** RESOLVED, that ${ein.fields.find((field) => field.line === '7a')?.value} is designated the responsible party and is authorized to apply for an employer identification number.
7. **Bank account.** RESOLVED, that the company is authorized to open accounts with [bank], and that [names] are authorized signatories. Any single signatory may act up to $[amount].
8. **Stock issuance.** RESOLVED, that the company issue [number] shares of common stock to ${founderName} at $[price] per share under a restricted stock purchase agreement, subject to a repurchase right that lapses under the following vesting schedule: 25% after 12 months, then 1/48th monthly for 36 months.
9. **Stock plan.** RESOLVED, that 1,000,000 shares are reserved under the [year] Stock Plan [if applicable].
10. **IP assignments.** RESOLVED, that the company accept the assignment of all intellectual property from each founder and contractor, and that each person must execute a Proprietary Information and Inventions Assignment.
11. **Fiscal year and accountant.** RESOLVED, that the fiscal year ends 31 December, and that [firm] is engaged as accountant [if applicable].
12. **Insurance.** RESOLVED, that the company may obtain general liability, cyber and directors-and-officers insurance as recommended by counsel.
13. **${home.name} qualification.** RESOLVED, that the officers are authorized to register the company as a foreign entity in ${home.name}.
14. **Reimbursement.** RESOLVED, that the company shall reimburse founders for formation expenses incurred on its behalf, totalling $[amount].
15. **83(b).** RESOLVED, that the officers shall notify each stockholder subject to a repurchase right of their obligation to consider and timely file an 83(b) election.

*Executed on ${fmt(forming)} by ${founderName}, acting as incorporator and sole initial ${isCorp ? 'director' : 'member'}.*

Signature: ______________________________
`;

  files['legal/04-founder-stock.md'] = `${header('Founder stock purchase agreement — key terms')}
> A term sheet your lawyer turns into a real agreement. Do not issue shares on a handshake.

| Term | Value for ${identity.name} | Why it matters |
| --- | --- | --- |
| Stockholder | ${founderName} | The person actually receiving the shares |
| Shares | [number] of common shares | Set the total against your authorized shares |
| Purchase price | $[0.0001]–$[0.001] per share, paid in cash | Must be real consideration — paid, not promised |
| Payment | Cash, or a promissory note on terms your lawyer approves | An unpaid note is a common diligence flag |
| Vesting | 25% after 12 months, then 1/48 monthly over 36 months | Standard; aligns risk and reward |
| Acceleration | Double-trigger on acquisition only | Single-trigger is generous; cheap to promise, expensive later |
| Repurchase right | Company may repurchase unvested shares at cost on departure | The mechanism that makes vesting real |
| Transfer restrictions | No transfer without board consent; right of first refusal | Keeps your cap table clean and known |
| Election | Promptly file an 83(b) within 30 days | Miss it and vesting can cost you real tax |
| Documents | Spouse consent where community property applies | Prevents a divorce from becoming a cap-table problem |

**Sequence**
1. Board approves issuance and price (a 409A valuation is optional at this stage but needed before you grant options to employees).
2. Founder signs the purchase agreement and pays.
3. Shares are issued and recorded in the cap table.
4. 83(b) is mailed within 30 days with proof of mailing, and a copy is filed with the company records.
`;

  files['legal/05-ip-assignment.md'] = `${header('Proprietary information and inventions assignment (PIIA)')}
> Every founder, employee and contractor signs this **before** contributing work, code, designs or content. Retroactive signing is possible but weaker.

**1. Definitions.** “Company” means ${identity.legalName}. “Inventions” means all ideas, discoveries, designs, code, data, models, content, processes and improvements, whether or not patentable, made by me, alone or with others, that relate to the Company's business or were made using Company resources or time.

**2. Assignment.** I hereby irrevocably assign to the Company all right, title and interest worldwide in all Inventions, effective on creation, including moral rights to the extent permitted by law. I will sign any documents needed to perfect this assignment.

**3. Prior inventions.** Attached as Schedule A is a complete list of inventions I created before joining that I claim as mine. If the list is empty, I confirm that I have no such inventions relevant to the Company's business. Anything not listed and relevant to the Company is assigned.

**4. Disclosure.** I will promptly disclose all Inventions to the Company and maintain adequate records.

**5. Confidentiality.** I will keep non-public information confidential indefinitely, use it only to do my job, and return or destroy it when my relationship with the Company ends. This does not cover information that is public through no fault of mine, or that I am legally required to disclose.

**6. Company property.** All devices, accounts and documents remain Company property.

**7. Third-party and open-source material.** I will not incorporate third-party code, models, datasets or assets into Company work without written approval, and will not include material under a license incompatible with the Company's use.

**8. No conflicting obligations.** I represent that I am not bound by any agreement that conflicts with this one — including a non-compete or IP clause from a previous employer — and I will not bring a former employer's confidential material to the Company.

**9. Non-solicitation.** [Optional and jurisdiction-dependent: for twelve months after my relationship ends I will not solicit Company employees or customers. I acknowledge that non-competition covenants are unenforceable or restricted in several states, including California, and this section does not restrain me from earning a living.]

**10. At-will engagement.** If I am an employee, my employment remains at will and this agreement does not guarantee a term of employment.

**11. Governing law.** [State], with disputes in the courts of [county]. [Consider excluding the forum for IP disputes to avoid conflicts between employment law and IP law.]

**12. Assignment and successors.** This agreement binds me and benefits the Company, its successors and assigns.

Signed: ______________________________  Date: __________
Name: ${founderName}
Company: ${identity.legalName}, by ______________________________

**Schedule A — Prior inventions:** (list or write “None”)
`;

  files['legal/06-83b-election.md'] = `${header('83(b) election — do it or lose money')}
**Deadline: 30 days from the date your restricted stock was issued. Not the date you agreed to it. Not the date you started. There are no extensions, and the IRS has no discretion to grant one.**

**Why it matters.** Without an 83(b) election, you are taxed as your shares vest. If the company is worth more when you vest than when you received the stock, you pay ordinary income tax on the difference on each vesting date. With a timely election you pay tax on the (tiny) value at issuance and start the long-term capital-gains clock — and the QSBS clock if the entity qualifies.

**Checklist**
- [ ] Complete Form 83(b) (a letter-format election works; the service center does not send an acknowledgement).
- [ ] State the total shares, the purchase price, the date issued, the vesting schedule and that the election is under section 83(b) of the Internal Revenue Code.
- [ ] Sign and date it.
- [ ] Attach a copy to your tax return for the year of the issuance.
- [ ] **Mail it by certified post with return receipt** to the IRS service center where you file, and keep the certified receipt and a copy forever. The postmark, not the receipt date, is what counts.
- [ ] Send a copy to the company so it can be placed in the corporate records.
- [ ] Repeat this for every founder who receives restricted stock — each person files separately.

**Common ways people lose money here**
1. Assuming the accountant will handle it — the accountant files your return, they do not file this election.
2. Sending it by ordinary mail with no proof.
3. Calculating the 30 days from the wrong date, or counting calendar months instead of days.
4. Filing the election when the shares have already vested, so there is nothing left to elect.

> Verify the service center address and any change to the rules with the IRS or your tax adviser before mailing. Filing instructions change.
`;

  files['legal/07-ein-packet.md'] = `${header('EIN application packet (Form SS-4)')}
${ein.note}

## Eligibility for the online assistant
${ein.onlineBlockers.map((line) => `- ${line}`).join('\n')}

## Pre-filled values
| SS-4 line | Field | Value |
| --- | --- | --- |
${ein.fields.map((field) => `| ${field.line} | ${field.label} | ${String(field.value).replace(/\|/g, '\\|')} |`).join('\n')}

${ein.fields
  .filter((field) => field.help)
  .map((field) => `> **Line ${field.line}:** ${field.help}`)
  .join('\n>\n')}

## Filing routes
${ein.routes
  .map(
    (route) => `### ${route.name}
- **Eligible when:** ${route.eligible}
- **Typical time:** ${route.time}
- **How:** ${route.how}
- **Official source:** ${route.link}`,
  )
  .join('\n\n')}

## After you receive it
${ein.afterApproval.map((item) => `- ${item}`).join('\n')}

> Never send an SSN or ITIN by unencrypted email. If someone offers to obtain your EIN for a fee, decline — the IRS charges nothing and third parties resell the same form.
`;

  files['legal/08-bank-packet.md'] = `${header('Bank-ready packet')}
${bank.reality}

## Cover sheet (fill this in and put it on top)
| Field | Value |
| --- | --- |
| Legal entity name (exactly as filed) | ${identity.legalName} |
| EIN | [from your CP575 letter] |
| Formation state | ${formationJurisdiction.name} |
| Formation date | ${fmt(forming)} |
| Registered agent | [name and address] |
| Principal business address | [address — no PO box] |
| Website | https://${identity.analysis.compact}.com |
| Industry / what you do | ${profile.category} for ${profile.buyer} |
| Expected monthly volume | [amount] |
| Expected transaction types | [card payments, transfers, payroll] |
| Authorized signatories | ${founderName} |

## Documents to include, in this order
${bank.checklist.map((item, index) => `${index + 1}. **${item.item}** — ${item.why}`).join('\n')}

## Application sequence
${bank.sequence.map((item, index) => `${index + 1}. ${item}`).join('\n')}

## Provider shortlist
| Provider | Type | Best for | Watch out for |
| --- | --- | --- | --- |
${bank.providers.map((provider) => `| ${provider.name} | ${provider.type} | ${provider.idealFor} | ${provider.caveat} |`).join('\n')}

${bank.providers.map((provider) => `### ${provider.name}\n${provider.idealFor}\n\n**Requirements:** ${provider.requirements.join(' · ')}\n\n**Highlights:** ${provider.highlights.join(' · ')}\n\n*Fit for you:* ${provider.match}`).join('\n\n')}

## Avoid these mistakes
${bank.warnings.map((item) => `- ${item}`).join('\n')}
`;

  files['legal/09-trademark.md'] = `${header('Trademark screening')}
## Recommended classes
${trademark.classes.map((entry) => `- **Class ${entry.code}** — ${entry.name}`).join('\n')}

## Steps
${trademark.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

## Official links
${trademark.links.map((link) => `- [${link.label}](${link.href})`).join('\n')}

> ${trademark.note}
`;

  files['legal/10-compliance.md'] = `${header('Compliance calendar')}
## Dated obligations from formation (${fmt(forming)})
| Date | Obligation | Detail |
| --- | --- | --- |
${compliance.dates.map((entry) => `| ${entry.date}${entry.critical ? ' ⚠️' : ''} | ${entry.label} | ${entry.detail} |`).join('\n')}

A ready-to-import calendar is included as \`legal/compliance-calendar.ics\`.

## Standing obligations
${compliance.standing
  .map(
    (task) => `### ${task.title}
- **When:** ${task.when}
- ${task.detail}
- *Source:* ${task.citable}`,
  )
  .join('\n\n')}

## Quarterly review
- [ ] Are all annual filings still on track?
- [ ] Have any new states created tax nexus (customers, employees, inventory)?
- [ ] Are IP assignments signed for everyone who has contributed work?
- [ ] Are cap-table records and board minutes current?
- [ ] Has insurance kept pace with contracts you have signed?
`;

  files['legal/11-cap-table.md'] = `${header('Cap table and equity guidance')}
**Authorized:** ${capTable.totalShares} · **Par value:** ${capTable.pricePar}

| Holder | Role | Shares | % | Vesting | Notes |
| --- | --- | --- | --- | --- | --- |
${capTable.rows.map((row) => `| ${row.holder} | ${row.role} | ${row.shares} | ${row.percent} | ${row.vesting} | ${row.notes} |`).join('\n')}

${capTable.valuation}

A spreadsheet-friendly version is included as \`legal/cap-table.csv\`.

## Guidance
${capTable.guidance.map((item) => `- ${item}`).join('\n')}
`;

  files['legal/cap-table.csv'] = capTable.csv;
  files['legal/compliance-calendar.ics'] = compliance.calendar;

  return files;
}

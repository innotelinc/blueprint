// Print-ready government forms.
//
// Each renderer returns a complete HTML document sized to US Letter at true
// size, so "Print" on the open page produces a form that measures correctly and
// can be signed. Values that can be derived from the project are pre-filled;
// anything only the founder can supply (addresses, taxpayer numbers) is left
// blank so it can be written in rather than printed with a placeholder that
// someone forgets to remove.
//
// Provenance is printed on every sheet. The SS-4 replica is built from the
// published Form SS-4 (Rev. December 2025) line structure, and IRS Publication
// 1167 permits substitute forms that are legible. State sheets carry their own
// provenance, because for several states the state publishes no form to copy.
import { SS4, stateFiling } from './govforms.js';
import { escapeHtml as h } from './rng.js';

// --- Page shell -------------------------------------------------------------

const SHEET_CSS = `
  @page { size: letter portrait; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; background: #e8e8e8; }
  /* No max-height and no overflow:hidden on purpose. A clipped form that looks
     complete is worse than one that flows to a second sheet, so the layout is
     made to fit by construction and the fit is checked in the test suite. */
  .sheet { width: 8.5in; min-height: 11in; padding: 0.26in 0.34in 0.2in; background: #fff; margin: 0 auto;
           position: relative; display: flex; flex-direction: column; }
  .sheet + .sheet { margin-top: 14px; }
  .page-intro { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
  .page-intro .left { flex: 1; }
  .form-id { font-size: 13px; font-weight: 700; letter-spacing: -0.2px; }
  .form-rev { font-size: 8.2px; font-weight: 700; }
  .agency { font-size: 8.2px; line-height: 1.28; margin-top: 2px; }
  .form-title { font-size: 14px; font-weight: 700; margin-top: 5px; line-height: 1.15; }
  .form-sub { font-size: 7.2px; line-height: 1.26; margin-top: 2px; max-width: 5.3in; }
  .side-boxes { width: 2in; flex: none; }
  .side-box { border: 1px solid #000; padding: 2px 5px; font-size: 7.4px; }
  .side-box + .side-box { border-top: 0; }
  .side-box.irs-use { height: 0.62in; }
  .side-box .sb-label { font-weight: 700; }
  .rule { border-top: 2px solid #000; margin: 5px 0 0; }
  .rows { border: 1px solid #000; border-top: 0; }
  .row { display: flex; border-top: 1px solid #000; }
  .row:first-child { border-top: 0; }
  .cell { padding: 1px 5px 1px; border-left: 1px solid #000; min-width: 0; }
  .cell:first-child { border-left: 0; }
  .num { font-weight: 700; }
  .label { font-size: 7.1px; line-height: 1.14; }
  .field { margin-top: 1px; min-height: 11.5px; font-family: 'Courier New', monospace; font-size: 9.2px;
           border-bottom: 1px solid #000; padding: 0 2px 0; word-break: break-word; line-height: 1.2; }
  .field.tall { min-height: 19px; }
  .field.blank { border-bottom: 1px solid #000; }
  .boxes { display: flex; flex-wrap: wrap; gap: 1px 9px; margin-top: 1px; }
  .box-item { display: flex; align-items: flex-start; gap: 3px; font-size: 7.1px; line-height: 1.14; }
  .cb { width: 8px; height: 8px; border: 1px solid #000; flex: none; margin-top: 1px; position: relative; }
  .cb.on::after { content: '\\2715'; position: absolute; inset: -4px 0 0 0; font-size: 10px; font-weight: 700; }
  .yn { display: flex; gap: 9px; margin-top: 1px; font-size: 7.4px; }
  .yn .box-item { font-size: 7.4px; }
  .specify { display: inline-block; min-width: 1.4in; border-bottom: 1px solid #000; margin-left: 3px;
             font-family: 'Courier New', monospace; font-size: 7.4px; padding: 0 2px; }
  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .section { border: 1px solid #000; border-top: 0; padding: 3px 5px 3px; }
  .section-head { font-size: 7.6px; font-weight: 700; margin-bottom: 2px; }
  .decl { font-size: 6.9px; line-height: 1.22; margin-top: 3px; }
  .sig-grid { display: grid; grid-template-columns: 1.5in 1fr 0.95in; gap: 2px 8px; margin-top: 4px; font-size: 7.1px; }
  .sig-grid.wide { grid-template-columns: 1.4in 1fr 1.05in; }
  .sig-line { border-bottom: 1px solid #000; height: 0.26in; }
  .footer { margin-top: auto; padding-top: 5px; font-size: 6.5px; color: #333; line-height: 1.32; border-top: 1px solid #bbb; }
  .footer b { color: #000; }
  .banner { border: 1px solid #000; background: #f2f2f2; padding: 6px 8px; font-size: 8.4px; line-height: 1.4; margin-bottom: 10px; }
  .banner b { display: block; margin-bottom: 2px; font-size: 9.2px; }
  .stamp { position: absolute; top: 0.3in; right: 0.4in; font-size: 7.4px; text-align: right; color: #555; }
  .art-head { text-align: center; }
  .art-head .doc-title { font-size: 13.5px; font-weight: 700; letter-spacing: 0.3px; }
  .art-head .doc-sub { font-size: 9px; margin-top: 3px; }
  .art-sub { font-size: 10px; font-weight: 700; margin: 10px 0 4px; }
  .art-body { font-size: 9.6px; line-height: 1.5; }
  .art-body p { margin: 0 0 7px; }
  .art-list { margin: 0 0 7px 0; padding-left: 0; list-style: none; }
  .art-list li { font-size: 9.6px; line-height: 1.5; margin-bottom: 7px; }
  .art-list b { display: block; }
  .fill-in { display: inline-block; min-width: 1.4in; border-bottom: 1px solid #000; font-family: 'Courier New', monospace; font-size: 9.5px; padding: 0 3px; }
  .checklist { border: 1px solid #000; padding: 8px 9px; font-size: 8.5px; line-height: 1.5; margin-top: 12px; }
  .checklist b { font-size: 9.2px; }
  .checklist ul { margin: 4px 0 0; padding-left: 16px; }
  .kv { width: 100%; border-collapse: collapse; font-size: 8.5px; margin: 4px 0 0; }
  .kv td { border: 1px solid #000; padding: 3px 6px; vertical-align: top; }
  .kv td.k { width: 1.9in; font-weight: 700; background: #f2f2f2; }
  .print-bar { position: fixed; top: 0; left: 0; right: 0; background: #111; color: #fff; padding: 8px 14px;
               font-size: 12px; display: flex; gap: 12px; align-items: center; justify-content: space-between; z-index: 9; }
  .print-bar span { opacity: 0.75; }
  @media print {
    body { background: #fff; }
    .sheet { box-shadow: none; margin: 0; width: auto; min-height: 0; padding: 0.35in 0.4in 0.28in; }
    .print-bar { display: none; }
    .sheet + .sheet { margin-top: 0; }
    .footer { margin-top: 12px; }
  }
  @media screen {
    body { padding: 44px 0 40px; }
    .sheet { box-shadow: 0 1px 6px rgba(0,0,0,0.25); }
  }
`;

function document(title, body, options = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(title)}</title>
<style>${SHEET_CSS}</style>
</head>
<body>
<div class="print-bar no-print">
  <strong>${h(options.barTitle || title)}</strong>
  <span>${h(options.barHint || 'Print at 100% scale on US Letter. Do not use "fit to page".')}</span>
</div>
${body}
</body>
</html>`;
}

const blank = (value) => (value === undefined || value === null || value === '' ? '' : String(value));

function field(value, extra = '') {
  return `<div class="field ${extra}">${blank(value) ? h(blank(value)) : '&nbsp;'}</div>`;
}

function yesNo(selected) {
  const mk = (label, on) => `<span class="box-item"><span class="cb${on ? ' on' : ''}"></span>${label}</span>`;
  return `<div class="yn">${mk('Yes', selected === true)}${mk('No', selected === false)}</div>`;
}

function checkboxList(items, selected = [], options = {}) {
  const set = new Set(selected);
  return `<div class="boxes">${items
    .map((item) => {
      const label = typeof item === 'string' ? item : item.label;
      const specify = typeof item === 'object' && item.specify ? `<span class="specify">${h(item.specify)}</span>` : '';
      return `<span class="box-item"><span class="cb${set.has(label) ? ' on' : ''}"></span>${h(label)}${specify}</span>`;
    })
    .join('')}</div>`;
}

function cell(number, label, content, style = '') {
  return `<div class="cell" style="${style}"><div class="label"><span class="num">${number}</span> ${label}</div>${content}</div>`;
}

function footer(lines) {
  return `<div class="footer">${lines.map((line) => `<div>${line}</div>`).join('')}</div>`;
}

// --- IRS Form SS-4 ----------------------------------------------------------

/** Map the project onto every SS-4 line we can derive without the founder. */
export function ss4Values(project) {
  const { identity, intake, company } = project;
  const isLlc = String(company?.recommendation?.entity?.key || '').includes('llc');
  const isCorp = /corporat/i.test(String(company?.recommendation?.entity?.label || '')) && !isLlc;
  const jurisdiction = company?.recommendation?.jurisdiction || { name: stateFiling(intake.state).name };
  const profile = identity.profile || {};
  const members = Number(intake.cofounders || 0) + 1;
  const employees = Number(intake.employees || 0);

  // Line 9a asks for the federal tax classification. An LLC that has not elected
  // to be taxed as a corporation is reported as "Other", not as a corporation.
  let entityType = 'Corporation (specify)';
  let entitySpecify = '';
  if (isLlc) {
    entityType = 'Other (specify)';
    entitySpecify = members > 1 ? 'Multi-member LLC (partnership)' : 'Single-member LLC (disregarded entity)';
  } else if (!isCorp) {
    entityType = 'Other (specify)';
    entitySpecify = company?.recommendation?.entity?.label || 'Limited liability company';
  }

  return {
    isLlc,
    isCorp,
    values: {
      '1': identity.legalName || identity.name,
      '2': identity.dba && identity.dba !== identity.name ? identity.dba : '',
      '3': '',
      '4a': '',
      '4b': '',
      '5a': '',
      '5b': '',
      '6': '',
      '7a': intake.founder || '',
      '7b': '',
      '8a': isLlc ? true : false,
      '8b': isLlc ? String(members) : '',
      '8c': isLlc ? true : undefined,
      '9a': entityType,
      '9aSpecify': entitySpecify,
      '9b': isCorp ? jurisdiction.name : '',
      '10': 'Started a new business (specify type)',
      '10Specify': profile.category || intake.industryLabel || '',
      '11': intake.formationDate || '',
      '12': 'December',
      '13': employees > 0 ? String(employees) : '0',
      '14': employees > 0 ? true : false,
      '15': '',
      '16': 'Other',
      '17': profile.category ? `${profile.category} for ${profile.buyer}` : `${intake.industryLabel} services`,
      '18': false,
    },
  };
}

export function renderSS4(project) {
  const { intake, identity } = project;
  const { values, isLlc, isCorp } = ss4Values(project);
  const v = values;
  const stateName = stateFiling(intake.state).name;

  const header = `
  <div class="page-intro">
    <div class="left">
      <div class="form-id">${SS4.formNumber}</div>
      <div class="form-rev">(Rev. ${SS4.revision})</div>
      <div class="agency">${SS4.agency}<br>${SS4.bureau}</div>
      <div class="form-title">${SS4.title}</div>
      <div class="form-sub">${SS4.subtitle}</div>
      <div class="form-sub"><b>${SS4.seeInstructions}</b> ${SS4.keepCopy}</div>
    </div>
    <div class="side-boxes">
      <div class="side-box"><span class="sb-label">OMB No.</span> ${SS4.omb}</div>
      <div class="side-box irs-use">
        <div class="sb-label">Date received</div>
        <div style="font-size:7.6px;color:#666;margin-top:2px">For IRS use only</div>
      </div>
    </div>
  </div>
  <div class="rule"></div>`;

  const rows = `
  <div class="rows">
    <div class="row">${cell('1', SS4.lines[0].label, field(v['1']))}</div>
    <div class="row">${cell('2', SS4.lines[1].label, field(v['2']))}</div>
    <div class="row">${cell('3', SS4.lines[2].label, field(v['3']))}</div>
    <div class="row">
      ${cell('4a', SS4.lines[3].label, field(v['4a']), 'flex:1')}
    </div>
    <div class="row">${cell('4b', SS4.lines[4].label, field(v['4b']))}</div>
    <div class="row">${cell('5a', SS4.lines[5].label, field(v['5a']))}</div>
    <div class="row">${cell('5b', SS4.lines[6].label, field(v['5b']))}</div>
    <div class="row">${cell('6', SS4.lines[7].label, field(v['6'] || `&nbsp;`))}</div>
    <div class="row">
      ${cell('7a', SS4.lines[8].label, field(v['7a']), 'flex:1.6')}
      ${cell('7b', SS4.lines[9].label, field(v['7b']), 'flex:1')}
    </div>
    <div class="row">${cell('8a', SS4.lines[10].label, yesNo(isLlc ? true : false))}</div>
    <div class="row">
      ${cell('8b', SS4.lines[11].label, field(v['8b']), 'flex:1')}
    </div>
    <div class="row">${cell('8c', SS4.lines[12].label, isLlc ? yesNo(true) : yesNo(undefined))}</div>
    <div class="row">
      ${cell('9a', SS4.lines[13].label, checkboxList(
        SS4.entityTypes.map((label) => ({ label, specify: label === v['9a'] ? v['9aSpecify'] : '' })),
        [v['9a']],
      ))}
    </div>
    <div class="row">${cell('9b', SS4.lines[14].label, field(v['9b']))}</div>
    <div class="row">
      ${cell('10', SS4.lines[15].label, checkboxList(
        SS4.reasons.map((label) => ({ label, specify: label === v['10'] ? v['10Specify'] : '' })),
        [v['10']],
      ))}
    </div>
    <div class="row">
      ${cell('11', SS4.lines[16].label, field(v['11']), 'flex:1')}
      ${cell('12', SS4.lines[17].label, field(v['12']), 'flex:1')}
    </div>
    <div class="row">
      ${cell('13', SS4.lines[18].label, `
        <div class="grid3" style="margin-top:4px">
          ${SS4.employeeColumns
            .map((name) => `<div><div style="font-size:8px">${name}</div><div class="field" style="min-height:14px">${
              name === 'Other' && v['13'] ? h(v['13']) : '&nbsp;'
            }</div></div>`)
            .join('')}
        </div>`)}
    </div>
    <div class="row">${cell('14', SS4.lines[19].label, yesNo(v['14']))}</div>
    <div class="row">${cell('15', SS4.lines[20].label, field(v['15']))}</div>
    <div class="row">${cell('16', SS4.lines[21].label, checkboxList(SS4.activities, [v['16']]))}</div>
    <div class="row">${cell('17', SS4.lines[22].label, field(v['17'], 'tall'))}</div>
    <div class="row">${cell('18', SS4.lines[23].label, `
      <div style="display:flex;align-items:flex-start;gap:20px;margin-top:2px">
        ${yesNo(v['18'])}
        <div style="flex:1"><div style="font-size:8px">If "Yes," enter previous EIN here</div>${field('')}</div>
      </div>`)}
    </div>
  </div>`;

  const designee = `
  <div class="section">
    <div class="section-head">Third Party Designee</div>
    <div style="font-size:7.9px;line-height:1.3">${SS4.designee.intro}</div>
    <div class="boxes" style="margin-top:5px">
      <span class="box-item"><span class="cb"></span>Check if you want a third party to receive the EIN and answer questions.</span>
    </div>
    <div class="grid2" style="margin-top:5px;gap:0 12px">
      ${SS4.designee.fields
        .map((f) => `<div style="margin-bottom:4px"><div class="label" style="font-size:7.9px">${h(f)}</div>${field('')}</div>`)
        .join('')}
    </div>
  </div>`;

  const signature = `
  <div class="section">
    <div class="decl">${SS4.declaration}</div>
    <div class="sig-grid wide">
      <div><div class="label">${SS4.signatureFields[0]}</div><div class="sig-line"></div></div>
      <div><div class="label">${SS4.signatureFields[1]}</div><div class="sig-line"></div></div>
      <div><div class="label">${SS4.signatureFields[2]}</div><div class="sig-line"></div></div>
    </div>
    <div class="sig-grid">
      <div><div class="label">${SS4.signatureFields[3]}</div><div class="sig-line"></div></div>
      <div><div class="label">${SS4.signatureFields[4]}</div><div class="sig-line"></div></div>
      <div></div>
    </div>
  </div>`;

  const foot = footer([
    `<b>Provenance:</b> prepared replica of ${SS4.formNumber} (Rev. ${SS4.revision}), OMB No. ${SS4.omb}, built from the published line structure. ${h(SS4.reproductionPolicy)}`,
    `<b>Verify before filing:</b> compare against the official form at ${h(SS4.officialPdf)} — the IRS may revise the form before your filing date.`,
    `<b>Fax (50 states and D.C.):</b> ${h(SS4.channels.faxInland)} &nbsp;·&nbsp; <b>Mail:</b> ${h(SS4.channels.mailInland)} &nbsp;·&nbsp; <b>Online EIN assistant:</b> ${h(SS4.channels.online)}`,
    `Prepared for ${h(identity.legalName || identity.name)}${isCorp ? ` — a ${h(stateName)} corporation` : isLlc ? ` — a ${h(stateName)} limited liability company` : ''}. Generated by Blueprint; not a filing service.`,
  ]);

  const body = `<div class="sheet">${header}${rows}${designee}${signature}${foot}</div>`;
  return document(`${SS4.formNumber} — ${identity.legalName || identity.name}`, body, {
    barTitle: `${SS4.formNumber} (Rev. ${SS4.revision}) — ${identity.legalName || identity.name}`,
  });
}

// --- State formation filing -------------------------------------------------

/**
 * The document's own name, taken from the registry rather than assumed.
 * Delaware files a Certificate, not Articles; Texas files a Certificate of
 * Formation even for a corporation; Massachusetts calls a corporation's filing
 * Articles of Organization. Hardcoding "Articles of Incorporation" gets these wrong.
 */
export function documentHeading(spec) {
  // Strip the trailing parenthetical first: some titles contain an em dash
  // inside it (Georgia's transmittal note), which would truncate the name if
  // the dash were split on first.
  return String(spec.title)
    .replace(/\s*\([^)]*\)\s*$/, '')
    .split(' — ')[0]
    .replace(/\s+/g, ' ')
    .trim();
}

export function renderStateFiling(project, options = {}) {
  const { intake, identity, company } = project;
  const entity = options.entity || (String(company?.recommendation?.entity?.key || '').includes('llc') ? 'llc' : 'corp');
  const state = stateFiling(options.state || intake.state);
  const spec = state[entity];
  const isLlc = entity === 'llc';
  const fee = state.fee[entity];
  const profile = identity.profile || {};
  const formationDate = intake.formationDate || '';
  const shares = '10,000,000';
  const par = '0.0001';

  const provenance = spec.printable
    ? `<b>Form reproduced:</b> ${spec.number ? `Form ${h(spec.number)} — ` : ''}${h(spec.title)}, ${h(state.agency)}. Prepared filing built to this form's required statements.`
    : `<b>No state form exists for this filing.</b> ${h(state.note || `${state.name} does not publish a numbered formation form.`)} This sheet is the drafted document the state accepts, not a reproduction of an official form.`;

  const head = `
  <div class="banner">
    <b>${spec.printable ? 'Official state form — prepared filing' : 'Drafted filing document — no official state form'}</b>
    ${provenance}
  </div>
  <div class="art-head">
    <div style="font-size:9px">${h(state.agency)}</div>
    <div class="doc-title">${h(documentHeading(spec).toUpperCase())}</div>
    <div class="doc-sub">${h(spec.title)}</div>
    <div class="doc-sub">${spec.number ? `Form ${h(spec.number)}` : ''}</div>
  </div>
  <table class="kv">
    <tr><td class="k">Entity name</td><td>${h(identity.legalName || identity.name)}</td></tr>
    <tr><td class="k">Jurisdiction</td><td>${h(state.name)}</td></tr>
    <tr><td class="k">Filing fee</td><td>$${fee}${state.feeVerified ? '' : ' <b>(confirm on the state fee schedule before filing)</b>'}${state.feeNote ? ` — ${h(state.feeNote)}` : ''}</td></tr>
    <tr><td class="k">File with</td><td>${h(state.agency)}${state.address ? `<br>${h(state.address)}` : ''}</td></tr>
    <tr><td class="k">Online portal</td><td>${h(state.portal)}</td></tr>
    <tr><td class="k">Registered agent</td><td><span class="fill-in">&nbsp;</span> <span style="font-size:8px">(name and street address in ${h(state.name)}; a post office box is not accepted)</span></td></tr>
  </table>`;

  const articles = isLlc
    ? [
        ['ARTICLE I — Name', `The name of the limited liability company is <b>${h(identity.legalName || identity.name)}</b>.`],
        ['ARTICLE II — Registered agent and registered office', `The name of the registered agent is <span class="fill-in">&nbsp;</span> and the address of the registered office in ${h(state.name)} is <span class="fill-in">&nbsp;</span>.`],
        ['ARTICLE III — Purpose', `The purpose for which the company is organized is to transact any and all lawful business for which limited liability companies may be organized under the laws of the State of ${h(state.name)}, including ${h(profile.category || 'software')} and related products and services.`],
        ['ARTICLE IV — Duration', `The company shall have perpetual duration unless dissolved in accordance with the applicable law of ${h(state.name)}.`],
        ['ARTICLE V — Management', `The company is member-managed. The name and address of each member is: <span class="fill-in">&nbsp;</span>`],
        ['ARTICLE VI — Principal office', `The principal office of the company is located at <span class="fill-in">&nbsp;</span>, ${h(state.name)}.`],
        ['ARTICLE VII — Effective date', `This certificate becomes effective on <b>${h(formationDate)}</b>.`],
      ]
    : [
        ['ARTICLE I — Name', `The name of the corporation is <b>${h(identity.legalName || identity.name)}</b>.`],
        ['ARTICLE II — Registered agent and registered office', `The name of the registered agent is <span class="fill-in">&nbsp;</span> and the address of the registered office in ${h(state.name)} is <span class="fill-in">&nbsp;</span>.`],
        ['ARTICLE III — Purpose', `The purpose for which the corporation is organized is to engage in any lawful act or activity for which corporations may be organized under the laws of ${h(state.name)}, including ${h(profile.category || 'software')} and related products and services.`],
        ['ARTICLE IV — Authorized shares', `The aggregate number of shares which the corporation shall have authority to issue is <b>${shares}</b>, all of one class of common stock, each with a par value of $${par}.`],
        // The placeholder must stay outside h(): escaping it would print the
        // markup literally on the filed document.
        ['ARTICLE V — Directors and incorporator', `The name and address of the incorporator is ${intake.founder ? h(intake.founder) : '<span class="fill-in">&nbsp;</span>'}, <span class="fill-in">&nbsp;</span>. The initial board consists of <span class="fill-in">&nbsp;</span> director(s).`],
        ['ARTICLE VI — Limitation of director liability', `A director of the corporation shall not be personally liable to the corporation or its shareholders for monetary damages for breach of fiduciary duty as a director, except to the extent such exemption from liability is not permitted by the law of ${h(state.name)}.`],
        ['ARTICLE VII — Perpetual duration and effective date', `The corporation shall have perpetual duration. This certificate becomes effective on <b>${h(formationDate)}</b>.`],
      ];

  const articleBlock = articles
    .map(([title, body]) => `<p><b>${title}.</b> ${body}</p>`)
    .join('\n');

  const signature = `
  <div class="art-sub">Execution</div>
  <div class="art-body">
    <p>The undersigned, being at least eighteen years of age and acting as the ${isLlc ? 'organizer' : 'incorporator'} of the ${isLlc ? 'company' : 'corporation'}, declares that the statements above are true and has executed this document on ${h(formationDate)}.</p>
  </div>
  <div class="sig-grid wide">
    <div><div class="label">Signature of ${isLlc ? 'organizer' : 'incorporator'}</div><div class="sig-line"></div></div>
    <div><div class="label">Printed name and title</div><div class="sig-line"></div></div>
    <div><div class="label">Date</div><div class="sig-line"></div></div>
  </div>`;

  const checklist = `
  <div class="checklist">
    <b>Before you file</b>
    <ul>
      <li>Confirm the entity name is available in ${h(state.name)} — a name reservation is cheaper than a rejected filing.</li>
      <li>Fill every blank above. An incomplete ${isLlc ? 'certificate' : 'articles'} is the single most common rejection reason.</li>
      <li>Attach the registered agent's written consent if ${h(state.name)} requires one (Texas requires it; the agent keeps the original).</li>
      <li>Verify the fee above against the state's current schedule${state.feeVerified ? '' : ' — this figure could not be read directly off the official schedule.'}</li>
      <li>File through the portal where possible; it validates the submission and returns the stamped copy faster.</li>
      ${state.note ? `<li><b>${h(state.note)}</b></li>` : ''}
    </ul>
  </div>`;

  const foot = footer([
    provenance,
    `<b>Source:</b> ${h(state.portal)} &nbsp;·&nbsp; <b>Agency:</b> ${h(state.agency)}${state.address ? ` &nbsp;·&nbsp; ${h(state.address)}` : ''}`,
    `Prepared for ${h(identity.legalName || identity.name)} in ${h(state.name)}. Generated by Blueprint; not a filing service and not legal advice.`,
  ]);

  const body = `<div class="sheet"><div class="art-head" style="margin-bottom:6px"></div>${head}<div class="art-sub">Articles</div><div class="art-body">${articleBlock}</div>${signature}${checklist}${foot}</div>`;
  return document(
    `${spec.title} — ${state.name} — ${identity.legalName || identity.name}`,
    body,
    { barTitle: `${state.name}: ${spec.title}${spec.number ? ` (${spec.number})` : ''}` },
  );
}

/** Both documents plus the manifest entry each one needs. */
export function governmentForms(project, options = {}) {
  const { identity } = project;
  const entity = options.entity || (String(project.company?.recommendation?.entity?.key || '').includes('llc') ? 'llc' : 'corp');
  const state = stateFiling(options.state || project.intake.state);
  return [
    {
      id: 'ss4',
      path: 'legal/forms/irs-form-ss-4.html',
      title: 'IRS Form SS-4 (printable replica)',
      html: renderSS4(project),
      description: `Pre-filled replica of Form SS-4 (Rev. December 2025) for ${identity.legalName || identity.name}.`,
    },
    {
      id: 'state-filing',
      path: `legal/forms/${state.code.toLowerCase()}-${entity}-formation.html`,
      title: `${state.name} — ${documentHeading(state[entity])}`,
      html: renderStateFiling(project, { entity, state: state.code }),
      description: state[entity].printable
        ? `Prepared filing for ${state[entity].number ? `Form ${state[entity].number} — ` : ''}${state[entity].title}.`
        : `Drafted ${state[entity].title} for ${state.name}, which publishes no numbered formation form.`,
      documentName: documentHeading(state[entity]),
    },
  ];
}

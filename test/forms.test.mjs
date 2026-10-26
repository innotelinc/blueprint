import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCompany } from '../public/lib/index.js';
import { SS4, STATE_FILINGS, STATE_CODES, stateFiling } from '../public/lib/govforms.js';
import { renderSS4, renderStateFiling, ss4Values, documentHeading } from '../public/lib/printforms.js';

const build = (overrides = {}) =>
  generateCompany({ name: 'Northwind', industry: 'saas', founder: 'Ada Founder', formationDate: '2026-11-03', ...overrides });

const formHtml = (project, id) => {
  const form = project.company.forms.find((entry) => entry.id === id);
  return project.bundle.files.find((file) => file.path === form.path).content;
};

// Labels are escaped on the way into the document, so compare like for like.
const escapeLabel = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

test('the jurisdiction registry covers all 50 states plus DC', () => {
  assert.equal(STATE_CODES.length, 51);
  for (const code of [...STATE_CODES, 'DC']) {
    assert.match(code, /^[A-Z]{2}$/, `${code} is not a two-letter code`);
  }
  for (const [code, state] of Object.entries(STATE_FILINGS)) {
    assert.ok(state.name, `${code} has no name`);
    assert.ok(state.agency, `${code} has no filing agency`);
    assert.ok(state.portal && state.portal.startsWith('https://'), `${code} has no https portal`);
    for (const kind of ['corp', 'llc']) {
      assert.ok(state[kind], `${code} is missing its ${kind} filing`);
      assert.ok(state[kind].title, `${code} ${kind} has no document title`);
      assert.equal(typeof state[kind].printable, 'boolean', `${code} ${kind} must declare printable`);
      assert.ok(Number.isFinite(state.fee[kind]), `${code} ${kind} has no numeric fee`);
    }
    assert.equal(typeof state.feeVerified, 'boolean', `${code} must declare whether its fee was verified`);
  }
});

test('stateFiling resolves codes, full names and unknown input', () => {
  assert.equal(stateFiling('CA').name, 'California');
  assert.equal(stateFiling('california').name, 'California');
  assert.equal(stateFiling('  ny ').name, 'New York');
  // An unknown jurisdiction must fall back rather than throw.
  assert.equal(stateFiling('ZZ').code, 'DE');
  assert.equal(stateFiling('').code, 'DE');
  assert.equal(stateFiling(undefined, 'WY').code, 'WY');
});

test('the SS-4 replica carries the form identity and every printed line', () => {
  const project = build();
  const html = formHtml(project, 'ss4');

  assert.ok(html.startsWith('<!doctype html>'), 'must be a complete document');
  assert.ok(html.includes(SS4.omb), 'OMB control number missing');
  assert.ok(html.includes(`Rev. ${SS4.revision}`), 'revision date missing');
  assert.ok(html.includes(SS4.title), 'official title missing');
  assert.ok(html.includes(SS4.agency) && html.includes(SS4.bureau), 'issuing agency missing');
  assert.ok(html.includes(SS4.channels.faxInland), 'fax channel missing');
  assert.ok(html.includes('Cincinnati, OH 45999'), 'mailing address missing');
  assert.ok(html.includes(SS4.officialPdf), 'link to the official PDF missing');
  assert.ok(html.includes('Publication 1167'), 'reproduction basis missing');

  // Every numbered line must be present as a labeled row.
  for (const line of SS4.lines) {
    assert.ok(html.includes(`>${line.id}<`), `line ${line.id} is missing from the form`);
  }
  // The option sets have to be complete or the form is unusable.
  for (const option of [...SS4.entityTypes, ...SS4.reasons, ...SS4.activities]) {
    assert.ok(html.includes(escapeLabel(option)), `line option "${option}" is missing`);
  }
  assert.ok(html.includes('Third Party Designee'), 'designee section missing');
  assert.ok(html.includes('penalties of perjury'), 'declaration missing');
});

test('the SS-4 replica pre-fills what it can and leaves the rest blank', () => {
  const corp = build({ state: 'DE', entity: 'de-c-corp' });
  const corpHtml = formHtml(corp, 'ss4');
  assert.ok(corpHtml.includes('Northwind, Inc.'), 'legal name not pre-filled');
  assert.ok(corpHtml.includes('Started a new business'), 'line 10 not pre-filled');
  assert.ok(corpHtml.includes('Delaware'), 'line 9b should name the state of incorporation');
  assert.ok(corpHtml.includes('Ada Founder'), 'line 7a should carry the responsible party');
  assert.ok(corpHtml.includes('December'), 'line 12 should be pre-filled');

  const llc = build({ state: 'TX', entity: 'home-llc', cofounders: 2 });
  const values = ss4Values(llc).values;
  assert.equal(values['8a'], true, 'an LLC must answer Yes on line 8a');
  assert.equal(values['8b'], '3', 'line 8b should count every member');
  assert.equal(values['8c'], true, 'a domestic LLC answers Yes on line 8c');
  // A plain multi-member LLC is taxed as a partnership, not as a corporation.
  assert.equal(values['9a'], 'Other (specify)');
  assert.match(values['9aSpecify'], /partnership/i);
  assert.equal(values['9b'], '', 'line 9b is for corporations only');
});

test('the SS-4 never carries a taxpayer number or an address it cannot know', () => {
  const html = formHtml(build(), 'ss4');
  assert.ok(!/\b\d{3}-\d{2}-\d{4}\b/.test(html), 'the form must never contain a Social Security number');
  assert.ok(!/1-\d{2}-\d{7}/.test(html), 'the form must not fabricate an EIN');
});

test('each jurisdiction renders its own form with honest provenance', () => {
  for (const [code, state] of Object.entries(STATE_FILINGS)) {
    const project = build({ state: code, entity: 'home-llc' });
    const form = project.company.forms.find((entry) => entry.id === 'state-filing');
    const html = project.bundle.files.find((file) => file.path === form.path).content;

    assert.equal(form.path, `legal/forms/${code.toLowerCase()}-llc-formation.html`, `${code}: unexpected path`);
    assert.ok(html.includes(state.agency), `${code}: filing agency missing`);
    assert.ok(html.includes(state.portal), `${code}: portal link missing`);
    assert.ok(html.includes(`$${state.fee.llc}`), `${code}: fee missing`);
    // Use the project's own legal name — an LLC is "Northwind LLC", a corporation "Northwind, Inc.".
    assert.ok(html.includes(project.identity.legalName), `${code}: entity name missing`);
    assert.ok(html.includes('Signature'), `${code}: no signature block`);

    if (state.llc.printable) {
      assert.ok(html.includes('Form reproduced'), `${code}: a printable state form must be labeled as reproduced`);
      if (state.llc.number) {
        assert.ok(html.includes(state.llc.number), `${code}: official form number ${state.llc.number} missing`);
      }
    } else {
      assert.ok(
        html.includes('No state form exists for this filing'),
        `${code}: must state plainly that the state publishes no form`,
      );
      assert.ok(
        html.includes('drafted document the state accepts'),
        `${code}: must not pass a drafted document off as an official form`,
      );
    }
  }
});

test('a corporation and an LLC in the same state get different documents', () => {
  const corp = build({ state: 'DE', entity: 'de-c-corp' });
  const llc = build({ state: 'DE', entity: 'de-llc' });
  const corpForm = corp.company.forms.find((entry) => entry.id === 'state-filing');
  const llcForm = llc.company.forms.find((entry) => entry.id === 'state-filing');

  assert.equal(corpForm.path, 'legal/forms/de-corp-formation.html');
  assert.equal(llcForm.path, 'legal/forms/de-llc-formation.html');
  const corpHtml = formHtml(corp, 'state-filing');
  const llcHtml = formHtml(llc, 'state-filing');
  // Delaware files CERTIFICATES, not Articles — the heading must not be assumed.
  assert.ok(corpHtml.includes('CERTIFICATE OF INCORPORATION'), 'Delaware files a Certificate of Incorporation');
  assert.ok(!/ARTICLES OF INCORPORATION/.test(corpHtml), 'Delaware must not be labeled with Articles');
  assert.ok(corpHtml.includes('Authorized shares'), 'corporation must state authorized shares');
  assert.ok(corpHtml.includes('10,000,000'), 'corporation must state the share count');
  assert.ok(llcHtml.includes('CERTIFICATE OF FORMATION'), 'Delaware files a Certificate of Formation for an LLC');
  // "authorized shares" appears in Delaware's fee note, so check the articles
  // rather than the whole document: an LLC must not state a share count.
  assert.ok(!llcHtml.includes('10,000,000'), 'an LLC must not state authorized shares');
  assert.ok(/ARTICLE IV — Duration/.test(llcHtml), 'the LLC articles should run Name, Agent, Purpose, Duration');
  assert.ok(llcHtml.includes('member-managed'), 'an LLC should state its management structure');
});

// These are the jurisdiction naming traps: assuming "Articles of Incorporation" is
// wrong in several of them, and the filing would be rejected for the wrong document.
test('each document is named the way its state actually names it', () => {
  const heading = (code, kind) => documentHeading(STATE_FILINGS[code][kind]);
  assert.equal(heading('DE', 'corp'), 'Certificate of Incorporation');
  assert.equal(heading('DE', 'llc'), 'Certificate of Formation');
  assert.equal(heading('TX', 'corp'), 'Certificate of Formation for a For-Profit Corporation');
  assert.equal(heading('NY', 'corp'), 'Certificate of Incorporation for a Domestic Business Corporation');
  assert.equal(heading('MA', 'corp'), 'Articles of Organization');
  assert.equal(heading('CA', 'corp'), 'Articles of Incorporation');
  assert.equal(heading('GA', 'llc'), 'Articles of Organization for LLC');

  // And the rendered sheet must carry that name as its heading.
  for (const [code, state] of [['DE', STATE_FILINGS.DE], ['TX', STATE_FILINGS.TX], ['MA', STATE_FILINGS.MA]]) {
    const project = build({ state: code, entity: 'home-llc' });
    const html = formHtml(project, 'state-filing');
    assert.ok(
      html.includes(documentHeading(state.llc).toUpperCase()),
      `${code}: the sheet heading must match the state's own document name`,
    );
  }
});

test('generated forms are well formed and safe to print', () => {
  const project = build({ state: 'CA', entity: 'home-llc' });
  for (const form of project.company.forms) {
    const html = project.bundle.files.find((file) => file.path === form.path).content;
    assert.ok(!html.includes('undefined'), `${form.path} contains "undefined"`);
    assert.ok(!html.includes('[object Object]'), `${form.path} contains "[object Object]"`);
    assert.ok(!html.includes('NaN'), `${form.path} contains NaN`);
    // Letter sizing is what makes the printed sheet measure correctly.
    assert.ok(html.includes('@page { size: letter portrait; margin: 0; }'), `${form.path} is not set to Letter`);
    assert.ok(html.includes('width: 8.5in'), `${form.path} has no true-size page width`);
    assert.ok(html.includes('min-height: 11in'), `${form.path} has no true-size page height`);
    // Unclosed tags would push content onto a stray page.
    const opens = (html.match(/<div\b/g) || []).length;
    const closes = (html.match(/<\/div>/g) || []).length;
    assert.equal(opens, closes, `${form.path} has unbalanced div tags (${opens} open, ${closes} close)`);
    // Markup that was escaped on its way into the document prints as literal
    // text on a filed form, which is worse than a blank line.
    for (const tag of ['&lt;span', '&lt;div', '&lt;b&gt;', '&lt;/']) {
      assert.ok(!html.includes(tag), `${form.path} prints escaped markup (${tag})`);
    }
  }
});

// An omittable field must degrade to a blank rule, never to escaped markup.
// The founder name is optional, and its absence is what exposed the bug above.
test('forms render without a founder name and stay clean', () => {
  const project = build({ state: 'DE', entity: 'de-c-corp', founder: '' });
  for (const form of project.company.forms) {
    const html = project.bundle.files.find((file) => file.path === form.path).content;
    const body = html.slice(html.indexOf('<body'));
    for (const tag of ['&lt;span', '&lt;div', '&lt;b&gt;']) {
      assert.ok(!body.includes(tag), `${form.path} prints escaped markup with no founder (${tag})`);
    }
    assert.ok(!/\bundefined\b/.test(body), `${form.path} prints "undefined" with no founder`);
  }
});

// A form that silently clips its signature block looks complete and is not.
// The SS-4 is a one-page form, so the layout is compacted until it fits rather
// than hidden — measured in a browser at 10.20in of content against 11in Letter.
test('the printable sheet never clips content to force a one-page fit', () => {
  const project = build({ state: 'DE', entity: 'de-c-corp' });
  for (const form of project.company.forms) {
    const html = project.bundle.files.find((file) => file.path === form.path).content;
    const sheetRule = html.match(/\.sheet \{[^}]*\}/)[0];
    assert.ok(!/overflow\s*:\s*hidden/.test(sheetRule), `${form.path}: .sheet must not clip overflow`);
    assert.ok(!/max-height/.test(sheetRule), `${form.path}: .sheet must not cap its height`);
    assert.ok(/min-height:\s*11in/.test(sheetRule), `${form.path}: .sheet must be a full Letter page`);
  }
});

test('tables and checkboxes render checked state from the project', () => {
  const project = build({ state: 'DE', entity: 'de-c-corp' });
  const html = formHtml(project, 'ss4');
  // The selected entity type and reason must be the ones drawn as checked.
  const checkedCount = (html.match(/class="cb on"/g) || []).length;
  assert.ok(checkedCount >= 2, `expected at least the entity type and reason checked, got ${checkedCount}`);
  const values = ss4Values(project).values;
  assert.ok(html.includes(values['9a']), 'selected entity type missing');
  assert.ok(html.includes(values['10']), 'selected reason missing');
});

test('renderers are callable directly with a minimal project', () => {
  const project = build();
  const ss4 = renderSS4({ intake: project.intake, identity: project.identity, company: project.company });
  const state = renderStateFiling({ intake: project.intake, identity: project.identity, company: project.company }, { entity: 'llc', state: 'WY' });
  assert.ok(ss4.includes(SS4.title));
  assert.ok(state.includes('Wyoming'));
  assert.ok(state.includes('Wyoming') && state.includes('Secretary of State'));
});

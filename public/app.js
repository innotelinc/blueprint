// Blueprint app shell.
//
// The generator runs here in the browser; the API is only used for registry
// lookups, saving a project, and the optional form backend.
import {
  generateCompany,
  INDUSTRY_OPTIONS,
  TONE_OPTIONS,
  AUDIENCE_OPTIONS,
  ENGINE_VERSION,
  normalizeIntake,
  applyPositioningStatement,
} from './lib/index.js';
import { planHighlights } from './lib/businessplan.js';
import { escapeHtml as h } from './lib/rng.js';
import { humanBytes } from './lib/zip.js';
import { zipBundle } from './lib/export.js';
import { handleProbeRequests, SOCIAL_ASSET_SPECS } from './lib/social.js';
import { MAIL_PROVIDERS, DEFAULT_MAIL_PROVIDER, mailRecords } from './lib/domains.js';
import { JURISDICTIONS } from './lib/presets.js';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'identity', label: 'Identity' },
  { id: 'brand', label: 'Brand' },
  { id: 'domains', label: 'Domain & email' },
  { id: 'website', label: 'Website' },
  { id: 'social', label: 'Social' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'plan', label: 'Business plan' },
  { id: 'company', label: 'Company & filing' },
  { id: 'launch', label: 'Launch console' },
];

const STATE = {
  project: null,
  config: null,
  apiOnline: false,
  tab: 'overview',
  chosenLogoId: null,
  checklistDone: new Set(),
  domainResults: null,
  handleResults: null,
  positioning: null,
  mail: null,
  mailBusy: false,
  docPath: 'legal/00-document-index.md',
  previewPath: 'index.html',
  saved: null,
  generating: false,
};

/**
 * Where this browser keeps the projects it can reopen.
 *
 * A project lives on the server keyed by its id and edit token, and the API has no
 * account to list against — a founder is known by the token they hold. So the index
 * of "which projects do I have" is local, and it is the thing the Restore picker
 * reads. `blueprint.lastProject` (the single entry older builds wrote) is folded in
 * on read, so a browser that saved before this list existed still shows its project.
 */
const PROJECTS_KEY = 'blueprint.projects';
const LAST_PROJECT_KEY = 'blueprint.lastProject';

const $ = (selector) => document.querySelector(selector);
const view = $('#view');

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function toast(message, kind) {
  const el = $('#toast');
  el.textContent = message;
  el.className = kind === 'bad' ? 'show bad' : 'show';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    el.className = '';
  }, 4200);
}

function setFooter(message) {
  $('#footer-status').textContent = message;
}

function download(name, content, type = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------------------------------------------------------------------------
// Printable-form modal
// ---------------------------------------------------------------------------
// Generated forms are documents in their own right, so they are shown in a
// modal iframe rather than a pop-up tab: embedded panes and strict pop-up
// settings silently block window.open, and a blocked tab gave the user nothing
// at all. The document goes in through `srcdoc`, which hands the markup to the
// frame directly — no URL to navigate to, no blob to revoke, and nothing that
// a strict frame-src policy or a browser short of network access can refuse.
// The frame inherits our origin, so the modal can style and print it.

const FORM_HINT = 'Print at 100% scale on US Letter — do not use "fit to page".';
const FORM_FALLBACK_HINT =
  'The embedded preview did not load here, so there is nothing to print from this window. Use "Open in new tab", or "Save .html" and print the file.';
const FORM_FRAME_CSS = '.print-bar { display: none !important; } @media screen { body { padding: 0 0 24px; } }';

let formLoadTimer = null;

function setFormHint(text, warn = false) {
  const hint = $('#form-modal-hint');
  hint.textContent = text;
  hint.style.color = warn ? 'var(--warn)' : '';
}

// An iframe that never commits a navigation leaves an empty gray box and no
// explanation — the same dead end as a silently blocked pop-up, which is what
// this modal replaced. So the frame is checked and, if it is empty, the modal
// says what to do instead. A cross-origin document counts as loaded: it is
// unreadable, not broken.
function frameLoadedForm() {
  const frame = $('#form-modal-frame');
  try {
    const doc = frame.contentDocument;
    if (!doc) return true;
    return Boolean(doc.querySelector('.sheet') || doc.body?.textContent?.trim());
  } catch {
    return true;
  }
}

function formContent(path) {
  return (
    STATE.project?.bundle?.files?.find((file) => file.path === path)?.content ??
    STATE.project?.company?.documents?.[path] ??
    null
  );
}

function closeForm() {
  const modal = $('#form-modal');
  if (modal.hidden) return;
  clearTimeout(formLoadTimer);
  // Dropping the markup releases the frame's document along with the copy of
  // the form the browser parsed for it.
  $('#form-modal-frame').removeAttribute('srcdoc');
  modal.hidden = true;
  modal.removeAttribute('data-path');
  document.body.classList.remove('form-open');
}

function openForm(path) {
  const content = formContent(path);
  if (!content) {
    setFooter(`Form not found: ${path}`);
    return;
  }
  const modal = $('#form-modal');
  const frame = $('#form-modal-frame');
  // Recording the path first means a late load event for a previous form can
  // tell that it is stale and do nothing.
  modal.dataset.path = path;
  clearTimeout(formLoadTimer);
  setFormHint(FORM_HINT);

  const settle = () => {
    if (modal.hidden || modal.dataset.path !== path) return false;
    try {
      const doc = frame.contentDocument;
      // The modal already carries the form's title and the print hint, so the
      // form's own screen-only bar is dropped to give the sheet the full height.
      if (doc?.head && !doc.getElementById('modal-frame-css')) {
        const style = doc.createElement('style');
        style.id = 'modal-frame-css';
        style.textContent = FORM_FRAME_CSS;
        doc.head.appendChild(style);
      }
    } catch {
      // Unreadable for some reason: the form still renders, it keeps its bar.
    }
    if (frameLoadedForm()) return true;
    setFormHint(FORM_FALLBACK_HINT, true);
    return false;
  };

  frame.addEventListener('load', () => {
    clearTimeout(formLoadTimer);
    settle();
  }, { once: true });
  // A frame that never fires load would otherwise leave a silent empty box.
  formLoadTimer = setTimeout(settle, 4000);

  frame.srcdoc = content;
  $('#form-modal-title').textContent =
    STATE.project?.company?.forms?.find((form) => form.path === path)?.title || path;
  $('#form-modal-path').textContent = path;
  modal.hidden = false;
  document.body.classList.add('form-open');
  $('#form-modal-print').focus();
  setFooter(`Print ${path} at 100% scale on US Letter — do not use "fit to page".`);
}

function printForm() {
  const frame = $('#form-modal-frame');
  const path = $('#form-modal').dataset.path || 'the form';
  try {
    const win = frame.contentWindow;
    if (!win || typeof win.print !== 'function') throw new Error('the frame is not printable');
    win.focus();
    win.print();
    setFooter(`Sent ${path} to the print dialog — choose US Letter at 100% scale.`);
  } catch (error) {
    setFooter(`This browser would not print the embedded form (${error.message}). Use "Open in new tab" and print from there.`);
  }
}

// A real click, so a tab opened here is a user gesture and is not pop-up
// blocked. This is the unambiguous print path when a browser prints its host
// page instead of the frame.
function openFormTab() {
  const path = $('#form-modal').dataset.path || '';
  const content = formContent(path);
  if (!content) {
    setFooter(`Form not found: ${path}`);
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type: 'text/html' }));
  const win = window.open(url, '_blank');
  if (!win) {
    URL.revokeObjectURL(url);
    setFooter('Your browser blocked the tab. Use "Save .html" and open the file.');
    return;
  }
  setFooter(`Opened ${path} in a tab — print at 100% scale on US Letter.`);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.token ? { 'x-edit-token': options.token } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text.slice(0, 200) };
  }
  if (!response.ok) {
    const error = new Error(data.message || `Request failed (${response.status})`);
    error.data = data;
    error.status = response.status;
    throw error;
  }
  return data;
}

/** Minimal markdown renderer. Escapes first, then applies structure. */
function md(text) {
  const safeHref = (url) => (/^(https?:|mailto:|#|\/)/i.test(url) ? url : '#');
  const inline = (value) =>
    h(value)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => `<a href="${h(safeHref(url))}" target="_blank" rel="noopener noreferrer">${label}</a>`);

  const lines = String(text ?? '').split('\n');
  const out = [];
  let list = null;
  let inCode = false;
  let table = null;
  let quote = false;

  const closeList = () => {
    if (list) out.push(list === 'ol' ? '</ol>' : '</ul>');
    list = null;
  };
  const closeTable = () => {
    if (!table) return;
    const [head, ...rows] = table;
    out.push('<table><thead><tr>' + head.map((cell) => `<th>${inline(cell)}</th>`).join('') + '</tr></thead><tbody>');
    rows.forEach((row) => out.push('<tr>' + row.map((cell) => `<td>${inline(cell)}</td>`).join('') + '</tr>'));
    out.push('</tbody></table>');
    table = null;
  };
  const closeQuote = () => {
    if (quote) out.push('</blockquote>');
    quote = false;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');

    if (line.startsWith('```')) {
      closeList(); closeTable(); closeQuote();
      out.push(inCode ? '</pre>' : '<pre>');
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(h(raw));
      continue;
    }

    if (/^\|/.test(line)) {
      closeList(); closeQuote();
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
      table = table || [];
      table.push(cells);
      continue;
    }
    closeTable();

    if (!line.trim()) {
      closeList(); closeQuote();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList(); closeQuote();
      const level = Math.min(3, heading[1].length);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      closeList();
      if (!quote) out.push('<blockquote>');
      quote = true;
      out.push(`<p>${inline(line.replace(/^>\s?/, ''))}</p>`);
      continue;
    }
    closeQuote();

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (numbered) {
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${inline(numbered[1])}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList(); closeTable(); closeQuote();
  if (inCode) out.push('</pre>');
  return out.join('\n');
}

async function svgToPng(svg, width, height) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.decoding = 'sync';
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Could not rasterise the SVG.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, width, height);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Extract a page's markup and styles for a contained visual preview.
 *
 * The preview is rendered into a shadow root rather than an iframe: shadow DOM
 * scopes the site's CSS away from the app, and because scripts are stripped and
 * never executed the preview cannot post forms or touch the parent document.
 */
function sitePreview(site, path) {
  const source = site.files[path] || site.files['index.html'];
  const doc = new DOMParser().parseFromString(source, 'text/html');
  for (const node of doc.querySelectorAll('script, link, style')) node.remove();

  const css = ['css/brand.css', 'css/styles.css']
    .map((file) => site.files[file])
    .filter(Boolean)
    .join('\n')
    // Tokens and page-level styles are remapped onto the shadow host.
    .replace(/:root/g, ':host')
    .replace(/\bhtml\s*\{[^}]*\}/g, '')
    .replace(/\bbody\s*\{/g, '.dz-preview-body {');

  return { css, body: doc.body.innerHTML };
}

function mountPreview() {
  const host = document.getElementById('site-preview');
  if (!host || !STATE.project) return;
  const { css, body } = sitePreview(STATE.project.site, STATE.previewPath);
  const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>:host{display:block}${css}</style><div class="dz-preview-body">${body}</div>`;
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function metric(label, value, sub) {
  return `<div class="metric"><div class="label">${h(label)}</div><div class="value">${h(value)}</div>${sub ? `<div class="sub">${h(sub)}</div>` : ''}</div>`;
}

function table(headers, rows, options = {}) {
  const head = headers
    .map((header) => `<th${typeof header === 'object' && header.num ? ' class="num"' : ''}>${h(typeof header === 'object' ? header.label : header)}</th>`)
    .join('');
  const body = rows
    .map(
      (row) =>
        '<tr>' +
        row
          .map((cell) => {
            if (cell && typeof cell === 'object' && 'html' in cell) return `<td${cell.num ? ' class="num"' : ''}>${cell.html}</td>`;
            return `<td${typeof cell === 'string' && /^\d+(\.\d+)?$/.test(cell) ? ' class="num"' : ''}>${h(cell)}</td>`;
          })
          .join('') +
        '</tr>',
    )
    .join('');
  const wrap = `<div class="table-wrap${options.scroll ? ' scroll-y' : ''}"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  return options.scroll && rows.length > 12 ? `<div class="scroll-y">${wrap}</div>` : wrap;
}

function availabilityChip(result) {
  if (!result) return '<span class="chip">not checked</span>';
  if (result.available === true) return `<span class="chip good">available · ${h(result.confidence)} confidence</span>`;
  if (result.available === false) return '<span class="chip bad">registered</span>';
  return '<span class="chip warn">could not confirm</span>';
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function panelOverview(p) {
  const { summary, identity, bundle, checklist } = p;
  const done = STATE.checklistDone.size;
  return `
  <div class="section-head">
    <h1>${h(identity.name)}</h1>
    <p>${h(identity.primaryTagline)}</p>
  </div>
  <div class="grid grid-4">
    ${metric('Legal name', identity.legalName)}
    ${metric('Recommended entity', summary.entity, `${summary.jurisdiction} · ${p.company.recommendation.needsForeignQualification ? `plus ${p.company.recommendation.homeState} registration` : 'single filing'}`)}
    ${metric('Primary domain', summary.domain, p.domains.primaryDomain === p.domains.primary ? 'the .com is available to check' : 'your chosen domain')}
    ${metric('Bundle', `${summary.fileCount} files`, summary.bundleSize)}
    ${metric('Brand archetype', identity.archetype.name, identity.tone.label)}
    ${metric('Launch steps', `${done} / ${checklist.length}`, done === 0 ? 'nothing ticked yet' : `${Math.round((done / checklist.length) * 100)}% complete`)}
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Take it with you</h2></div>
    <div class="row">
      <button class="btn btn-primary" data-action="download-zip">Download the whole bundle (.zip)</button>
      <button class="btn" data-action="download-file" data-path="brand/brand.json">brand.json</button>
      <button class="btn" data-action="download-file" data-path="website/index.html">Website</button>
      <button class="btn" data-action="download-file" data-path="checklists/launch-console.csv">Launch console CSV</button>
    </div>
    <p class="small faint" style="margin-top:10px">Zipping happens in your browser using the platform's own deflate implementation. ${summary.fileCount} files, ${humanBytes(bundle.manifest.counts.bytes)} uncompressed.</p>
  </div>

  <div class="grid grid-2" style="margin-top:16px">
    <div class="panel">
      <div class="panel-head"><h2>What is inside</h2></div>
      ${table(
        ['Folder', 'What you get'],
        [
          ['brand/', `${p.brand.concepts.length} logo directions, palette, type scale, business card, email signature, social cards`],
          ['website/', `${p.site.routes.length} pages incl. blog, privacy, terms, SEO files and deploy config`],
          ['marketing/', 'GTM playbook, 12-week plan, launch kit, outbound, ads, SEO, investor materials'],
          ['social/', `${p.social.profiles.length} platforms with bios and assets, plus a 30-day calendar`],
          ['domains/', 'Ranked candidates, DNS records, mailbox plan, screening'],
          ['legal/', `${Object.keys(p.company.documents).length} documents incl. EIN and bank packets`],
          ['checklists/', 'The launch console above as CSV'],
        ],
      )}
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Read this before you rely on it</h2></div>
      <div class="notice warn">
        <strong>Filing, EINs and bank accounts cannot be automated.</strong>
        <p style="margin:8px 0 0">Incorporation is filed with a state, an EIN is issued by the IRS to a signed application, and a bank account requires Customer Identification Program checks on the entity and its owners under the USA PATRIOT Act. Blueprint prepares every packet and links the official portal, then you finish it with a signature and an ID.</p>
      </div>
      <div class="notice" style="margin-top:10px">
        <strong>Not legal advice.</strong>
        <p style="margin:8px 0 0">The legal folder is a drafting aid for your lawyer, generated from public filing requirements captured in 2026. Figures and deadlines change — every document links its official source.</p>
      </div>
      <div class="notice good" style="margin-top:10px">
        <strong>Deterministic.</strong>
        <p style="margin:8px 0 0">The same name and intake always produce the same company, so you can regenerate, diff and review the output rather than trusting a slot machine.</p>
      </div>
    </div>
  </div>

  ${panelPositioning(p)}
  ${panelOasisMail(p)}`;
}

/** The positioning statement actually in force: the model's, or the engine's. */
function positioningFor(p) {
  const written = STATE.positioning;
  if (written && written.text) return { text: written.text, model: written.model, source: 'model' };
  return { text: p.identity.positioning, model: null, source: 'engine' };
}

function panelPositioning(p) {
  const { text, model, source } = positioningFor(p);
  const configured = STATE.config?.ai?.configured;
  const chip = source === 'model' ? h(model || 'model') : configured ? 'writing…' : 'engine';
  return `<div class="panel">
    <div class="panel-head">
      <h2>Positioning <span class="chip ${source === 'model' ? 'good' : ''}">${chip}</span></h2>
    </div>
    <div class="md">${md(text)}</div>
  </div>`;
}

/**
 * Oasis mail, end to end: the tenant that gets created, the mailboxes that go
 * with it and the records that are published for you. The button asks the API
 * to carry it out; with no Oasis credentials the API answers with the plan and
 * says plainly that nothing was created.
 */
function panelOasisMail(p) {
  const provider = MAIL_PROVIDERS.find((entry) => entry.key === p.intake.mailProvider) || MAIL_PROVIDERS[0];
  const records = mailRecords(p.dns);
  const result = STATE.mail;
  const live = STATE.config?.mail;
  const dots = { applied: 'good', skipped: '', planned: '', failed: 'bad' };

  return `<div class="panel" style="margin-top:16px">
    <div class="panel-head">
      <h2>Mailboxes — ${h(provider.label)}</h2>
      <button class="btn btn-sm" data-action="provision-mail" ${STATE.mailBusy ? 'disabled' : ''}>${STATE.mailBusy ? 'Working…' : 'Create the mailboxes'}</button>
    </div>
    <p class="panel-sub">${h(provider.summary || '')}</p>
    <div class="grid grid-2">
      <div>
        ${table(
          ['Address', 'For'],
          p.mailboxes.boxes.slice(0, 9).map((box) => [box.address, box.purpose]),
        )}
      </div>
      <div>
        ${table(
          ['Record', 'Value'],
          records.map((record) => [`${record.type} ${record.name}`, record.value]),
        )}
      </div>
    </div>
    <p class="small faint" style="margin-top:10px">${provider.managed
      ? `These are published into ${h(p.domains.primaryDomain)} for you: the tenant, the mail domain and every mailbox are created through ${h(provider.operator || 'the operator')} before you are told it worked.`
      : `Add these records at your DNS provider, then create each mailbox by hand at ${h(provider.label)}.`}
      ${live && !live.configured ? ' Oasis provisioning is not configured on this deployment, so the button returns the plan only.' : ''}
    </p>
    ${result
      ? `<p class="phase">Run</p>
    ${table(
      ['Step', 'Via', 'Result'],
      result.steps.map((entry) => [
        entry.title,
        entry.via,
        { html: `<span class="chip ${dots[entry.status] || ''}">${h(entry.status)}</span> ${h(entry.detail)}` },
      ]),
    )}
    <p class="small faint">${result.applied
      ? `Applied. The mailboxes are live at ${h(result.webmail || 'mail.innotel.us')}.`
      : `${h(result.note || 'Nothing was created.')}`}</p>`
      : ''}
  </div>`;
}

function panelIdentity(p) {
  const { identity, domains } = p;
  const scores = identity.analysis.scores.parts;
  return `
  <div class="section-head">
    <h1>Identity</h1>
    <p>How the company describes itself, and whether the name itself is working for you.</p>
  </div>

  <div class="panel">
    <div class="panel-head">
      <h2>Name check: “${h(identity.name)}”</h2>
      <span class="chip ${identity.analysis.scores.overall >= 70 ? 'good' : identity.analysis.scores.overall >= 55 ? 'warn' : 'bad'}">${identity.analysis.scores.overall}/100 · ${h(identity.analysis.scores.label)}</span>
    </div>
    <div class="grid grid-2">
      ${scores
        .map(
          (part) => `<div class="metric">
        <div class="label">${h(part.label)}</div>
        <div class="value">${part.score}<span class="faint" style="font-size:13px">/100</span></div>
        <div class="sub">${h(part.note)}</div>
      </div>`,
        )
        .join('')}
    </div>
    <p class="small faint" style="margin-top:12px">Say it as <strong>${h(identity.analysis.sayIt)}</strong> · ${identity.analysis.length} letters · ${identity.analysis.syllables} syllables. ${
      identity.analysis.flags.length ? `Watch: ${h(identity.analysis.flags.join('; '))}.` : 'No obvious sound-to-letter traps.'
    }</p>
  </div>

  <div class="grid grid-2" style="margin-top:16px">
    <div class="panel">
      <div class="panel-head"><h2>Taglines</h2><span class="chip">${identity.taglines.length} options</span></div>
      ${table(
        ['Tagline', 'Style', 'Use for'],
        identity.taglines.map((tagline) => [
          { html: `<strong>${h(tagline.text)}</strong> <button class="btn btn-sm btn-ghost" data-action="copy" data-copy="${h(tagline.text)}">copy</button>` },
          tagline.styleLabel,
          tagline.useFor,
        ]),
      )}
      <p class="small faint" style="margin-top:10px">Tagline one is your hero. Tagline two works better in a deck title. The contrarian one starts fights — that is the point.</p>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Mission, vision, promise</h2></div>
      <p><strong>Mission.</strong> ${h(identity.mission)}</p>
      <p><strong>Vision.</strong> ${h(identity.vision)}</p>
      <p><strong>Promise.</strong> ${h(identity.promise)}</p>
      <p><strong>Archetype.</strong> ${h(identity.archetype.name)} — leads with ${h(identity.archetype.promise.toLowerCase())}. Voice: ${h(identity.archetype.voice.join(', '))}.</p>
    </div>
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Values</h2></div>
    <div class="grid grid-2">
      ${identity.values
        .map((value) => `<div class="metric"><div class="value" style="font-size:14px">${h(value.name)}</div><div class="sub">${h(value.statement)}</div></div>`)
        .join('')}
    </div>
  </div>

  <div class="grid grid-2" style="margin-top:16px">
    <div class="panel">
      <div class="panel-head"><h2>Voice guide</h2></div>
      <ul class="check-list" style="border:none">
        ${identity.voice.principles.map((rule) => `<li class="check-item" style="display:block">${h(rule)}</li>`).join('')}
      </ul>
      <p class="phase">Say this</p>
      <ul>${identity.voice.doSay.map((rule) => `<li>${h(rule)}</li>`).join('')}</ul>
      <p class="phase">Avoid</p>
      <ul>${identity.voice.dontSay.map((rule) => `<li>${h(rule)}</li>`).join('')}</ul>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>In practice</h2></div>
      ${table(
        ['Context', 'Copy'],
        Object.entries(identity.voice.samples).map(([key, value]) => [key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase()), value]),
      )}
    </div>
  </div>

  <div class="grid grid-2" style="margin-top:16px">
    <div class="panel">
      <div class="panel-head"><h2>Screen the name</h2><span class="chip warn">do this before you print anything</span></div>
      ${table(
        ['Check', 'Why', ''],
        identity.screening.map((item) => [
          item.check,
          item.why,
          { html: item.link ? `<a class="btn btn-sm btn-ghost" href="${h(item.link)}" target="_blank" rel="noopener noreferrer">open</a>` : '' },
        ]),
      )}
    </div>
    <div class="panel">
      <div class="panel-head"><h2>If you need a different name</h2><span class="chip">alternatives</span></div>
      ${table(
        ['Name', 'Why it works', 'Watch out'],
        identity.alternates.map((alternate) => [{ html: `<strong>${h(alternate.name)}</strong><br><span class="faint mono">${h(alternate.domainHint)}</span>` }, alternate.why, alternate.risk]),
      )}
    </div>
  </div>
`;
}

function panelBrand(p) {
  const { brand, identity } = p;
  const chosenConcept = brand.concepts.find((concept) => concept.id === STATE.chosenLogoId) || brand.chosen;
  const variants = Object.keys(chosenConcept.variants);
  return `
  <div class="section-head">
    <h1>Brand</h1>
    <p>A complete visual identity: three logo directions to choose between, a color system with a WCAG audit, and the assets you need for day one.</p>
  </div>

  <div class="panel">
    <div class="panel-head"><h2>Logo directions</h2><span class="chip">chosen: ${h(chosenConcept.name)}</span></div>
    <p class="panel-sub">Picked for a ${h(identity.profile?.label || 'your')} company with a ${h(identity.archetype?.name || '')} voice — the two symbol directions come from different silhouette families, so you are choosing between ideas rather than between two versions of one.</p>
    <div class="logo-grid">
      ${brand.concepts
        .map(
          (concept) => `<div class="logo-card${concept.id === chosenConcept.id ? ' selected' : ''}">
        <div class="logo-stage">${concept.variants.horizontal}</div>
        <div class="logo-stage dark">${concept.variants.stackedReverse}</div>
        <div class="logo-meta">
          <strong>${h(concept.name)}</strong>
          <span class="small muted">${h(concept.idea)}</span>
          ${concept.reason ? `<span class="small muted"><em>${h(concept.reason)}</em></span>` : ''}
          <span class="small faint">Best for: ${h(concept.bestFor)}</span>
          <div class="row" style="margin-top:4px">
            <button class="btn btn-sm ${concept.id === chosenConcept.id ? 'btn-primary' : ''}" data-action="logo-select" data-id="${h(concept.id)}">${
              concept.id === chosenConcept.id ? 'Selected' : 'Choose this'
            }</button>
            <button class="btn btn-sm" data-action="download-svg" data-concept="${h(concept.id)}" data-variant="horizontal">SVG</button>
            <button class="btn btn-sm" data-action="download-png" data-concept="${h(concept.id)}" data-variant="appIcon" data-size="1024">PNG 1024</button>
          </div>
        </div>
      </div>`,
        )
        .join('')}
    </div>
    <p class="small faint" style="margin-top:12px">All ${Object.keys(brand.logo).length} files for the chosen direction are in the bundle under <span class="mono">brand/</span>: ${variants.join(', ')}.</p>
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Color system</h2><span class="chip">${h(brand.palette.harmony)} harmony</span></div>
    <div class="swatches">
      ${brand.palette.swatches
        .map(
          (swatch) => `<div class="swatch">
        <div class="chip-color" style="background:${h(swatch.hex)};color:${h(swatch.hex)}"><span style="mix-blend-mode:difference;color:#fff">${h(swatch.hex)}</span></div>
        <div class="meta"><strong>${h(swatch.name)}</strong><span class="faint">${h(swatch.role)}</span></div>
      </div>`,
        )
        .join('')}
    </div>
    <p class="phase">Contrast audit (WCAG 2.1)</p>
    ${table(
      ['Pair', { label: 'Ratio', num: true }, 'Grade'],
      brand.palette.checks.map((check) => [
        check.usage,
        { html: String(check.ratio), num: true },
        { html: `<span class="chip ${check.grade === 'fail' ? 'bad' : check.grade === 'AA' || check.grade === 'AAA' ? 'good' : 'warn'}">${h(check.grade)}</span>` },
      ]),
    )}
    <p class="small faint" style="margin-top:10px">Anywhere a pair fails AA, the tokens give you a corrected color: use <span class="mono">--brand-primary-text</span> for text instead of the raw primary.</p>
  </div>

  <div class="grid grid-2" style="margin-top:16px">
    <div class="panel">
      <div class="panel-head"><h2>Typography</h2><span class="chip">${h(brand.typography.pair.heading)} / ${h(brand.typography.pair.body)}</span></div>
      ${table(
        ['Token', 'Size', 'Weight', 'Use for'],
        brand.typography.scale.map((step) => [step.name, `${step.size}px`, String(step.weight), step.usage]),
      )}
      <p class="phase">Rules</p>
      <ul class="small">${brand.typography.rules.map((rule) => `<li>${h(rule)}</li>`).join('')}</ul>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Usage rules</h2></div>
      <ul>${brand.rules.map((rule) => `<li>${h(rule)}</li>`).join('')}</ul>
      <p class="phase">Never</p>
      <ul>${brand.misuse.map((rule) => `<li>${h(rule)}</li>`).join('')}</ul>
    </div>
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Day-one assets</h2><span class="chip">${p.social.profiles.length} platform sizes</span></div>
    <div class="grid grid-3">
      <div class="metric"><div class="label">Social card</div><div class="logo-stage" style="background:#0d1017;padding:10px">${brand.og}</div>
        <div class="row" style="margin-top:8px"><button class="btn btn-sm" data-action="download-file" data-path="brand/social-card.svg">SVG</button>
        <button class="btn btn-sm" data-action="download-png-asset" data-asset="og" data-size="1200">PNG 1200×630</button></div></div>
      <div class="metric"><div class="label">Business card</div><div class="logo-stage" style="padding:10px">${brand.card.front}</div>
        <div class="row" style="margin-top:8px"><button class="btn btn-sm" data-action="download-file" data-path="brand/business-card-front.svg">SVG front</button>
        <button class="btn btn-sm" data-action="download-file" data-path="brand/business-card-back.svg">SVG back</button></div></div>
      <div class="metric"><div class="label">App icon + favicon</div><div class="logo-stage" style="padding:10px">${brand.logo['app-icon.svg']}</div>
        <div class="row" style="margin-top:8px"><button class="btn btn-sm" data-action="download-file" data-path="brand/app-icon.svg">SVG</button>
        <button class="btn btn-sm" data-action="download-png-asset" data-asset="appIcon" data-size="1024">PNG 1024</button></div></div>
    </div>
    <p class="phase">Email signature (copy and paste into Gmail or Outlook)</p>
    <div style="background:#fff;padding:14px;border-radius:8px">${brand.emailSignature}</div>
    <div class="row" style="margin-top:8px"><button class="btn btn-sm" data-action="copy" data-copy="${h(brand.emailSignature)}">Copy HTML</button>
    <button class="btn btn-sm" data-action="download-file" data-path="brand/email-signature.html">Download</button></div>
  </div>
  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Brand guidelines</h2></div>
    <div class="md">${md(p.bundle.files.find((file) => file.path === 'brand/brand-guidelines.md').content)}</div>
  </div>`;
}

function panelDomains(p) {
  const { domains, dns, mailboxes } = p;
  const results = STATE.domainResults || [];
  const byDomain = new Map(results.map((result) => [result.domain, result]));
  return `
  <div class="section-head">
    <h1>Domain, DNS and email</h1>
    <p>Candidate domains ranked with the reasoning behind each, the exact DNS records to publish, and a mailbox plan that does not leave a customer unanswered.</p>
  </div>

  <div class="panel">
    <div class="panel-head">
      <h2>Availability</h2>
      <button class="btn btn-primary btn-sm" data-action="check-domains">Check ${domains.ranked.length} domains now</button>
    </div>
    <p class="panel-sub">Lookups run through this app's API against RDAP and DNS-over-HTTPS. Registries throttle, so any inconclusive answer is shown as inconclusive rather than guessed. <strong>Confirm at checkout.</strong></p>
    ${table(
      ['Domain', 'Strategy', 'Signal', 'Why', { label: 'Score', num: true }],
      domains.ranked.map((entry) => [
        { html: `<span class="mono">${h(entry.domain)}</span>` },
        entry.strategy,
        { html: availabilityChip(byDomain.get(entry.domain)) },
        entry.why,
        { html: String(entry.score), num: true },
      ]),
      { scroll: true },
    )}
    <p class="phase">Registrar steps</p>
    <ol>${domains.registrarSteps.map((step) => `<li>${h(step)}</li>`).join('')}</ol>
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>DNS records</h2><span class="chip">${h(dns.providerLabel)}</span></div>
    ${table(
      ['Type', 'Name', 'Value', 'TTL', 'Why'],
      dns.records.map((record) => [record.type, record.name, { html: `<span class="mono">${h(String(record.value))}</span>` }, String(record.ttl), record.purpose]),
      { scroll: true },
    )}
    <p class="phase">Order of operations</p>
    <ol>${dns.order.map((step) => `<li>${h(step)}</li>`).join('')}</ol>
    <p class="small faint">${h(dns.propagation)}</p>
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Mailboxes</h2><span class="chip">${h(MAIL_PROVIDERS.find((provider) => provider.key === mailboxes.provider)?.label || mailboxes.provider)}</span></div>
    ${table(
      ['Address', 'Purpose', 'Owner'],
      mailboxes.boxes.map((box) => [{ html: `<span class="mono">${h(box.address)}</span>` }, box.purpose, box.owner]),
    )}
    <p class="phase">Rules</p>
    <ul>${mailboxes.rules.map((rule) => `<li>${h(rule)}</li>`).join('')}</ul>
  </div>`;
}

function panelWebsite(p) {
  const { site } = p;
  const pages = site.routes;
  const current = pages.includes(STATE.previewPath) ? STATE.previewPath : pages[0];
  return `
  <div class="section-head">
    <h1>Website</h1>
    <p>A complete static site: ${pages.length} pages, forms wired to a real backend, structured data, sitemap, security headers and a deploy guide for three hosts.</p>
  </div>

  <div class="panel">
    <div class="panel-head">
      <h2>Preview</h2>
      <span class="chip">${pages.length} pages · ${site.files['css/styles.css'].split('\n').length} lines of CSS</span>
    </div>
    <div class="preview-bar">
      ${pages
        .map((page) => `<button class="btn btn-sm ${page === current ? 'btn-primary' : ''}" data-action="preview-page" data-path="${h(page)}">${h(page.replace('blog/', 'blog / '))}</button>`)
        .join('')}
    </div>
    <div class="preview-frame" id="site-preview" role="region" aria-label="Website preview"></div>
    <p class="small faint" style="margin-top:8px">The real generated markup and CSS, rendered in a shadow root so it cannot affect this app. Scripts are stripped, so the forms are inert here — in the deployed site they post to your project's backend.</p>
  </div>

  <div class="grid grid-2" style="margin-top:16px">
    <div class="panel">
      <div class="panel-head"><h2>Files</h2><button class="btn btn-sm" data-action="download-website">Download site</button></div>
      <div class="file-tree">
        ${Object.keys(site.files)
          .map(
            (name) => `<div class="file-row"><span>website/${h(name)}</span><button data-action="download-file" data-path="website/${h(name)}">save</button></div>`,
          )
          .join('')}
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Built-in SEO</h2></div>
      <ul>
        <li>Per-page title, meta description and canonical URL.</li>
        <li>Open Graph and Twitter card tags pointing at a generated <span class="mono">og.svg</span>.</li>
        <li>JSON-LD: Organization, WebSite, FAQPage on the home page and BlogPosting on each post.</li>
        <li><span class="mono">sitemap.xml</span> with priorities, and a <span class="mono">robots.txt</span> that keeps thin pages out.</li>
        <li>Security headers via <span class="mono">_headers</span>, including a strict Content-Security-Policy.</li>
        <li>A web manifest with the generated app icon, so the site installs as an app.</li>
      </ul>
      <p class="phase">Honest notes from the generator</p>
      <ul class="small">${site.notes.map((note) => `<li>${h(note)}</li>`).join('')}</ul>
    </div>
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>A page of the copy</h2><span class="chip">index.html</span></div>
    <div class="md">${
      // Show the readable text of the home page rather than markup.
      md(
        site.files['index.html']
          .replace(/<script[\s\S]*?<\/script>/g, '')
          .replace(/<style[\s\S]*?<\/style>/g, '')
          .replace(/<\/(h1|h2|h3|p|li|div|section|footer|header|tr)>/g, '\n')
          .replace(/<li[^>]*>/g, '- ')
          .replace(/<[^>]+>/g, '')
          .replace(/\n{3,}/g, '\n\n'),
      )
    }</div>
  </div>`;
}

function panelSocial(p) {
  const { social } = p;
  const results = new Map((STATE.handleResults || []).map((result) => [`${result.platform}:${result.handle}`, result]));
  const checkable = handleProbeRequests(social.handles, 6);
  return `
  <div class="section-head">
    <h1>Social</h1>
    <p>One handle strategy across ${social.handles.length} platforms, bios written to each character limit, correctly sized assets, and 30 drafted posts.</p>
  </div>

  <div class="panel">
    <div class="panel-head">
      <h2>Handles</h2>
      <button class="btn btn-primary btn-sm" data-action="check-handles" ${checkable.length ? '' : 'disabled'}>Check ${checkable.length} automatically checkable</button>
    </div>
    ${table(
      ['Platform', 'Handle', 'Priority', 'Check', 'Bio length', 'Notes'],
      social.profiles.map((profile) => {
        const result = results.get(`${profile.platform}:${profile.handle}`);
        const chip = result
          ? result.state === 'available'
            ? '<span class="chip good">likely free</span>'
            : result.state === 'taken'
              ? '<span class="chip bad">taken</span>'
              : '<span class="chip warn">unverifiable</span>'
          : profile.automated === 'checkable'
            ? '<span class="chip">not checked</span>'
            : `<span class="chip">${h(profile.automated)}</span>`;
        return [
          profile.name,
          { html: `<span class="mono">@${h(profile.handle)}</span>` },
          profile.priority,
          { html: chip },
          `${profile.bioLength}/${profile.bioMax}`,
          profile.valid ? profile.note : `<strong style="color:var(--bad)">${h(profile.validationNote || '')}</strong>`,
        ];
      }),
      { scroll: true },
    )}
    <p class="small faint" style="margin-top:10px">Platforms that block automated checks are labeled. An unverifiable result is not a green light — open the app and try the handle before you print it anywhere.</p>
  </div>

  <div class="grid grid-2" style="margin-top:16px">
    <div class="panel">
      <div class="panel-head"><h2>Profiles</h2><button class="btn btn-sm" data-action="download-file" data-path="social/social-kit.md">Download kit</button></div>
      ${table(
        ['Platform', 'Display name', 'Bio'],
        social.profiles.map((profile) => [profile.name, profile.displayName, { html: `<span class="small">${h(profile.bio).replace(/\n/g, '<br>')}</span>` }]),
        { scroll: true },
      )}
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Set-up order</h2></div>
      ${table(
        ['#', 'Platform', 'Why'],
        social.setupOrder.map((item) => [String(item.step), item.task, item.why]),
      )}
      <p class="phase">Rules that matter</p>
      <ul class="small">${social.rules.map((rule) => `<li>${h(rule)}</li>`).join('')}</ul>
    </div>
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>30-day content calendar</h2><button class="btn btn-sm" data-action="download-file" data-path="social/content-calendar.csv">Download CSV</button></div>
    ${table(
      ['Day', 'Platform', 'Pillar', 'Format', 'Hook', 'Post body'],
      social.calendar.days.slice(0, 12).map((day) => [
        String(day.day),
        day.platform,
        day.pillar,
        day.format,
        { html: `<strong>${h(day.hook)}</strong>` },
        { html: `<span class="small muted">${h(day.body).replace(/\n/g, '<br>')}</span>` },
      ]),
      { scroll: true },
    )}
    <p class="small faint">Showing the first 12 of ${social.calendar.days.length}. The CSV has every post with platform, pillar, hook, body, CTA and hashtags.</p>
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Asset sizes</h2></div>
    ${table(
      ['Platform', 'Avatar', 'Banner', 'Bio limit', 'Handle limit'],
      SOCIAL_ASSET_SPECS.map((spec) => [spec.platform, spec.avatar, spec.banner, String(spec.bioLimit), String(spec.handleLimit)]),
    )}
    <div class="grid grid-3" style="margin-top:12px">
      ${social.profiles
        .slice(0, 6)
        .map(
          (profile) => `<div class="metric"><div class="label">${h(profile.name)} avatar</div><div style="padding:8px">${profile.assets.avatar}</div>
        <button class="btn btn-sm" data-action="download-social" data-platform="${h(profile.platform)}" data-kind="avatar">SVG</button></div>`,
        )
        .join('')}
    </div>
  </div>`;
}

/**
 * Market research, driven by the industry rather than by a generic template.
 * Shown with its own caveats visible: shapes of competitor instead of a name
 * list, and planning ranges with the source to verify each one against.
 */
function panelMarketResearch(p) {
  const { marketing: m, intake } = p;
  const r = m.research;
  if (!r) return '';
  return `
  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Market research</h2><span class="chip">${h(r.industry)}</span></div>
    <p class="panel-sub">${h(r.definition)}</p>

    <div class="grid grid-2">
      <div>
        <p class="phase">Who you are up against</p>
        ${table(
          ['Shape', 'Wins on', 'Loses on'],
          r.competitorShapes.map((shape) => [shape.shape, shape.whatTheyWinOn, shape.whereTheyLose]),
        )}
        <p class="small faint">${h(r.competitorNote)}</p>
      </div>
      <div>
        <p class="phase">What makes someone buy now</p>
        <ul class="small">${r.howItIsBought.triggers.map((trigger) => `<li>${h(trigger)}</li>`).join('')}</ul>
        <p class="small faint">${h(r.howItIsBought.note)} Lead with: <strong>${h(r.howItIsBought.firstRealTrigger)}</strong></p>
      </div>
    </div>

    <div class="grid grid-2" style="margin-top:12px">
      <div>
        <p class="phase">Demand signals to measure</p>
        <ul class="small">${r.demandSignals.map((signal) => `<li>${h(signal)}</li>`).join('')}</ul>
      </div>
      <div>
        <p class="phase">Where to read it yourself</p>
        <ul class="small">${r.whereToReadItYourself
          .map((source) => `<li><strong>${h(source.name)}</strong> — ${h(source.where)}<br><span class="faint">${h(source.use)}</span></li>`)
          .join('')}</ul>
      </div>
    </div>

    <p class="phase">Planning ranges</p>
    ${table(
      ['Metric', 'Range', 'Verify against'],
      r.planningBenchmarks.map((entry) => [entry.metric, entry.band, entry.verify]),
    )}
    <p class="small faint">${h(r.benchmarkNote)}</p>

    <div class="grid grid-2" style="margin-top:12px">
      <div>
        <p class="phase">Objections, and the honest answer</p>
        ${table(
          ['Objection', 'Answer'],
          r.objections.map((entry) => [entry.objection, entry.answer]),
        )}
      </div>
      <div>
        <p class="phase">Beachhead</p>
        <p class="small"><strong>${h(r.beachhead.wedge)}</strong></p>
        <p class="small muted">${h(r.beachhead.whyNow)}</p>
        <p class="small faint">Expansion, only after the wedge works: ${h(r.beachhead.expansion)}</p>
        <p class="phase">Week one</p>
        <ol class="small">${r.firstWeek.map((task) => `<li>${h(task)}</li>`).join('')}</ol>
      </div>
    </div>
    <p class="small faint" style="margin-top:10px">${h(intake.audience || 'Your chosen audience')} · also exported as <span class="mono">marketing/market-research.md</span> in the bundle.</p>
  </div>`;
}

function panelMarketing(p) {
  const { marketing: m, identity } = p;
  return `
  <div class="section-head">
    <h1>Marketing</h1>
    <p>Positioning, pricing, channels, a 12-week plan, launch copy for every platform, outbound sequences and the SEO structure.</p>
  </div>

  <div class="grid grid-2">
    <div class="panel">
      <div class="panel-head"><h2>Positioning</h2><span class="chip ${positioningFor(p).source === 'model' ? 'good' : ''}">${positioningFor(p).source === 'model' ? h(positioningFor(p).model || 'model') : 'engine'}</span></div>
      <p>${h(identity.positioning)}</p>
      ${table(
        ['Layer', 'Statement'],
        m.messaging.house.map((layer) => [layer.layer, layer.statement]),
      )}
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Ideal customer</h2></div>
      <p><strong>${h(m.icp.primary.who)}</strong></p>
      <p class="muted">${h(m.icp.primary.trigger)}</p>
      <p class="phase">Pains</p>
      <ul>${m.icp.primary.pains.map((pain) => `<li>${h(pain)}</li>`).join('')}</ul>
      <p class="phase">Objections and the honest answer</p>
      ${table(['Objection', 'Answer'], [
        [m.icp.primary.objections[0], 'Build a narrow version and let them compare both on the same task.'],
        [m.icp.primary.objections[1], 'Quantify the cost of the workaround — the status quo is never free.'],
        [m.icp.primary.objections[2], 'Offer a paid pilot. Do not give the product away.'],
        [m.icp.primary.objections[3], 'Send security documentation before the trial, not after the objection.'],
      ])}
    </div>
  </div>

  ${panelMarketResearch(p)}

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Pricing</h2><span class="chip">${h(m.pricing.model)}</span></div>
    <div class="grid grid-3">
      ${m.pricing.tiers
        .map(
          (tier) => `<div class="metric" style="${tier.highlighted ? 'border-color:var(--accent)' : ''}">
        <div class="label">${h(tier.name)}${tier.highlighted ? ' · recommended' : ''}</div>
        <div class="value">${h(tier.price)}<span class="faint" style="font-size:12px">${h(tier.price === 'Free' ? '' : '/mo')}</span></div>
        <div class="sub">${h(tier.billing)}</div>
        <p class="small" style="margin:8px 0 4px">${h(tier.tagline)}</p>
        <ul class="small">${tier.features.map((feature) => `<li>${h(feature)}</li>`).join('')}</ul>
        <p class="small faint">${h(tier.limits)}</p>
      </div>`,
        )
        .join('')}
    </div>
    <div class="grid grid-2" style="margin-top:12px">
      <div><p class="phase">Principles</p><ul class="small">${m.pricing.rationale.map((rule) => `<li>${h(rule)}</li>`).join('')}</ul></div>
      <div><p class="phase">Notes</p><ul class="small">${m.pricing.notes.map((rule) => `<li>${h(rule)}</li>`).join('')}</ul></div>
    </div>
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Channels</h2></div>
    ${table(
      ['Channel', 'Effort', 'Impact', 'First step', 'Metric'],
      m.channels.map((channel) => [channel.channel, channel.effort, channel.impact, channel.firstStep, channel.metric]),
      { scroll: true },
    )}
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>12-week plan</h2><span class="chip">${h(m.gtm.phaseNote)}</span></div>
    ${table(
      ['Week', 'Focus', 'Deliverables'],
      m.gtm.calendar.map((week) => [String(week.week), week.focus, { html: week.deliverables.map((item) => `☐ ${h(item)}`).join('<br>') }]),
    )}
  </div>

  <div class="grid grid-2" style="margin-top:16px">
    <div class="panel">
      <div class="panel-head"><h2>Launch copy</h2><button class="btn btn-sm" data-action="download-file" data-path="marketing/launch-kit.md">Download kit</button></div>
      <p class="phase">Product Hunt</p>
      <p class="small"><strong>${h(m.launchCopy.productHunt.tagline)}</strong></p>
      <pre class="md" style="white-space:pre-wrap">${h(m.launchCopy.productHunt.description)}</pre>
      <p class="phase">Hacker News</p>
      <p class="small mono">${h(m.launchCopy.hackerNews.title)}</p>
      <p class="phase">Launch-day runbook</p>
      ${table(['When', 'Task'], m.launch.runbook.map((item) => [item.t, item.task]), { scroll: true })}
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Metrics and budget</h2></div>
      <p><strong>North star.</strong> ${h(m.metrics.northStar)}</p>
      ${table(['Metric', 'Target', 'Why'], m.metrics.supporting.map((metric) => [metric.metric, metric.target, metric.why]))}
      <p class="phase">Lean 90-day budget</p>
      ${table(['Item', 'Cost', 'Note'], m.budget.lean.map((item) => [item.item, item.cost, item.note]))}
    </div>
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Outbound, ads and SEO</h2></div>
    <div class="grid grid-2">
      <div>
        <p class="phase">Cold email sequence</p>
        ${table(['Day', 'Subject', 'Body'], m.coldEmail.sequence.map((step) => [String(step.day), step.subject, { html: `<span class="small muted">${h(step.body).replace(/\n/g, '<br>')}</span>` }]), { scroll: true })}
      </div>
      <div>
        <p class="phase">Ad angles</p>
        ${table(['Angle', 'Headline', 'Primary text'], m.ads.angles.map((angle) => [angle.angle, angle.headline, angle.primaryText]))}
        <p class="phase">SEO pillars</p>
        ${table(['Pillar', 'Intent', 'Keywords'], m.seo.pillars.map((pillar) => [pillar.title, pillar.intent, pillar.keywords.join(', ')]))}
      </div>
    </div>
    <p class="phase">Quick wins</p>
    <ul class="small">${m.seo.quickWins.map((item) => `<li>${h(item)}</li>`).join('')}</ul>
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Investor materials</h2><button class="btn btn-sm" data-action="download-file" data-path="marketing/investor-materials.md">Download</button></div>
    ${table(['Slide', 'What to say'], m.pitchDeck.slides.map((slide) => [`${slide.n}. ${slide.title}`, slide.say]))}
  </div>`;
}

/**
 * The business plan.
 *
 * Rendered from the same structures the markdown document is built from, so the
 * page and the exported file cannot disagree. The two things this panel has to
 * do are show the numbers honestly and show what they rest on: the assumptions
 * table, the sensitivity table and the funding verdict are all above the fold,
 * because a plan whose assumptions are hidden is a pitch, not a plan.
 */
function panelPlan(p) {
  const plan = p.businessPlan;
  if (!plan) return '<div class="panel"><h2>Business plan</h2><p>No plan was generated for this project.</p></div>';
  const money = (value) => `$${Math.round(value).toLocaleString('en-US')}`;
  const f = plan.funding;
  const base = plan.base.summary;
  const quarterly = plan.base.months.filter((row) => row.month % 3 === 0 || row.month === 1);

  return `
  <div class="section-head">
    <h1>Business plan</h1>
    <p>A ${plan.horizonMonths}-month model with three scenarios, unit economics derived from the same assumptions, a funding ask sized by the plan itself, and every input labelled with the source that replaces it.</p>
  </div>

  <div class="grid grid-3">
    ${planHighlights(plan)
      .map(
        (item) => `<div class="metric">
      <div class="label">${h(item.label)}</div>
      <div class="value">${h(item.value)}</div>
      <div class="sub">${h(item.sub)}</div>
    </div>`,
      )
      .join('')}
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head">
      <h2>Funding</h2>
      <span class="chip ${f.funded ? 'good' : 'bad'}">${f.funded ? 'plan is funded' : `short by ${h(money(f.shortfall))}`}</span>
    </div>
    <p>${h(f.note)}</p>
    <div class="grid grid-2" style="margin-top:10px">
      <div>
        ${table(
          ['Item', 'Amount'],
          [
            ['Amount in this plan', money(f.requested)],
            ['Sized need (deepest cash position + buffer)', money(f.required)],
            ['Cash the plan consumes before revenue covers costs', money(f.trough)],
            ['Cash trough, base case', money(base.minCash)],
            ['Three-month buffer', money(f.buffer)],
            ['Monthly burn in month one', money(f.monthlyBurn)],
            ['Runway on this plan', f.runwayMonths ? `${f.runwayMonths} months` : 'Funds the whole horizon'],
            ['Typical round for ' + plan.industry, money(f.seedAsk)],
          ],
        )}
      </div>
      <div>
        <p class="phase">Use of funds</p>
        ${table(
          ['Bucket', 'Share', 'Amount'],
          f.useOfFunds.buckets.map((bucket) => [bucket.label, `${bucket.share}%`, money(bucket.dollars)]),
        )}
        <p class="small faint">${h(f.useOfFunds.note)}</p>
      </div>
    </div>
    <p class="small faint">${h(f.terms.instrument)}</p>
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Scenarios</h2><span class="chip">same model, shifted inputs</span></div>
    ${table(
      ['Scenario', 'ARR at end', 'Paying customers', 'Gross margin', 'Break-even', 'Cash at end'],
      plan.scenarios.map((entry) => [
        entry.label,
        money(entry.arrMonthEnd),
        String(entry.payingCustomersMonthEnd),
        `${Math.round(entry.grossMargin * 100)}%`,
        entry.breakEvenMonth ? `M${entry.breakEvenMonth}` : 'Not in horizon',
        money(entry.cashMonthEnd),
      ]),
    )}
    <p class="small faint">${plan.scenarios.map((entry) => `${entry.label}: ${entry.note}`).join(' ')}</p>
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Unit economics</h2></div>
    ${table(['Metric', 'Value', 'How it is derived'], plan.unitEconomics.map((row) => [row.metric, row.value, row.note]))}
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Sensitivity — what the plan is betting on</h2></div>
    <p class="small muted">${h(plan.sensitivity.note)}</p>
    ${table(
      ['Change', 'ARR at end', 'Break-even', 'Cash at end', 'Effect on ARR'],
      plan.sensitivity.rows.map((row) => [
        row.label,
        money(row.arrMonthEnd),
        row.breakEvenMonth ? `M${row.breakEvenMonth}` : 'Not in horizon',
        money(row.cashMonthEnd),
        row.delta === 0 ? '—' : `${row.delta > 0 ? '+' : '−'}${money(Math.abs(row.delta))}`,
      ]),
    )}
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Monthly model</h2><button class="btn btn-sm" data-action="download-file" data-path="business-plan/financial-model.csv">Export CSV</button></div>
    <p class="small muted">Quarterly here; every month is in <span class="mono">business-plan/financial-model.csv</span>. Each row reads only the row above it, so any line can be checked by hand.</p>
    ${table(
      ['Month', 'Accounts', 'Paying', 'Revenue', 'Gross profit', 'Opex', 'Net cash', 'Cash'],
      quarterly.map((row) => [
        row.label,
        String(row.activeCustomers),
        String(row.payingCustomers),
        money(row.revenue),
        money(row.grossProfit),
        money(row.opex),
        money(row.netCash),
        money(row.cash),
      ]),
    )}
    <p class="small faint">Market ceiling: ${base.marketAccounts.toLocaleString('en-US')} accounts · this plan reaches ${Math.round(base.marketPct * 100)}% of it · ${Math.round(base.grossMargin * 100)}% gross margin · ${h(plan.sensitivity.swingsOn)} moves the outcome most.</p>
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Assumptions</h2><button class="btn btn-sm" data-action="download-file" data-path="business-plan/assumptions.md">Export</button></div>
    <p class="small muted">${h(plan.assumptions.note)}</p>
    ${table(
      ['Assumption', 'Value', 'Basis', 'Verify against'],
      plan.assumptions.lines.map((line) => [line.label, line.value, line.basis, line.verify]),
    )}
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Milestones and hiring</h2></div>
    <div class="grid grid-2">
      <div>
        <p class="phase">Milestones</p>
        ${table(['Month', 'Milestone', 'Check'], plan.milestones.map((entry) => [`M${entry.at}`, entry.milestone, entry.check]))}
      </div>
      <div>
        <p class="phase">Hiring plan</p>
        ${table(['Month', 'Role', 'Annual', 'Monthly'], plan.hiring.map((entry) => [entry.label, entry.role, money(entry.annual), money(entry.monthly)]))}
      </div>
    </div>
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head">
      <h2>Write-up</h2>
      <button class="btn btn-sm" data-action="download-file" data-path="business-plan/business-plan.md">Download the plan</button>
    </div>
    ${plan.sections
      .map(
        (section) => `<div style="margin-top:14px">
      <p class="phase">${h(section.heading)}</p>
      ${section.paragraphs.map((paragraph) => `<p>${md(paragraph)}</p>`).join('')}
      ${
        section.table
          ? table(section.table.headers, section.table.rows)
          : ''
      }
      ${section.bullets && section.bullets.length ? `<ul class="small">${section.bullets.map((bullet) => `<li>${md(bullet)}</li>`).join('')}</ul>` : ''}
    </div>`,
      )
      .join('')}
  </div>`;
}

function panelCompany(p) {
  const { company, identity } = p;
  const docPaths = Object.keys(company.documents).filter((path) => path.endsWith('.md'));
  const current = docPaths.includes(STATE.docPath) ? STATE.docPath : docPaths[0];
  const rec = company.recommendation;
  return `
  <div class="section-head">
    <h1>Company and filing</h1>
    <p>The entity decision with its reasoning, the exact filing steps, drafted documents, a pre-filled EIN application, a bank-ready packet and a compliance calendar.</p>
  </div>

  <div class="notice warn">
    <strong>What software cannot do here, and why.</strong>
    <p style="margin:8px 0 0">Incorporation is filed with a state registry that requires a signature and a filing fee. An EIN is issued by the IRS only against a signed application from a responsible party with a tax ID. A business bank account requires Customer Identification Program checks on the entity and every 25%+ owner under the USA PATRIOT Act. Blueprint prepares all three packets so the human part takes minutes instead of days — and links the official portal for each step. Nothing here claims to have filed anything.</p>
  </div>

  <div class="grid grid-2" style="margin-top:16px">
    <div class="panel">
      <div class="panel-head"><h2>Recommended structure</h2><span class="chip accent">${h(rec.entity.label)}</span></div>
      <p>${h(rec.why)}</p>
      <p class="small muted">Formation state: <strong>${h(rec.jurisdiction.name)}</strong> · ${rec.needsForeignQualification ? `you must also register as a foreign entity in ${h(rec.homeState)}` : 'no second state registration needed'}.</p>
      <p class="phase">Alternatives</p>
      ${table(
        ['Structure', 'Best for', 'Investors'],
        company.entityOptions.map((option) => [option.label, option.bestFor, option.investors]),
      )}
    </div>
    <div class="panel">
      <div class="panel-head"><h2>What it costs</h2><span class="chip">$${company.costEstimate.filing} filing</span></div>
      ${table(['Item', 'Cost'], company.costEstimate.breakdown.map((item) => [item.item, item.cost]))}
      <p class="small faint">${h(company.costEstimate.note)}</p>
      <p class="phase">Jurisdictions at a glance</p>
      ${table(
        ['State', 'LLC fee', 'LLC annual', 'Corp fee', 'Corp annual'],
        company.jurisdictions.map((row) => [
          { html: `${h(row.name)}${row.recommended ? ' <span class="chip accent">chosen</span>' : ''}${row.isHome ? ' <span class="chip">home</span>' : ''}` },
          `$${row.llcFee}`,
          `$${row.llcAnnual}`,
          `$${row.corpFee}`,
          `$${row.corpAnnual}`,
        ]),
      )}
    </div>
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Filing steps</h2></div>
    ${table(
      ['#', 'Step', 'What to do', 'Cost', 'Time', ''],
      company.filingSteps.map((step) => [
        String(step.step),
        step.title,
        step.detail,
        step.cost,
        step.time,
        { html: step.link ? `<a class="btn btn-sm btn-ghost" href="${h(step.link)}" target="_blank" rel="noopener noreferrer">${h(step.linkLabel || 'open')}</a>` : '' },
      ]),
    )}
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Printable government forms</h2><span class="chip accent">${company.forms.length} forms</span></div>
    <p class="small muted" style="margin-top:0">Full-page forms at true US Letter size, pre-filled with everything that can be derived from your intake. Open one and print at 100% scale — do not use &ldquo;fit to page&rdquo;. Fields only you can supply (addresses, your taxpayer number) print blank so you can write them in, and each sheet carries its provenance so you always know what you are holding.</p>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">
      ${company.forms
        .map(
          (form) => `<div class="row" style="align-items:flex-start;gap:12px;justify-content:space-between;border:1px solid var(--line);border-radius:8px;padding:12px 14px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600">${h(form.title)}</div>
          <div class="small muted" style="margin-top:4px">${h(form.description)}</div>
          <div class="small muted" style="margin-top:4px;font-family:var(--mono,monospace)">${h(form.path)}</div>
        </div>
        <div style="display:flex;gap:8px;flex:none">
          <button class="btn btn-sm btn-primary" data-action="open-form" data-path="${h(form.path)}">View &amp; print</button>
          <button class="btn btn-sm" data-action="download-file" data-path="${h(form.path)}">Save .html</button>
        </div>
      </div>`,
        )
        .join('')}
    </div>
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Documents</h2><span class="chip">${docPaths.length} drafts</span></div>
    <div class="row" style="margin-bottom:10px">
      <select data-action="select-doc" id="doc-select">
        ${docPaths.map((path) => `<option value="${h(path)}"${path === current ? ' selected' : ''}>${h(path.replace('legal/', ''))}</option>`).join('')}
      </select>
      <button class="btn btn-sm" data-action="download-file" data-path="${h(current)}">Download this document</button>
      <button class="btn btn-sm" data-action="download-docs">Download all legal drafts</button>
    </div>
    <div class="md" style="max-height:520px;overflow-y:auto;border:1px solid var(--line);border-radius:8px;padding:16px">${md(company.documents[current])}</div>
  </div>

  <div class="grid grid-2" style="margin-top:16px">
    <div class="panel">
      <div class="panel-head"><h2>EIN application (Form SS-4)</h2><span class="chip">$0 from the IRS</span></div>
      <p class="panel-sub">${h(company.ein.note)}</p>
      ${table(
        ['Line', 'Field', 'Value'],
        company.ein.fields.map((field) => [field.line, field.label, { html: `<span class="mono">${h(String(field.value))}</span>` }]),
        { scroll: true },
      )}
      <p class="phase">Eligibility for the online assistant</p>
      <ul class="small">${company.ein.onlineBlockers.map((line) => `<li>${h(line)}</li>`).join('')}</ul>
      <p class="phase">Filing routes</p>
      ${table(
        ['Route', 'Time', 'Official source'],
        company.ein.routes.map((route) => [route.name, route.time, { html: `<a href="${h(route.link)}" target="_blank" rel="noopener noreferrer">${h(route.link.replace('https://', '').slice(0, 40))}…</a>` }]),
      )}
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Bank-ready packet</h2><span class="chip warn">needs a human</span></div>
      <p class="panel-sub">${h(company.bank.reality)}</p>
      ${table(['Document', 'Why the bank wants it'], company.bank.checklist.map((item) => [item.item, item.why]), { scroll: true })}
      <p class="phase">Provider shortlist</p>
      ${table(
        ['Provider', 'Type', 'Best for', 'Watch out for'],
        company.bank.providers.map((provider) => [provider.name, provider.type, provider.idealFor, provider.caveat]),
        { scroll: true },
      )}
    </div>
  </div>

  <div class="grid grid-2" style="margin-top:16px">
    <div class="panel">
      <div class="panel-head"><h2>Compliance calendar</h2><button class="btn btn-sm" data-action="download-file" data-path="legal/compliance-calendar.ics">Add to calendar</button></div>
      ${table(
        ['Date', 'Obligation', 'Detail'],
        company.compliance.dates.map((entry) => [
          { html: `${h(entry.date)}${entry.critical ? ' <span class="chip bad">critical</span>' : ''}` },
          entry.label,
          entry.detail,
        ]),
      )}
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Cap table</h2><span class="chip">${h(company.capTable.totalShares)}</span></div>
      ${table(
        ['Holder', 'Shares', '%', 'Vesting'],
        company.capTable.rows.map((row) => [row.holder, row.shares, row.percent, row.vesting]),
      )}
      <p class="small faded">${h(company.capTable.valuation)}</p>
      <ul class="small">${company.capTable.guidance.slice(0, 3).map((item) => `<li>${h(item)}</li>`).join('')}</ul>
    </div>
  </div>

  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>Trademark</h2></div>
    <div class="grid grid-2">
      <div>
        <p class="phase">Suggested classes</p>
        ${table(['Class', 'Covers'], company.trademark.classes.map((entry) => [String(entry.code), entry.name]))}
        <p class="phase">Official links</p>
        <ul class="small">${company.trademark.links.map((link) => `<li><a href="${h(link.href)}" target="_blank" rel="noopener noreferrer">${h(link.label)}</a></li>`).join('')}</ul>
      </div>
      <div>
        <p class="phase">Steps</p>
        <ol class="small">${company.trademark.steps.map((step) => `<li>${h(step)}</li>`).join('')}</ol>
        <p class="small muted">${h(company.trademark.note)}</p>
      </div>
    </div>
  </div>`;
}

function panelLaunch(p) {
  const { checklist } = p;
  const phases = [...new Set(checklist.map((item) => item.phase))];
  const done = STATE.checklistDone.size;
  return `
  <div class="section-head">
    <h1>Launch console</h1>
    <p>Every actionable step in this project in one list, grouped by phase. Your ticks are saved in this browser and travel with the project when you save it.</p>
  </div>
  <div class="panel">
    <div class="panel-head">
      <h2>Progress</h2>
      <span class="chip ${done === checklist.length ? 'good' : ''}">${done} of ${checklist.length}</span>
    </div>
    <div class="progress"><span style="width:${Math.round((done / checklist.length) * 100)}%"></span></div>
    <div class="row" style="margin-top:12px">
      <button class="btn btn-sm" data-action="check-all">Tick everything</button>
      <button class="btn btn-sm" data-action="check-none">Clear</button>
      <button class="btn btn-sm" data-action="download-file" data-path="checklists/launch-console.csv">Export CSV</button>
    </div>
  </div>
  ${phases
    .map(
      (phase) => `<div class="panel" style="margin-top:12px">
    <p class="phase" style="margin-top:0">${h(phase)}</p>
    <div class="check-list">
      ${checklist
        .filter((item) => item.phase === phase)
        .map((item, index) => {
          const key = `${slug(item.phase)}-${slug(item.task)}-${index}`;
          const checked = STATE.checklistDone.has(key);
          return `<label class="check-item${checked ? ' done' : ''}">
          <input type="checkbox" data-action="toggle-check" data-key="${h(key)}"${checked ? ' checked' : ''}>
          <span><strong>${h(item.task)}</strong><br><span class="detail">${h(item.detail)}</span></span>
        </label>`;
        })
        .join('')}
    </div>
  </div>`,
    )
    .join('')}`;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderTabs() {
  return `<div class="tabs" role="tablist">
    ${TABS.map(
      (tab) =>
        `<button class="tab" role="tab" aria-selected="${STATE.tab === tab.id}" data-action="tab" data-tab="${tab.id}">${h(tab.label)}</button>`,
    ).join('')}
  </div>`;
}

function render() {
  if (!STATE.project) {
    view.innerHTML = `
      <div class="section-head">
        <h1>Type a name. Walk away with a company.</h1>
        <p>Blueprint turns one name into a brand, a logo, a website, a domain and DNS plan, mailboxes, a social presence, a go-to-market plan, a funded business plan — and the formation, EIN and banking packets a real company needs.</p>
      </div>
      <div class="grid grid-2">
        <div class="panel">
          <div class="panel-head"><h2>What happens when you press generate</h2></div>
          <ol>
            <li><strong>Identity</strong> — name analysis with a 100-point score, taglines, mission, values and a voice guide.</li>
            <li><strong>Brand</strong> — a color system with a WCAG audit, a type scale and three procedurally drawn logo directions as real SVG.</li>
            <li><strong>Website</strong> — a complete static site with forms, JSON-LD, sitemap and security headers.</li>
            <li><strong>Domain and email</strong> — ranked candidates, live availability checks, DNS records and mailboxes.</li>
            <li><strong>Social</strong> — handles, bios written to each limit, correctly sized assets, 30 drafted posts.</li>
            <li><strong>Marketing</strong> — positioning, pricing, channels, a 12-week plan and launch copy.</li>
            <li><strong>Business plan</strong> — a 36-month financial model built around your own prices, three scenarios, a funding ask sized from the plan, and the assumptions to replace first.</li>
            <li><strong>Company</strong> — entity recommendation, drafted formation documents, a pre-filled SS-4, a bank packet and a compliance calendar.</li>
          </ol>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>How it works</h2></div>
          <p>Everything is generated from the name, deterministically, in your browser. Nothing is uploaded unless you press save.</p>
          <p>The site is plain HTML and CSS, the legal documents are markdown for your lawyer, and the whole bundle downloads as a zip you can hand to anyone.</p>
          <div class="notice">Try a name you already own or one you are considering. Then change it and watch the entire company change with it.</div>
        </div>
      </div>`;
    return;
  }

  const panels = {
    overview: panelOverview,
    identity: panelIdentity,
    brand: panelBrand,
    domains: panelDomains,
    website: panelWebsite,
    social: panelSocial,
    marketing: panelMarketing,
    plan: panelPlan,
    company: panelCompany,
    launch: panelLaunch,
  };
  const project = STATE.project;
  document.title = `${project.identity.name} · Blueprint`;
  view.innerHTML = renderTabs() + (panels[STATE.tab] || panelOverview)(project);

  // Re-tint the shell with the generated brand's accent.
  document.documentElement.style.setProperty('--accent', project.brand.palette.primaryText);

  if (STATE.tab === 'website') {
    if (!project.site.routes.includes(STATE.previewPath)) STATE.previewPath = 'index.html';
    mountPreview();
  }
}

function savedProjects() {
  let list = [];
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) list = parsed.filter((entry) => entry && typeof entry.id === 'string');
  } catch {
    list = [];
  }
  try {
    const last = JSON.parse(localStorage.getItem(LAST_PROJECT_KEY) || 'null');
    if (last && typeof last.id === 'string' && !list.some((entry) => entry.id === last.id)) list.push(last);
  } catch {
    /* a corrupt single-slot entry is ignored, not fatal */
  }
  return list.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

function writeSavedProjects(list) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(list));
  // Keep the single-slot key in step: a build (or another tab) that only knows
  // `lastProject` must not resurrect a project this picker removed.
  if (list.length) localStorage.setItem(LAST_PROJECT_KEY, JSON.stringify(list[0]));
  else localStorage.removeItem(LAST_PROJECT_KEY);
}

function rememberProject(entry) {
  writeSavedProjects([entry, ...savedProjects().filter((item) => item.id !== entry.id)]);
}

function forgetProject(id) {
  writeSavedProjects(savedProjects().filter((item) => item.id !== id));
}

function savedWhen(ms) {
  if (!ms) return 'earlier';
  try {
    return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return 'earlier';
  }
}

function renderSavedState() {
  const restore = $('#btn-restore');
  const count = savedProjects().length;
  restore.hidden = count === 0;
  restore.textContent = count > 1 ? `Restore (${count})` : 'Restore';
  const publish = $('#btn-publish');
  if (publish) publish.disabled = !STATE.project;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function persistLocal() {
  if (!STATE.project) return;
  const key = `blueprint.local.${STATE.project.slug}`;
  localStorage.setItem(key, JSON.stringify({ checklistDone: [...STATE.checklistDone], chosenLogoId: STATE.chosenLogoId }));
}

function loadLocal(slugName) {
  try {
    const raw = localStorage.getItem(`blueprint.local.${slugName}`);
    if (!raw) return;
    const data = JSON.parse(raw);
    STATE.checklistDone = new Set(data.checklistDone || []);
    STATE.chosenLogoId = data.chosenLogoId || null;
  } catch {
    /* ignore corrupt local state */
  }
}

function readIntake() {
  return normalizeIntake({
    name: $('#name').value,
    oneLiner: $('#oneLiner').value,
    industry: $('#industry').value,
    audience: $('#audience').value,
    tone: $('#tone').value,
    founder: $('#founder').value,
    founderEmail: $('#founderEmail').value,
    city: $('#city').value,
    state: $('#state').value,
    entity: $('#entity').value,
    raising: $('#raising').value,
    cofounders: $('#cofounders').value,
    raiseAmount: $('#raiseAmount').value,
    mailProvider: $('#mailProvider').value,
  });
}

function generate() {
  const started = performance.now();
  STATE.generating = true;
  setFooter('Generating…');
  // Yield a frame so the button state paints before the synchronous work.
  requestAnimationFrame(() => {
    try {
      const project = generateCompany(readIntake());
      STATE.project = project;
      STATE.chosenLogoId = STATE.chosenLogoId || project.brand.chosen.id;
      STATE.domainResults = null;
      STATE.handleResults = null;
      STATE.positioning = null;
      STATE.mail = null;
      loadLocal(project.slug);
      // A positioning statement restored with the project is reused until the
      // model has answered for the current intake.
      if (STATE.restoredPositioning?.text) {
        STATE.positioning = {
          text: STATE.restoredPositioning.text,
          model: STATE.restoredPositioning.model || null,
          pending: false,
          signature: positioningSignature(project),
        };
        applyPositioning(project, STATE.restoredPositioning.text);
      }
      render();
      const ms = Math.round(performance.now() - started);
      setFooter(`Generated ${project.summary.fileCount} files in ${ms} ms.`);
      toast(`${project.identity.name} is ready — ${project.summary.fileCount} files.`);
      void autoPosition(project);
    } catch (error) {
      console.error(error);
      toast(`Generation failed: ${error.message}`, 'bad');
      setFooter('Generation failed.');
    } finally {
      STATE.generating = false;
      $('#btn-save').disabled = !STATE.project;
      renderSavedState();
    }
  });
}

async function checkDomains() {
  const button = view.querySelector('[data-action="check-domains"]');
  if (button) {
    button.disabled = true;
    button.textContent = 'Checking…';
  }
  try {
    const domains = STATE.project.domains.ranked.map((entry) => entry.domain);
    const data = await api('/api/domains/check', { method: 'POST', body: { domains } });
    STATE.domainResults = data.results;
    render();
    const free = data.results.filter((result) => result.available === true).length;
    toast(`${data.results.length} checked · ${free} look free · ${data.results.filter((r) => r.available === null).length} inconclusive`);
  } catch (error) {
    toast(error.message, 'bad');
    if (button) {
      button.disabled = false;
      button.textContent = 'Check availability';
    }
  }
}

async function checkHandles() {
  const button = view.querySelector('[data-action="check-handles"]');
  if (button) {
    button.disabled = true;
    button.textContent = 'Checking…';
  }
  try {
    const handles = handleProbeRequests(STATE.project.social.handles, 6);
    const data = await api('/api/handles/check', { method: 'POST', body: { handles } });
    STATE.handleResults = data.results;
    render();
    toast(`${data.results.length} handles probed. Unverifiable ones need a manual check.`);
  } catch (error) {
    toast(error.message, 'bad');
    if (button) {
      button.disabled = false;
      button.textContent = 'Check handles';
    }
  }
}

/**
 * Save under the business name.
 *
 * The name is the project's identity, not a label: a project is looked up by it
 * when the founder presses save again, so renaming the company starts a new
 * project rather than overwriting the last one, and the picker never shows two
 * rows called "Untitled". `quiet` is for Publish, which reports once at the end.
 */
async function saveProject({ quiet = false } = {}) {
  if (!STATE.project) return null;
  $('#btn-save').disabled = true;
  if (!quiet) setFooter('Saving…');
  const name = STATE.project.identity.name;
  try {
    const payload = {
      name,
      intake: STATE.project.intake,
      chosenLogoId: STATE.chosenLogoId,
      checklistDone: [...STATE.checklistDone],
      // The model's positioning statement is the one artifact that cannot be
      // regenerated from the intake, so it travels with the project.
      notes: STATE.positioning?.text ? { positioning: STATE.positioning.text } : {},
    };
    const existing = savedProjects().find((entry) => entry.name === name);
    let saved;
    if (existing) {
      try {
        await api(`/api/projects/${existing.id}`, { method: 'PUT', token: existing.editToken, body: payload });
        saved = { id: existing.id, editToken: existing.editToken };
      } catch {
        // The token no longer opens it (a different browser, or the project was
        // removed): fall through to a new project rather than losing the work.
        saved = await api('/api/projects', { method: 'POST', body: payload });
      }
    } else {
      saved = await api('/api/projects', { method: 'POST', body: payload });
    }
    STATE.saved = saved;
    rememberProject({ ...saved, name, savedAt: Date.now() });
    renderSavedState();
    if (!quiet) {
      toast(`Saved as “${name}”. Your website forms can now post to it.`);
      setFooter(`Saved “${name}” as project ${saved.id.slice(0, 8)}…`);
    }
    return { ...saved, name };
  } catch (error) {
    if (!quiet) {
      toast(`Could not save: ${error.message}`, 'bad');
      setFooter('Save failed.');
    }
    throw error;
  } finally {
    $('#btn-save').disabled = false;
  }
}

/**
 * Publish: the whole package in one action.
 *
 * It assembles the same bundle every download button assembles — website, brand
 * files, the business card, the legal drafts, the plan — saves the project under
 * the business name, and hands the founder one zip named after the company. Both
 * halves matter: a package with no saved project is a file nobody can reopen, and
 * a saved project with no package is a row that cannot be printed.
 */
async function publishProject() {
  if (!STATE.project) return;
  const button = $('#btn-publish');
  button.disabled = true;
  setFooter('Publishing the package…');
  try {
    const saved = await saveProject({ quiet: true });
    const bytes = await zipBundle(STATE.project.bundle);
    const file = `${slug(STATE.project.identity.name)}-business-package.zip`;
    download(file, new Blob([bytes], { type: 'application/zip' }));
    toast(`${STATE.project.identity.name}: ${STATE.project.bundle.files.length} files, ${humanBytes(bytes.length)}.`);
    setFooter(`Published ${file} (${humanBytes(bytes.length)}) and saved as “${saved.name}”.`);
  } catch (error) {
    toast(`Publish failed: ${error.message}`, 'bad');
    setFooter('Publish failed.');
  } finally {
    button.disabled = !STATE.project;
  }
}

function openProjects() {
  const list = savedProjects();
  const container = $('#projects-list');
  container.innerHTML = list.length
    ? list
        .map(
          (entry) => `<div class="project-row">
            <div>
              <div class="project-name">${h(entry.name || 'Untitled')}</div>
              <div class="project-meta">Saved ${h(savedWhen(entry.savedAt))} · project ${h(entry.id.slice(0, 8))}…</div>
            </div>
            <div class="project-actions">
              <button class="btn btn-sm btn-primary" data-action="open-project" data-id="${h(entry.id)}">Open</button>
              <button class="btn btn-sm btn-ghost" data-action="remove-project" data-id="${h(entry.id)}">Remove</button>
            </div>
          </div>`,
        )
        .join('')
    : '<p class="small faint">No projects saved in this browser yet. “Publish package” or “Save project” keeps one here.</p>';
  $('#projects-modal').hidden = false;
}

function closeProjects() {
  $('#projects-modal').hidden = true;
}

async function restoreProject(id = null) {
  const entries = savedProjects();
  const entry = id ? entries.find((item) => item.id === id) : entries[0];
  if (!entry) return;
  try {
    const data = await api(`/api/projects/${entry.id}`);
    applyIntake(data.payload.intake || {});
    STATE.restoredPositioning = data.payload.notes?.positioning ? { text: data.payload.notes.positioning } : null;
    STATE.chosenLogoId = data.payload.chosenLogoId || null;
    STATE.checklistDone = new Set(data.payload.checklistDone || []);
    STATE.saved = { id: entry.id, editToken: entry.editToken };
    rememberProject({ ...entry, name: data.name || entry.name });
    closeProjects();
    generate();
    toast(`Restored “${data.name || entry.name}”`);
  } catch (error) {
    toast(`Could not restore: ${error.message}`, 'bad');
  }
}

async function removeProject(id) {
  const entry = savedProjects().find((item) => item.id === id);
  if (!entry) return;
  const label = entry.name || 'this project';
  if (!window.confirm(`Remove “${label}”? The saved project and the enquiries its website collected are deleted, and its forms stop working.`)) return;
  try {
    await api(`/api/projects/${id}`, { method: 'DELETE', token: entry.editToken });
  } catch (error) {
    // Already gone on the server (404) is the state removal wants; anything else
    // (a token that no longer matches, a network failure) leaves it in the list.
    if (error.status !== 404) {
      toast(`Could not remove “${label}”: ${error.message}`, 'bad');
      return;
    }
  }
  forgetProject(id);
  renderSavedState();
  if (!$('#projects-modal').hidden) openProjects();
  toast(`Removed “${label}”.`);
}

/**
 * Select a value that may not be an option — an older saved project, or an API
 * caller, can carry an audience or a co-founder count the dropdowns do not
 * offer. Adding it keeps their data visible instead of silently blanking it.
 */
function setSelectValue(element, value) {
  const wanted = String(value ?? '');
  if (wanted && ![...element.options].some((option) => option.value === wanted)) {
    element.add(new Option(wanted || '(none)', wanted));
  }
  element.value = wanted;
}

function applyIntake(intake) {
  $('#name').value = intake.name || '';
  $('#oneLiner').value = intake.oneLiner || '';
  $('#industry').value = intake.industry || 'b2b-saas';
  setSelectValue($('#audience'), intake.audience || '');
  $('#tone').value = intake.tone || 'calm';
  $('#founder').value = intake.founder || '';
  $('#founderEmail').value = intake.founderEmail || '';
  $('#city').value = intake.city || '';
  $('#state').value = intake.state || 'DE';
  $('#entity').value = intake.entity || 'auto';
  $('#raising').value = intake.raising ? 'yes' : 'no';
  setSelectValue($('#cofounders'), String(intake.cofounders ?? 0));
  // Blank means "size it from the model", which is the default a founder should
  // see rather than a pre-filled number they did not choose.
  $('#raiseAmount').value = Number(intake.raiseAmount) > 0 ? String(intake.raiseAmount) : '';
  $('#mailProvider').value = intake.mailProvider || DEFAULT_MAIL_PROVIDER;
  syncMailProviderHint();
}

/** Spell out who hosts the chosen mailboxes, right under the dropdown. */
function syncMailProviderHint() {
  const hint = $('#mailProvider-hint');
  if (!hint) return;
  const provider = MAIL_PROVIDERS.find((entry) => entry.key === $('#mailProvider').value) || MAIL_PROVIDERS[0];
  hint.textContent = provider.managed
    ? `Hosted by ${provider.operator}. Blueprint creates the tenant, the mail domain and every mailbox on the ${provider.server} server for you.`
    : `You create these mailboxes yourself at ${provider.label} and add the records to your DNS.`;
}

/** Identifies the exact intake a positioning statement was written for. */
function positioningSignature(project) {
  return `${project.slug}:${project.identity.oneLiner}:${project.intake.audience}:${project.intake.tone}`;
}

/**
 * Ask the model for the positioning statement, once per generate.
 *
 * Failure is never fatal: the engine's own statement is already on screen, so a
 * gateway that is down, slow or unconfigured just means the deterministic copy
 * stays. Only an unexpected error is reported, and never as a failed generate.
 */
async function autoPosition(project) {
  if (!STATE.config?.ai?.configured) {
    STATE.positioning = null;
    return;
  }
  const signature = positioningSignature(project);
  // A restored statement already matches this intake: keep it, do not re-bill
  // the model for something we have.
  if (STATE.positioning?.text && STATE.positioning.signature === signature) return;
  STATE.positioning = { text: null, model: null, pending: true, signature };
  render();
  try {
    const data = await api('/api/ai/positioning', {
      method: 'POST',
      body: {
        context: {
          name: project.identity.name,
          oneLiner: project.identity.oneLiner,
          industry: project.intake.industryLabel,
          audience: project.intake.audience,
          archetype: project.identity.archetype.name,
          tone: project.identity.tone.label,
          values: project.identity.values.map((value) => value.name),
        },
      },
    });
    // A generate may have happened while the model was thinking; the answer for
    // a company that is no longer on screen must not overwrite the current one.
    if (STATE.positioning && STATE.positioning.signature !== signature) return;
    STATE.positioning = { text: data.text, model: data.model, pending: false, signature };
    applyPositioning(project, data.text);
    render();
  } catch (error) {
    if (STATE.positioning && STATE.positioning.signature === signature) STATE.positioning = null;
    render();
    // 501 means unconfigured, which is a supported state, not a fault.
    if (!/not configured/i.test(error.message)) toast(`Positioning left to the engine: ${error.message}`);
  }
}

/**
 * Put the model's statement everywhere the deterministic one appears — the
 * marketing copy, the generated site and the downloadable bundle. The rebuild
 * itself lives in the engine, which is the only place that knows the shape of
 * the context the exporters need.
 */
function applyPositioning(project, text) {
  applyPositioningStatement(project, text);
}

/**
 * Create the Oasis tenant, mail domain and mailboxes for this project.
 * The server re-validates everything and answers with a per-step result.
 */
async function provisionMail() {
  if (!STATE.project) return;
  STATE.mailBusy = true;
  render();
  try {
    const project = STATE.project;
    const data = await api('/api/mail/provision', {
      method: 'POST',
      body: {
        domain: project.domains.primaryDomain,
        mailboxes: project.mailboxes.boxes.map((box) => ({ address: box.address, purpose: box.purpose, owner: box.owner })),
        records: mailRecords(project.dns),
        apply: true,
      },
    });
    STATE.mail = data;
    toast(data.applied ? 'Mailboxes created.' : 'Plan ready — nothing was created.', data.applied ? '' : 'warn');
  } catch (error) {
    toast(`Mail provisioning failed: ${error.message}`, 'bad');
  } finally {
    STATE.mailBusy = false;
    render();
  }
}

async function downloadZip() {
  setFooter('Zipping…');
  try {
    const bytes = await zipBundle(STATE.project.bundle);
    download(`${STATE.project.slug}-blueprint-bundle.zip`, new Blob([bytes], { type: 'application/zip' }));
    toast(`Zip ready — ${humanBytes(bytes.length)}`);
    setFooter(`Zipped ${STATE.project.bundle.files.length} files (${humanBytes(bytes.length)}).`);
  } catch (error) {
    toast(`Zip failed: ${error.message}`, 'bad');
  }
}

function findBundleFile(path) {
  return STATE.project.bundle.files.find((file) => file.path === path);
}

function downloadBundleFile(path) {
  const file = findBundleFile(path);
  if (!file) {
    toast(`No file at ${path}`, 'bad');
    return;
  }
  const type = path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.json') ? 'application/json' : path.endsWith('.csv') || path.endsWith('.ics') ? 'text/csv' : 'text/plain';
  download(path.split('/').pop(), file.content, `${type};charset=utf-8`);
}

function downloadDocs() {
  const docs = STATE.project.bundle.files.filter((file) => file.path.startsWith('legal/'));
  docs.forEach((file, index) => {
    setTimeout(() => download(file.path.split('/').pop(), file.content), index * 120);
  });
  toast(`Downloading ${docs.length} documents.`);
}

function downloadWebsite() {
  const files = STATE.project.bundle.files.filter((file) => file.path.startsWith('website/'));
  files.forEach((file, index) => {
    setTimeout(() => download(file.path.replace('website/', '').split('/').pop(), file.content), index * 100);
  });
  toast(`Downloading ${files.length} site files.`);
}

function conceptById(id) {
  return STATE.project.brand.concepts.find((concept) => concept.id === id) || STATE.project.brand.chosen;
}

async function downloadConceptPng(conceptId, variant, size) {
  try {
    const svg = conceptById(conceptId).variants[variant];
    const dims = variant === 'appIcon' ? [size, size] : variant === 'og' ? [1200, 630] : [size, size];
    const blob = await svgToPng(svg, dims[0], dims[1]);
    if (!blob) throw new Error('Rasterisation returned nothing.');
    download(`${slug(STATE.project.identity.name)}-${conceptId}-${variant}.png`, blob);
    toast('PNG exported.');
  } catch (error) {
    toast(`PNG export failed: ${error.message}`, 'bad');
  }
}

async function downloadAssetPng(asset, size) {
  try {
    const brand = STATE.project.brand;
    const source = asset === 'og' ? brand.og : brand.logo['app-icon.svg'];
    const dims = asset === 'og' ? [1200, 630] : [size, size];
    const blob = await svgToPng(source, dims[0], dims[1]);
    download(`${slug(STATE.project.identity.name)}-${asset}.png`, blob);
    toast('PNG exported.');
  } catch (error) {
    toast(`PNG export failed: ${error.message}`, 'bad');
  }
}

function downloadSocial(platform, kind) {
  const profile = STATE.project.social.profiles.find((item) => item.platform === platform);
  if (!profile) return;
  const svg = kind === 'banner' ? profile.assets.banner : profile.assets.avatar;
  if (!svg) {
    toast('That platform has no banner slot.', 'bad');
    return;
  }
  download(`${platform}-${kind}.svg`, svg, 'image/svg+xml;charset=utf-8');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied.');
  } catch {
    toast('Clipboard blocked by the browser — select and copy manually.', 'bad');
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

view.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  if (action === 'tab') {
    STATE.tab = target.dataset.tab;
    render();
    document.querySelector('.content').scrollTop = 0;
    return;
  }
  if (action === 'download-zip') return void downloadZip();
  if (action === 'download-file') return void downloadBundleFile(target.dataset.path);
  if (action === 'open-form') return void openForm(target.dataset.path);
  if (action === 'download-docs') return void downloadDocs();
  if (action === 'download-website') return void downloadWebsite();
  if (action === 'download-png') return void downloadConceptPng(target.dataset.concept, target.dataset.variant, Number(target.dataset.size || 1024));
  if (action === 'download-png-asset') return void downloadAssetPng(target.dataset.asset, Number(target.dataset.size || 1200));
  if (action === 'download-svg') {
    const concept = conceptById(target.dataset.concept);
    download(`${slug(STATE.project.identity.name)}-${target.dataset.variant}.svg`, concept.variants[target.dataset.variant], 'image/svg+xml;charset=utf-8');
    return;
  }
  if (action === 'download-social') return void downloadSocial(target.dataset.platform, target.dataset.kind);
  if (action === 'check-domains') return void checkDomains();
  if (action === 'check-handles') return void checkHandles();
  if (action === 'copy') return void copyText(target.dataset.copy);
  if (action === 'logo-select') {
    STATE.chosenLogoId = target.dataset.id;
    persistLocal();
    render();
    toast('Logo direction selected.');
    return;
  }
  if (action === 'preview-page') {
    STATE.previewPath = target.dataset.path;
    render();
    return;
  }
  if (action === 'check-all') {
    STATE.project.checklist.forEach((item, index) => STATE.checklistDone.add(`${slug(item.phase)}-${slug(item.task)}-${index}`));
    persistLocal();
    render();
    return;
  }
  if (action === 'check-none') {
    STATE.checklistDone.clear();
    persistLocal();
    render();
    return;
  }
  if (action === 'provision-mail') return void provisionMail();
});

view.addEventListener('change', (event) => {
  const target = event.target;
  if (target.dataset && target.dataset.action === 'toggle-check') {
    const key = target.dataset.key;
    if (target.checked) STATE.checklistDone.add(key);
    else STATE.checklistDone.delete(key);
    persistLocal();
    const label = target.closest('.check-item');
    if (label) label.classList.toggle('done', target.checked);
    const total = STATE.project.checklist.length;
    setFooter(`${STATE.checklistDone.size} of ${total} launch steps complete.`);
    return;
  }
  if (target.dataset && target.dataset.action === 'select-doc') {
    STATE.docPath = target.value;
    render();
  }
});

$('#intake').addEventListener('submit', (event) => {
  event.preventDefault();
  generate();
});

// Live regeneration when the name or industry changes and a project exists.
let debounce = null;
for (const id of ['name', 'industry', 'tone', 'audience']) {
  const element = document.getElementById(id);
  element.addEventListener('change', () => {
    if (!STATE.project) return;
    clearTimeout(debounce);
    debounce = setTimeout(generate, 220);
  });
}

$('#btn-publish').addEventListener('click', () => void publishProject());
$('#btn-save').addEventListener('click', () => void saveProject());
$('#btn-restore').addEventListener('click', openProjects);
$('#projects-modal-close').addEventListener('click', closeProjects);
$('#projects-modal').addEventListener('click', (event) => {
  if (event.target === $('#projects-modal')) closeProjects();
});
$('#projects-list').addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  if (target.dataset.action === 'open-project') void restoreProject(target.dataset.id);
  if (target.dataset.action === 'remove-project') void removeProject(target.dataset.id);
});

// Modal chrome lives outside #view, so it needs its own listeners.
$('#form-modal-close').addEventListener('click', () => closeForm());
$('#form-modal-print').addEventListener('click', () => printForm());
$('#form-modal-tab').addEventListener('click', () => openFormTab());
$('#form-modal').addEventListener('click', (event) => {
  // Clicking the backdrop dismisses; clicks inside the panel do not.
  if (event.target === $('#form-modal')) closeForm();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeForm();
    closeProjects();
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function fillSelects() {
  $('#industry').innerHTML = INDUSTRY_OPTIONS.map((option) => `<option value="${h(option.key)}">${h(option.label)}</option>`).join('');
  $('#tone').innerHTML = TONE_OPTIONS.map((option) => `<option value="${h(option.key)}">${h(option.label)}</option>`).join('');
  $('#state').innerHTML = Object.entries(JURISDICTIONS)
    .map(([code, entry]) => `<option value="${h(code)}">${h(entry.name)}</option>`)
    .join('');
  $('#audience').innerHTML = AUDIENCE_OPTIONS.map(
    (option) => `<option value="${h(option.label)}">${option.key === 'auto' ? 'Let Blueprint infer it from the industry' : h(option.label)}</option>`,
  ).join('');
  $('#mailProvider').innerHTML = MAIL_PROVIDERS.map((provider) => `<option value="${h(provider.key)}">${h(provider.label)}</option>`).join('');
  $('#industry').value = 'b2b-saas';
  $('#tone').value = 'calm';
  $('#state').value = 'DE';
  $('#mailProvider').value = DEFAULT_MAIL_PROVIDER;
  syncMailProviderHint();
  $('#engine-version').textContent = ENGINE_VERSION;
}

async function boot() {
  fillSelects();
  render();
  renderSavedState();
  try {
    const config = await api('/api/config');
    STATE.config = config;
    STATE.apiOnline = true;
    $('#api-dot').className = 'dot on';
    const bits = [config.email.configured ? `${config.email.label} ready` : 'form capture mode'];
    if (config.ai.configured) bits.push(`positioning by ${config.ai.model}`);
    if (config.mail?.configured) bits.push(`${config.mail.label.replace(/\s*\(.*\)$/, '')} mail ready`);
    $('#api-status').textContent = `API online · ${bits.join(' · ')}`;
    // A project can already be on screen if generate ran before the config
    // landed; now that we know whether a gateway exists, ask it for the copy.
    if (STATE.project) void autoPosition(STATE.project);
  } catch {
    STATE.apiOnline = false;
    $('#api-dot').className = 'dot off';
    $('#api-status').textContent = 'API offline — generation still works';
  }
}

// Debug handle for automated checks and manual inspection from the console.
globalThis.__blueprint = {
  STATE,
  render,
  md,
  sitePreview,
  mountPreview,
  generate,
  readIntake,
  svgToPng,
  openForm,
  closeForm,
  printForm,
  openFormTab,
  frameLoadedForm,
  formContent,
  autoPosition,
  provisionMail,
  publishProject,
  saveProject,
  restoreProject,
  removeProject,
  savedProjects,
};

boot();

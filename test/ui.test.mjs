import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const html = read('public/index.html');
const css = read('public/app.css');
const js = read('public/app.js');

// Every element app.js reaches for by id has to exist in the markup. A typo
// here is a null dereference at boot, and nothing else in the suite loads the
// page, so this is the only place that can catch it.
test('every element id referenced by app.js exists in the page', () => {
  const referenced = new Set([...js.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map((match) => match[1]));
  assert.ok(referenced.size > 5, `expected app.js to reference ids, found ${referenced.size}`);
  const declared = new Set([...html.matchAll(/\bid="([A-Za-z0-9_-]+)"/g)].map((match) => match[1]));
  for (const id of referenced) {
    assert.ok(declared.has(id), `app.js uses #${id} but index.html never declares it`);
  }
});

// The panels render by returning one big template literal, so a typo inside it
// is emitted as text rather than as a syntax error — a `}` left before the
// closing backtick showed up as a stray brace under the Marketing tab. Nothing
// else in the suite evaluates app.js, so the render layer is guarded here.
test('no panel template ends on a literal brace', () => {
  // A line that is nothing but `}` before the closing backtick is a brace the
  // page renders. `${...}` on its own line is interpolation and stays legal, so
  // the pattern is anchored to a line whose only content is the brace.
  const strays = [...js.matchAll(/^[ \t]*\}[ \t]*`;/gm)].map((match) => match[0].trim());
  assert.deepEqual(strays, [], `a template ends with a literal brace the page will render: ${strays.join(' | ')}`);
});

// The modal is the replacement for a pop-up tab, so it must be a sibling of
// the app shell. Inside #view it would be destroyed by the next render().
test('the printable-form modal is a sibling of the app shell, not inside it', () => {
  const modalAt = html.indexOf('id="form-modal"');
  const footerAt = html.indexOf('class="footerbar"');
  assert.ok(modalAt !== -1, 'the form modal is missing from the page');
  assert.ok(footerAt !== -1 && modalAt > footerAt, 'the modal must sit after the app shell, not inside it');
  assert.ok(html.indexOf('id="form-modal"') > html.indexOf('id="view"'), 'the modal must not render inside #view');
});

test('the modal carries a frame and the three controls it needs', () => {
  const modal = html.slice(html.indexOf('id="form-modal"'), html.indexOf('id="toast"'));
  assert.ok(/<iframe[^>]*id="form-modal-frame"/.test(modal), 'no iframe to render the form in');
  for (const id of ['form-modal-print', 'form-modal-tab', 'form-modal-close']) {
    assert.ok(modal.includes(`id="${id}"`), `modal is missing the ${id} control`);
  }
  // It must start dismissed: an open backdrop on first paint would block the app.
  assert.match(modal, /id="form-modal"[^>]*\shidden/, 'the modal must start hidden');
  // type="button" matters: inside a form these would otherwise submit it.
  for (const id of ['form-modal-print', 'form-modal-tab', 'form-modal-close']) {
    const tag = modal.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`));
    assert.ok(tag, `${id} is not a button element`);
    assert.ok(/type="button"/.test(tag[0]), `${id} needs type="button" so it cannot submit the intake form`);
  }
});

// The old behavior opened a pop-up tab and had nothing to fall back on when
// the browser blocked it. The iframe must be the primary path now.
test('opening a form does not depend on a pop-up tab', () => {
  assert.ok(/function openForm\(/.test(js), 'openForm is missing');
  assert.ok(/modal\.hidden\s*=\s*false/.test(js), 'openForm never reveals the modal');
  const openForm = js.slice(js.indexOf('function openForm('), js.indexOf('function printForm('));
  assert.ok(!/window\.open/.test(openForm), 'the primary open path must not open a tab');
  assert.ok(/function openFormTab\(/.test(js), 'the deliberate new-tab escape hatch is missing');
  assert.ok(/function closeForm\(/.test(js) && /function printForm\(/.test(js), 'the modal controls are incomplete');
});

// The document is handed to the frame directly, so there is no URL to
// navigate to: nothing for a frame-src policy to refuse and no blob to leak.
test('the form reaches the frame as markup, not as a navigation', () => {
  const openForm = js.slice(js.indexOf('function openForm('), js.indexOf('function printForm('));
  assert.ok(/frame\.srcdoc = content/.test(openForm), 'openForm never gives the frame the form markup');
  assert.ok(!/frame\.src\s*=/.test(js), 'the frame must not depend on a navigation');
  assert.ok(!/createObjectURL/.test(openForm), 'the embedded view must not need a blob URL');
  // A real click, so this tab is a user gesture and cannot be pop-up blocked.
  const openFormTab = js.slice(js.indexOf('function openFormTab('));
  assert.ok(/window\.open/.test(openFormTab), 'the new-tab path is missing');
  assert.ok(/revokeObjectURL/.test(openFormTab), 'the new-tab blob URL is never revoked');
});

test('the modal controls are wired, dismissed by Escape and the backdrop', () => {
  assert.ok(/form-modal-print'\)\.addEventListener\('click', \(\) => printForm\(\)\)/.test(js), 'print button is not wired');
  assert.ok(/form-modal-tab'\)\.addEventListener\('click', \(\) => openFormTab\(\)\)/.test(js), 'new-tab button is not wired');
  assert.ok(/form-modal-close'\)\.addEventListener\('click', \(\) => closeForm\(\)\)/.test(js), 'close button is not wired');
  assert.ok(/event\.key === 'Escape'/.test(js), 'Escape does not dismiss the modal');
  assert.ok(/event\.target === \$\('#form-modal'\)/.test(js), 'the backdrop does not dismiss the modal');
});

// If the frame never commits a navigation the user must be told what to do,
// not left staring at an empty box — the same dead end as a blocked pop-up.
test('a frame that never loads falls back to instructions, not a blank box', () => {
  assert.ok(/function frameLoadedForm\(/.test(js), 'nothing ever checks whether the frame loaded');
  assert.ok(/const FORM_FALLBACK_HINT =/.test(js), 'there is no fallback message to show');
  const openForm = js.slice(js.indexOf('function openForm('), js.indexOf('function printForm('));
  // Both the load event and a timer must settle the frame the same way, so a
  // frame that never fires load is still caught.
  assert.ok(/frame\.addEventListener\('load', \(\) => \{\s*clearTimeout\(formLoadTimer\);\s*settle\(\);/.test(openForm),
    'the load event does not settle the frame');
  assert.ok(/formLoadTimer = setTimeout\(settle/.test(openForm), 'a frame that never fires load is never checked');
  // The fallback must be decided by the check, not assumed.
  assert.ok(/if \(frameLoadedForm\(\)\) return true;\s*setFormHint\(FORM_FALLBACK_HINT, true\);/.test(openForm),
    'the fallback must be driven by frameLoadedForm');
  // A cross-origin frame is unreadable, not broken, and must not cry failure.
  const check = js.slice(js.indexOf('function frameLoadedForm('), js.indexOf('function formContent('));
  assert.ok(/\} catch \{\s*return true;/.test(check), 'a cross-origin frame must count as loaded');
  assert.ok(/id="form-modal-hint"/.test(html), 'the modal has nowhere to show the fallback');
});

// A load event for a form the user already replaced must not report failure
// against the one now on screen.
test('a stale load event cannot clobber the form that is open', () => {
  const openForm = js.slice(js.indexOf('function openForm('), js.indexOf('function printForm('));
  assert.ok(/const settle = \(\) => \{\s*if \(modal\.hidden \|\| modal\.dataset\.path !== path\) return false;/.test(openForm),
    'settle must ignore a frame that is no longer the current form');
  assert.ok(/modal\.dataset\.path = path;\s*clearTimeout\(formLoadTimer\)/.test(openForm),
    'the path must be recorded before the load handlers are armed');
});

// Reopening a form in the frame must not leak the document already parsed
// there, and closing must leave nothing armed behind it.
test('closing the modal releases the frame and everything armed for it', () => {
  const closeForm = js.slice(js.indexOf('function closeForm('), js.indexOf('function openForm('));
  assert.ok(/clearTimeout\(formLoadTimer\)/.test(closeForm), 'the pending load check is never canceled');
  assert.ok(/removeAttribute\('srcdoc'\)/.test(closeForm), 'closing the modal must drop the parsed document');
  assert.ok(/classList\.remove\('form-open'\)/.test(closeForm), 'closing the modal must drop the print marker');
  assert.ok(/removeAttribute\('data-path'\)/.test(closeForm), 'closing the modal must forget the form it showed');
  // Assigning srcdoc again replaces the document; nothing else may linger.
  const openForm = js.slice(js.indexOf('function openForm('), js.indexOf('function printForm('));
  assert.equal((openForm.match(/frame\.srcdoc = content/g) || []).length, 1, 'the form must be assigned once per open');
});

// A browser that prints the host page instead of the frame would otherwise
// print the app UI. The hedge must exist — and must not fire when the modal is
// shut, or printing the app itself would come out blank.
test('printing is guarded so only the form lands on the sheet', () => {
  const printBlock = css.slice(css.indexOf('@media print {\n  body.form-open'));
  assert.ok(printBlock.length > 0, 'the print fallback for an open modal is missing');
  for (const selector of ['body.form-open .app', 'body.form-open .modal-head', 'body.form-open #form-modal-frame']) {
    assert.ok(printBlock.includes(selector), `print fallback does not handle ${selector}`);
  }
  // Unguarded rules would blank out a normal print of the app.
  const unguarded = [...css.matchAll(/@media print \{[^@]*/g)].map((match) => match[0]);
  for (const block of unguarded) {
    assert.ok(!/\n\s*\.app\s*\{/.test(block), 'a print rule hides the app without the form-open guard');
  }
});

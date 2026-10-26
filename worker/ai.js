// The positioning writer.
//
// There is no "rewrite with AI" button. The model has exactly one job: write the
// company's positioning statement, automatically, from the intake. Everything
// else Blueprint produces is deterministic engine output, so the app never
// depends on a model to be complete.
//
// The gateway is any OpenAI-compatible chat-completions endpoint. In this estate
// that is OmniRoute, and the key is read from Vault at startup rather than
// written into a file — see the `vault://` handling in scripts/dev-server.mjs.
// AI_BASE_URL must stop at /v1: this module appends /chat/completions.
//
// Anything the model returns is untrusted text: it is length-capped, stripped of
// markup and returned as data, never executed or rendered as HTML.

/** Hard cap on what a model may return, before the statement is shown or stored. */
export const MAX_POSITIONING = 1200;

/** How long we wait before giving up and leaving the engine's copy in place. */
const TIMEOUT_MS = 20_000;

export function aiStatus(env) {
  const base = String(env.AI_BASE_URL || '').replace(/\/+$/, '');
  const key = env.AI_API_KEY;
  const model = env.AI_MODEL;
  if (!base || !key) {
    return {
      configured: false,
      note: 'Set AI_BASE_URL, AI_API_KEY and AI_MODEL to have the positioning statement written for you. Everything else is generated either way.',
    };
  }
  return { configured: true, model: model || 'default', base, purpose: 'positioning' };
}

const POSITIONING_BRIEF = [
  'Write the positioning statement for this company, in the classic form:',
  'For [specific audience] who [need or trigger], [name] is a [category] that [outcome].',
  'Unlike [the alternative they use today], we [the differentiator].',
  '',
  'Rules:',
  '- One paragraph, 40–90 words. No heading, no bullet points, no code fences.',
  '- Name the audience concretely enough that they recognise themselves.',
  '- The differentiator must be something the product actually does, not an adjective.',
  '- Never invent statistics, customer names, funding or certifications.',
  '- No hype words: revolutionary, cutting-edge, seamless, game-changing, world-class.',
  '- Plain text only.',
].join('\n');

/** The company facts the model is allowed to see. Nothing else is sent. */
function positioningContext(company = {}) {
  return {
    name: String(company.name || '').slice(0, 80),
    purpose: String(company.oneLiner || company.purpose || '').slice(0, 300),
    industry: String(company.industry || '').slice(0, 80),
    audience: String(company.audience || '').slice(0, 200),
    archetype: String(company.archetype || '').slice(0, 60),
    tone: String(company.tone || '').slice(0, 60),
    values: Array.isArray(company.values)
      ? company.values.slice(0, 5).map((value) => String(typeof value === 'string' ? value : value?.name || '').slice(0, 80))
      : [],
  };
}

/**
 * Build the messages sent to the gateway. Exported so a test can assert the
 * prompt without reaching the network.
 */
export function buildPositioningPrompt(company = {}) {
  const context = positioningContext(company);
  return [
    {
      role: 'system',
      content:
        'You are a senior brand strategist writing positioning for a first-time founder. ' +
        'You write plainly and specifically, you prefer concrete nouns to adjectives, and you never ' +
        'invent facts. You output the statement and nothing else — no preamble, no explanation.',
    },
    {
      role: 'user',
      content: [
        `Company: ${context.name}`,
        `Purpose: ${context.purpose || '(not supplied — infer it from the industry, and keep it general)'}`,
        `Industry: ${context.industry}`,
        `Target audience: ${context.audience || '(not supplied — infer the most likely buyer from the industry)'}`,
        context.archetype ? `Brand archetype: ${context.archetype}` : '',
        context.tone ? `Tone of voice: ${context.tone}` : '',
        context.values.length ? `Values: ${context.values.join(', ')}` : '',
        '',
        POSITIONING_BRIEF,
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];
}

/**
 * Strip anything that must not survive a round trip through the UI or a file:
 * code fences, HTML tags and control characters.
 */
export function sanitizePositioning(raw) {
  return String(raw ?? '')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_POSITIONING);
}

/**
 * Ask the gateway to write the positioning statement.
 * @returns {Promise<{text: string, model: string}>}
 */
export async function writePositioning(env, company, options = {}) {
  const status = aiStatus(env);
  if (!status.configured) {
    const error = new Error(status.note);
    error.code = 'ai_not_configured';
    throw error;
  }

  const fetchImpl = options.fetchImpl || fetch;
  // A model that never answers must not hold the request open: abort on a timer
  // unless the caller supplied its own signal (tests pass a stub and no signal).
  const controller = new AbortController();
  const timer = options.signal ? null : setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetchImpl(`${status.base}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.AI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.AI_MODEL || 'auto/best-chat',
        messages: buildPositioningPrompt(company),
        temperature: 0.6,
        max_tokens: 500,
      }),
      signal: options.signal || controller.signal,
    });
  } catch (error) {
    const wrapped = new Error('The model endpoint could not be reached.');
    wrapped.code = 'ai_unreachable';
    wrapped.cause = error;
    throw wrapped;
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!response.ok) {
    const error = new Error(`The model endpoint returned ${response.status}.`);
    error.code = 'ai_upstream_error';
    throw error;
  }

  const data = await response.json().catch(() => null);
  const text = sanitizePositioning(data?.choices?.[0]?.message?.content);
  if (!text) {
    const error = new Error('The model returned an empty response.');
    error.code = 'ai_empty';
    throw error;
  }
  return { text, model: data?.model || env.AI_MODEL || 'unknown' };
}

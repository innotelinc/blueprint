// Deterministic randomness and small text/color utilities.
//
// Every artifact in Blueprint is derived from the company name, so the same name
// always produces the same company. That makes output reviewable, diffable and
// testable instead of a slot machine.

/** xmur3 string hash -> 32-bit seed. Stable across runs and platforms. */
export function hashString(input) {
  let h = 1779033703 ^ String(input).length;
  for (let i = 0; i < String(input).length; i += 1) {
    h = Math.imul(h ^ String(input).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 PRNG. Small, fast, deterministic. */
export function makeRng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    float: next,
    int: (max) => Math.floor(next() * max),
    range: (min, max) => min + next() * (max - min),
    bool: (p = 0.5) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    sample: (list, count) => shuffle(list, next).slice(0, Math.max(0, Math.min(count, list.length))),
    shuffle: (list) => shuffle(list, next),
    /** Weighted pick: entries are [value, weight]. */
    weighted: (entries) => {
      const total = entries.reduce((sum, entry) => sum + entry[1], 0);
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll <= 0) return value;
      }
      return entries[entries.length - 1][0];
    },
  };
}

export function shuffle(list, rand) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Build a seeded rng for a named section of a project. */
export function seedFor(name, section) {
  return makeRng(hashString(`${String(name).trim().toLowerCase()}::${section}`));
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function slugify(input) {
  return String(input)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

/** Compact alphanumeric form for domain names and handles. */
export function compact(input) {
  return String(input)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function titleCase(input) {
  return String(input)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      // Preserve intentional capitalization like "iOS", "McKay" or "B2B".
      if (/[A-Z]/.test(word.slice(1)) || /\d/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape untrusted text before it reaches generated HTML. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

/** Escape a value for use inside a JSON <script> block. */
export function escapeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

const ACRONYM_VOWEL_SOUND = /^(A|E|F|H|I|L|M|N|O|R|S|X)/;
const AN_EXCEPTIONS = /^(hour|honest|honour|honor|heir)/i;

/**
 * Fix a/an agreement in generated prose.
 *
 * Templates concatenate a slot ("a {category}") into a sentence, so "a AI
 * platform" and "a app" are inevitable without a check. Acronyms are read
 * letter by letter, so "an MVP" and "an SEO plan" are handled by their own rule.
 */
export function withArticles(text) {
  return String(text).replace(/\b(a|an|A|An)\s+([A-Za-z][\w'’-]*)/g, (match, article, word) => {
    const isAn = article.toLowerCase() === 'an';
    const isAcronym = /^[A-Z]{2,}/.test(word);
    let wantsAn;
    if (isAcronym) {
      wantsAn = ACRONYM_VOWEL_SOUND.test(word);
    } else if (AN_EXCEPTIONS.test(word)) {
      wantsAn = true;
    } else if (/^[aeio]/i.test(word) && !/^(one|once)/i.test(word)) {
      wantsAn = true;
    } else if (/^[bcdfgjklmnpqrstvwxyz]/i.test(word) || /^h/.test(word)) {
      wantsAn = false;
    } else {
      return match; // 'u' words are ambiguous (a unicorn, an umbrella) — leave them alone.
    }
    if (wantsAn === isAn) return match;
    const replacement = wantsAn ? 'an' : 'a';
    return `${article === article.toUpperCase() ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement} ${word}`;
  });
}

/** Apply withArticles to every string in a nested structure. */
export function fixArticlesDeep(value) {
  if (typeof value === 'string') return withArticles(value);
  if (Array.isArray(value)) return value.map(fixArticlesDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, fixArticlesDeep(entry)]));
  }
  return value;
}

export function unique(list) {
  return [...new Set(list.filter((item) => item !== undefined && item !== null && item !== ''))];
}

export function truncate(value, max) {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function words(value) {
  return String(value ?? '').trim().split(/\s+/).filter(Boolean);
}

export function sentenceCase(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

export function hslToHex(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;
  const k = (n) => (n + hue / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (v) =>
    Math.round(255 * v)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export function hexToRgb(hex) {
  const clean = String(hex).replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }) {
  const toHex = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function channelLuminance(value) {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** WCAG 2.1 contrast ratio between two hex colors (1..21). */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG grade for a pair: 'AAA' | 'AA' | 'AA-large' | 'fail'. */
export function contrastGrade(ratio, large = false) {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (large && ratio >= 3) return 'AA-large';
  return 'fail';
}

/** Pick black or white text for maximum legibility on a background. */
export function readableOn(background, options = {}) {
  const dark = options.dark || '#0b0e14';
  const light = options.light || '#ffffff';
  return contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark;
}

/** Nudge a color's lightness until it clears a contrast target. */
export function ensureContrast(foreground, background, target = 4.5) {
  const { r, g, b } = hexToRgb(foreground);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = ((max + min) / 2 / 255) * 100;
  const s = max === min ? 0 : (max - min) / (max + min > 255 ? 2 - (max + min) / 255 : max + min);
  let hue = 0;
  if (max !== min) {
    if (max === r) hue = ((g - b) / (max - min)) % 6;
    else if (max === g) hue = (b - r) / (max - min) + 2;
    else hue = (r - g) / (max - min) + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const sat = s * 100;
  const backIsLight = luminance(background) > 0.4;
  let lightness = l;
  for (let step = 0; step < 60; step += 1) {
    const candidate = hslToHex(hue, sat, lightness);
    if (contrastRatio(candidate, background) >= target) return candidate;
    lightness += backIsLight ? -2 : 2;
    if (lightness <= 2 || lightness >= 98) break;
  }
  return readableOn(background);
}

export function mix(a, b, amount = 0.5) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * amount,
    g: ca.g + (cb.g - ca.g) * amount,
    b: ca.b + (cb.b - ca.b) * amount,
  });
}

export function alpha(hex, value) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Number(value.toFixed(3))})`;
}

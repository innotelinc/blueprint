// Brand: color system, typography, procedurally generated logo marks and the
// asset set a new company needs on day one (favicon, app icon, social cards).
//
// Everything here is deterministic for a given name and returns plain strings,
// so the same functions power the live preview and the downloadable bundle.
import {
  seedFor,
  escapeXml,
  hslToHex,
  mix,
  alpha,
  contrastRatio,
  contrastGrade,
  readableOn,
  ensureContrast,
  clamp,
} from './rng.js';
import { FONT_PAIRS } from './presets.js';

const SANS_FALLBACK = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const MOOD_RANGES = {
  bold: { sat: [74, 94], light: [46, 56] },
  editorial: { sat: [30, 46], light: [30, 42] },
  expressive: { sat: [64, 84], light: [44, 56] },
  humanist: { sat: [42, 60], light: [38, 50] },
};

const HARMONIES = [
  ['analogous', 3],
  ['complementary', 2],
  ['split', 2.5],
  ['triadic', 1.5],
  ['monochrome', 1],
];

function round(value, places = 0) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

export function buildPalette(name, archetype, rand) {
  const mood = MOOD_RANGES[archetype.type] || MOOD_RANGES.editorial;
  const [hueMin, hueMax] = archetype.hue;
  const baseHue = rand.range(hueMin, hueMax);
  const harmony = rand.weighted(HARMONIES);
  const sat = rand.range(mood.sat[0], mood.sat[1]);
  const light = rand.range(mood.light[0], mood.light[1]);

  const offsets = {
    analogous: [24, 340],
    complementary: [180, 205],
    split: [150, 210],
    triadic: [120, 240],
    monochrome: [12, 348],
  }[harmony];

  const hue = (offset) => hslToHex(baseHue + offset, sat, light);

  let primary = hue(0);
  let accent = hue(offsets[0]);
  let secondary = hue(offsets[1]);

  // Keep primary and accent visually distinct, not just technically different.
  const accentSwing = rand.range(-14, 14);
  accent = hslToHex(baseHue + offsets[0] + accentSwing, clamp(sat + rand.range(-8, 10), 25, 96), clamp(light + rand.range(-8, 8), 26, 62));
  secondary = hslToHex(baseHue + offsets[1], clamp(sat * 0.7, 20, 80), clamp(light + 8, 30, 66));

  const neutralSat = clamp(sat * 0.12, 3, 14);
  const ramp = (l) => hslToHex(baseHue, neutralSat, l);

  const neutrals = {
    50: ramp(98.5),
    100: ramp(96),
    200: ramp(91),
    300: ramp(84),
    400: ramp(70),
    500: ramp(56),
    600: ramp(42),
    700: ramp(30),
    800: ramp(19),
    900: ramp(11),
    950: ramp(7),
  };

  const paper = neutrals[50];
  const surface = '#ffffff';
  const surfaceAlt = neutrals[100];
  const ink = neutrals[900];
  const inkMuted = neutrals[600];
  const inkSubtle = neutrals[500];
  const line = neutrals[200];

  const base = {
    primary,
    accent,
    secondary,
    paper,
    surface,
    surfaceAlt,
    ink,
    inkMuted,
    inkSubtle,
    line,
    neutral: neutrals,
    onPrimary: readableOn(primary),
    onAccent: readableOn(accent),
    semantic: {
      positive: hslToHex(148, 58, 34),
      caution: hslToHex(38, 82, 40),
      critical: hslToHex(2, 68, 44),
      info: hslToHex(212, 62, 42),
    },
    dark: {
      background: neutrals[950],
      surface: neutrals[900],
      line: neutrals[800],
      text: neutrals[100],
      textMuted: neutrals[400],
    },
  };

  // Anything that carries text must clear WCAG AA on the surface it sits on.
  base.primaryText = ensureContrast(primary, paper, 4.5);
  base.primaryHover = mix(primary, ink, 0.18);
  base.link = base.primaryText;
  base.focusRing = ensureContrast(accent, paper, 3);

  const pair = (fg, bg, usage, large = false) => {
    const ratio = ratioOf(fg, bg);
    return { usage, foreground: fg, background: bg, ratio: round(ratio, 2), grade: contrastGrade(ratio, large) };
  };
  const ratioOf = (a, b) => contrastRatio(a, b);

  const checks = [
    pair(ink, paper, 'Body text on page background'),
    pair(inkMuted, paper, 'Secondary text'),
    pair(base.primaryText, paper, 'Links and buttons text on light'),
    pair(base.onPrimary, primary, 'Text on the primary color'),
    pair(base.onAccent, accent, 'Text on the accent color'),
    pair(neutrals[100], neutrals[950], 'Dark-mode body text', true),
  ];

  const swatches = [
    { name: 'Primary', hex: primary, role: 'Buttons, links, the mark itself', usage: 'Use on ≤20% of a layout surface.' },
    { name: 'Accent', hex: accent, role: 'Highlights, data viz, hover states', usage: 'One accent per screen.' },
    { name: 'Secondary', hex: secondary, role: 'Supporting fills, illustrations', usage: 'Never for text on light backgrounds.' },
    { name: 'Ink', hex: ink, role: 'Headings and body copy', usage: 'Default text color.' },
    { name: 'Muted ink', hex: inkMuted, role: 'Captions, metadata, labels', usage: 'Minimum 15px.' },
    { name: 'Paper', hex: paper, role: 'Page background', usage: 'The quietest color in the system.' },
    { name: 'Surface', hex: surface, role: 'Cards and panels', usage: 'Pair with a hairline border.' },
    { name: 'Line', hex: line, role: 'Dividers and borders', usage: '1px is enough.' },
    { name: 'Positive', hex: base.semantic.positive, role: 'Success states', usage: 'Always pair with an icon or word.' },
    { name: 'Critical', hex: base.semantic.critical, role: 'Errors, destructive actions', usage: 'Never the only signal of an error.' },
  ];

  const css = `:root {
  /* Brand */
  --brand-primary: ${primary};
  --brand-primary-hover: ${base.primaryHover};
  --brand-primary-text: ${base.primaryText};
  --brand-accent: ${accent};
  --brand-secondary: ${secondary};

  /* Surfaces */
  --paper: ${paper};
  --surface: ${surface};
  --surface-alt: ${surfaceAlt};
  --line: ${line};

  /* Text */
  --ink: ${ink};
  --ink-muted: ${inkMuted};
  --ink-subtle: ${inkSubtle};
  --on-primary: ${base.onPrimary};
  --on-accent: ${base.onAccent};
  --link: ${base.link};
  --focus: ${base.focusRing};

  /* State */
  --positive: ${base.semantic.positive};
  --caution: ${base.semantic.caution};
  --critical: ${base.semantic.critical};
  --info: ${base.semantic.info};

  /* Neutrals */
${Object.entries(neutrals)
  .map(([step, hex]) => `  --neutral-${step}: ${hex};`)
  .join('\n')}

  /* Dark mode */
  --dark-bg: ${base.dark.background};
  --dark-surface: ${base.dark.surface};
  --dark-line: ${base.dark.line};
  --dark-text: ${base.dark.text};
  --dark-text-muted: ${base.dark.textMuted};
}`;

  return {
    mood: archetype.type,
    harmony,
    baseHue: round(baseHue),
    ...base,
    neutrals,
    checks,
    swatches,
    gradients: {
      dawn: `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`,
      dusk: `linear-gradient(135deg, ${secondary} 0%, ${primary} 65%, ${accent} 100%)`,
      veil: `linear-gradient(180deg, ${alpha(paper, 0)} 0%, ${paper} 100%)`,
      mesh: `radial-gradient(at 15% 20%, ${alpha(accent, 0.28)} 0px, transparent 55%), radial-gradient(at 85% 10%, ${alpha(primary, 0.26)} 0px, transparent 50%), radial-gradient(at 60% 90%, ${alpha(secondary, 0.22)} 0px, transparent 55%), ${paper}`,
    },
    css,
    textCss: `.text-primary { color: ${base.primaryText}; }`,
  };
}

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export function buildTypography(rand, archetype, profile) {
  const pool = FONT_PAIRS.filter((pair) => pair.type === (profile.type || archetype.type));
  const candidates = pool.length >= 2 ? pool : FONT_PAIRS.filter((pair) => pair.type === archetype.type);
  const pair = rand.pick(candidates.length ? candidates : FONT_PAIRS);

  const headingStack = `'${pair.heading}', ${SANS_FALLBACK}`;
  const bodyStack = `'${pair.body}', ${SANS_FALLBACK}`;
  const monoStack = `'${pair.mono}', ui-monospace, SFMono-Regular, Menlo, monospace`;

  const families = [...new Set([pair.heading, pair.body, pair.mono])];
  const googleHref = `https://fonts.googleapis.com/css2?${[
    `${encodeURIComponent(pair.heading).replace(/%20/g, '+')}:wght@400;500;600;700`,
    `${encodeURIComponent(pair.body).replace(/%20/g, '+')}:wght@400;500;600`,
    `${encodeURIComponent(pair.mono).replace(/%20/g, '+')}:wght@400;500`,
  ].join('&family=')}&display=swap`;

  const scale = [
    { name: 'display', size: 64, lineHeight: 1.02, weight: 700, tracking: '-0.03em', usage: 'Hero headline only' },
    { name: 'h1', size: 48, lineHeight: 1.08, weight: 700, tracking: '-0.02em', usage: 'Page title' },
    { name: 'h2', size: 34, lineHeight: 1.15, weight: 600, tracking: '-0.015em', usage: 'Section heading' },
    { name: 'h3', size: 26, lineHeight: 1.2, weight: 600, tracking: '-0.01em', usage: 'Subsection, card title' },
    { name: 'h4', size: 20, lineHeight: 1.3, weight: 600, tracking: '0', usage: 'Feature label' },
    { name: 'body', size: 17, lineHeight: 1.6, weight: 400, tracking: '0', usage: 'Paragraph copy' },
    { name: 'small', size: 15, lineHeight: 1.5, weight: 400, tracking: '0', usage: 'Captions, footer' },
    { name: 'caption', size: 13, lineHeight: 1.4, weight: 500, tracking: '0.02em', usage: 'Labels, badges' },
    { name: 'code', size: 14, lineHeight: 1.5, weight: 400, tracking: '0', usage: 'Code, IDs' },
  ];

  return {
    pair: { heading: pair.heading, body: pair.body, mono: pair.mono, mood: pair.mood },
    stacks: { heading: headingStack, body: bodyStack, mono: monoStack },
    families,
    googleHref,
    scale,
    rules: [
      'Body text measures 60–72 characters per line; never let a paragraph span a full desktop width.',
      'Use weight and size for hierarchy — avoid introducing a fourth color for emphasis.',
      'Headings at 34px or larger may use the accent color; below that, stay in ink for contrast.',
      `Numbers in tables and metrics use ${pair.mono} so digits align.`,
      `Paragraph spacing is one line height (${round(17 * 1.6)}px at body size); no first-line indents.`,
      'Never set body copy in all caps — reserve caps for labels of three words or fewer.',
    ],
  };
}

// ---------------------------------------------------------------------------
// Logo marks
// ---------------------------------------------------------------------------

// Every mark is drawn on the same 96x96 field and is built to survive being
// shrunk: nothing is stroked thinner than MIN_STROKE (about a pixel at 16px),
// no detail is smaller than the mark's own optical centre, and each mark fills a
// comparable optical area, so the three directions compare like for like instead
// of one reading as visually heavier than the rest.
//
// Each mark also declares the brand archetypes it suits, which is how the two
// abstract directions are chosen — a design judgement rather than a coin toss.
const MARK_SIZE = 96;
const CENTER = 48;
const MIN_STROKE = 5.5;

/** Polar to cartesian, rounded so the same input always draws the same path. */
function polar(angle, radius, at = [CENTER, CENTER]) {
  const radians = (angle * Math.PI) / 180;
  return [round(at[0] + radius * Math.cos(radians), 2), round(at[1] + radius * Math.sin(radians), 2)];
}

/** An arc as a path, so it can carry the rounded ends the rest of the set uses. */
function arcPath(startAngle, sweep, radius, at = [CENTER, CENTER]) {
  const [x1, y1] = polar(startAngle, radius, at);
  const [x2, y2] = polar(startAngle + sweep, radius, at);
  const large = Math.abs(sweep) > 180 ? 1 : 0;
  return `M${x1} ${y1} A${round(radius, 2)} ${round(radius, 2)} 0 ${large} ${sweep >= 0 ? 1 : 0} ${x2} ${y2}`;
}

const stroke = (path, color, width = MIN_STROKE, extra = '') =>
  `<path d="${path}" fill="none" stroke="${color}" stroke-width="${round(width, 2)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const disc = (at, radius, fill, extra = '') => `<circle cx="${at[0]}" cy="${at[1]}" r="${round(radius, 2)}" fill="${fill}"${extra}/>`;
const bar = (x, y, width, height, fill, extra = '') =>
  `<rect x="${round(x, 2)}" y="${round(y, 2)}" width="${round(width, 2)}" height="${round(height, 2)}" rx="${round(height / 2, 2)}" fill="${fill}"${extra}/>`;

/** A disc cut into unequal parts: one system, many pieces. */
function mark_slice(rand, colors) {
  const segments = 4;
  const radius = 42;
  const gap = 6 + rand.range(2, 6);
  const turn = rand.range(-24, 24);
  let out = '';
  for (let index = 0; index < segments; index += 1) {
    const from = turn + (index / segments) * 360 + gap / 2;
    const to = turn + ((index + 1) / segments) * 360 - gap / 2;
    const [x1, y1] = polar(from, radius);
    const [x2, y2] = polar(to, radius);
    out += `<path d="M${CENTER} ${CENTER} L${x1} ${y1} A${radius} ${radius} 0 0 1 ${x2} ${y2} Z" fill="${
      index === 2 ? colors.accent : colors.primary
    }" opacity="${index % 2 ? 0.42 : 1}"/>`;
  }
  // A solid hub keeps the mark readable when the gaps go soft at small sizes.
  return out + disc([CENTER, CENTER], 12, colors.primary, ` stroke="${colors.paper}" stroke-width="4"`);
}

/** Arcs sweeping around a moving point: cycles that keep running. */
function mark_orbit(rand, colors) {
  const offset = rand.range(-40, 40);
  let out = '';
  for (let index = 0; index < 3; index += 1) {
    out += stroke(
      arcPath(offset + index * 96, 200 + index * 20, 18 + index * 12),
      index % 2 ? colors.accent : colors.primary,
      MIN_STROKE + (index === 0 ? 1.5 : 0),
    );
  }
  // The satellite rides just inside the outermost ring rather than floating at
  // random, and stays within the field: 38 + 7 keeps it inside 96.
  return out + disc(polar(offset + 40, 38), 7, colors.accent);
}

/** Unequal bars stacked into a ladder: modules adopted one rung at a time. */
function mark_stack(rand, colors) {
  const height = 13 + rand.range(-1, 2);
  let out = '';
  for (let index = 0; index < 3; index += 1) {
    const width = 66 - index * 11;
    out += bar(
      (MARK_SIZE - width) / 2 - index * 3,
      20 + index * (height + 9),
      width,
      height,
      index === 1 ? colors.accent : colors.primary,
      index === 2 ? ' opacity="0.45"' : '',
    );
  }
  return out;
}

/** Two layered summits: the plateau the buyer is on, and the one they move to. */
function mark_peak(rand, colors) {
  const rise = rand.range(4, 10);
  const apex = round(30 + rise * 1.6, 2);
  const back = `<path d="M${CENTER} ${round(20 + rise, 2)} L${round(88 - rise, 2)} 80 L${round(8 + rise, 2)} 80 Z" fill="${colors.accent}" opacity="0.4"/>`;
  const front = `<path d="M${CENTER} ${apex} L${round(84 - rise, 2)} 80 L${round(12 + rise, 2)} 80 Z" fill="${colors.primary}"/>`;
  // One deliberate aperture below the summit, kept large enough to survive 16px.
  return back + front + disc([CENTER, round(apex + 13, 2)], 6.5, colors.paper);
}

/** Points in a closed loop around a hub: integrations and what they connect. */
function mark_node(rand, colors) {
  const count = 6;
  const points = [];
  for (let index = 0; index < count; index += 1) {
    points.push(polar(-90 + (360 / count) * index + rand.range(-6, 6), 33 + rand.range(-4, 4)));
  }
  let out = '';
  // Every edge is drawn, and every edge is at least 4 units wide: the old
  // hairline links and randomly-dropped edges vanished below 32px.
  points.forEach(([x, y], index) => {
    const next = points[(index + 1) % points.length];
    out += stroke(`M${x} ${y} L${next[0]} ${next[1]}`, colors.primary, MIN_STROKE - 1.5, ' opacity="0.55"');
  });
  points.forEach(([x, y], index) => {
    out += disc([x, y], index === 0 ? 9 : 7 - (index % 2), index === 0 ? colors.accent : colors.primary);
  });
  return out + disc([CENTER, CENTER], 6, colors.primary);
}

/** Petals opening from a solid core: optimistic, and legible at sixteen pixels. */
function mark_bloom(rand, colors) {
  const petals = rand.bool() ? 6 : 8;
  let out = '';
  for (let index = 0; index < petals; index += 1) {
    out += `<ellipse cx="${CENTER}" cy="${CENTER - 21}" rx="8" ry="21" fill="${
      index % 2 ? colors.accent : colors.primary
    }" opacity="${index % 2 ? 0.5 : 0.9}" transform="rotate(${round((360 / petals) * index, 2)} ${CENTER} ${CENTER})"/>`;
  }
  return out + disc([CENTER, CENTER], 13, colors.paper) + disc([CENTER, CENTER], 7, colors.primary);
}

/** Two currents crossing: transfer, motion and continuous operation. */
function mark_flow(rand, colors) {
  const amplitude = rand.range(14, 20);
  return (
    stroke(`M8 36 C 30 ${round(36 - amplitude, 2)}, 66 ${round(36 + amplitude, 2)}, 88 36`, colors.primary, 11) +
    stroke(`M8 60 C 30 ${round(60 + amplitude, 2)}, 66 ${round(60 - amplitude, 2)}, 88 60`, colors.accent, 8, ' opacity="0.85"')
  );
}

/** One shape refracted into a second: one input, several useful outputs. */
function mark_prism(rand, colors) {
  // Sized so that even tilted, with one square shifted off-centre, both stay
  // inside the 96 field.
  const size = rand.range(48, 54);
  const offset = rand.range(9, 12);
  const tilt = rand.range(-14, 14);
  const inset = (MARK_SIZE - size) / 2;
  const square = (shift, color, opacity, rotation) =>
    `<rect x="${round(inset + shift, 2)}" y="${round(inset, 2)}" width="${round(size, 2)}" height="${round(size, 2)}" rx="${round(
      size * 0.24,
      2,
    )}" fill="${color}" opacity="${opacity}" transform="rotate(${round(rotation, 2)} ${CENTER} ${CENTER})"/>`;
  return square(-offset / 2, colors.accent, 0.45, -tilt) + square(offset / 2 + 2, colors.primary, 0.92, tilt);
}

/** An arch locked by its wedge: permanence, and the piece that carries the load. */
function mark_keystone(rand, colors) {
  const spring = round(CENTER + rand.range(-3, 3), 2);
  return (
    `<path d="M12 84 V${spring} A36 36 0 0 1 84 ${spring} V84 H71 V${spring} A23 23 0 0 0 25 ${spring} V84 Z" fill="${colors.primary}"/>` +
    `<path d="M39 ${round(spring - 36, 2)} H57 L61 ${round(spring - 23, 2)} H35 Z" fill="${colors.accent}"/>`
  );
}

/** Blades opening on one point of focus: attention deliberately narrowed. */
function mark_aperture(rand, colors) {
  const blades = 6;
  const radius = 40;
  let out = '';
  for (let index = 0; index < blades; index += 1) {
    const from = (360 / blades) * index - 90;
    const to = from + 360 / blades;
    const [x1, y1] = polar(from, radius);
    const [x2, y2] = polar(to, radius);
    const [x3, y3] = polar(to + rand.range(20, 40), 15);
    out += `<path d="M${x1} ${y1} A${radius} ${radius} 0 0 1 ${x2} ${y2} L${x3} ${y3} Z" fill="${
      index % 2 ? colors.accent : colors.primary
    }" opacity="${index % 2 ? 0.55 : 0.95}"/>`;
  }
  return out + disc([CENTER, CENTER], 6, colors.paper);
}

/** Layered bands with one clean cut: depth you can see into. */
function mark_strata(rand, colors) {
  const height = 17;
  const gap = 4;
  const start = (MARK_SIZE - (3 * height + 2 * gap)) / 2;
  const bottom = start + 3 * height + 2 * gap;
  let out = '';
  for (let index = 0; index < 3; index += 1) {
    out += bar(10, start + index * (height + gap), 76, height, index === 1 ? colors.accent : colors.primary, index === 2 ? ' opacity="0.5"' : '');
  }
  return (
    out +
    `<path d="M62 ${round(start - 7, 2)} L74 ${round(start - 7, 2)} L34 ${round(bottom + 7, 2)} L22 ${round(bottom + 7, 2)} Z" fill="${colors.paper}"/>`
  );
}

/** A four-point flare with a satellite: momentum, and reach past the launch. */
function mark_spark(rand, colors) {
  const arm = rand.range(32, 38);
  const waist = round(arm * 0.17, 2);
  const near = round(CENTER - arm, 2);
  const far = round(CENTER + arm, 2);
  const star =
    `<path d="M${CENTER} ${near} Q ${round(CENTER + waist, 2)} ${round(CENTER - waist, 2)} ${far} ${CENTER} ` +
    `Q ${round(CENTER + waist, 2)} ${round(CENTER + waist, 2)} ${CENTER} ${far} ` +
    `Q ${round(CENTER - waist, 2)} ${round(CENTER + waist, 2)} ${near} ${CENTER} ` +
    `Q ${round(CENTER - waist, 2)} ${round(CENTER - waist, 2)} ${CENTER} ${near} Z" fill="${colors.primary}"/>`;
  return (
    `<g transform="rotate(${round(rand.range(-22, 22), 2)} ${CENTER} ${CENTER})">${star}</g>` +
    disc(polar(rand.range(0, 360), 40), 6.5, colors.accent)
  );
}

/** Two grids woven through each other: structure that flexes instead of breaking. */
function mark_lattice(rand, colors) {
  const tilt = rand.range(18, 34);
  const size = 58;
  const x = (MARK_SIZE - size) / 2;
  const square = (rotation, color, width, opacity) =>
    `<rect x="${round(x, 2)}" y="${round(x, 2)}" width="${size}" height="${size}" rx="10" fill="none" stroke="${color}" stroke-width="${round(
      width,
      2,
    )}" opacity="${opacity}" transform="rotate(${round(rotation, 2)} ${CENTER} ${CENTER})"/>`;
  return (
    square(-tilt, colors.primary, MIN_STROKE + 1, 1) +
    square(tilt, colors.accent, MIN_STROKE, 0.85) +
    disc([CENTER, CENTER], 7, colors.primary)
  );
}

/** A divider drawing its own arc: precision, measurement, deliberate progress. */
function mark_compass(rand, colors) {
  const spread = rand.range(24, 32);
  const radius = 50;
  const feet = [1, -1].map((sign) => [
    round(CENTER - sign * radius * Math.sin((spread * Math.PI) / 180), 2),
    round(18 + radius * Math.cos((spread * Math.PI) / 180), 2),
  ]);
  return (
    stroke(`M${CENTER} 18 L${feet[0][0]} ${feet[0][1]}`, colors.primary, MIN_STROKE + 1) +
    stroke(`M${CENTER} 18 L${feet[1][0]} ${feet[1][1]}`, colors.primary, MIN_STROKE + 1) +
    stroke(`M${feet[0][0]} ${feet[0][1]} Q ${CENTER} 92 ${feet[1][0]} ${feet[1][1]}`, colors.accent, MIN_STROKE - 1, ' opacity="0.85"') +
    disc([CENTER, 18], 8, colors.accent)
  );
}

/** A tapered tower broadcasting: a signal sent out on purpose. */
function mark_beacon(rand, colors) {
  const top = round(36 + rand.range(-2, 3), 2);
  const halfTop = 8;
  const halfBase = 19;
  const tower = `<path d="M${CENTER - halfTop} ${top} L${CENTER + halfTop} ${top} L${CENTER + halfBase} 84 L${CENTER - halfBase} 84 Z" fill="${colors.primary}"/>`;
  // Radii are capped so the outermost arc still clears the top of the field:
  // the arc passes through its topmost point at (center, top - radius).
  let waves = '';
  for (let index = 0; index < 3; index += 1) {
    const radius = 13 + index * 9;
    waves += stroke(
      arcPath(-146, 112, radius, [CENTER, top]),
      index === 1 ? colors.accent : colors.primary,
      round(MIN_STROKE - index * 0.5, 2),
      ` opacity="${round(1 - index * 0.3, 2)}"`,
    );
  }
  return waves + tower + disc([CENTER, top], 6, colors.accent);
}

/** A spine with ribs: one load-bearing structure everything else attaches to. */
function mark_spine(rand, colors) {
  const ribs = 4;
  const gap = 13;
  const start = round(CENTER - ((ribs - 1) * gap) / 2, 2);
  let out = bar(CENTER - 6, 12, 12, 72, colors.primary);
  for (let index = 0; index < ribs; index += 1) {
    const y = round(start + index * gap - 5, 2);
    const width = index % 2 === 0 ? 34 : 26;
    out += bar(round(CENTER - 6 - width, 2), y, width, 10, index === 1 ? colors.accent : colors.primary, index % 2 ? ' opacity="0.5"' : '');
    out += bar(round(CENTER + 6, 2), y, width, 10, index === 2 ? colors.accent : colors.primary, index % 2 ? ' opacity="0.5"' : '');
  }
  return out;
}

/** Three stacked swells: something that arrives in cycles and always returns. */
function mark_tide(rand, colors) {
  const amplitude = rand.range(7, 10);
  let out = '';
  for (let index = 0; index < 3; index += 1) {
    const y = 30 + index * 18;
    const lift = index === 1 ? -amplitude : amplitude;
    out += stroke(
      `M8 ${y} C 30 ${round(y + lift, 2)}, 66 ${round(y - lift, 2)}, 88 ${y}`,
      index === 1 ? colors.accent : colors.primary,
      round(9 - index * 1.5, 2),
      index === 2 ? ' opacity="0.55"' : '',
    );
  }
  return out;
}

/** An instrument dial with one needle: a reading someone is accountable for. */
function mark_dial(rand, colors) {
  const radius = 36;
  const angle = round(rand.range(-58, -22), 2);
  const [nx, ny] = polar(angle, radius - 12);
  let ticks = '';
  for (let index = 0; index < 5; index += 1) {
    const tick = 180 + (index / 4) * 180;
    const [x1, y1] = polar(tick, radius - 7);
    const [x2, y2] = polar(tick, radius + 1);
    ticks += stroke(`M${x1} ${y1} L${x2} ${y2}`, colors.primary, MIN_STROKE - 1.5, ' opacity="0.55"');
  }
  return (
    `<circle cx="${CENTER}" cy="${CENTER}" r="${radius}" fill="none" stroke="${colors.primary}" stroke-width="${MIN_STROKE + 1}"/>` +
    ticks +
    stroke(`M${CENTER} ${CENTER} L${nx} ${ny}`, colors.accent, MIN_STROKE + 1) +
    disc([CENTER, CENTER], 8, colors.primary)
  );
}

/** A trunk that branches into points: one root, many directions out. */
function mark_bough(rand, colors) {
  const spread = rand.range(30, 40);
  const [lx, ly] = polar(180 + spread, 30, [CENTER, 56]);
  const [rx, ry] = polar(-spread, 30, [CENTER, 56]);
  return (
    stroke(`M${CENTER} 84 L${CENTER} 40`, colors.primary, MIN_STROKE + 1.5) +
    stroke(`M${CENTER} 56 L${lx} ${ly}`, colors.primary, MIN_STROKE) +
    stroke(`M${CENTER} 56 L${rx} ${ry}`, colors.primary, MIN_STROKE) +
    disc([lx, ly], 8, colors.accent) +
    disc([rx, ry], 8, colors.accent) +
    disc([CENTER, 34], 9, colors.primary)
  );
}

/** A folded parcel: a thing that exists, ships and arrives. */
function mark_parcel(rand, colors) {
  const fold = round(rand.range(26, 32), 2);
  return (
    `<path d="M14 ${fold} L${CENTER} 18 L82 ${fold} L82 78 L14 78 Z" fill="none" stroke="${colors.primary}" stroke-width="${MIN_STROKE + 1}" stroke-linejoin="round"/>` +
    stroke(`M14 ${fold} L${CENTER} ${round(fold + 14, 2)} L82 ${fold}`, colors.primary, MIN_STROKE - 1) +
    stroke(`M${CENTER} ${round(fold + 14, 2)} L${CENTER} 78`, colors.accent, MIN_STROKE - 1)
  );
}

/** A sun over two rules: a new day, and a place people are heading to. */
function mark_horizon(rand, colors) {
  const radius = round(rand.range(22, 26), 2);
  const base = round(CENTER + rand.range(0, 4), 2);
  return (
    `<path d="M${round(CENTER - radius, 2)} ${base} A${radius} ${radius} 0 0 1 ${round(CENTER + radius, 2)} ${base} Z" fill="${colors.primary}"/>` +
    disc([CENTER, round(base - radius * 0.35, 2)], 7, colors.accent) +
    bar(10, round(base + 10, 2), 76, 9, colors.accent, ' opacity="0.85"') +
    bar(22, round(base + 25, 2), 52, 8, colors.primary, ' opacity="0.45"')
  );
}

/** Steps falling forward: a path anyone can walk after you. */
function mark_cascade(rand, colors) {
  const step = rand.range(17, 20);
  const width = rand.range(40, 46);
  let out = '';
  for (let index = 0; index < 3; index += 1) {
    out += bar(
      12 + index * step,
      24 + index * step,
      width - index * 6,
      12,
      index === 1 ? colors.accent : colors.primary,
      index === 2 ? ' opacity="0.45"' : '',
    );
  }
  return out;
}

/** A shield with one clean notch: protection with a stated limit. */
function mark_shield(rand, colors) {
  const inset = round(rand.range(4, 10), 2);
  return (
    `<path d="M${CENTER} 10 L${round(80 - inset, 2)} 24 L${round(80 - inset, 2)} 54 Q${CENTER} 82 ${round(16 + inset, 2)} 54 L${round(16 + inset, 2)} 24 Z" fill="${colors.primary}"/>` +
    stroke(`M${round(CENTER - 14, 2)} 46 L${round(CENTER - 4, 2)} 57 L${round(CENTER + 15, 2)} 34`, colors.paper, 8)
  );
}

/** A kite on a taut line: ambition being flown on purpose. */
function mark_kite(rand, colors) {
  const span = round(rand.range(30, 34), 2);
  const tail = polar(round(rand.range(62, 74), 2), 30, [CENTER, 42]);
  return (
    `<path d="M${CENTER} ${round(42 - span, 2)} L${round(CENTER + span * 0.8, 2)} 42 L${CENTER} ${round(42 + span, 2)} L${round(CENTER - span * 0.8, 2)} 42 Z" fill="${colors.primary}"/>` +
    stroke(`M${CENTER} ${round(42 - span, 2)} L${CENTER} ${round(42 + span, 2)}`, colors.accent, MIN_STROKE - 1.5) +
    stroke(`M${CENTER} ${round(42 + span, 2)} L${tail[0]} ${tail[1]}`, colors.primary, MIN_STROKE - 1) +
    disc(tail, 6, colors.accent)
  );
}

/**
 * The mark library. Two axes decide which two abstract directions a company is
 * offered:
 *
 *   `industries` — the industries the mark reads correctly in. This is the
 *                  market-research axis, and it is ranked first: a fintech asked
 *                  to choose between an instrument dial and a flower is being
 *                  asked a question it should not have to answer.
 *   `fits`       — the brand archetypes the mark suits, which decides the
 *                  tie-break. A Sage company gets the marks that read as
 *                  considered, a Creator company the ones that read as made.
 *
 * Both are design judgements, and both are declared rather than inferred, so a
 * missing edge in the library fails the coverage test rather than silently
 * offering every company the same three shapes.
 */
export const MARKS = {
  slice: {
    build: mark_slice,
    name: 'Segmented disc',
    idea: 'One disc cut into unequal parts: a whole system you can still see the seams in.',
    industries: ['b2b-saas', 'ai-tool', 'marketplace', 'consumer-app', 'education', 'ecommerce'],
    fits: ['sage', 'ruler'],
    bestFor: 'App icon, favicon, and anywhere the name is already visible',
  },
  orbit: {
    build: mark_orbit,
    name: 'Orbit',
    idea: 'Arcs sweeping around a moving point — cycles that keep running whether or not anyone is watching.',
    industries: ['b2b-saas', 'ai-tool', 'nonprofit'],
    fits: ['explorer', 'sage'],
    bestFor: 'Product UI, loading states and anything that suggests uptime',
  },
  stack: {
    build: mark_stack,
    name: 'Stack',
    idea: 'Unequal bars stacked into a ladder: modules a buyer can adopt one rung at a time.',
    industries: ['b2b-saas', 'education', 'ai-tool', 'ecommerce', 'marketplace'],
    fits: ['ruler', 'sage'],
    bestFor: 'Add-ons and tiered products where the parts matter',
  },
  peak: {
    build: mark_peak,
    name: 'Peak',
    idea: 'Two layered summits — the plateau your buyer is on today, and the higher one you move them to.',
    industries: ['consumer-app', 'agency', 'local-service'],
    fits: ['hero', 'explorer'],
    bestFor: 'Merch, out-of-home and campaign work',
  },
  node: {
    build: mark_node,
    name: 'Node ring',
    idea: 'A closed loop of connected points: integrations, and the relationships that make them worth having.',
    industries: ['b2b-saas', 'ai-tool', 'marketplace', 'fintech', 'nonprofit'],
    fits: ['sage', 'caregiver'],
    bestFor: 'Integration and partnership pages',
  },
  bloom: {
    build: mark_bloom,
    name: 'Bloom',
    idea: 'Petals opening from a solid core — warm, memorable, and still legible at sixteen pixels.',
    industries: ['consumer-app', 'health', 'nonprofit', 'agency', 'ecommerce'],
    fits: ['caregiver', 'creator'],
    bestFor: 'Consumer brands, packaging and community spaces',
  },
  flow: {
    build: mark_flow,
    name: 'Flow',
    idea: 'Two currents crossing: transfer, motion and something that runs continuously in the background.',
    industries: ['fintech', 'ecommerce', 'marketplace'],
    fits: ['explorer', 'hero'],
    bestFor: 'Anything that moves money, data or goods',
  },
  prism: {
    build: mark_prism,
    name: 'Prism',
    idea: 'One shape refracted into a second — a single input becoming several useful outputs.',
    industries: ['agency', 'ai-tool', 'education'],
    fits: ['creator', 'sage'],
    bestFor: 'Studio and product identities where two ideas meet',
  },
  keystone: {
    build: mark_keystone,
    name: 'Keystone arch',
    idea: 'An arch locked by its wedge: built to last, and the piece that carries the load when everything leans on it.',
    industries: ['fintech', 'local-service', 'nonprofit'],
    fits: ['ruler', 'caregiver'],
    bestFor: 'Financial, legal and infrastructure brands',
  },
  aperture: {
    build: mark_aperture,
    name: 'Aperture',
    idea: 'Blades opening on one point of focus — attention deliberately narrowed to what matters.',
    industries: ['agency', 'consumer-app', 'education'],
    fits: ['creator', 'ruler'],
    bestFor: 'Photography, media and focus-driven products',
  },
  strata: {
    build: mark_strata,
    name: 'Strata',
    idea: 'Layered bands with one clean cut through them: depth you can see into, and a decision already made.',
    industries: ['b2b-saas', 'education', 'health', 'fintech'],
    fits: ['sage', 'explorer'],
    bestFor: 'Research, data and long-horizon products',
  },
  spark: {
    build: mark_spark,
    name: 'Spark',
    idea: 'A four-point flare with a satellite: momentum, and reach past the day you launch.',
    industries: ['consumer-app', 'agency', 'marketplace'],
    fits: ['hero', 'creator'],
    bestFor: 'Launch moments, events and social avatars',
  },
  lattice: {
    build: mark_lattice,
    name: 'Lattice',
    idea: 'Two grids woven through each other — structure with give in it, that flexes instead of breaking.',
    industries: ['marketplace', 'b2b-saas', 'ai-tool', 'agency', 'fintech'],
    fits: ['ruler', 'creator'],
    bestFor: 'Platforms, marketplaces and design systems',
  },
  compass: {
    build: mark_compass,
    name: 'Divider',
    idea: 'A drafting divider drawing its own arc: measurement, precision and progress you can point at.',
    industries: ['agency', 'fintech', 'local-service'],
    fits: ['sage', 'hero'],
    bestFor: 'Consulting, engineering and anything sold on precision',
  },
  beacon: {
    build: mark_beacon,
    name: 'Beacon',
    idea: 'A tower sending out three waves: a signal broadcast on purpose, not a light left on by accident.',
    industries: ['ai-tool', 'b2b-saas', 'local-service'],
    fits: ['explorer', 'hero'],
    bestFor: 'Alerting, monitoring and anything that tells you first',
  },
  spine: {
    build: mark_spine,
    name: 'Spine',
    idea: 'One load-bearing column with ribs either side: everything else attaches to it and stays attached.',
    industries: ['b2b-saas', 'education', 'health'],
    fits: ['ruler', 'sage'],
    bestFor: 'Core systems, curricula and anything the rest depends on',
  },
  tide: {
    build: mark_tide,
    name: 'Tide',
    idea: 'Three swells arriving in sequence: something that cycles, and comes back whether or not you watch it.',
    industries: ['health', 'consumer-app', 'nonprofit', 'marketplace', 'ecommerce'],
    fits: ['caregiver', 'explorer'],
    bestFor: 'Recurring services, programmes and seasonal businesses',
  },
  dial: {
    build: mark_dial,
    name: 'Dial',
    idea: 'An instrument with one needle: a reading somebody is accountable for, not a dashboard nobody reads.',
    industries: ['fintech', 'local-service', 'health'],
    fits: ['ruler', 'sage'],
    bestFor: 'Finance, compliance and measurement-led products',
  },
  bough: {
    build: mark_bough,
    name: 'Bough',
    idea: 'A trunk that splits into two ends: one root, two directions, and a place to grow into.',
    industries: ['nonprofit', 'education', 'health', 'agency'],
    fits: ['caregiver', 'creator'],
    bestFor: 'Community, mission and human-centred work',
  },
  parcel: {
    build: mark_parcel,
    name: 'Parcel',
    idea: 'A folded parcel seen from above: a thing that exists, gets packed and actually arrives.',
    industries: ['ecommerce', 'marketplace', 'local-service'],
    fits: ['creator', 'ruler'],
    bestFor: 'Commerce, fulfilment and logistics',
  },
  horizon: {
    build: mark_horizon,
    name: 'Horizon',
    idea: 'A sun cresting two rules: a new day, and a place people are already heading toward.',
    industries: ['nonprofit', 'health', 'education', 'local-service'],
    fits: ['caregiver', 'hero'],
    bestFor: 'Programmes, clinics and mission-led brands',
  },
  cascade: {
    build: mark_cascade,
    name: 'Cascade',
    idea: 'Steps falling forward and widening: a path that is obvious to follow after you have walked it.',
    industries: ['ai-tool', 'consumer-app', 'ecommerce'],
    fits: ['explorer', 'creator'],
    bestFor: 'Onboarding, funnels and products sold as a sequence',
  },
  shield: {
    build: mark_shield,
    name: 'Shield',
    idea: 'A shield with one clean notch: protection stated as a specific promise rather than a vague feeling.',
    industries: ['fintech', 'health', 'nonprofit', 'local-service'],
    fits: ['ruler', 'caregiver'],
    bestFor: 'Security, insurance and trust-critical categories',
  },
  kite: {
    build: mark_kite,
    name: 'Kite',
    idea: 'A kite held on a taut line: ambition flown on purpose, and pulled when it needs pulling.',
    industries: ['consumer-app', 'agency', 'ecommerce'],
    fits: ['hero', 'explorer'],
    bestFor: 'Campaigns, launches and lifestyle brands',
  },
};

// A mark with a missing field would render as a nameless blank in the UI, so the
// library fails loudly at load rather than quietly at generation.
for (const [key, entry] of Object.entries(MARKS)) {
  if (
    typeof entry.build !== 'function' ||
    !entry.name ||
    !entry.idea ||
    !entry.fits.length ||
    !entry.industries.length ||
    !entry.bestFor
  ) {
    throw new Error(`logo mark ${key} is incomplete`);
  }
}

function monogramMark(monogram, colors, shape) {
  const letters = escapeXml(String(monogram).slice(0, 2));
  const fontSize = letters.length > 1 ? 38 : 48;
  const shapes = {
    square: `<rect x="6" y="6" width="84" height="84" rx="22" fill="${colors.primary}"/>`,
    circle: `<circle cx="48" cy="48" r="44" fill="${colors.primary}"/>`,
    squircle: `<path d="M48 4c24 0 44 20 44 44S72 92 48 92 4 72 4 48 24 4 48 4z" fill="${colors.primary}"/>`,
    cut: `<path d="M4 40 A44 44 0 0 1 48 4 L92 4 L92 92 L4 92 Z" fill="${colors.primary}"/>`,
  };
  // The container plus one accent detail, both large enough to hold their shape
  // in a 16px favicon — a small dot there just reads as noise.
  const accentDot = colors.accent
    ? `<circle cx="${shape === 'cut' ? 76 : 72}" cy="${shape === 'cut' ? 24 : 72}" r="10" fill="${colors.accent}"/>`
    : '';
  return `${shapes[shape] || shapes.square}${accentDot}<text x="48" y="50" font-family="${escapeXml(
    colors.fontStack || SANS_FALLBACK,
  )}" font-size="${fontSize}" font-weight="700" letter-spacing="-1" fill="${colors.onPrimary}" text-anchor="middle" dominant-baseline="central">${letters}</text>`;
}

/** Build the three logo directions a founder should actually choose between. */
/**
 * Silhouette families, used to stop a company being offered two versions of the
 * same shape. A family is how the mark reads in the first 50ms at 16px, which is
 * the only scale that matters for a favicon or an app icon: radial things are
 * seen as a disc, linear ones as stripes, masses as a wedge, figures as a shape
 * with a head or a hand on it.
 */
const MARK_FAMILIES = {
  slice: 'radial',
  orbit: 'radial',
  node: 'radial',
  bloom: 'radial',
  aperture: 'radial',
  spark: 'radial',
  lattice: 'radial',
  stack: 'linear',
  flow: 'linear',
  tide: 'linear',
  strata: 'linear',
  cascade: 'linear',
  spine: 'linear',
  parcel: 'linear',
  peak: 'mass',
  keystone: 'mass',
  prism: 'mass',
  shield: 'mass',
  kite: 'mass',
  beacon: 'figure',
  dial: 'figure',
  bough: 'figure',
  horizon: 'figure',
  compass: 'figure',
};

// A mark without a family cannot be de-duplicated when the two picks collide, so
// the gap is an error rather than a silently weaker choice.
for (const key of Object.keys(MARKS)) {
  if (!MARK_FAMILIES[key]) throw new Error(`logo mark ${key} has no silhouette family`);
}

/**
 * Rank the library for one company and take the two best symbol directions.
 *
 * The ordering is deliberate and reproducible:
 *
 *   1. industry match — a market-research judgement, ranked first, because a
 *      mark that reads wrong for the category cannot be rescued by taste.
 *   2. archetype match — the brand judgement, breaking ties inside the industry.
 *   3. the seeded shuffle — so two companies in the same industry and archetype
 *      still get different directions, while a given intake always gets the same
 *      two. Reproducible without being repetitive.
 *
 * The two picks are also forced to be different *kinds* of mark: if the top two
 * happen to be visually similar (two radial marks, say), the second is swapped
 * for the next-best from a different shape family, so a founder is never asked
 * to choose between two versions of the same idea.
 */
function pickMarkKeys(identity, rand) {
  const industry = identity.profile?.key || 'b2b-saas';
  const archetype = identity.archetype?.key || 'sage';
  // Rank as a tuple: does it fit the industry (binary, not a position — the
  // order of a mark's own industry list says nothing about fit), then how
  // strongly it fits the archetype, where list position does mean fit strength:
  // a mark lists its primary archetype first and its secondary one second.
  const ranked = rand.shuffle(Object.keys(MARKS)).map((key) => ({
    key,
    industry: MARKS[key].industries.includes(industry) ? 0 : 99,
    archetype: MARKS[key].fits.indexOf(archetype) === -1 ? 99 : MARKS[key].fits.indexOf(archetype),
  }));
  const better = (a, b) => a.industry - b.industry || a.archetype - b.archetype;
  ranked.sort(better);

  // Draw the leading direction at random from the whole best-scoring tier rather
  // than taking the first row. Taking the first row looks fair but is not: every
  // tie is resolved by array order, which is one seeded stream, so companies in
  // the same industry and archetype end up clustered on the same two or three
  // marks. Drawing from the tier uses the whole eligible set.
  const top = ranked[0];
  const tier = ranked.filter((entry) => better(entry, top) === 0 && better(top, entry) === 0);
  const first = rand.pick(tier.length ? tier : ranked);

  // A second direction from a different family: radial marks share a silhouette
  // at 16px, so offering two of them is offering one choice, not two. Prefer a
  // different-family mark of the same quality, and only widen if there is none.
  const different = (entry) => entry.key !== first.key && MARK_FAMILIES[entry.key] !== MARK_FAMILIES[first.key];
  const sameTier = ranked.filter((entry) => better(entry, first) === 0 && better(first, entry) === 0).filter(different);
  const pool = sameTier.length ? sameTier : ranked.filter(different);
  const second = rand.pick(pool.length ? pool : ranked.filter((entry) => entry.key !== first.key));

  return [first.key, second?.key].filter(Boolean).slice(0, 2);
}

/**
 * Why this mark was offered, in the words a founder can act on. Shown in the UI
 * so the three directions are a decision with reasons rather than a slot pull.
 */
function markReason(key, identity) {
  const meta = MARKS[key];
  const industry = identity.profile?.label || 'your industry';
  const archetype = identity.archetype?.name || 'your brand';
  const readsFor = meta.industries.includes(identity.profile?.key) ? `it reads correctly in ${industry}` : 'it holds up in adjacent categories';
  const readsAs = meta.fits.includes(identity.archetype?.key) ? `and matches the ${archetype} voice this name produces` : `and sits comfortably beside the ${archetype} voice this name produces`;
  return `Offered because ${readsFor} ${readsAs}.`;
}

export function buildLogoConcepts(name, identity, palette, typography, rand) {
  const keys = pickMarkKeys(identity, rand);
  const wordmarkText = escapeXml(identity.name);
  const fontStack = escapeXml(typography.stacks.heading.replace(/"/g, "'"));
  const markColors = {
    primary: palette.primary,
    accent: palette.accent,
    paper: palette.paper,
    onPrimary: palette.onPrimary,
    fontStack,
  };

  const concepts = [];

  keys.forEach((key) => {
    const meta = MARKS[key];
    concepts.push({
      id: `mark-${key}`,
      kind: 'symbol',
      name: meta.name,
      idea: meta.idea,
      reason: markReason(key, identity),
      bestFor: meta.bestFor,
      variants: buildVariants({ icon: meta.build(rand, markColors), wordmarkText, fontStack, palette }),
    });
  });

  const monogramShape = rand.pick(['square', 'circle', 'squircle', 'cut']);
  const monogramIcon = monogramMark(identity.monogram, markColors, monogramShape);
  concepts.push({
    id: 'monogram',
    kind: 'monogram',
    name: `Monogram (${monogramShape})`,
    idea: `The initials “${escapeXml(identity.monogram)}” inside a ${monogramShape} container. Cheapest to execute well and impossible to get wrong at 16px.`,
    reason: 'Always worth having: it survives every size, single-color print and favicon slot, which is where a symbol mark usually needs a second asset.',
    bestFor: 'Avatars, app icons, stamps, watermarks and email footers',
    variants: buildVariants({ icon: monogramIcon, wordmarkText, fontStack, palette }),
  });

  return concepts;
}

function buildVariants({ icon, wordmarkText, fontStack, palette }) {
  const iconOnly = (size, bg) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_SIZE} ${MARK_SIZE}" width="${size}" height="${size}" role="img">${
      bg ? `<rect width="${MARK_SIZE}" height="${MARK_SIZE}" fill="${bg}"/>` : ''
    }${icon}</svg>`;

  const horizontal = (width, color, bg) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96" width="${width}" height="${round((width / 320) * 96)}" role="img">${
      bg ? `<rect width="320" height="96" fill="${bg}"/>` : ''
    }<g transform="translate(0,0)">${icon}</g><text x="116" y="49" font-family="${fontStack}" font-size="34" font-weight="700" letter-spacing="-1.1" fill="${color}" dominant-baseline="central">${wordmarkText}</text></svg>`;

  const stacked = (width, color, bg) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 176" width="${width}" height="${round((width / 240) * 176)}" role="img">${
      bg ? `<rect width="240" height="176" fill="${bg}"/>` : ''
    }<g transform="translate(72,8)">${icon}</g><text x="120" y="146" font-family="${fontStack}" font-size="30" font-weight="700" letter-spacing="-0.9" fill="${color}" text-anchor="middle" dominant-baseline="central">${wordmarkText}</text></svg>`;

  return {
    // Every file here is distinct — no near-duplicates to confuse a designer.
    icon: iconOnly(MARK_SIZE),
    horizontal: horizontal(320, palette.ink),
    horizontalReverse: horizontal(320, palette.paper, palette.ink),
    stacked: stacked(240, palette.ink),
    stackedReverse: stacked(240, palette.paper, palette.ink),
    appIcon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img"><rect width="512" height="512" rx="112" fill="${palette.primary}"/><g transform="translate(64,64) scale(4)">${icon}</g></svg>`,
    favicon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96" role="img"><rect width="96" height="96" rx="20" fill="${palette.primary}"/><g transform="scale(0.78) translate(13.5,13.5)">${icon}</g></svg>`,
    mono: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96" role="img"><g fill="currentColor" color="currentColor">${icon.replace(
      /(fill|stroke)="#[0-9a-fA-F]{3,8}"/g,
      '$1="currentColor"',
    )}</g></svg>`,
  };
}

// ---------------------------------------------------------------------------
// Asset set
// ---------------------------------------------------------------------------

export function buildOgImage(identity, palette, typography, logoIcon, domain) {
  const tagline = escapeXml(identity.primaryTagline);
  const name = escapeXml(identity.name);
  const host = escapeXml(domain || `${identity.slug}.com`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" role="img" aria-label="${name} social card">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.paper}"/>
      <stop offset="100%" stop-color="${palette.surfaceAlt}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1050" cy="90" r="220" fill="${alpha(palette.accent, 0.16)}"/>
  <circle cx="120" cy="600" r="260" fill="${alpha(palette.primary, 0.12)}"/>
  <g transform="translate(84,84) scale(0.9)">${logoIcon}</g>
  <text x="84" y="360" font-family="${escapeXml(typography.stacks.heading.replace(/"/g, "'"))}" font-size="86" font-weight="700" letter-spacing="-2.5" fill="${palette.ink}">${name}</text>
  <text x="84" y="428" font-family="${escapeXml(typography.stacks.body.replace(/"/g, "'"))}" font-size="34" fill="${palette.inkMuted}">${tagline}</text>
  <rect x="84" y="492" width="72" height="6" rx="3" fill="${palette.accent}"/>
  <text x="84" y="552" font-family="${escapeXml(typography.stacks.body.replace(/"/g, "'"))}" font-size="26" fill="${palette.inkSubtle}">${host}</text>
</svg>`;
}

export function buildSocialAvatar(icon, palette, size = 400) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img"><rect width="${size}" height="${size}" fill="${palette.primary}"/><g transform="translate(${round(
    size * 0.16,
    1,
  )},${round(size * 0.16, 1)}) scale(${round((size * 0.68) / MARK_SIZE, 4)})">${icon}</g></svg>`;
}

export function buildSocialBanner(identity, palette, typography, width, height) {
  const name = escapeXml(identity.name);
  const tagline = escapeXml(identity.primaryTagline);
  const fontSize = Math.max(28, Math.round(height * 0.24));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">
  <defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="${palette.primary}"/><stop offset="100%" stop-color="${palette.secondary}"/>
  </linearGradient></defs>
  <rect width="${width}" height="${height}" fill="url(#b)"/>
  <circle cx="${round(width * 0.88, 0)}" cy="${round(height * 0.2, 0)}" r="${round(height * 0.6, 0)}" fill="${alpha(palette.accent, 0.35)}"/>
  <text x="${round(width * 0.06, 0)}" y="${round(height * 0.52, 0)}" font-family="${escapeXml(
    typography.stacks.heading.replace(/"/g, "'"),
  )}" font-size="${fontSize}" font-weight="700" letter-spacing="-0.02em" fill="${palette.onPrimary}">${name}</text>
  <text x="${round(width * 0.06, 0)}" y="${round(height * 0.74, 0)}" font-family="${escapeXml(
    typography.stacks.body.replace(/"/g, "'"),
  )}" font-size="${Math.max(14, Math.round(fontSize * 0.42))}" fill="${alpha(palette.onPrimary, 0.82)}">${tagline}</text>
</svg>`;
}

export function buildBusinessCard(identity, palette, typography, contact) {
  const esc = escapeXml;
  const contactLine = [contact.email, contact.phone, contact.site].filter(Boolean).map(esc).join('  ·  ');
  const font = esc(typography.stacks.body.replace(/"/g, "'"));
  const headingFont = esc(typography.stacks.heading.replace(/"/g, "'"));
  return {
    front: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 350 200" width="1050" height="600" role="img">
  <rect width="350" height="200" fill="${palette.paper}"/>
  <rect x="0" y="0" width="8" height="200" fill="${palette.primary}"/>
  <text x="32" y="86" font-family="${headingFont}" font-size="30" font-weight="700" letter-spacing="-1" fill="${palette.ink}">${esc(
      identity.name,
    )}</text>
  <text x="32" y="116" font-family="${font}" font-size="12" fill="${palette.inkMuted}">${esc(identity.primaryTagline)}</text>
  <rect x="32" y="140" width="48" height="3" rx="1.5" fill="${palette.accent}"/>
</svg>`,
    back: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 350 200" width="1050" height="600" role="img">
  <rect width="350" height="200" fill="${palette.ink}"/>
  <circle cx="310" cy="30" r="70" fill="${alpha(palette.primary, 0.35)}"/>
  <text x="32" y="78" font-family="${font}" font-size="14" font-weight="600" fill="${palette.paper}">${esc(contact.person || '')}</text>
  <text x="32" y="98" font-family="${font}" font-size="11" fill="${alpha(palette.paper, 0.72)}">${esc(contact.title || '')}</text>
  <text x="32" y="132" font-family="${font}" font-size="10.5" fill="${alpha(palette.paper, 0.86)}">${contactLine}</text>
</svg>`,
  };
}

export function buildEmailSignature(identity, palette, typography, contact) {
  const esc = escapeXml;
  return `<table cellpadding="0" cellspacing="0" style="font-family:${esc(
    typography.stacks.body,
  )};font-size:14px;line-height:1.5;color:${palette.ink}">
  <tr>
    <td style="padding-right:16px;border-right:2px solid ${palette.accent}">
      <div style="font-weight:700;font-size:15px">${esc(contact.person || identity.name)}</div>
      <div style="color:${palette.inkMuted}">${esc(contact.title || `${identity.name} · ${identity.primaryTagline}`)}</div>
    </td>
    <td style="padding-left:16px">
      <div style="font-weight:600">${esc(identity.name)}</div>
      <div><a href="https://${esc(contact.site || `${identity.slug}.com`)}" style="color:${palette.primaryText};text-decoration:none">${esc(
        contact.site || `${identity.slug}.com`,
      )}</a></div>
      ${contact.email ? `<div><a href="mailto:${esc(contact.email)}" style="color:${palette.primaryText};text-decoration:none">${esc(contact.email)}</a></div>` : ''}
      ${contact.phone ? `<div style="color:${palette.inkMuted}">${esc(contact.phone)}</div>` : ''}
    </td>
  </tr>
</table>`;
}

export function buildPattern(palette, rand) {
  const kind = rand.pick(['dots', 'grid', 'waves']);
  const body =
    kind === 'dots'
      ? Array.from({ length: 48 }, (_, i) => {
          const x = (i % 8) * 24 + 12;
          const y = Math.floor(i / 8) * 24 + 12;
          return `<circle cx="${x}" cy="${y}" r="${(i % 3) + 1.4}" fill="${palette.primary}" opacity="0.18"/>`;
        }).join('')
      : kind === 'grid'
        ? Array.from({ length: 100 }, (_, i) => {
            const x = (i % 10) * 20;
            const y = Math.floor(i / 10) * 20;
            return `<path d="M${x} ${y}h20v20" fill="none" stroke="${palette.primary}" stroke-width="0.6" opacity="0.14"/>`;
          }).join('')
        : `<path d="M0 60 Q 48 20 96 60 T 192 60" fill="none" stroke="${palette.primary}" stroke-width="2" opacity="0.2"/>
           <path d="M0 20 Q 48 -20 96 20 T 192 20" fill="none" stroke="${palette.accent}" stroke-width="2" opacity="0.18"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 120" width="192" height="120" role="img" aria-hidden="true">${body}</svg>`;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function buildBrand(intake, identity) {
  const rand = seedFor(intake.name, 'brand');
  const profile = identity.profile || {};
  const archetype = identity.archetype;
  const palette = buildPalette(intake.name, archetype, rand);
  const typography = buildTypography(rand, archetype, profile);
  const concepts = buildLogoConcepts(intake.name, identity, palette, typography, rand);

  const contact = {
    person: intake.founder || '',
    title: intake.founderTitle || 'Founder',
    email: intake.founderEmail || '',
    phone: intake.phone || '',
    site: `${identity.analysis.compact}.com`,
  };

  const chosen = concepts[0];

  return {
    palette,
    typography,
    concepts,
    chosen,
    logo: {
      // Flattened, ready-to-save files for the recommended direction.
      'logo-icon.svg': chosen.variants.icon,
      'logo-horizontal.svg': chosen.variants.horizontal,
      'logo-horizontal-reverse.svg': chosen.variants.horizontalReverse,
      'logo-stacked.svg': chosen.variants.stacked,
      'logo-stacked-reverse.svg': chosen.variants.stackedReverse,
      'logo-monochrome.svg': chosen.variants.mono,
      'favicon.svg': chosen.variants.favicon,
      'app-icon.svg': chosen.variants.appIcon,
      'pattern.svg': buildPattern(palette, rand),
    },
    card: buildBusinessCard(identity, palette, typography, contact),
    emailSignature: buildEmailSignature(identity, palette, typography, contact),
    og: buildOgImage(identity, palette, typography, chosen.variants.icon, contact.site),
    // Rules that keep the brand looking deliberate as more people use it.
    rules: [
      `Clear space around the mark equals the height of the icon divided by two — never crowd it with text or edges.`,
      `Minimum icon size: 24px on screen, 8mm in print. Below that, use the favicon cut.`,
      `Only use the supplied lockups. Do not re-type the wordmark, stretch it, or add effects.`,
      `Primary color on paper for buttons; never place body copy directly on the accent color.`,
      `Photography is warm and natural — no stock handshakes, no floating laptops.`,
      `Never rotate the mark, add outlines, or place it on a busy photo without a veil.`,
    ],
    misuse: [
      'Do not recolor the mark outside the palette.',
      'Do not place the mark on a low-contrast background (check contrast grades below).',
      'Do not outline, bevel, glow or drop-shadow the logo.',
      'Do not use the wordmark as a headline — it is a signature, not a typeface.',
    ],
    contact,
  };
}

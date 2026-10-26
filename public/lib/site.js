// Website generator: turns the identity, brand and marketing layers into a
// complete deployable static site — pages, design tokens, forms, SEO files,
// security headers and deploy instructions.
import { escapeHtml as h, escapeJson, seedFor } from './rng.js';

export function generateSite(intake, ctx) {
  const { identity, brand, marketing } = ctx;
  const profile = identity.profile;
  const rand = seedFor(intake.name, 'site');
  const year = new Date().getFullYear();

  const site = {
    name: identity.name,
    tagline: identity.primaryTagline,
    description: identity.boilerplates.medium,
    url: `https://${identity.analysis.compact}.com`,
    email: intake.founderEmail || `hello@${identity.analysis.compact}.com`,
    phone: intake.phone || '',
    location: intake.city || 'Remote-first',
    projectId: intake.projectId || '',
    apiBase: intake.apiBase || '',
    nav: [
      { href: '/', label: 'Product' },
      { href: '/pricing.html', label: 'Pricing' },
      { href: '/about.html', label: 'About' },
      { href: '/blog/', label: 'Blog' },
      { href: '/contact.html', label: 'Contact' },
    ],
  };

  const shared = { identity, brand, marketing, profile, site, year, intake };
  const files = {};

  files['index.html'] = renderHome(shared);
  files['pricing.html'] = renderPricing(shared);
  files['about.html'] = renderAbout(shared);
  files['contact.html'] = renderContact(shared);
  files['thanks.html'] = renderThanks(shared);
  files['blog/index.html'] = renderBlogIndex(shared);
  const posts = blogPosts(shared, rand);
  posts.forEach((post) => {
    files[`blog/${post.slug}.html`] = renderPost(shared, post);
  });
  files['privacy.html'] = renderLegal(shared, 'privacy');
  files['terms.html'] = renderLegal(shared, 'terms');
  files['404.html'] = render404(shared);

  files['css/brand.css'] = `${brand.palette.css}\n\n${typographyCss(brand)}`;
  files['css/styles.css'] = stylesCss(brand);
  files['js/main.js'] = mainJs(shared);
  files['favicon.svg'] = brand.logo['favicon.svg'];
  files['og.svg'] = brand.og;
  files['site.webmanifest'] = manifest(shared);
  files['robots.txt'] = robots(shared);
  files['sitemap.xml'] = sitemap(shared, posts);
  files['_headers'] = headers();
  files['netlify.toml'] = netlify();
  files['README.md'] = siteReadme(shared, posts);
  files['DEPLOY.md'] = deployGuide(shared);

  return {
    files,
    site,
    routes: Object.keys(files).filter((name) => name.endsWith('.html')),
    posts: posts.map((post) => ({ slug: post.slug, title: post.title, description: post.description })),
    notes: [
      'Every page is plain HTML and CSS with no build step — upload the folder and it works.',
      'Forms post to the Blueprint API when a project id is configured; otherwise they fall back to email.',
      'Testimonials and press mentions are bracketed placeholders on purpose. Publishing invented social proof is a legal and reputational risk.',
      'The privacy and terms pages are a starting structure, not legal advice. Have a lawyer review them before you take payments or personal data.',
    ],
  };
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function page(ctx, options) {
  const { brand, site, identity, year } = ctx;
  const title = options.title === identity.name ? identity.name : `${options.title} · ${identity.name}`;
  const description = options.description || site.description;
  const canonical = `${site.url}${options.path || '/'}`;
  const jsonLd = options.jsonLd ? `<script type="application/ld+json">${escapeJson(options.jsonLd)}</script>` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(title)}</title>
<meta name="description" content="${h(description)}">
<link rel="canonical" href="${h(canonical)}">
<meta name="theme-color" content="${brand.palette.primary}">
<meta property="og:type" content="website">
<meta property="og:title" content="${h(title)}">
<meta property="og:description" content="${h(description)}">
<meta property="og:url" content="${h(canonical)}">
<meta property="og:image" content="${h(site.url)}/og.svg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${h(title)}">
<meta name="twitter:description" content="${h(description)}">
<meta name="twitter:image" content="${h(site.url)}/og.svg">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/favicon.svg">
<link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${h(brand.typography.googleHref)}">
<link rel="stylesheet" href="/css/brand.css">
<link rel="stylesheet" href="/css/styles.css">
${jsonLd}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header" data-header>
  <div class="wrap header-inner">
    <a class="brand" href="/" aria-label="${h(identity.name)} home">
      ${inlineLogo(brand, identity)}
    </a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" data-nav-toggle>
      <span class="sr">Menu</span>
      <svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
    </button>
    <nav class="site-nav" id="site-nav" data-nav>
      ${site.nav
        .map(
          (item) =>
            `<a href="${h(item.href)}"${options.active === item.href ? ' aria-current="page"' : ''}>${h(item.label)}</a>`,
        )
        .join('\n      ')}
      <a class="btn btn-primary nav-cta" href="${h(options.ctaHref || '/#start')}">${h(options.ctaLabel || 'Start free')}</a>
    </nav>
  </div>
</header>
<main id="main">
${options.content}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <div class="footer-brand">${inlineLogo(brand, identity)}</div>
      <p class="muted">${h(identity.oneLiner)}</p>
      <p class="muted small">${h(site.location)}</p>
    </div>
    <div>
      <h3 class="footer-head">Product</h3>
      <ul class="footer-list">
        <li><a href="/pricing.html">Pricing</a></li>
        <li><a href="/#how">How it works</a></li>
        <li><a href="/#faq">FAQ</a></li>
        <li><a href="/contact.html">Contact</a></li>
      </ul>
    </div>
    <div>
      <h3 class="footer-head">Company</h3>
      <ul class="footer-list">
        <li><a href="/about.html">About</a></li>
        <li><a href="/blog/">Blog</a></li>
        <li><a href="${h(site.email ? `mailto:${site.email}` : '/contact.html')}">${h(site.email || 'Email us')}</a></li>
      </ul>
    </div>
    <div class="footer-news">
      <h3 class="footer-head">One useful email a month</h3>
      ${newsletterForm(sharedForForms(ctx), 'footer')}
    </div>
  </div>
  <div class="wrap footer-base">
    <p class="muted small">© ${year} ${h(identity.legalName)}. All rights reserved.</p>
    <p class="muted small">
      <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a>
    </p>
  </div>
</footer>
<script>window.BLUEPRINT_SITE = ${escapeJson({ projectId: site.projectId, apiBase: site.apiBase })};</script>
<script src="/js/main.js" defer></script>
</body>
</html>`;
}

function sharedForForms(ctx) {
  return ctx;
}

function inlineLogo(brand, identity) {
  // Inline SVG keeps the header crisp without an extra request.
  const svg = brand.chosen.variants.horizontal;
  return svg.replace('<svg ', '<svg class="logo" ');
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function renderHome(ctx) {
  const { identity, brand, profile, site, marketing } = ctx;
  const [entry, core, scale] = marketing.pricing.tiers;
  const features = featureList(identity, profile);
  const steps = howItWorks(identity, profile);

  const content = `
<section class="hero">
  <div class="wrap hero-inner">
    <div class="hero-copy">
      <span class="pill">${h(profile.label)} · ${h(identity.archetype.name)} brand</span>
      <h1>${h(identity.primaryTagline)}</h1>
      <p class="lede">${h(identity.elevatorPitch)}</p>
      <div class="cta-row" id="start">
        <a class="btn btn-primary" href="/contact.html">${h(core.cta)}</a>
        <a class="btn btn-ghost" href="#how">See how it works</a>
      </div>
      <p class="muted small">No credit card. ${h(identity.promise)}</p>
    </div>
    <div class="hero-art" aria-hidden="true">
      <div class="art-card">
        ${brand.chosen.variants.stacked.replace('<svg ', '<svg class="art-logo" ')}
      </div>
    </div>
  </div>
  <div class="wrap proof-strip">
    ${profile.proof.map((item) => `<span class="proof">${h(item)}</span>`).join('\n    ')}
  </div>
</section>

<section class="section problem">
  <div class="wrap narrow">
    <h2>The problem is not new. Paying for it is.</h2>
    <p class="lede">${h(profile.problem)}. Most teams cope with ${h(profile.alt)} and quietly absorb the cost — in hours, in errors, and in decisions that arrive a week too late.</p>
    <div class="split">
      <div class="card">
        <h3>What it costs you today</h3>
        <ul class="ticks">
          <li>Time lost to work that should be automatic</li>
          <li>No single source of truth, so nobody trusts the number</li>
          <li>Every new person needs tribal knowledge to get started</li>
        </ul>
      </div>
      <div class="card accent-card">
        <h3>What changes with ${h(identity.name)}</h3>
        <ul class="ticks">
          <li>${h(profile.outcome)}</li>
          <li>One place to look, with an audit trail</li>
          <li>Onboarding measured in minutes</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section class="section" id="features">
  <div class="wrap">
    <h2>What you get with ${h(site.name)}</h2>
    <p class="lede narrow">Six things that matter, and nothing that does not.</p>
    <div class="grid grid-3">
      ${features
        .map(
          (feature) => `<article class="card feature">
        <div class="feature-icon" aria-hidden="true">${feature.icon}</div>
        <h3>${h(feature.title)}</h3>
        <p>${h(feature.body)}</p>
      </article>`,
        )
        .join('\n      ')}
    </div>
  </div>
</section>

<section class="section alt" id="how">
  <div class="wrap">
    <h2>How it works</h2>
    <ol class="steps">
      ${steps
        .map(
          (step, index) => `<li class="step">
        <span class="step-num">${index + 1}</span>
        <h3>${h(step.title)}</h3>
        <p>${h(step.body)}</p>
      </li>`,
        )
        .join('\n      ')}
    </ol>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <h2>What people say</h2>
    <p class="muted">Placeholders below — swap in real quotes before you publish. Invented testimonials are a legal and reputational risk.</p>
    <div class="grid grid-3">
      ${[1, 2, 3]
        .map(
          () => `<figure class="card quote">
        <blockquote>[Replace with a one-sentence outcome quote from a real customer]</blockquote>
        <figcaption>[Name, role, company]</figcaption>
      </figure>`,
        )
        .join('\n      ')}
    </div>
  </div>
</section>

<section class="section alt" id="pricing-preview">
  <div class="wrap">
    <h2>Pricing</h2>
    <p class="lede narrow">${h(marketing.pricing.model.charAt(0).toUpperCase() + marketing.pricing.model.slice(1))}. Publish it — buyers who cannot find a price assume it is expensive.</p>
    <div class="grid grid-3 pricing-grid">
      ${[entry, core, scale].map((tier) => tierCard(tier)).join('\n      ')}
    </div>
    <p class="center"><a class="btn btn-ghost" href="/pricing.html">Compare all plans</a></p>
  </div>
</section>

<section class="section" id="faq">
  <div class="wrap narrow">
    <h2>Questions we get asked</h2>
    <div class="faq">
      ${faqItems(identity, profile, marketing)
        .map(
          (item) => `<details>
        <summary>${h(item.q)}</summary>
        <p>${h(item.a)}</p>
      </details>`,
        )
        .join('\n      ')}
    </div>
  </div>
</section>

<section class="section cta-final">
  <div class="wrap narrow center">
    <h2>${h(identity.taglines[1]?.text || identity.primaryTagline)}</h2>
    <p class="lede">${h(identity.boilerplates.medium)}</p>
    <div class="cta-row center-row">
      <a class="btn btn-primary" href="/contact.html">${h(core.cta)}</a>
      <a class="btn btn-ghost" href="mailto:${h(site.email)}">Email the founder</a>
    </div>
  </div>
</section>`;

  return page(ctx, {
    title: identity.name,
    description: site.description,
    path: '/',
    active: '/',
    content,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          name: identity.legalName,
          url: site.url,
          description: identity.boilerplates.medium,
          email: site.email,
          sameAs: [`https://x.com/${identity.analysis.compact}`, `https://www.linkedin.com/company/${identity.analysis.slug}`],
        },
        { '@type': 'WebSite', name: identity.name, url: site.url },
        {
          '@type': 'FAQPage',
          mainEntity: faqItems(identity, profile, marketing).map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          })),
        },
      ],
    },
  });
}

function renderPricing(ctx) {
  const { identity, marketing, site } = ctx;
  const content = `
<section class="section">
  <div class="wrap narrow center">
    <h1>Pricing that survives contact with procurement</h1>
    <p class="lede">${h(identity.promise)}</p>
  </div>
  <div class="wrap">
    <div class="grid grid-3 pricing-grid">
      ${marketing.pricing.tiers.map((tier) => tierCard(tier)).join('\n      ')}
    </div>
    <div class="callout">
      <h3>How to read this</h3>
      <ul class="ticks">
        ${marketing.pricing.notes.map((note) => `<li>${h(note)}</li>`).join('\n        ')}
      </ul>
    </div>
    <div class="callout">
      <h3>Pricing principles we follow</h3>
      <ul class="ticks">
        ${marketing.pricing.rationale.map((note) => `<li>${h(note)}</li>`).join('\n        ')}
      </ul>
    </div>
  </div>
</section>`;
  return page(ctx, { title: 'Pricing', path: '/pricing.html', active: '/pricing.html', content });
}

function renderAbout(ctx) {
  const { identity, site, profile } = ctx;
  const content = `
<section class="section">
  <div class="wrap narrow">
    <h1>About ${h(identity.name)}</h1>
    <p class="lede">${h(identity.mission)}</p>
    <h2>Why we exist</h2>
    <p>${h(site.description)}</p>
    <p>Our vision is simple: ${h(identity.vision)}</p>
    <h2>What we believe</h2>
    <div class="grid grid-2">
      ${identity.values
        .map(
          (value) => `<article class="card">
        <h3>${h(value.name)}</h3>
        <p>${h(value.statement)}</p>
      </article>`,
        )
        .join('\n      ')}
    </div>
    <h2>How we work</h2>
    <ul class="ticks">
      ${profile.proof.map((item) => `<li>${h(item)}</li>`).join('\n      ')}
    </ul>
    <h2>Talk to a human</h2>
    <p>Everything goes to a real inbox. Write to <a href="mailto:${h(site.email)}">${h(site.email)}</a> and you will hear back within one business day.</p>
  </div>
</section>`;
  return page(ctx, { title: 'About', path: '/about.html', active: '/about.html', content });
}

function renderContact(ctx) {
  const { identity, site } = ctx;
  const content = `
<section class="section">
  <div class="wrap grid grid-2 contact-grid">
    <div>
      <h1>Talk to us</h1>
      <p class="lede">${h(identity.oneLiner)}</p>
      <ul class="ticks">
        <li><strong>Reply time:</strong> one business day, from a person.</li>
        <li><strong>Best for:</strong> pricing, security reviews, partnerships, or a walkthrough.</li>
        <li><strong>Direct:</strong> <a href="mailto:${h(site.email)}">${h(site.email)}</a></li>
      </ul>
      ${site.phone ? `<p class="muted small">Phone: ${h(site.phone)}</p>` : ''}
      <p class="muted small">We do not add you to a mailing list because you asked a question.</p>
    </div>
    <div class="card">
      <form data-blueprint-form="lead" novalidate>
        <div class="field">
          <label for="name">Your name</label>
          <input id="name" name="name" type="text" autocomplete="name" required>
        </div>
        <div class="field">
          <label for="email">Work email</label>
          <input id="email" name="email" type="email" autocomplete="email" required>
        </div>
        <div class="field">
          <label for="company">Company <span class="muted">(optional)</span></label>
          <input id="company" name="company" type="text" autocomplete="organization">
        </div>
        <div class="field">
          <label for="message">What are you trying to solve?</label>
          <textarea id="message" name="message" rows="5" required></textarea>
        </div>
        <input type="text" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
        <button class="btn btn-primary" type="submit">Send message</button>
        <p class="form-status" role="status" aria-live="polite"></p>
        <p class="muted small">By sending this you agree we may reply by email. See the <a href="/privacy.html">privacy policy</a>.</p>
      </form>
    </div>
  </div>
</section>`;
  return page(ctx, { title: 'Contact', path: '/contact.html', active: '/contact.html', content });
}

function renderThanks(ctx) {
  const content = `
<section class="section center">
  <div class="wrap narrow">
    <h1>Thanks — message received.</h1>
    <p class="lede">A person will reply within one business day. If it is urgent, reply to the confirmation email and mark it urgent.</p>
    <p><a class="btn btn-primary" href="/">Back to the site</a></p>
  </div>
</section>`;
  return page(ctx, { title: 'Thanks', path: '/thanks.html', content });
}

function renderBlogIndex(ctx) {
  const { identity, marketing } = ctx;
  const posts = blogPosts(ctx, seedFor(identity.name, 'site'));
  const content = `
<section class="section">
  <div class="wrap narrow">
    <h1>The ${h(identity.name)} blog</h1>
    <p class="lede">Working notes on ${h(marketing.slots.problem)} — written for ${h(marketing.slots.audience)}.</p>
    <div class="post-list">
      ${posts
        .map(
          (post) => `<article class="card post-card">
        <h2><a href="/blog/${h(post.slug)}.html">${h(post.title)}</a></h2>
        <p>${h(post.description)}</p>
        <p class="muted small">${h(post.readingTime)} min read</p>
      </article>`,
        )
        .join('\n      ')}
    </div>
    <div class="callout">
      <h3>Get the next one</h3>
      <p>One useful email a month. No drip campaign, unsubscribe in one click.</p>
      ${newsletterForm(ctx, 'blog')}
    </div>
  </div>
</section>`;
  return page(ctx, { title: 'Blog', path: '/blog/', active: '/blog/', content });
}

function renderPost(ctx, post) {
  const { identity, site } = ctx;
  const content = `
<article class="section">
  <div class="wrap narrow prose">
    <p class="muted small"><a href="/blog/">Blog</a> · ${h(post.readingTime)} min read</p>
    <h1>${h(post.title)}</h1>
    <p class="lede">${h(post.description)}</p>
    ${post.sections
      .map(
        (section) => `<h2>${h(section.h)}</h2>
    ${section.paras.map((para) => `<p>${h(para)}</p>`).join('\n    ')}
    ${section.list ? `<ul class="ticks">${section.list.map((item) => `<li>${h(item)}</li>`).join('')}</ul>` : ''}`,
      )
      .join('\n    ')}
    <div class="callout">
      <h3>${h(identity.taglines[2]?.text || identity.primaryTagline)}</h3>
      <p>${h(identity.oneLiner)}</p>
      <p><a class="btn btn-primary" href="/contact.html">Start free</a></p>
    </div>
    <p class="muted small">Written by ${h(site.name)}. Found an error? <a href="mailto:${h(site.email)}">Tell us</a> — we correct in public.</p>
  </div>
</article>`;
  return page(ctx, {
    title: post.title,
    description: post.description,
    path: `/blog/${post.slug}.html`,
    active: '/blog/',
    content,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.description,
      author: { '@type': 'Organization', name: identity.name },
      publisher: { '@type': 'Organization', name: identity.name },
      datePublished: new Date().toISOString().slice(0, 10),
    },
  });
}

function renderLegal(ctx, kind) {
  const { identity, site } = ctx;
  const isPrivacy = kind === 'privacy';
  const content = `
<section class="section">
  <div class="wrap narrow prose">
    <h1>${isPrivacy ? 'Privacy policy' : 'Terms of service'}</h1>
    <p class="muted small">Last updated ${new Date().toISOString().slice(0, 10)} · Draft structure — have a lawyer review this before you launch.</p>
    ${
      isPrivacy
        ? `<h2>What we collect</h2>
    <p>Account details you give us (name, email, company), usage events needed to run the product, and payment details processed by our payment provider. We do not store card numbers ourselves.</p>
    <h2>Why we collect it</h2>
    <p>To provide the service, secure it, support you, and meet legal obligations. We do not sell personal data, and we do not share it with advertisers.</p>
    <h2>Cookies and analytics</h2>
    <p>We use strictly necessary cookies for sign-in and a privacy-respecting analytics tool for aggregate usage. You can opt out of analytics without losing functionality.</p>
    <h2>Your rights</h2>
    <p>You can request a copy, correction or deletion of your personal data at any time by emailing <a href="mailto:${h(site.email)}">${h(site.email)}</a>. If you are in the EU or UK, you have rights under GDPR; in California, under CCPA/CPRA. We respond within 30 days.</p>
    <h2>Sub-processors and transfers</h2>
    <p>We use hosting, email and payment providers. A current list is available on request. Where data leaves your region we rely on standard contractual clauses.</p>
    <h2>Retention</h2>
    <p>We keep account data while your account is open, then for 90 days so you can change your mind, then delete it — except records we must keep for tax and legal reasons.</p>
    <h2>Contact</h2>
    <p>Data controller: ${h(identity.legalName)}. Email <a href="mailto:${h(site.email)}">${h(site.email)}</a>.</p>`
        : `<h2>The agreement</h2>
    <p>These terms govern your use of ${h(identity.name)}, provided by ${h(identity.legalName)}. By creating an account you accept them.</p>
    <h2>Your account</h2>
    <p>You are responsible for your credentials and for activity under your account. One person per seat; do not share logins.</p>
    <h2>Acceptable use</h2>
    <p>No unlawful use, no attempts to breach or overload the service, no reselling without an agreement, no uploading content you do not have rights to.</p>
    <h2>Payment and refunds</h2>
    <p>Paid plans are billed in advance. Cancel any time; access continues to the end of the paid period. If the product fails to work as described, contact us within 30 days for a refund.</p>
    <h2>Intellectual property</h2>
    <p>You own your data and your content. We own the software, the brand and the documentation. Feedback is welcome and may be used without obligation.</p>
    <h2>Availability and liability</h2>
    <p>We aim for high availability but do not promise uninterrupted service outside a signed SLA. Our aggregate liability is limited to the fees you paid in the previous 12 months.</p>
    <h2>Termination</h2>
    <p>You may close your account at any time and export your data first. We may suspend accounts that breach these terms, with notice where practical.</p>
    <h2>Governing law</h2>
    <p>Governed by the laws of [your state], with disputes handled in the courts of [your county].</p>`
    }
  </div>
</section>`;
  return page(ctx, {
    title: isPrivacy ? 'Privacy' : 'Terms',
    path: isPrivacy ? '/privacy.html' : '/terms.html',
    content,
  });
}

function render404(ctx) {
  const { identity } = ctx;
  const content = `
<section class="section center">
  <div class="wrap narrow">
    <h1>404 — that page moved or never existed</h1>
    <p class="lede">${h(identity.voice.samples.errorMessage)}</p>
    <p><a class="btn btn-primary" href="/">Go home</a> <a class="btn btn-ghost" href="/contact.html">Report a broken link</a></p>
  </div>
</section>`;
  return page(ctx, { title: 'Not found', path: '/404.html', content });
}

// ---------------------------------------------------------------------------
// Content helpers
// ---------------------------------------------------------------------------

const ICONS = {
  bolt: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z"/></svg>',
  gauge: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14l4-4"/><path d="M4 18a8 8 0 1 1 16 0"/></svg>',
  users: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 6a3 3 0 0 1 0 6"/></svg>',
  plug: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3v6M15 3v6M6 9h12v3a6 6 0 0 1-12 0V9ZM12 18v3"/></svg>',
  chart: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
};

function featureList(identity, profile) {
  const icons = Object.values(ICONS);
  const titles = [
    ['Set up in one afternoon', `You bring the problem; ${identity.name} brings the structure. No implementation partner, no data migration project.`],
    [profile.proof[0] || 'Private by default', 'Your data stays yours. Export everything, in an open format, at any time — including on the day you leave.'],
    ['Fast enough to stop noticing', 'Built to feel instant. If a screen takes longer than a breath, we treat it as a bug.'],
    [`Made for ${profile.buyer.split(' and ')[0]}`, 'Defaults that match how the work actually happens, including the messy edge cases nobody documents.'],
    ['Connects to what you already run', `Integrations with ${profile.integrations.slice(0, 3).join(', ')} and an API for everything else.`],
    ['Numbers you can defend', 'Every metric is traceable to an event, with an audit trail your finance team will accept.'],
  ];
  return titles.map(([title, body], index) => ({ title, body, icon: icons[index % icons.length] }));
}

function howItWorks(identity, profile) {
  return [
    { title: 'Connect your world', body: `Sign in, invite the team, and point ${identity.name} at the tools you already use. Import takes minutes, not weeks.` },
    { title: 'Choose your defaults', body: `Start from the template built for ${profile.buyer.split(' and ')[0]} and adjust the two or three rules that are specific to you.` },
    { title: 'Let it run', body: `${profile.outcome.charAt(0).toUpperCase() + profile.outcome.slice(1)} — with a weekly digest that highlights only what needs a human.` },
    { title: 'Prove it worked', body: 'Compare week one with week twelve. If the numbers do not move, cancel and keep the export.' },
  ];
}

function faqItems(identity, profile, marketing) {
  return [
    { q: 'How long does setup take?', a: 'Most teams are running the same afternoon. There is no implementation project and no data migration fee.' },
    { q: `How is ${identity.name} different from ${profile.alt}?`, a: identity.positioning },
    { q: 'What does it cost?', a: `The entry tier is free and stays free. Paid plans start at ${marketing.pricing.tiers[1].price}${marketing.pricing.tiers[0].price === 'Free' ? '/month, billed annually' : ''}. Pricing is published; no sales call required.` },
    { q: 'What happens to my data if I leave?', a: 'You export everything in an open format at any time, including on the day you cancel. We delete your data 90 days after account closure.' },
    { q: `Who is ${identity.name} for?`, a: `${marketing.icp.primary.who}. If you are a single person with no dedicated owner for this problem yet, you are probably early — start with the free tier.` },
    { q: 'Do you offer a discount for startups or nonprofits?', a: 'Yes. Tell us what you are building and we will do something sensible. The free tier already covers most pre-seed teams.' },
  ];
}

function tierCard(tier) {
  return `<article class="card tier${tier.highlighted ? ' tier-featured' : ''}">
        ${tier.highlighted ? '<span class="badge">Most popular</span>' : ''}
        <h3>${h(tier.name)}</h3>
        <p class="price">${h(tier.price)}<span class="per">${h(tier.price === 'Free' ? '' : '/mo')}</span></p>
        <p class="muted small">${h(tier.billing)}</p>
        <p>${h(tier.tagline)}</p>
        <ul class="ticks">
          ${tier.features.map((feature) => `<li>${h(feature)}</li>`).join('\n          ')}
        </ul>
        <a class="btn ${tier.highlighted ? 'btn-primary' : 'btn-ghost'}" href="/contact.html">${h(tier.cta)}</a>
        <p class="muted small">${h(tier.limits)}</p>
      </article>`;
}

function newsletterForm(ctx, placement) {
  return `<form class="newsletter" data-blueprint-form="subscribe" data-placement="${h(placement)}" novalidate>
      <label class="sr" for="nl-${h(placement)}">Email address</label>
      <input id="nl-${h(placement)}" name="email" type="email" placeholder="you@company.com" autocomplete="email" required>
      <input type="text" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
      <button class="btn btn-primary" type="submit">Subscribe</button>
      <p class="form-status" role="status" aria-live="polite"></p>
      <p class="muted small">We send a confirmation link first — you are only subscribed once you click it.</p>
    </form>`;
}

function typographyCss(brand) {
  const { stacks, scale, pair } = brand.typography;
  return `:root {
  --font-heading: ${stacks.heading};
  --font-body: ${stacks.body};
  --font-mono: ${stacks.mono};
${scale.map((step) => `  --text-${step.name}: ${step.size}px;`).join('\n')}
  --leading-body: ${scale.find((s) => s.name === 'body').lineHeight};
  --measure: 66ch;
}

/* Font pairing: ${pair.heading} / ${pair.body} / ${pair.mono} (${pair.mood}) */`;
}

function stylesCss(brand) {
  return `/* Base ---------------------------------------------------------------- */
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-body);
  line-height: var(--leading-body);
  color: var(--ink);
  background: var(--paper);
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3, h4 {
  font-family: var(--font-heading);
  line-height: 1.12;
  letter-spacing: -0.02em;
  margin: 0 0 0.5em;
  text-wrap: balance;
}
h1 { font-size: clamp(2.1rem, 1.4rem + 2.6vw, var(--text-display)); font-weight: 700; }
h2 { font-size: clamp(1.6rem, 1.2rem + 1.4vw, var(--text-h2)); font-weight: 600; }
h3 { font-size: clamp(1.15rem, 1rem + 0.6vw, var(--text-h3)); font-weight: 600; }
p { margin: 0 0 1rem; }
a { color: var(--link); text-decoration-thickness: 1px; text-underline-offset: 2px; }
a:hover { color: var(--brand-primary-hover); }
img, svg { max-width: 100%; height: auto; }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; border-radius: 4px; }
button, input, textarea, select { font: inherit; color: inherit; }

.skip {
  position: absolute; left: -9999px; top: 0; padding: 12px 16px;
  background: var(--ink); color: var(--paper); z-index: 100;
}
.skip:focus { left: 12px; top: 12px; }
.sr {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
.hp { position: absolute; left: -9999px; height: 0; width: 0; opacity: 0; }

.wrap { width: min(1140px, 100% - 3rem); margin-inline: auto; }
.wrap.narrow, .narrow { max-width: calc(var(--measure) + 8ch); }
.center { text-align: center; }
.center-row { justify-content: center; }
.muted { color: var(--ink-muted); }
.small { font-size: var(--text-small); }

/* Header -------------------------------------------------------------- */
.site-header {
  position: sticky; top: 0; z-index: 50;
  background: color-mix(in srgb, var(--paper) 88%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.header-inner { display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; min-height: 68px; }
.brand { display: inline-flex; align-items: center; }
.logo { height: 34px; width: auto; }
.site-nav { display: flex; align-items: center; gap: 1.4rem; }
.site-nav a { color: var(--ink); text-decoration: none; font-size: var(--text-small); font-weight: 500; opacity: 0.82; }
.site-nav a:hover, .site-nav a[aria-current="page"] { opacity: 1; color: var(--brand-primary-text); }
.nav-cta { color: var(--on-primary) !important; opacity: 1 !important; }
.nav-toggle { display: none; background: none; border: 1px solid var(--line); border-radius: 8px; padding: 8px; cursor: pointer; }

/* Buttons ------------------------------------------------------------- */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
  padding: 0.75rem 1.15rem; border-radius: 10px; border: 1px solid transparent;
  font-weight: 600; font-size: var(--text-small); text-decoration: none; cursor: pointer;
  transition: transform 0.12s ease, background-color 0.15s ease, box-shadow 0.15s ease;
}
.btn-primary { background: var(--brand-primary); color: var(--on-primary); }
.btn-primary:hover { background: var(--brand-primary-hover); color: var(--on-primary); transform: translateY(-1px); }
.btn-ghost { border-color: var(--line); color: var(--ink); background: transparent; }
.btn-ghost:hover { border-color: var(--brand-primary); color: var(--brand-primary-text); }

/* Hero ---------------------------------------------------------------- */
.hero { padding: clamp(3rem, 6vw, 6rem) 0 2.5rem; background: var(--paper); position: relative; overflow: hidden; }
.hero::after {
  content: ""; position: absolute; inset: auto -10% -40% 40%; height: 420px;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--brand-accent) 22%, transparent), transparent);
  pointer-events: none;
}
.hero-inner { display: grid; grid-template-columns: 1.25fr 0.85fr; gap: 3rem; align-items: center; position: relative; }
.hero-copy h1 { margin-bottom: 1rem; }
.pill {
  display: inline-block; margin-bottom: 1.25rem; padding: 0.35rem 0.7rem; border-radius: 999px;
  background: var(--surface-alt); border: 1px solid var(--line);
  font-size: var(--text-caption); font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase;
  color: var(--ink-muted);
}
.lede { font-size: 1.08rem; color: var(--ink-muted); max-width: 62ch; }
.cta-row { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 1.5rem 0 0.75rem; }
.hero-art { display: flex; justify-content: center; }
.art-card {
  padding: 2.5rem; border-radius: 24px; background: var(--surface);
  border: 1px solid var(--line); box-shadow: 0 24px 60px -30px color-mix(in srgb, var(--ink) 40%, transparent);
}
.art-logo { height: 190px; width: auto; }
.proof-strip {
  display: flex; flex-wrap: wrap; gap: 1.25rem 2rem; margin-top: 3rem;
  padding-top: 1.5rem; border-top: 1px solid var(--line);
}
.proof { font-size: var(--text-small); font-weight: 600; color: var(--ink-muted); }

/* Sections ------------------------------------------------------------ */
.section { padding: clamp(3rem, 5vw, 5rem) 0; }
.section.alt { background: var(--surface-alt); }
.section.cta-final { background: var(--brand-primary); color: var(--on-primary); }
.section.cta-final h2, .section.cta-final .lede { color: var(--on-primary); }
.section.cta-final .lede { opacity: 0.9; }
.section.cta-final .btn-ghost { border-color: color-mix(in srgb, var(--on-primary) 45%, transparent); color: var(--on-primary); }
.problem .split, .split { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 2rem; }

/* Cards --------------------------------------------------------------- */
.grid { display: grid; gap: 1.25rem; margin-top: 2rem; }
.grid-2 { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.grid-3 { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
.card {
  background: var(--surface); border: 1px solid var(--line); border-radius: 16px;
  padding: 1.5rem; box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 6%, transparent);
}
.card h3 { margin-top: 0; }
.card > :last-child { margin-bottom: 0; }
.accent-card { border-color: color-mix(in srgb, var(--brand-primary) 35%, var(--line)); background: color-mix(in srgb, var(--brand-primary) 5%, var(--surface)); }
.feature-icon { color: var(--brand-primary-text); margin-bottom: 0.75rem; }
.ticks { list-style: none; padding: 0; margin: 0.75rem 0 1rem; display: grid; gap: 0.5rem; }
.ticks li { position: relative; padding-left: 1.6rem; color: var(--ink-muted); }
.ticks li::before {
  content: ""; position: absolute; left: 0; top: 0.52em; width: 0.75rem; height: 0.42rem;
  border-left: 2px solid var(--brand-primary); border-bottom: 2px solid var(--brand-primary);
  transform: rotate(-45deg);
}

/* Steps --------------------------------------------------------------- */
.steps { list-style: none; counter-reset: step; padding: 0; margin: 2rem 0 0; display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
.step { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 1.5rem; }
.step-num {
  display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px;
  border-radius: 50%; background: var(--brand-primary); color: var(--on-primary);
  font-weight: 700; font-size: var(--text-caption); margin-bottom: 0.75rem;
}

/* Pricing ------------------------------------------------------------- */
.pricing-grid { align-items: stretch; }
.tier { display: flex; flex-direction: column; gap: 0.35rem; position: relative; }
.tier .btn { margin-top: auto; }
.tier-featured { border-color: var(--brand-primary); box-shadow: 0 18px 44px -26px color-mix(in srgb, var(--brand-primary) 60%, transparent); }
.badge {
  position: absolute; top: -0.75rem; right: 1.25rem; padding: 0.2rem 0.6rem; border-radius: 999px;
  background: var(--brand-accent); color: var(--on-accent);
  font-size: var(--text-caption); font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
}
.price { font-family: var(--font-heading); font-size: 2.1rem; font-weight: 700; margin: 0.25rem 0 0; }
.price .per { font-size: var(--text-small); font-weight: 500; color: var(--ink-muted); }
.callout {
  margin-top: 2rem; padding: 1.5rem; border-radius: 16px;
  background: var(--surface-alt); border: 1px solid var(--line);
}

/* FAQ ----------------------------------------------------------------- */
.faq { margin-top: 1.5rem; display: grid; gap: 0.75rem; }
.faq details { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 1rem 1.25rem; }
.faq summary { font-weight: 600; cursor: pointer; }
.faq details[open] summary { color: var(--brand-primary-text); margin-bottom: 0.5rem; }
.faq p { margin: 0; color: var(--ink-muted); }

/* Quotes -------------------------------------------------------------- */
.quote { margin: 0; }
.quote blockquote { margin: 0 0 0.75rem; font-size: 1.05rem; }
.quote figcaption { color: var(--ink-muted); font-size: var(--text-small); }

/* Forms --------------------------------------------------------------- */
.field { margin-bottom: 1rem; display: grid; gap: 0.35rem; }
.field label { font-weight: 600; font-size: var(--text-small); }
input[type="text"], input[type="email"], textarea, select {
  width: 100%; padding: 0.7rem 0.85rem; border: 1px solid var(--line);
  border-radius: 10px; background: var(--paper);
}
input:focus, textarea:focus { border-color: var(--brand-primary); outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-primary) 22%, transparent); }
[aria-invalid="true"] { border-color: var(--critical); }
.newsletter { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.newsletter input[type="email"] { flex: 1 1 220px; }
.form-status { flex-basis: 100%; margin: 0.25rem 0 0; font-size: var(--text-small); color: var(--ink-muted); }
.form-status[data-state="error"] { color: var(--critical); }
.form-status[data-state="ok"] { color: var(--positive); }

/* Blog ---------------------------------------------------------------- */
.post-list { display: grid; gap: 1.25rem; margin: 2rem 0; }
.post-card h2 { font-size: var(--text-h3); margin-bottom: 0.4rem; }
.post-card h2 a { text-decoration: none; }
.prose h2 { margin-top: 2rem; }
.prose p, .prose li { color: var(--ink-muted); }
.prose .lede { color: var(--ink); }

/* Footer -------------------------------------------------------------- */
.site-footer { border-top: 1px solid var(--line); padding: 3rem 0 1.5rem; background: var(--surface-alt); margin-top: 3rem; }
.footer-grid { display: grid; grid-template-columns: 1.4fr 1fr 1fr 1.4fr; gap: 2rem; }
.footer-brand .logo { height: 32px; }
.footer-head { font-size: var(--text-caption); text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-muted); margin-bottom: 0.75rem; }
.footer-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
.footer-list a { color: var(--ink-muted); text-decoration: none; font-size: var(--text-small); }
.footer-list a:hover { color: var(--brand-primary-text); }
.footer-base { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-top: 2.5rem; padding-top: 1.25rem; border-top: 1px solid var(--line); }
.footer-base a { color: var(--ink-muted); }

/* Responsive ---------------------------------------------------------- */
@media (max-width: 900px) {
  .hero-inner, .split, .footer-grid, .contact-grid { grid-template-columns: 1fr !important; }
  .hero-art { order: -1; }
  .nav-toggle { display: inline-flex; }
  .site-nav {
    display: none; position: absolute; top: 68px; left: 0; right: 0;
    flex-direction: column; align-items: stretch; gap: 0;
    background: var(--paper); border-bottom: 1px solid var(--line); padding: 0.5rem 1.5rem 1rem;
  }
  .site-nav[data-open="true"] { display: flex; }
  .site-nav a { padding: 0.75rem 0; border-bottom: 1px solid var(--line); }
  .nav-cta { margin-top: 0.75rem; }
}
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
@media print {
  .site-header, .site-footer, .cta-row { display: none; }
  body { background: #fff; color: #000; }
}
`;
}

function mainJs(ctx) {
  return `// Generated by Blueprint. Handles the contact form and newsletter signup.
const config = window.BLUEPRINT_SITE || {};

function setStatus(form, message, state) {
  const el = form.querySelector('.form-status');
  if (!el) return;
  el.textContent = message;
  if (state) el.dataset.state = state;
}

function validate(form) {
  const email = form.querySelector('input[type="email"]');
  if (email && !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]{2,}$/.test(email.value.trim())) {
    email.setAttribute('aria-invalid', 'true');
    email.focus();
    return 'That email address does not look right.';
  }
  if (email) email.removeAttribute('aria-invalid');
  const required = form.querySelectorAll('[required]');
  for (const field of required) {
    if (!field.value.trim()) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
      return 'Please fill in every required field.';
    }
    field.removeAttribute('aria-invalid');
  }
  return null;
}

async function submit(form, payload) {
  if (!config.apiBase) return { offline: true };
  const response = await fetch(config.apiBase + '/api/' + (payload.kind === 'subscribe' ? 'subscribers' : 'leads'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload, projectId: config.projectId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Something went wrong. Please try again.');
  return data;
}

for (const form of document.querySelectorAll('[data-blueprint-form]')) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const invalid = validate(form);
    if (invalid) return setStatus(form, invalid, 'error');
    if (form.querySelector('input[name="website"]')?.value) return; // honeypot

    const data = Object.fromEntries(new FormData(form).entries());
    const kind = form.dataset.blueprintForm;
    const button = form.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.dataset.label = button.textContent; button.textContent = 'Sending…'; }
    setStatus(form, 'Sending…');

    try {
      const result = await submit(form, { ...data, kind, source: form.dataset.placement || 'site' });
      if (result.offline) {
        const mail = 'hello@' + (location.hostname || 'your-domain.com');
        setStatus(form, 'This form is not connected yet — email ' + mail + ' instead.', 'error');
      } else if (kind === 'subscribe') {
        setStatus(form, 'Almost there — check your inbox for the confirmation link.', 'ok');
        form.reset();
      } else {
        setStatus(form, 'Thanks. A person will reply within one business day.', 'ok');
        setTimeout(() => { window.location.href = '/thanks.html'; }, 900);
      }
    } catch (error) {
      setStatus(form, error.message, 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = button.dataset.label || 'Send'; }
    }
  });
}

// Mobile navigation.
const toggle = document.querySelector('[data-nav-toggle]');
const nav = document.querySelector('[data-nav]');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.dataset.open === 'true';
    nav.dataset.open = String(!open);
    toggle.setAttribute('aria-expanded', String(!open));
  });
}

// Highlight the section in view, if the browser supports it.
if ('IntersectionObserver' in window) {
  const links = [...document.querySelectorAll('.site-nav a[href^="/#"]')];
  const map = new Map(links.map((link) => [link.getAttribute('href').slice(2), link]));
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const link = map.get(entry.target.id);
      if (!link) continue;
      if (entry.isIntersecting) {
        links.forEach((item) => item.removeAttribute('aria-current'));
        link.setAttribute('aria-current', 'page');
      }
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  for (const id of map.keys()) {
    const target = document.getElementById(id);
    if (target) observer.observe(target);
  }
}
`;
}

function manifest(ctx) {
  const { identity, brand } = ctx;
  return `${JSON.stringify(
    {
      name: identity.name,
      short_name: identity.name.slice(0, 12),
      description: identity.boilerplates.short,
      start_url: '/',
      display: 'standalone',
      background_color: brand.palette.paper,
      theme_color: brand.palette.primary,
      icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
    },
    null,
    2,
  )}\n`;
}

function robots(ctx) {
  return `# ${ctx.identity.name}
User-agent: *
Allow: /
Disallow: /thanks.html

Sitemap: ${ctx.site.url}/sitemap.xml
`;
}

function sitemap(ctx, posts) {
  const { site } = ctx;
  const today = new Date().toISOString().slice(0, 10);
  const routes = [
    { path: '/', priority: '1.0', changefreq: 'weekly' },
    { path: '/pricing.html', priority: '0.9', changefreq: 'monthly' },
    { path: '/about.html', priority: '0.6', changefreq: 'monthly' },
    { path: '/contact.html', priority: '0.7', changefreq: 'yearly' },
    { path: '/blog/', priority: '0.8', changefreq: 'weekly' },
    ...posts.map((post) => ({ path: `/blog/${post.slug}.html`, priority: '0.7', changefreq: 'yearly' })),
    { path: '/privacy.html', priority: '0.3', changefreq: 'yearly' },
    { path: '/terms.html', priority: '0.3', changefreq: 'yearly' },
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (route) => `  <url>
    <loc>${site.url}${route.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`;
}

function headers() {
  return `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; form-action 'self'; frame-ancestors 'none'

/css/*
  Cache-Control: public, max-age=31536000, immutable

/js/*
  Cache-Control: public, max-age=31536000, immutable
`;
}

function netlify() {
  return `[build]
  publish = "."

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
`;
}

function blogPosts(ctx, rand) {
  const { identity, marketing, profile } = ctx;
  const slots = marketing.slots;
  const posts = [
    {
      slug: `the-real-cost-of-${profile.thing.replace(/\s+/g, '-')}`,
      title: `The real cost of ${profile.problem.split(',')[0]}`,
      description: `A worked example of what ${profile.thing} costs ${slots.audience} per year, and the three places the number hides.`,
      sections: [
        {
          h: 'The number nobody puts in a spreadsheet',
          paras: [
            `Ask ${slots.audience} what ${profile.thing} costs and you will get a shrug. The software line item is obvious; the rest is invisible because it is spread across people’s calendars.`,
            'Start with three numbers: how many people touch the process, how many hours a week it takes each of them, and what an hour of their time is worth fully loaded. Multiply those together and most teams find the real cost is four to eight times the tooling bill.',
          ],
          list: ['Count touches, not tools. Every handoff is a delay and an opportunity for error.', 'Use fully loaded cost, not salary.', 'Include the cost of the weekly meeting that exists only because nobody trusts the data.'],
        },
        {
          h: 'Where the money actually leaks',
          paras: [
            `${profile.outcome.charAt(0).toUpperCase() + profile.outcome.slice(1)} is the goal, but leaks happen in three predictable places. First, the rework loop: work gets redone because the input was wrong. Second, the waiting state: decisions stall between two people who both think the other owns it. Third, the archaeology tax: someone has to reverse-engineer what happened three months ago.`,
            'The third one is the most expensive and the least discussed, because it only shows up when an auditor, a customer or a new hire asks a simple question.',
          ],
        },
        {
          h: 'What to do about it this week',
          paras: [
            'Do not start with software. Start by instrumenting the current process for seven days — timestamps, handoffs, and the moment something gets redone. You will find one stage that accounts for most of the waste.',
            `Then fix that stage properly, with a tool that fits it. That is what we built ${identity.name} for: ${identity.oneLiner}`,
          ],
          list: ['Pick the single worst stage.', 'Define what "done" means for it, measurably.', 'Automate one step, then measure again in two weeks.', 'Only then extend to the next stage.'],
        },
      ],
    },
    {
      slug: `${identity.analysis.compact}-vs-${profile.alt.split(' ')[0].toLowerCase()}`,
      title: `${identity.name} vs ${profile.alt}: an honest comparison`,
      description: `Where ${identity.name} wins, where the alternative still wins, and how to decide in ten minutes.`,
      sections: [
        {
          h: 'The short version',
          paras: [
            `${profile.alt} exists for a reason, and for some teams it is still the right call. This page is written so you can decide quickly rather than book a demo to find out.`,
            `Choose ${identity.name} if you want ${profile.outcome} without adding a platform team. Choose ${profile.alt} if you need something we deliberately do not do.`,
          ],
        },
        {
          h: 'Where we are genuinely better',
          paras: [`${profile.problem.charAt(0).toUpperCase() + profile.problem.slice(1)} — that is the whole target. Everything in the product exists to remove that specific cost.`],
          list: [...profile.proof.slice(0, 3), 'No implementation project: value in the first afternoon, not the second quarter.', 'Published pricing with a real free tier, so you can evaluate without a sales call.'],
        },
        {
          h: 'Where the alternative wins',
          paras: [
            'Being honest about this saves everybody time. If you need a deeply custom data model, an on-premises deployment, or a vendor with a 20-year track record for a procurement checklist, the incumbent is the safer answer today.',
            'We also do not compete on breadth. If you need one vendor for twelve overlapping workflows, we are not it.',
          ],
        },
        {
          h: 'How to decide in ten minutes',
          paras: ['Run this test with the person who owns the problem. It does not need a committee.'],
          list: [`Can you name the stage that hurts most? If not, instrument for a week first.`, 'Do you need a bespoke data model? If yes, the alternative is probably right.', 'Is a happy path worth more than full configurability? If yes, we are the faster route.', 'Try both free tiers on the same real task and compare the time to first value.'],
        },
      ],
    },
    {
      slug: `how-to-reach-${profile.categoryWord}-outcomes-in-90-days`,
      title: `How ${slots.audience} get results in 90 days`,
      description: 'A week-by-week plan with the metrics to watch at each stage, and the two traps that stall most rollouts.',
      sections: [
        {
          h: 'Days 1–30: earn the right to change anything',
          paras: [
            'The first month is about measurement, not migration. Baseline the process you have: volume, cycle time, error rate and the two steps people complain about unprompted.',
            'Pick one workflow and one owner. Rollouts fail when three teams adopt at once and none of them owns the outcome.',
          ],
        },
        {
          h: 'Days 31–60: automate one stage properly',
          paras: [
            `Take the worst stage and make it fully automatic or fully manual — never half. Half-automated steps are where trust dies. ${identity.name} is designed so the handoff is explicit and visible.`,
            'Publish the before-and-after numbers internally, even if they are modest. Credibility compounds faster than features.',
          ],
          list: ['One stage, fully owned.', 'A visible before-and-after number.', 'A written definition of done.'],
        },
        {
          h: 'Days 61–90: make it the default',
          paras: [
            'Turn off the old path. If it stays available, it stays the default, and adoption stalls at the early-adopter stage.',
            'Then extend to the next workflow with the same pattern. Two successful stages is the point at which people stop asking whether the change is permanent.',
          ],
        },
        {
          h: 'The two traps',
          paras: [
            'First: measuring activity instead of outcomes — logins and tickets are not results. Second: giving the rollout to someone without the authority to turn off the old process.',
            `Pick the metric that the business already cares about. For most ${slots.audience}, that is cycle time, and it moves within two weeks if you have chosen the right stage.`,
          ],
        },
      ],
    },
  ];

  return posts.map((post, index) => ({
    ...post,
    readingTime: 4 + index,
    sections: post.sections.map((section) => ({
      ...section,
      paras: section.paras.map((para) => para.replace(/\{\{(\w+)\}\}/g, (_, key) => key)),
    })),
  }));
}

// ---------------------------------------------------------------------------
// Docs shipped with the site
// ---------------------------------------------------------------------------

function siteReadme(ctx, posts) {
  const { identity, brand, marketing } = ctx;
  return `# ${identity.name} — website

Generated by Blueprint for **${identity.legalName}**.

> ${identity.primaryTagline}

## What is in this folder

| Path | What it is |
| --- | --- |
| \`index.html\` | Home — hero, problem, features, how it works, social proof, pricing preview, FAQ |
| \`pricing.html\` | Full pricing with the reasoning behind each tier |
| \`about.html\` | Story, mission, values, contact |
| \`contact.html\` | Contact form wired to the Blueprint leads API |
| \`blog/\` | Index plus ${posts.length} starter posts |
| \`privacy.html\`, \`terms.html\` | Starting structures for legal pages |
| \`css/brand.css\` | Design tokens (color, type scale) — regenerate-safe |
| \`css/styles.css\` | Layout and components |
| \`js/main.js\` | Form handling, mobile nav, scroll spy |
| \`_headers\`, \`netlify.toml\` | Security headers and platform config |
| \`sitemap.xml\`, \`robots.txt\`, \`site.webmanifest\` | SEO and PWA plumbing |

## Before you publish

1. **Replace the bracketed placeholders.** Testimonials, quotes and press mentions are deliberately fake-looking so you cannot publish them by accident.
2. **Check the pricing.** Numbers are a starting point derived from your industry, not from your unit economics.
3. **Point the forms somewhere.** Add your project id to \`window.BLUEPRINT_SITE\` in each page, or change the form action to your own endpoint.
4. **Have a lawyer read \`privacy.html\` and \`terms.html\`.** They are structured starting points, not legal advice.
5. **Add analytics** and define the activation event before you spend a penny on anything else.

## Local check

\`\`\`bash
python3 -m http.server 8000
# then open http://localhost:8000
\`\`\`

## Colors

Primary \`${brand.palette.primary}\` · Accent \`${brand.palette.accent}\` · Ink \`${brand.palette.ink}\`

${brand.palette.checks
  .map((check) => `- ${check.usage}: **${check.ratio}:1 (${check.grade})**`)
  .join('\n')}

## Voice

${marketing.messaging.house.map((layer) => `- **${layer.layer}:** ${layer.statement}`).join('\n')}
`;
}

function deployGuide(ctx) {
  const { identity } = ctx;
  return `# Deploying ${identity.name}

The site is static: HTML, CSS and one JavaScript file. No build step, no dependencies.

## Cloudflare Pages (recommended if you already use Cloudflare for DNS)

1. Push this folder to a Git repository, or run \`wrangler pages deploy . --project-name ${identity.analysis.compact}\`.
2. Framework preset: **None**. Build command: leave empty. Output directory: \`/\`.
3. Add your custom domain under **Custom domains** — this creates the DNS records for you if your zone is on Cloudflare.
4. Add the \`_headers\` file support (Pages applies it automatically).

## Netlify

\`\`\`bash
netlify deploy --dir=. --prod
\`\`\`

## Vercel

\`\`\`bash
vercel --prod
\`\`\`

## Anywhere else

Upload the folder to any static host or object storage with a CDN. Requirements: HTTPS, and \`404.html\` configured as the error document.

## After the first deploy

- [ ] Confirm HTTPS on both the apex and \`www\`, and redirect one to the other.
- [ ] Submit \`sitemap.xml\` in Google Search Console.
- [ ] Send a test message through the contact form and the newsletter form.
- [ ] Add the domain to your email provider and publish SPF, DKIM and DMARC.
- [ ] Check the site on a real phone, on mobile data.
- [ ] Run a Lighthouse pass and fix anything under 90 on performance or accessibility.
`;
}

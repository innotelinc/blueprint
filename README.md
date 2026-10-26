# Blueprint.

**Every Step Taken.** Type a name, walk away with a company.

Blueprint turns one company name into the artifacts a founder actually needs on day one:

| You give it | You get |
| --- | --- |
| A name, a purpose, a target audience, co-founders and a tone | A name analysis with a 100-point score, taglines, mission, values, a voice guide and screening links |
| | Three procedurally drawn **logo** directions as real SVG, chosen from a 24-mark library by industry and archetype, with a color system with a WCAG audit, a type scale, social cards, a business card and an email signature |
| | A complete **static website** — 12 pages, contact and newsletter forms, JSON-LD, sitemap, security headers and a deploy guide |
| | A **domain** shortlist with live availability checks, the exact DNS records, and a mailbox plan |
| | **Oasis mail** — Innotel's hosted mailbox service. Your domain, its MX/SPF/DKIM/DMARC records and a mailbox per person, provisioned on Stalwart through Cerulean |
| | A **social** plan: handles, bios written to each platform's limit, correctly sized assets and 30 drafted posts |
| | **Marketing**: industry-specific **market research**, positioning, ICP, pricing, channels, a 12-week plan, launch copy, outbound sequences, ad angles and SEO |
| | A **business plan**: a 36-month financial model built from your own published prices, three scenarios, unit economics, a funding ask sized from the plan's own cash curve, sensitivity on one assumption at a time, and a use-of-funds split — as a readable plan, seven data files and a launch-console phase |
| | **Company setup**: entity recommendation, drafted formation documents, a pre-filled SS-4, a bank-ready packet, a cap table and a compliance calendar |

Everything downloads as a single zip of ~108 files that you can hand to a designer, a lawyer, an investor or a developer.

---

## Run it

There are no dependencies. No bundler, no framework, no npm install.

```bash
npm run dev      # http://127.0.0.1:8787
npm test         # 119 tests, no network required
```

`npm run dev` starts a small Node server that serves `public/` and runs the real Worker request handler from `worker/index.js`, so local development exercises the same routing, validation and storage code that runs in production.

> On a machine without Node installed, `scripts/local-node.sh` finds one (it can fall back to any Electron binary running with `ELECTRON_RUN_AS_NODE=1`). Use it as `bash scripts/local-node.sh scripts/dev-server.mjs`.

### Optional environment

Copy `.dev.vars.example` to `.dev.vars`. Every value is optional — with none of them set, the app still generates everything, still checks domains, and stores form submissions, it just records email in **capture mode** instead of delivering it.

| Variable | Purpose |
| --- | --- |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | An OpenAI-compatible endpoint used to write the positioning statement. Unset, the deterministic engine writes it instead |
| `CERULEAN_API_URL`, `CERULEAN_API_TOKEN` | Cerulean publishes the customer's mail domain and its MX/SPF/DKIM/DMARC records |
| `OASIS_JMAP_URL`, `OASIS_ADMIN_TOKEN`, `OASIS_JMAP_ACCOUNT_ID` | The Stalwart side of Oasis: creates the tenant, the mail domain and the mailboxes |
| `EMAIL_PROVIDER`, `EMAIL_FROM` + one of `RESEND_API_KEY` / `POSTMARK_SERVER_TOKEN` / `PLUNK_API_KEY` | Delivers the double opt-in confirmation and the new-enquiry notification |
| `LEAD_NOTIFY_TO` | Where new contact-form enquiries are announced |

Any value may be a `vault://path#KEY` reference, which the local dev server resolves at startup, so a checkout can point at the estate's Vault instead of holding a copy of a secret.

## Deploy

The Worker in `worker/index.js` is dependency-free ES modules using only Web APIs, so it runs unchanged on Cloudflare Workers with static assets.

1. `wrangler d1 create blueprint`, then paste the id into `wrangler.jsonc` and apply `worker/schema.sql`.
2. `wrangler secret put AI_API_KEY`, `wrangler secret put CERULEAN_API_TOKEN`, `wrangler secret put OASIS_ADMIN_TOKEN` (plus an email key if you want outbound mail).
3. `wrangler deploy`.

Without D1 the Worker falls back to an in-process store, which is fine for a demo but loses data on restart.

---

## How it works

```
public/lib/            the generation engine — shared by the browser and the tests
  rng.js               hashing, seeded PRNG, color maths, escaping
  presets.js           industries, archetypes, font pairings, platforms, jurisdictions
  naming.js            name analysis, archetypes, taglines, mission, voice
  brand.js             palette + contrast audit, typography, logo marks, assets
  domains.js           domain candidates, DNS records, mailbox plan
  site.js              the whole static website generator
  social.js            handles, bios, per-platform assets, content calendar
  marketing.js         positioning, pricing, GTM, launch copy, outbound, SEO
  company.js           entity decision, formation docs, EIN, bank, compliance
  businessplan.js      the financial model: 36 months, three scenarios, unit
                       economics, funding sizing, sensitivity, break-even
  zip.js               dependency-free ZIP writer (deflate via CompressionStream)
  export.js            bundle assembly, brand guidelines, playbooks, launch console
  index.js             generateCompany(intake) -> a whole company

public/app.js          the wizard UI (imports the engine directly, no build step)
worker/                the API: domains, handles, projects, leads, subscribers
  index.js             routing, validation, same-origin enforcement, rate limits
  ai.js                the OmniRoute/OpenAI-compatible client that writes positioning
  oasis.js             the Oasis provisioner (Cerulean for DNS, Stalwart for mail)
  email.js             outbound adapters: Resend, Postmark, Plunk, capture mode
test/                  119 tests: engine determinism, copy quality, SVG validity and
                       field bounds, mark-library coverage, XSS escaping, ZIP
                       round-trips, month-by-month model arithmetic, and the
                       API's auth rules
```

**The engine is deterministic and pure.** The same intake always produces the same company, which is why the server stores only the intake plus your ticks and rebuilds everything else on load. Projects cannot drift from the engine, and you can diff two runs.

**The API only does what a browser cannot.** Registry lookups (RDAP and DNS-over-HTTPS are not CORS-enabled), cross-origin form posts with persistence, email delivery, mail provisioning, and the positioning call.

### What is genuinely live

- **Market research** — a real research brief per industry: the analyst category, the shapes of competitor you will meet and the trade-off each has made, the events that create urgency, the demand signals worth measuring, the public sources to read, and planning ranges that each carry the source you must verify them against. No invented competitors and no invented statistics — a generated name list is stale the day it ships, and an unverified number is worse than no number.
- **Logo directions** — 24 marks, each of which declares the industries it reads correctly in and the archetypes it suits. The leading direction is drawn from the whole eligible set rather than the first row of a sort, and the two symbol directions are always from different silhouette families, so a founder chooses between ideas instead of between two versions of one. Every mark is checked for field bounds and minimum stroke width by the test suite.
- **Business plan** — the projection is generated from the company's own published pricing tiers rather than from a growth rate handed to a table: accounts come from marketing spend ÷ cost per account plus founder-led work, churn is a rate on the active base, only the paying share produces revenue, and cost of goods is charged to every account including the free ones. Each of the 36 monthly rows is reproducible by hand from the row above it; the three scenarios shift inputs rather than outcomes; the funding ask is sized from the plan's own cumulative cash curve, so the requirement does not move when the round does; the market ceiling tapers growth instead of letting it compound; and where the horizon ends before break-even the plan reports the monthly gap and the customer count at its own price that would close it. Every assumption carries the source to replace it with.
- **Domain availability** — RDAP answered by the registry (`Verisign` for .com/.net, `PIR` for .org, `Identity Digital` for .io/.info, `Nominet` for .uk) plus a DNS-over-HTTPS NS lookup through Cloudflare, cross-checked. Answers carry a confidence level, and inconclusive results say so instead of guessing.
- **Social handle probes** — GitHub, Product Hunt and Bluesky return a reliable 404 for a free handle. The other platforms block unauthenticated checks and are labeled as unverifiable rather than guessed at. Probe URLs are built server-side from an allow-list, so a handle cannot escape its host.
- **Contact forms and newsletter** — real persistence, honeypots, per-IP and per-project rate limits, and a genuine double opt-in: a pending subscriber becomes confirmed only by clicking the emailed token, and can unsubscribe with the same link.
- **Oasis mail provisioning** — the default mail provider is Innotel's own service. With credentials set, `POST /api/mail/provision` registers the customer's zone and publishes the MX/SPF/DKIM/DMARC records through **Cerulean**, then creates the tenant, the mail domain and one mailbox per person on **Stalwart**. Without credentials it returns the same ordered plan with every step marked `planned` and creates nothing — a plan is never reported as a provisioning that did not happen.
- **Positioning** — written by the model when `AI_BASE_URL` is set, and by the deterministic engine when it is not. The same intake yields the same statement, so two runs stay diffable.
- **ZIP export** — a real archive with real deflate, verified by decompressing entries back and comparing bytes.

### What needs a human, and why

Three of the requested steps **cannot** be automated, and Blueprint does not pretend otherwise — it prepares the packet and links the official portal:

| Step | Why software cannot do it | What Blueprint does instead |
| --- | --- | --- |
| **Incorporate the entity** | A state registry requires a signed filing, a fee and an authorized filer | Drafts the certificate of incorporation or articles of organization, the governance documents, the organizational consent, the founder stock terms and the IP assignment, with the filing fee, timeline and portal link for your state |
| **Get an EIN** | The IRS issues it only against a signed SS-4 from a responsible party with a tax ID | Pre-fills every field of Form SS-4 from your intake, explains the three filing routes and their eligibility rules, and links irs.gov |
| **Open a business bank account** | Banks must run Customer Identification Program checks on the entity and every 25%+ owner under the USA PATRIOT Act | Produces a bank-ready packet: the exact document checklist in order, a cover sheet, a provider shortlist with requirements and a realistic sequence |

The legal folder is a **drafting aid for a lawyer**, generated from public filing requirements captured in 2026, and every document links its official source. It is not legal or tax advice.

### Honest limitations

- Social handle availability is best-effort. Platforms throttle; anything not confirmable is labeled unverifiable.
- Domain results are strong hints. Confirm at the registrar before you commit.
- Testimonials and customer quotes in the generated website are bracketed placeholders on purpose — publishing invented proof is a legal and reputational risk.
- The business plan is a planning model, not a forecast. Its churn, acquisition cost and payroll figures are industry planning ranges, each printed with the source that replaces it; the plan says so in its own opening lines. It sizes a raise against a stated plan — it does not predict what the business will do.
- The rate limiter is per-isolate and best-effort; the D1-backed counts are the durable guard. Add a Durable Object or KV limiter before a public launch.
- Previewing the generated site uses shadow DOM, so scripts are stripped and the forms are inert in the preview only.
- Oasis cannot create a mailbox on a domain the customer has not yet delegated to Innotel's nameservers. Blueprint provisions the mail side and reports exactly which NS change is still outstanding rather than claiming the mailbox is live.
- Stalwart's configuration surface is JMAP, not REST, so the provisioner speaks JMAP with an administrative principal and reads per-method `notCreated` failures out of a 200 response — a 200 that created nothing is treated as a failure.

## Services

Every third-party option in this repo was chosen through the Gravity Index rather than from memory:

- **LLM gateway** — [OpenLLM](https://index.trygravity.com/go/a862da25-f73e-4df1-abdb-52a9c2c1b625) is the recommended single-key gateway. In this estate the endpoint is the OmniRoute gateway, and anything OpenAI-compatible works: set `AI_BASE_URL`, `AI_API_KEY` and `AI_MODEL`.
- **Mail** — Oasis is Innotel's own product, so it is not a Gravity Index pick: mailboxes are hosted on Innotel's Stalwart server and the domain and its records are published through Cerulean. Blueprint's transactional email is a separate concern and still uses a Resend, Postmark or Plunk adapter.
- **Transactional email** — Resend, Postmark and Plunk adapters are implemented; pick one with `EMAIL_PROVIDER`.
- **Formation, banking and domains** — the Gravity Index catalog contains no business-formation, banking or domain-registration providers, so instead of recommending an unvetted vendor, Blueprint links the official government portals for filing and IRs, the SBA's banking guidance, and a neutral comparison for registered agents and registrars.

The AI layer is entirely optional: nothing in the generator depends on a model, so the product works with no API key at all. Oasis is the default mail provider, but its credentials are equally optional — unset, it plans and creates nothing.

## Security notes

- Untrusted input is escaped everywhere it reaches markup. Hostile names are covered by tests, including inside generated SVG and in the founder inbox.
- The generated site ships a strict `Content-Security-Policy`, HSTS and `nosniff` via `_headers`.
- Public write endpoints accept cross-origin posts by design (they live on customer websites), so they are honeypotted, validated, length-capped and rate limited. Project data is never readable without the project's edit token, and the token is never returned by a GET.
- Model output is treated as untrusted text: length-capped, stripped of markup and rendered as text only.
- Secrets live in Worker secrets, never in project files, and are never logged or echoed back by the API.

## License

MIT. The generated output is yours.

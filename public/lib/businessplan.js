// The business plan generator.
//
// A business plan is only worth reading if its numbers are arithmetic rather
// than decoration, so this module is built around one deterministic monthly
// model and one rule: **every figure in the document traces back to a stated
// assumption, and every assumption names how to replace it with real data.**
//
// The model's causal chain is deliberately short and explicit:
//
//     capital raised  ->  marketing budget  ->  new accounts  ->  paying
//     customers  ->  revenue  ->  gross profit  ->  cash
//
// Four things follow from taking that seriously, and each one exists because the
// obvious alternative produces a document that is worse than nothing:
//
//   * **Costs are charged per active account, revenue comes from paying ones.**
//     Support and infrastructure are per-account; only some accounts pay. That
//     gap is what freemium actually costs, and a model that hides it reports a
//     margin the business cannot earn.
//   * **Acquisition cost is stated per account, and the cost per *paying*
//     customer is derived from it** through the paying share. Quoting one number
//     while the model uses the other is how LTV:CAC ends up contradicting the
//     projection it sits next to.
//   * **The raise deploys.** Money raised for growth is spent on growth over a
//     stated window, so the plan shows what the capital buys instead of showing
//     a small business that happens to have cash in the bank.
//   * **The ask is sized by the model**, by finding the smallest amount that
//     keeps cash above zero through the horizon. Where that iteration does not
//     settle, the plan says so rather than printing a number that looks precise.
//
// Nothing here is a promise about the future, and the generated document says so
// in its own words. Salary figures are planning figures with the source to check
// them against (BLS wage data) — not a claim about what you will pay.

import { seedFor, withArticles } from './rng.js';
import { MARKET_RESEARCH } from './presets.js';

/** How far the model projects. Three years is the standard planning horizon. */
export const PLAN_HORIZON_MONTHS = 36;

/** Payroll taxes and benefits, as a multiplier on base salary. */
const EMPLOYER_BURDEN = 1.22;

/** A three-month cash buffer on top of the modelled drawdown. */
const BUFFER_MONTHS = 3;

/** Funding need is quoted in round numbers a founder can actually raise. */
const RAISE_ROUNDING = 25_000;

/** The largest ask the sizing search will consider before giving up. */
const MAX_ASK = 10_000_000;

/**
 * How the planned go-to-market budget is spent.
 *
 * The plan has a *spend plan*, and the raise funds it — the direction matters.
 * An earlier version scaled the marketing budget off the size of the round, which
 * looked reasonable and quietly broke the arithmetic: a larger raise deployed
 * more, which deepened the burn, so "you need X more" was never quite true and
 * the model could report a funded plan that still ran out of money.
 *
 * With the spend plan fixed, extra cash shifts the whole curve up by exactly its
 * own size, so the funding requirement is a single subtraction rather than a
 * search — and every reader can check it.
 */
const DEPLOYMENT = {
  gtmMonths: 18,
  note: 'The planned go-to-market budget runs for 18 months, then falls back to the standing budget, which is what a raise actually buys: a window of investment, not a permanent cost.',
};

/**
 * Roles the plan can hire, as annual US base salary planning figures.
 *
 * These are *planning* figures, not market rates: replace them with your own
 * metro's numbers before you use the payroll line for anything real. BLS
 * Occupational Employment and Wage Statistics (bls.gov/oes) publishes them by
 * metro and occupation, free.
 */
const ROLES = {
  Founder: { annual: 90_000, note: 'Paid at 60% for the first six months, then full. Founders who skip this line produce a plan that cannot pay them.' },
  'Founding engineer': { annual: 150_000, note: 'The first hire in almost every software plan. Contract-to-hire de-risks it.' },
  'Second engineer': { annual: 145_000, note: 'Hire after the first has shipped something real, not before.' },
  'Founding marketer / GTM': { annual: 120_000, note: 'Owns the channel plan, not just the content calendar.' },
  'Second GTM hire': { annual: 110_000, note: 'Sales or marketing, depending on which motion produced the first ten customers.' },
  'Account executive': { annual: 105_000, note: 'Base only. Commission is modelled as a variable cost on new revenue.' },
  'Customer success / support': { annual: 68_000, note: 'Hire when one person can no longer answer everything within a day.' },
  'Operations / finance': { annual: 95_000, note: 'Bookkeeping and payroll are worth outsourcing long before this hire.' },
};

/**
 * When each role is hired, in months from the first day of the plan.
 *
 * Deliberately small and staged: a plan that hires eight people in month one is
 * not a plan, it is a wish. The scenarios shift the whole schedule rather than
 * inventing different roles, so the comparison stays like for like.
 */
const HIRE_SCHEDULE = [
  { month: 0, role: 'Founder' },
  { month: 3, role: 'Founding engineer' },
  { month: 6, role: 'Founding marketer / GTM' },
  { month: 10, role: 'Customer success / support' },
  { month: 14, role: 'Second engineer' },
  { month: 18, role: 'Account executive' },
  { month: 24, role: 'Second GTM hire' },
];

/**
 * Per-industry model assumptions.
 *
 * `infraPerActive` and `supportPerActive` are monthly costs per *active account*
 * — including the ones that never pay — so gross margin is computed from them
 * rather than asserted. `costPerAccount` is what it costs to win an active
 * account; the cost per paying customer is that divided by `payingShare`, and
 * both are reported.
 *
 * `seedAsk` is the industry-typical round, used as the amount under test when
 * none is entered. It is not a recommendation; the sizing pass decides what the
 * document asks for.
 *
 * `gtmPlanMonthly` is the planned go-to-market budget: the spend plan the round
 * exists to fund. It is a plan input rather than a function of the raise, so the
 * funding requirement stays a subtraction instead of a search.
 *
 * `marketAccounts` is the market ceiling: the accounts you could plausibly serve
 * at all. Without it, a model with positive unit economics compounds without
 * bound, because reinvesting revenue into acquisition is a *stock* growing a
 * *stock* — the arithmetic produces billion-dollar revenue in year three and the
 * document becomes fiction. Acquisition tapers as the base approaches the
 * ceiling, which is how growth actually behaves, and the plan reports how much of
 * the market you reach. This is the first number to replace with your own.
 *
 * `verify` names the reading that replaces each figure with a real one. None of
 * these are facts about your business; they are the shape of a business in your
 * category, and the generated document labels them that way.
 */
export const MODEL_ASSUMPTIONS = {
  'b2b-saas': {
    infraPerActive: 1.6,
    supportPerActive: 2.4,
    monthlyChurn: 0.022,
    payingShare: 0.35,
    costPerAccount: 340,
    organicPerMonth: 6,
    smBase: 2500,
    smReinvest: 0.22,
    adminMonthly: 900,
    toolingPerHead: 120,
    seedAsk: 2_000_000,
    marketAccounts: 12_000,
    gtmPlanMonthly: 50_000,
    verify: 'Your own cohort data, plus G2 or Capterra category pages for the range',
  },
  'consumer-app': {
    infraPerActive: 0.04,
    supportPerActive: 0.06,
    monthlyChurn: 0.085,
    payingShare: 0.05,
    costPerAccount: 1.4,
    organicPerMonth: 120,
    smBase: 3000,
    smReinvest: 0.2,
    adminMonthly: 500,
    toolingPerHead: 60,
    seedAsk: 1_500_000,
    marketAccounts: 400_000,
    gtmPlanMonthly: 37_500,
    verify: 'Your own paywall conversion once you have 500 installs, plus platform store economics',
  },
  agency: {
    infraPerActive: 0.5,
    supportPerActive: 6,
    monthlyChurn: 0.04,
    payingShare: 1,
    costPerAccount: 32000,
    organicPerMonth: 2,
    smBase: 1500,
    smReinvest: 0.12,
    adminMonthly: 1400,
    toolingPerHead: 150,
    seedAsk: 250_000,
    marketAccounts: 400,
    gtmPlanMonthly: 6_250,
    verify: 'Your own win rate and referral share, tracked per qualified proposal',
  },
  ecommerce: {
    infraPerActive: 0.9,
    supportPerActive: 2.5,
    monthlyChurn: 0.06,
    payingShare: 1,
    costPerAccount: 95,
    organicPerMonth: 60,
    smBase: 4000,
    smReinvest: 0.2,
    adminMonthly: 700,
    toolingPerHead: 90,
    seedAsk: 500_000,
    marketAccounts: 60_000,
    gtmPlanMonthly: 12_500,
    verify: 'Landed cost per unit and your own ad account, not an industry average',
  },
  fintech: {
    infraPerActive: 6,
    supportPerActive: 45,
    monthlyChurn: 0.012,
    payingShare: 0.5,
    costPerAccount: 3590,
    organicPerMonth: 1,
    smBase: 3000,
    smReinvest: 0.18,
    adminMonthly: 2500,
    toolingPerHead: 200,
    seedAsk: 3_000_000,
    marketAccounts: 1_200,
    gtmPlanMonthly: 75_000,
    verify: 'Public card network rate tables, and your own compliance cost per account',
  },
  health: {
    infraPerActive: 2.2,
    supportPerActive: 9,
    monthlyChurn: 0.03,
    payingShare: 0.6,
    costPerAccount: 170,
    organicPerMonth: 15,
    smBase: 2500,
    smReinvest: 0.18,
    adminMonthly: 1500,
    toolingPerHead: 110,
    seedAsk: 2_000_000,
    marketAccounts: 25_000,
    gtmPlanMonthly: 50_000,
    verify: 'Your own no-show and adherence data, plus public payment data at openpaymentsdata.cms.gov',
  },
  education: {
    infraPerActive: 1.4,
    supportPerActive: 7,
    monthlyChurn: 0.05,
    payingShare: 0.35,
    costPerAccount: 1440,
    organicPerMonth: 12,
    smBase: 3000,
    smReinvest: 0.2,
    adminMonthly: 900,
    toolingPerHead: 80,
    seedAsk: 750_000,
    marketAccounts: 3_000,
    gtmPlanMonthly: 18_750,
    verify: 'Your own cohort completion and placement numbers, with the survey method disclosed',
  },
  marketplace: {
    infraPerActive: 1.2,
    supportPerActive: 3.5,
    monthlyChurn: 0.045,
    payingShare: 0.3,
    costPerAccount: 228,
    organicPerMonth: 25,
    smBase: 3500,
    smReinvest: 0.22,
    adminMonthly: 900,
    toolingPerHead: 100,
    seedAsk: 1_500_000,
    marketAccounts: 30_000,
    gtmPlanMonthly: 37_500,
    verify: 'Your own fill rate and take rate in a single market before expanding',
  },
  'ai-tool': {
    infraPerActive: 6.5,
    supportPerActive: 2.5,
    monthlyChurn: 0.035,
    payingShare: 0.12,
    costPerAccount: 15.4,
    organicPerMonth: 80,
    smBase: 2500,
    smReinvest: 0.25,
    adminMonthly: 900,
    toolingPerHead: 140,
    seedAsk: 2_000_000,
    marketAccounts: 60_000,
    gtmPlanMonthly: 50_000,
    verify: 'Your own metered cost per successful task, which is the only number that matters here',
  },
  nonprofit: {
    infraPerActive: 0.8,
    supportPerActive: 2,
    monthlyChurn: 0.045,
    payingShare: 1,
    costPerAccount: 309,
    organicPerMonth: 8,
    smBase: 1200,
    smReinvest: 0.12,
    adminMonthly: 1200,
    toolingPerHead: 70,
    seedAsk: 750_000,
    marketAccounts: 20_000,
    gtmPlanMonthly: 10_000,
    verify: 'Your own donor retention and cost-to-raise-a-dollar from audited statements',
  },
  'local-service': {
    infraPerActive: 0.6,
    supportPerActive: 11,
    monthlyChurn: 0.035,
    payingShare: 1,
    costPerAccount: 1030,
    organicPerMonth: 20,
    smBase: 2500,
    smReinvest: 0.15,
    adminMonthly: 1600,
    toolingPerHead: 90,
    seedAsk: 200_000,
    marketAccounts: 6_000,
    gtmPlanMonthly: 5_000,
    verify: 'Your own missed-call rate and job book, by channel, over one quarter',
  },
};

// A missing industry would silently fall back to a software-shaped plan, which
// is exactly the generic advice this module exists to avoid.
for (const key of Object.keys(MARKET_RESEARCH)) {
  if (!MODEL_ASSUMPTIONS[key]) throw new Error(`no model assumptions for industry ${key}`);
}

/** The three scenarios are the same model with shifted inputs, nothing more. */
export const SCENARIOS = {
  conservative: {
    key: 'conservative',
    label: 'Conservative',
    note: 'Acquisition costs more than you expect, customers leave faster, and you hire later.',
    churnMultiplier: 1.3,
    costMultiplier: 1.25,
    organicMultiplier: 0.6,
    smMultiplier: 0.7,
    hireShiftMonths: 4,
    deployMultiplier: 0.8,
  },
  base: {
    key: 'base',
    label: 'Base',
    note: 'The plan you would actually commit to: stated assumptions, no optimism added.',
    churnMultiplier: 1,
    costMultiplier: 1,
    organicMultiplier: 1,
    smMultiplier: 1,
    hireShiftMonths: 0,
    deployMultiplier: 1,
  },
  ambitious: {
    key: 'ambitious',
    label: 'Ambitious',
    note: 'Word of mouth works, the channel is cheaper than modelled, and hires happen on time.',
    churnMultiplier: 0.8,
    costMultiplier: 0.85,
    organicMultiplier: 1.4,
    smMultiplier: 1.3,
    hireShiftMonths: -2,
    deployMultiplier: 1.15,
  },
};

const round2 = (value) => Math.round(value * 100) / 100;
const clampInt = (value) => Math.max(0, Math.round(value));

/** Monthly cost of a role, burdened, rounded to whole dollars. */
export function roleMonthlyCost(role, fraction = 1) {
  const entry = ROLES[role];
  if (!entry) throw new Error(`unknown role ${role}`);
  return Math.round((entry.annual / 12) * EMPLOYER_BURDEN * fraction);
}

/**
 * The blended monthly price a paying customer pays.
 *
 * Built from the same three pricing tiers the website publishes, so the plan and
 * the pricing page can never disagree. Where the entry tier is free, the blend is
 * over paying customers only — weighting a $0 tier into ARPU is the single most
 * common way a generated model produces nonsense.
 *
 * @param {number[]} points [entry, mid, high] monthly prices
 */
export function blendedArpu(points) {
  const [entry, mid, high] = points.map((value) => Number(value) || 0);
  if (entry > 0) return round2(entry * 0.5 + mid * 0.4 + high * 0.1);
  return round2(mid * 0.72 + high * 0.28);
}

function rolesAt(scenario, months = PLAN_HORIZON_MONTHS) {
  return HIRE_SCHEDULE.filter((entry) => entry.month < months).map((entry) => ({
    role: entry.role,
    month: Math.max(0, entry.month + scenario.hireShiftMonths),
  }));
}

/**
 * Run the model.
 *
 * One month at a time, in order, reading only the month before it. That is what
 * makes the output auditable: every row can be checked by hand against the row
 * above it.
 *
 * @param {object} input
 * @param {object} input.assumptions one entry from MODEL_ASSUMPTIONS
 * @param {number} input.arpuMonthly blended price per paying customer
 * @param {object} input.scenario    one entry from SCENARIOS
 * @param {number} [input.startCash] cash on day one, normally the raise
 * @param {number} [input.months]
 * @returns {{months: Array, summary: object, assumptions: object}}
 */
export function runModel(input) {
  const {
    assumptions,
    arpuMonthly,
    scenario,
    startCash = 0,
    months = PLAN_HORIZON_MONTHS,
  } = input;

  const churn = assumptions.monthlyChurn * scenario.churnMultiplier;
  const costPerAccount = assumptions.costPerAccount * scenario.costMultiplier;
  const organic = assumptions.organicPerMonth * scenario.organicMultiplier;
  const smBase = assumptions.smBase * scenario.smMultiplier;
  const ceiling = Math.max(1, assumptions.marketAccounts);
  // The planned budget, not a function of the raise: see DEPLOYMENT above.
  const gtmPerMonth = assumptions.gtmPlanMonthly * scenario.deployMultiplier;
  const hires = rolesAt(scenario, months);

  // Founder-led work wins the first handful of accounts before any spend does.
  let active = clampInt(organic * 1.5);
  let cash = round2(startCash);
  // Two different quantities, and conflating them was a real bug: `peakDrawdown`
  // is the deepest point of the cash *balance* (which depends on how much was
  // raised), while `cumulativeLow` is the deepest point of cumulative net cash,
  // which does not. The funding requirement comes from the second, because a
  // plan needs the money it consumes, not the money it happens to hold.
  let peakDrawdown = 0;
  let cumulative = 0;
  let cumulativeLow = 0;
  let minCash = round2(startCash);
  let totalRevenue = 0;
  let breakEvenMonth = null;
  let firstProfitableMonth = null;
  const rows = [];

  for (let month = 1; month <= months; month += 1) {
    const previous = rows[rows.length - 1] || null;
    const deploying = month <= DEPLOYMENT.gtmMonths;
    const smSpend = Math.round(
      smBase + (previous?.revenue || 0) * assumptions.smReinvest + (deploying ? gtmPerMonth : 0),
    );
    const paidAccounts = Math.floor(smSpend / costPerAccount);
    // Logistic taper: the accounts you can still win shrink as you approach the
    // market ceiling, so the base approaches it instead of passing it.
    const saturation = Math.max(0, 1 - active / ceiling);
    const newAccounts = clampInt((organic + paidAccounts) * saturation);
    const churned = clampInt(active * churn);
    active = clampInt(active + newAccounts - churned);
    const paying = clampInt(active * assumptions.payingShare);

    const revenue = round2(paying * arpuMonthly);
    // Costs are per active account: the free tier costs money to serve, and the
    // model must show that rather than pretending only paying users exist.
    const infra = round2(active * assumptions.infraPerActive);
    const support = round2(active * assumptions.supportPerActive);
    const cogs = round2(infra + support);
    const grossProfit = round2(revenue - cogs);

    const staffed = hires.filter((entry) => entry.month < month);
    // The founder draws a reduced salary for six months; everyone else is at
    // their planning figure from the month they start.
    const payroll = staffed.reduce((sum, entry) => {
      const fraction = entry.role === 'Founder' && month <= 6 ? 0.6 : 1;
      return sum + roleMonthlyCost(entry.role, fraction);
    }, 0);
    const commission = round2(newAccounts * assumptions.payingShare * arpuMonthly * 0.05);
    const marketing = clampInt(smSpend + commission);
    const tooling = clampInt(staffed.length * assumptions.toolingPerHead);
    const opex = clampInt(payroll + marketing + tooling + assumptions.adminMonthly);

    const netCash = round2(grossProfit - opex);
    cash = round2(cash + netCash);
    cumulative = round2(cumulative + netCash);
    if (cash < peakDrawdown) peakDrawdown = cash;
    if (cash < minCash) minCash = cash;
    if (cumulative < cumulativeLow) cumulativeLow = cumulative;
    totalRevenue = round2(totalRevenue + revenue);
    if (breakEvenMonth === null && netCash > 0) breakEvenMonth = month;
    if (cash > 0 && firstProfitableMonth === null && month > 1) firstProfitableMonth = month;

    rows.push({
      month,
      label: monthLabel(month),
      activeCustomers: active,
      payingCustomers: paying,
      newAccounts,
      churnedAccounts: churned,
      arpu: arpuMonthly,
      revenue,
      infra,
      support,
      grossProfit,
      payroll: clampInt(payroll),
      marketing,
      tooling,
      admin: assumptions.adminMonthly,
      opex,
      netCash,
      cumulative,
      cash,
    });
  }

  const last = rows[rows.length - 1];
  const grossMargin = last.revenue > 0 ? round2(last.grossProfit / last.revenue) : 0;
  const lifetimeMonths = churn > 0 ? 1 / churn : months;
  const ltv = round2(arpuMonthly * grossMargin * lifetimeMonths);
  // The cost that matters: what it takes to win one *paying* customer, not one
  // account. Deriving it here keeps the ratio honest.
  const costPerPayingCustomer =
    assumptions.payingShare > 0 ? round2(costPerAccount / assumptions.payingShare) : costPerAccount;
  const monthlyContribution = arpuMonthly * grossMargin;
  const paybackMonths = monthlyContribution > 0 ? round2(costPerPayingCustomer / monthlyContribution) : null;

  return {
    months: rows,
    // Exposed exactly as the model used them, not re-rounded for display: a
    // rounded assumption is one a reader cannot reproduce the projection from,
    // and 0.022 churn displayed as 0.02 is the difference between two different
    // month-one numbers. Display formatting belongs in the renderers.
    assumptions: {
      arpuMonthly,
      churn,
      costPerAccount,
      costPerPayingCustomer,
      organicPerMonth: organic,
      smBase,
      gtmPerMonth: clampInt(gtmPerMonth),
      infraPerActive: assumptions.infraPerActive,
      supportPerActive: assumptions.supportPerActive,
      payingShare: assumptions.payingShare,
    },
    summary: {
      scenario: scenario.key,
      startingCash: round2(startCash),
      arpuMonthly,
      accountsMonthEnd: last.activeCustomers,
      payingCustomersMonthEnd: last.payingCustomers,
      mrrMonthEnd: last.revenue,
      arrMonthEnd: round2(last.revenue * 12),
      totalRevenue,
      netCashMonthEnd: last.netCash,
      cashMonthEnd: last.cash,
      breakEvenMonth,
      peakDrawdown: round2(peakDrawdown),
      minCash: round2(minCash),
      cumulativeLow: round2(cumulativeLow),
      fundingRequired: round2(Math.max(0, -cumulativeLow)),
      grossMargin,
      ltv,
      costPerAccount,
      costPerPayingCustomer,
      ltvToCac: costPerPayingCustomer > 0 ? round2(ltv / costPerPayingCustomer) : null,
      paybackMonths,
      lifetimeMonths: round2(lifetimeMonths),
      marketAccounts: ceiling,
      marketPct: round2((last.activeCustomers / ceiling) * 100) / 100,
      // Above this reinvestment rate, revenue-funded acquisition grows the base
      // faster than churn removes it, which is a self-sustaining loop rather than
      // a plan. Reported so the reader can see which side of it they are on.
      selfFundingLimit: paybackMonths ? round2(churn * paybackMonths) : null,
      selfFunded: paybackMonths ? assumptions.smReinvest <= churn * paybackMonths : false,
    },
  };
}

function monthLabel(index) {
  const year = Math.floor((index - 1) / 12) + 1;
  const month = ((index - 1) % 12) + 1;
  return `Y${year} M${String(month).padStart(2, '0')}`;
}

/** The monthly cost of the plan at its leanest: month one, before any hire. */
export function monthlyBurnAtStart(assumptions) {
  return clampInt(assumptions.adminMonthly + assumptions.smBase + roleMonthlyCost('Founder', 0.6));
}

/**
 * Decide what to ask for, and say whether the plan is funded at that level.
 *
 * The amount under test is the round being planned (from the intake, or the
 * industry's typical seed as a starting point) rather than the smallest amount
 * that merely survives — a plan that asks for the minimum to stay solvent is not
 * a plan, it is a slower way to fail. So this runs the plan at the amount under
 * test and reports what it would actually need:
 *
 *   * `funded: true`  — the round covers the plan's deepest cash position plus a
 *     buffer, and the surplus is reserve.
 *   * `funded: false` — the plan is underfunded at that amount. `recommended` is
 *     what it needs, and the document is generated around the recommended
 *     amount so the reader sees a plan that works rather than one that runs out
 *     of money in month nine.
 *
 * One pass, no iteration: the definition is stated, the arithmetic is checkable,
 * and there is no slowly-converging search whose output nobody can verify.
 */
export function fundingPlan(baseInput) {
  const asked = Math.max(RAISE_ROUNDING, baseInput.startCash || baseInput.assumptions.seedAsk);
  const buffer = monthlyBurnAtStart(baseInput.assumptions) * BUFFER_MONTHS;
  const askedRun = runModel({ ...baseInput, startCash: asked });
  // Exact, not a search: nothing in the model depends on how much was raised, so
  // start cash shifts the whole curve up by its own size and the requirement is
  // the deepest cumulative position plus the buffer.
  const required = round2(askedRun.summary.fundingRequired + buffer);
  const trough = askedRun.summary.fundingRequired;
  const funded = required <= asked;
  const amount = funded
    ? asked
    : Math.min(MAX_ASK, Math.ceil(Math.max(required, RAISE_ROUNDING) / RAISE_ROUNDING) * RAISE_ROUNDING);
  const run = funded ? askedRun : runModel({ ...baseInput, startCash: amount });
  // Re-derived from the documented run rather than trusted from the formula: if
  // the two ever disagree, the plan says so instead of shipping the gap.
  const verified = round2(run.summary.fundingRequired + buffer) <= amount;

  return {
    asked,
    amount,
    recommended: amount,
    funded,
    // Re-derived from the documented run rather than assumed from the formula:
    // if these ever disagree the plan says so instead of shipping the gap.
    verified,
    shortfall: Math.max(0, amount - asked),
    surplus: funded ? Math.max(0, asked - required) : 0,
    buffer,
    required: round2(required),
    cumulativeLow: askedRun.summary.cumulativeLow,
    askedRun,
    run,
    trough: round2(trough),
    note: funded
      ? `The plan consumes ${Math.round(trough).toLocaleString('en-US')} dollars before revenue covers costs, plus a three-month buffer of ${Math.round(buffer).toLocaleString('en-US')}: ${Math.round(required).toLocaleString('en-US')} against ${Math.round(asked).toLocaleString('en-US')} raised, leaving ${Math.round(Math.max(0, asked - required)).toLocaleString('en-US')} of reserve.`
      : `Underfunded by ${Math.round(amount - asked).toLocaleString('en-US')} dollars at the amount entered. The plan below is generated around ${Math.round(amount).toLocaleString('en-US')} so it does not run out of money mid-execution.`,
  };
}

/**
 * Sensitivity: what the plan looks like if one assumption is wrong.
 *
 * Each row moves a single input off the base case and reports the end state, so
 * a reader can see which assumption the plan is actually betting on. That is the
 * point of the table — not to produce a range, but to show which number matters.
 */
export function sensitivity(baseInput, baseRun) {
  const moves = [
    { key: 'churn-up', label: 'Customers leave 25% faster', apply: (s) => ({ ...s, churnMultiplier: s.churnMultiplier * 1.25 }) },
    { key: 'churn-down', label: 'Customers leave 25% slower', apply: (s) => ({ ...s, churnMultiplier: s.churnMultiplier * 0.75 }) },
    { key: 'cost-up', label: 'Acquisition costs 25% more', apply: (s) => ({ ...s, costMultiplier: s.costMultiplier * 1.25 }) },
    { key: 'cost-down', label: 'Acquisition costs 25% less', apply: (s) => ({ ...s, costMultiplier: s.costMultiplier * 0.75 }) },
  ];

  const rows = [
    {
      key: 'base',
      label: 'Base case, nothing changed',
      arrMonthEnd: baseRun.summary.arrMonthEnd,
      breakEvenMonth: baseRun.summary.breakEvenMonth,
      cashMonthEnd: baseRun.summary.cashMonthEnd,
      delta: 0,
    },
  ];

  for (const move of moves) {
    const run = runModel({ ...baseInput, scenario: move.apply(baseInput.scenario) });
    rows.push({
      key: move.key,
      label: move.label,
      arrMonthEnd: run.summary.arrMonthEnd,
      breakEvenMonth: run.summary.breakEvenMonth,
      cashMonthEnd: run.summary.cashMonthEnd,
      delta: round2(run.summary.arrMonthEnd - baseRun.summary.arrMonthEnd),
    });
  }

  const worst = rows
    .slice(1)
    .reduce((acc, row) => (row.delta < acc.delta ? row : acc), rows[1]);
  return {
    rows,
    swingsOn: worst.label,
    worstDelta: worst.delta,
    note: 'Each row moves one input and holds everything else. The row that moves the end state most is the assumption to test first with real data — not the one that feels most uncertain.',
  };
}

/** How many paying customers it takes to reach a revenue milestone. */
export function customersForRevenue(target, arpuMonthly) {
  if (!(arpuMonthly > 0)) return null;
  return Math.ceil(target / (arpuMonthly * 12));
}

/**
 * Build the whole plan: model, scenarios, funding ask, and the prose sections as
 * data so the panel and the exported document render the same thing.
 *
 * @param {object} ctx the same context the other exporters use
 */
export function buildBusinessPlan(ctx) {
  const { intake, identity, brand, marketing, domains, dns, mailboxes, social, company } = ctx;
  const profile = identity.profile;
  const research = marketing.research;
  const assumptions = MODEL_ASSUMPTIONS[profile.key] || MODEL_ASSUMPTIONS['b2b-saas'];
  const pricePoints = marketing.pricing.points || [0, 49, 199];
  const arpu = blendedArpu(pricePoints);
  const oneOffCosts = startupCosts(ctx);

  const baseInput = { assumptions, arpuMonthly: arpu, scenario: SCENARIOS.base, startCash: 0 };
  const entered = Number(intake.raiseAmount) > 0;
  const sizing = fundingPlan({ ...baseInput, startCash: entered ? Number(intake.raiseAmount) : assumptions.seedAsk });
  const requestedRaise = sizing.amount;

  // Run every scenario with the amount actually being asked for, so the runway
  // and the ask agree with each other rather than with the placeholder.
  const runs = Object.values(SCENARIOS).map((scenario) => ({
    scenario,
    run: runModel({ ...baseInput, scenario, startCash: requestedRaise }),
  }));
  const funded = Object.fromEntries(runs.map((entry) => [entry.scenario.key, entry.run]));
  const baseRun = funded.base;
  const sensitivityTable = sensitivity({ ...baseInput, startCash: requestedRaise }, baseRun);
  const funds = useOfFunds(requestedRaise, runs);
  const milestone = customersForRevenue(1_000_000, arpu);
  const breakEven = breakEvenReport(baseRun);

  return {
    generatedAt: new Date().toISOString(),
    horizonMonths: PLAN_HORIZON_MONTHS,
    industry: profile.label,
    currency: 'USD',
    deployment: DEPLOYMENT,
    arpu,
    pricePoints,
    base: baseRun,
    scenarios: runs.map(({ scenario, run }) => ({
      key: scenario.key,
      label: scenario.label,
      note: scenario.note,
      arrMonthEnd: run.summary.arrMonthEnd,
      mrrMonthEnd: run.summary.mrrMonthEnd,
      payingCustomersMonthEnd: run.summary.payingCustomersMonthEnd,
      breakEvenMonth: run.summary.breakEvenMonth,
      cashMonthEnd: run.summary.cashMonthEnd,
      peakDrawdown: run.summary.peakDrawdown,
      grossMargin: run.summary.grossMargin,
      startingCash: run.summary.startingCash,
    })),
    assumptions: assumptionLines(assumptions, pricePoints, arpu, profile, baseRun),
    unitEconomics: unitEconomics(baseRun, arpu),
    sensitivity: sensitivityTable,
    breakEven,
    funding: {
      requested: requestedRaise,
      asked: sizing.asked,
      recommended: sizing.recommended,
      funded: sizing.funded,
      verified: sizing.verified,
      shortfall: sizing.shortfall,
      surplus: sizing.surplus,
      buffer: sizing.buffer,
      required: sizing.required,
      // The money the plan consumes on its own, before the buffer is added. The
      // panel shows it beside the sized need, so it has to be carried here: the
      // UI reads this object, not the sizing result behind it.
      trough: sizing.trough,
      cumulativeLow: sizing.cumulativeLow,
      entered,
      seedAsk: assumptions.seedAsk,
      note: sizing.note,
      peakDrawdown: baseRun.summary.peakDrawdown,
      runwayMonths: runwayMonths(baseRun),
      monthlyBurn: monthlyBurnAtStart(assumptions),
      useOfFunds: funds,
      terms: termsGuidance(profile, intake),
    },
    milestones: milestones(baseRun, requestedRaise, arpu),
    hiring: HIRE_SCHEDULE.map((entry) => ({
      month: entry.month,
      label: `M${entry.month}`,
      role: entry.role,
      annual: ROLES[entry.role].annual,
      monthly: roleMonthlyCost(entry.role),
      note: ROLES[entry.role].note,
    })),
    startupCosts: oneOffCosts,
    marketSizing: {
      arpu,
      customersFor1m: milestone,
      method:
        'Bottom-up, using your own price: (buyers you can reach this year) × (annual price). The only number to plug in is how many buyers you can actually reach.',
      note: 'Analyst market sizes are not used here on purpose: they are built on a definition of the category nobody sells into, and investors discount them. The arithmetic below uses only this plan\'s own price.',
      checkAgainst: research.whereToReadItYourself.map((source) => `${source.name} (${source.where})`).slice(0, 3),
      ceiling: assumptions.marketAccounts,
      penetrationAtEnd: baseRun.summary.marketPct,
      worked: [
        `At ${money(arpu)} per paying customer per month, $1M of annual revenue needs ${milestone} paying customers.`,
        `The base plan reaches ${baseRun.summary.payingCustomersMonthEnd} paying customers by month ${PLAN_HORIZON_MONTHS}.`,
        `That is ${Math.round((baseRun.summary.payingCustomersMonthEnd / milestone) * 100)}% of the way to $1M annual revenue on this trajectory.`,
        `The model caps the market at ${assumptions.marketAccounts.toLocaleString('en-US')} accounts, and the plan reaches ${Math.round(baseRun.summary.marketPct * 100)}% of it by month ${PLAN_HORIZON_MONTHS}.`,
      ],
      penetrationNote:
        baseRun.summary.marketPct > 0.5
          ? `Reaching ${Math.round(baseRun.summary.marketPct * 100)}% of the addressable market is the aggressive part of this plan, not the price or the channel. Either the ceiling is smaller than the real market, or this trajectory needs a second segment — check that number before anything else.`
          : 'Penetration stays in single or low double digits, which is the healthy shape: a plan that captures most of its market in three years is describing a market it has not sized honestly.',
    },
    // Prose goes through the article fixer at the point it is written, so the
    // plan reads as well as the rest of the generated copy and cannot emit "a AI
    // platform". Applied per string rather than over the document: running it
    // across markdown would rewrite things like "a [link]" inside table cells.
    sections: sections({
      ctx,
      arpu,
      baseRun,
      funded,
      research,
      requestedRaise,
      sizing,
      entered,
      oneOffCosts,
      funds,
      sensitivityRows: sensitivityTable.rows,
      milestone,
      breakEven,
    }).map((section) => ({
      ...section,
      paragraphs: section.paragraphs.map(withArticles),
      bullets: section.bullets ? section.bullets.map(withArticles) : section.bullets,
      table: section.table
        ? { ...section.table, rows: section.table.rows.map((row) => row.map((cell) => withArticles(String(cell)))) }
        : section.table,
    })),
    context: {
      name: identity.name,
      legalName: identity.legalName,
      tagline: identity.primaryTagline,
      positioning: identity.positioning,
      domain: domains.primaryDomain,
      mailboxes: (mailboxes.boxes || []).map((box) => box.address).slice(0, 3),
      mailboxCount: (mailboxes.boxes || []).length,
      entity: company.recommendation.entity.label,
      jurisdiction: company.recommendation.jurisdiction.name,
      archetype: identity.archetype.name,
      palette: { primary: brand.palette.primary, accent: brand.palette.accent },
      channels: (social.profiles || []).map((entry) => entry.platform).slice(0, 4),
      dnsRecords: (dns.records || []).length,
    },
  };
}

function money(value) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function runwayMonths(run) {
  const dry = run.months.find((row) => row.cash < 0);
  return dry ? dry.month - 1 : null;
}

/** The assumption table, with the derived number each line produces. */
function assumptionLines(assumptions, pricePoints, arpu, profile, baseRun) {
  const [entry, mid, high] = pricePoints;
  return {
    industry: profile.label,
    verify: assumptions.verify,
    lines: [
      { key: 'arpu', label: 'Blended price per paying customer', value: `${money(arpu)}/month`, basis: 'Built from the published pricing tiers and the paying-customer mix below.', verify: 'Your own invoices after the first ten customers' },
      { key: 'tiers', label: 'Published tiers', value: `${money(entry)} / ${money(mid)} / ${money(high)} per month`, basis: 'The same three tiers the website and pricing page use. The plan cannot quote different numbers.', verify: 'Your own plan mix after one quarter of sales' },
      { key: 'mix', label: 'Paying-customer mix', value: entry > 0 ? '50% entry / 40% middle / 10% top' : '72% middle / 28% top, free tier excluded', basis: 'Which tier most buyers choose. Weighting the free tier into this would understate revenue.', verify: 'Your own plan mix after one quarter' },
      { key: 'churn', label: 'Monthly churn', value: `${(assumptions.monthlyChurn * 100).toFixed(1)}% of active accounts`, basis: 'A planning rate for the category, not a measurement of your product. It sets customer lifetime, and lifetime sets LTV.', verify: assumptions.verify },
      { key: 'payingShare', label: 'Share of active accounts that pay', value: `${Math.round(assumptions.payingShare * 100)}%`, basis: 'Costs are charged to every account; revenue only comes from paying ones. This gap is what freemium actually costs.', verify: 'Your own funnel, once you have a cohort to watch' },
      { key: 'costPerAccount', label: 'Cost to win an active account', value: money(assumptions.costPerAccount), basis: `Divided by the paying share, that is ${money(baseRun.summary.costPerPayingCustomer)} per paying customer — the figure LTV must be compared against.`, verify: 'Your own ad account and outbound data, per channel' },
      { key: 'organic', label: 'Founder-led accounts per month', value: `${assumptions.organicPerMonth}`, basis: 'Work you do yourself before any budget: talks, posts, direct outreach.', verify: 'Your own pipeline, counted weekly' },
      { key: 'infra', label: 'Infrastructure per active account', value: `${money(assumptions.infraPerActive)}/month`, basis: 'Charged per account rather than as a share of revenue, because free accounts still cost money to serve.', verify: 'Your own infrastructure bill divided by active accounts' },
      { key: 'support', label: 'Support per active account', value: `${money(assumptions.supportPerActive)}/month`, basis: 'Support scales with accounts, not with revenue, and it is a cost of goods rather than overhead.', verify: 'Your own support hours per 100 accounts' },
      { key: 'sm', label: 'Standing marketing budget', value: `${money(assumptions.smBase)}/month`, basis: 'Before any capital deployment. Grows with revenue at the reinvestment rate below.', verify: 'Your own channel plan and what each channel actually costs' },
      { key: 'reinvest', label: 'Revenue reinvested in acquisition', value: `${Math.round(assumptions.smReinvest * 100)}% of the previous month`, basis: 'Keeps growth funded from revenue, not from the raise alone.', verify: 'Your own CAC payback once you have 12 months of data' },
      { key: 'gtmPlan', label: 'Planned go-to-market budget', value: `${money(assumptions.gtmPlanMonthly)}/month for ${DEPLOYMENT.gtmMonths} months`, basis: DEPLOYMENT.note + ' The round exists to fund this line and the hire schedule.', verify: 'Your own plan once the first channel has measurable payback' },
      { key: 'payroll', label: 'Payroll planning figures', value: `${Object.keys(ROLES).length} roles, ${money(ROLES['Founding engineer'].annual)}–${money(ROLES['Second engineer'].annual)} base, plus ${Math.round((EMPLOYER_BURDEN - 1) * 100)}% burden`, basis: 'US planning figures for a small team, staged by the hire schedule.', verify: 'BLS Occupational Employment and Wage Statistics (bls.gov/oes) for your metro' },
      { key: 'admin', label: 'Fixed monthly overhead', value: `${money(assumptions.adminMonthly)}/month`, basis: 'Accounting, legal, insurance, software and bank fees.', verify: 'Your own bank statement after three months' },
      { key: 'market', label: 'Reachable accounts (market ceiling)', value: `${assumptions.marketAccounts.toLocaleString('en-US')} accounts`, basis: 'Higher offers taper as the base approaches it. Without a ceiling the model compounds without bound and the document becomes fiction.', verify: 'This is the first number to replace: count the buyers you can name, in the sources listed under market sizing' },
    ],
    note: 'Every line above is an assumption, and the plan is only as good as the first one you replace with real data. The whole model recomputes from these inputs, so changing one number changes every table.',
  };
}

function unitEconomics(run, arpu) {
  const s = run.summary;
  return [
    { metric: 'Blended price per paying customer', value: `${money(arpu)}/month`, note: 'The input every other line depends on.' },
    { metric: 'Gross margin', value: `${Math.round(s.grossMargin * 100)}%`, note: 'Computed from per-account infrastructure and support, not asserted.' },
    { metric: 'Customer lifetime', value: `${s.lifetimeMonths} months`, note: 'The reciprocal of monthly churn at the modelled rate.' },
    { metric: 'Lifetime value', value: money(s.ltv), note: 'Price × gross margin × lifetime. Same churn figure as the projection.' },
    { metric: 'Cost per paying customer', value: money(s.costPerPayingCustomer), note: `Cost per account (${money(s.costPerAccount)}) divided by the paying share.` },
    { metric: 'LTV:CAC', value: s.ltvToCac ? `${s.ltvToCac}:1` : '—', note: 'Below 3:1, fix retention or price before scaling spend.' },
    { metric: 'CAC payback', value: s.paybackMonths ? `${s.paybackMonths} months` : '—', note: 'Target under 12 months self-serve, under 18 with a sales team.' },
  ];
}

/**
 * Use of funds, derived from what the plan actually spends rather than typed in.
 *
 * Payroll, go-to-market, product cost and overhead are summed over the horizon
 * from the base run, normalised to the ask, and the rounding drift is applied to
 * the last bucket so the dollars sum exactly to the amount raised.
 */
function useOfFunds(requested, runs) {
  const baseRun = (runs.find((entry) => entry.scenario.key === 'base') || runs[0]).run;
  const sum = (pick) => baseRun.months.reduce((total, row) => total + pick(row), 0);
  const raw = [
    { key: 'team', label: 'Team (payroll, burdened)', dollars: sum((row) => row.payroll), why: 'The largest line in almost every plan, and the one that decides how fast you can execute.' },
    { key: 'gtm', label: 'Go to market', dollars: sum((row) => row.marketing), why: 'Channel spend and commission. Fund it only where CAC payback is measured.' },
    { key: 'product', label: 'Product and infrastructure', dollars: sum((row) => row.infra + row.support), why: 'Infrastructure and support per active account — the costs that scale with customers.' },
    { key: 'operations', label: 'Operations, legal and tooling', dollars: sum((row) => row.tooling + row.admin), why: 'Accounting, insurance, legal filings, software and bank fees.' },
  ];
  const total = raw.reduce((acc, bucket) => acc + bucket.dollars, 0) || 1;
  const buckets = raw.map((bucket) => {
    const dollars = Math.round((bucket.dollars / total) * requested);
    return { ...bucket, dollars, share: requested > 0 ? Math.round((dollars / requested) * 1000) / 10 : 0 };
  });
  const drift = requested - buckets.reduce((acc, bucket) => acc + bucket.dollars, 0);
  buckets[buckets.length - 1].dollars += drift;
  buckets[buckets.length - 1].share = requested > 0 ? Math.round((buckets[buckets.length - 1].dollars / requested) * 1000) / 10 : 0;

  return {
    total: requested,
    horizonMonths: baseRun.months.length,
    buckets,
    note: 'Derived from what this plan spends over the horizon and normalised to the amount raised, so the dollars add up to the ask and the shares to 100%.',
    rules: [
      'Fund the milestone, not the runway: name what the money buys and when.',
      'Hold at least three months of payroll untouched. Plans miss; that is the buffer for missing.',
      'Do not spend the round on headcount before the channel that will feed them is measured.',
    ],
  };
}

function termsGuidance(profile, intake) {
  const bootstrapping = intake.raising === false;
  return {
    instrument: bootstrapping
      ? 'No equity instrument is needed if you are not raising. If you later take friends-and-family money, a post-money SAFE keeps it simple and defers the valuation question.'
      : 'A post-money SAFE — or a priced seed round if an investor insists on a board seat — is the standard instrument at this stage. Keep the stack boring: one instrument, one valuation cap, one discount rate.',
    range: 'Raise 18–24 months of this plan\'s spend. Less forces a raise mid-execution; more dilutes you before the story is proven.',
    rules: [
      'Never give a valuation number before you hear theirs.',
      'Ask for the milestone you can prove, not the highest number you can justify.',
      'Dilution is permanently cheaper than a bridge round priced by someone else.',
      'Get the cap table, the IP assignment and the 83(b) election done before money moves.',
    ],
    profileNote: `Terms and norms in ${profile.label} vary by buyer and jurisdiction. This is the shape of the conversation, not advice — a lawyer who has closed rounds in your category should review the documents.`,
  };
}

function milestones(baseRun, raise, arpu) {
  const money1 = (value) => `$${Math.round(value).toLocaleString('en-US')}`;
  const monthOf = (predicate) => baseRun.months.find(predicate)?.month ?? null;
  const items = [];
  const first = baseRun.months.find((row) => row.payingCustomers >= 1);
  items.push({
    at: first?.month || 1,
    milestone: 'First paying customer',
    detail: `The model has ${first?.payingCustomers || 0} paying customers in month ${first?.month || 1}.`,
    check: 'Money in the bank from someone who is not a friend.',
  });
  const ten = monthOf((row) => row.payingCustomers >= 10);
  if (ten) {
    items.push({
      at: ten,
      milestone: 'Ten paying customers',
      detail: 'Enough to see a pattern in who buys and why. Interview all ten.',
      check: 'Ten customers in one segment, not ten across five.',
    });
  }
  const hundredK = monthOf((row) => row.revenue * 12 >= 100_000);
  if (hundredK) {
    items.push({
      at: hundredK,
      milestone: '$100k annual run rate',
      detail: `Reached in month ${hundredK} with ${baseRun.months[hundredK - 1].payingCustomers} paying customers.`,
      check: 'Two channels producing customers, not one.',
    });
  }
  if (baseRun.summary.breakEvenMonth) {
    items.push({
      at: baseRun.summary.breakEvenMonth,
      milestone: 'Cash-flow break-even',
      detail: `Month ${baseRun.summary.breakEvenMonth} is the first month where gross profit covers operating costs.`,
      check: 'Break-even held for two consecutive months before you believe it.',
    });
  }
  const million = customersForRevenue(1_000_000, arpu);
  items.push({
    at: baseRun.months.length,
    milestone: `On the path to $1M annual revenue (${million} paying customers at this price)`,
    detail:
      baseRun.summary.payingCustomersMonthEnd >= million
        ? `The base plan passes $1M annual revenue inside the horizon and ends at ${money1(baseRun.summary.arrMonthEnd)} annualised.`
        : `The base plan ends at ${money1(baseRun.summary.arrMonthEnd)} annualised, so $1M sits beyond this horizon on these assumptions — which is the honest answer.`,
    check: 'Raise or reinvest from strength, not from a shortfall.',
  });
  items.push({
    at: 18,
    milestone: raise > 0 ? `Series A readiness after the ${money1(raise)} round` : 'Series A readiness, if you raise',
    detail: 'Investors want a repeatable channel, net revenue retention above 100%, and a team that has shipped without you.',
    check: 'You can name the one channel that will produce next year\'s customers.',
  });
  return items;
}

/** One-off costs to reach a first customer. Industry-aware, and deliberately short. */
function startupCosts(ctx) {
  const { company, identity } = ctx;
  return [
    { item: `Formation filing in ${company.recommendation.jurisdiction.name}`, cost: '$90–500', note: 'Plus a registered agent, typically $50–300 a year.' },
    { item: 'Legal documents', cost: '$0–2,500', note: 'The drafted packet covers the papers; a lawyer reviews them if you have co-founders or raise.' },
    { item: 'Domain and mailboxes', cost: '$15–40/mo', note: `${ctx.domains.primaryDomain} plus the Oasis mail plan generated with this project.` },
    { item: 'Trademark filing', cost: '$250–750 per class', note: 'Screen first; file once the name has survived a month of use.' },
    { item: 'Insurance', cost: '$500–2,500 a year', note: identity.profile.key === 'health' ? 'Professional liability is not optional in health.' : 'General liability, plus professional liability if you handle client data.' },
    { item: 'First three months of tooling', cost: '$0–300/mo', note: 'Analytics, error monitoring, email and the accounting stack.' },
  ];
}

/**
 * Break-even, and what to do when the horizon runs out first.
 *
 * "Not in horizon" is the least useful thing a plan can say: it tells the reader
 * a number is missing without telling them how far off it is. So the terminal
 * month is read back and reported as a monthly gap, translated into the thing the
 * reader can change — customers at the modelled price, or the cost base that has
 * to come down to meet the revenue this plan reaches.
 */
export function breakEvenReport(run) {
  const last = run.months[run.months.length - 1];
  const month = run.summary.breakEvenMonth;

  if (month) {
    return {
      reached: true,
      month,
      monthEnd: last.month,
      gap: 0,
      note: `Gross profit covers operating costs from month ${month}. It is the first month the plan stops consuming cash, not the month it becomes interesting — hold it for two consecutive months before believing it.`,
      detail: `Break-even arrives in month ${month}, and it is worth seeing what carries it: gross profit has to clear the whole operating cost base, payroll included, on the revenue in the table above. Every hire scheduled after that month still has to be absorbed, so the second month matters more than the first.`,
    };
  }

  const gap = round2(last.opex - last.grossProfit);
  // The terminal gross margin, not a per-row field: margin lives on the summary.
  const revenueNeeded = run.summary.grossMargin > 0 ? round2(last.opex / run.summary.grossMargin) : null;
  const payingNeeded =
    revenueNeeded && run.assumptions.arpuMonthly > 0 ? Math.ceil(revenueNeeded / run.assumptions.arpuMonthly) : null;
  const accountsNeeded =
    payingNeeded && run.assumptions.payingShare > 0 ? Math.ceil(payingNeeded / run.assumptions.payingShare) : null;
  const shortBy = payingNeeded ? payingNeeded - last.payingCustomers : null;

  return {
    reached: false,
    month: null,
    monthEnd: last.month,
    gap,
    revenue: last.revenue,
    grossProfit: last.grossProfit,
    opex: last.opex,
    revenueNeeded,
    payingCustomersNeeded: payingNeeded,
    accountsNeeded,
    payingCustomersAtEnd: last.payingCustomers,
    shortBy,
    // One sentence for the executive summary and the risk list, and the same
    // arithmetic spelled out for the financial section: the same paragraph in
    // both places reads as padding, which is how readers learn to skim.
    note:
      `The plan does not cover its own costs inside the horizon: month ${last.month} still runs ${money(gap)} short.` +
      (payingNeeded
        ? ` Closing that at the modelled price takes about ${payingNeeded.toLocaleString('en-US')} paying customers — ${shortBy.toLocaleString('en-US')} more than the ${last.payingCustomers.toLocaleString('en-US')} this plan ends with — or the same cut in the cost base, or more time. Decide which before the money runs out: a plan that plateaus below its own cost base is not a plan, it is a subsidy.`
        : ''),
    detail:
      `Break-even is missing, and it is worth seeing why rather than taking it on faith. At month ${last.month} the plan bills ${money(last.revenue)} at a ${Math.round(run.summary.grossMargin * 100)}% gross margin, which leaves ${money(last.grossProfit)} of gross profit to cover ${money(last.opex)} of operating cost — a shortfall of ${money(gap)} for that month.` +
      (revenueNeeded
        ? ` Revenue that covers the same cost base is ${money(revenueNeeded)} a month, or ${payingNeeded.toLocaleString('en-US')} paying customers at ${money(run.assumptions.arpuMonthly)} each, ${shortBy.toLocaleString('en-US')} more than this plan reaches. The alternatives are a lower cost base — the largest line is payroll, so the hire schedule is the lever — or a price above ${money(run.assumptions.arpuMonthly)}, or simply a longer horizon. The model cannot choose between them; the first cohort's data can.`
        : ''),
  };
}

/**
 * The plan's prose, as data.
 *
 * Everything the sentences need arrives as an argument — the numbers are
 * computed once in `buildBusinessPlan` and rendered here. Recomputing inside the
 * prose is how a document ends up quoting a figure its own tables contradict.
 */
function sections({ ctx, arpu, baseRun, funded, research, requestedRaise, sizing, entered, oneOffCosts, funds, sensitivityRows, milestone, breakEven }) {
  const { intake, identity, marketing, company, domains, mailboxes } = ctx;
  const profile = identity.profile;
  const conservative = funded.conservative.summary;
  const ambitious = funded.ambitious.summary;
  const base = baseRun.summary;
  const founderCount = 1 + (Number(intake.cofounders) || 0);
  const runway = runwayMonths(baseRun);

  return [
    {
      id: 'executive-summary',
      heading: 'Executive summary',
      paragraphs: [
        `${identity.name} is a ${marketing.slots.category} for ${marketing.slots.audience}. ${identity.positioning}`,
        `We are raising ${money(requestedRaise)} to reach ${money(base.arrMonthEnd)} of annual recurring revenue and ${base.payingCustomersMonthEnd} paying customers within ${baseRun.months.length} months, on the assumptions listed in this plan.`,
        `The model is arithmetic on stated inputs, not a forecast: ${money(arpu)} per paying customer per month, ${(baseRun.assumptions.churn * 100).toFixed(1)}% monthly churn, and ${money(baseRun.assumptions.costPerPayingCustomer)} to win a paying customer. On those numbers the plan ${base.breakEvenMonth ? `breaks even in month ${base.breakEvenMonth}` : 'reaches cash-flow break-even beyond this horizon'}, and the conservative case ends at ${money(conservative.arrMonthEnd)} annual revenue against ${money(ambitious.arrMonthEnd)} in the ambitious case.`,
        // A plan that never covers its own costs inside the horizon has to say so
        // here rather than in a footnote: it changes what the raise is for.
        ...(breakEven.reached ? [] : [breakEven.note]),
        `The plan needs ${founderCount === 1 ? 'one founder' : `${founderCount} founders`}, ${HIRE_SCHEDULE.length - 1} staged hires, and ${domains.primaryDomain} with working mailboxes from week one. Everything else is either a document this project already produced or an assumption you are expected to replace.`,
      ],
    },
    {
      id: 'problem',
      heading: 'The problem',
      paragraphs: [
        `In ${research.analystCategory}, ${profile.problem}.`,
        `${marketing.slots.audience} feel it as wasted hours, avoidable errors and decisions taken on stale information. It rarely appears as a line item, which is why it survives for years: nobody owns the cost, so nobody removes it.`,
      ],
      bullets: [
        `Who hurts: ${marketing.slots.audience}.`,
        `What it costs them: ${profile.problem}.`,
        `Why it persists: ${profile.alt} is already installed, and the workaround is free at the point of use.`,
        'What triggers a decision: the buying triggers in the market research section — the same events that make this sellable.',
      ],
    },
    {
      id: 'solution',
      heading: 'The solution',
      paragraphs: [
        `${identity.name} gives ${marketing.slots.audience} ${profile.outcome}, sold as ${profile.pricingModel}.`,
        identity.promise,
      ],
      bullets: [
        `Category: ${profile.category}.`,
        `The promise: ${profile.outcome}.`,
        `The proof we will publish: ${profile.proof.join('; ')}.`,
        'What we are deliberately not building: anything adjacent to the first customer\'s job. Scope is the most common way a plan like this dies.',
      ],
    },
    {
      id: 'market',
      heading: 'Market analysis',
      paragraphs: [
        `We sell into ${research.analystCategory}, to ${marketing.slots.audience}.`,
        research.definition,
        research.benchmarkNote,
      ],
      table: {
        title: 'Who you are up against',
        headers: ['Competitor shape', 'What they win on', 'Where they lose'],
        rows: research.competitorShapes.map((shape) => [shape.shape, shape.whatTheyWinOn, shape.whereTheyLose]),
      },
      bullets: [
        ...research.demandSignals.map((signal) => `Signal to measure: ${signal}`),
        `Read the primary sources yourself: ${research.whereToReadItYourself.map((source) => source.name).join(', ')}.`,
      ],
    },
    {
      id: 'market-sizing',
      heading: 'Market sizing, bottom-up',
      paragraphs: [
        `At ${money(arpu)} per paying customer per month, $1M of annual revenue needs ${milestone} paying customers. That is the only market size that matters before you have a customer.`,
        'We do not quote analyst market sizes. They are built on definitions of a category nobody sells into, investors discount them, and quoting one signals that you have not yet found your first buyer.',
      ],
      bullets: [
        `Replace the buyer count with a number you can defend: buyers reachable this year × ${money(arpu * 12)} annual price.`,
        `Base plan reaches ${base.payingCustomersMonthEnd} paying customers by month ${baseRun.months.length} — ${Math.round((base.payingCustomersMonthEnd / milestone) * 100)}% of the way to $1M annual revenue.`,
        `Market ceiling: ${baseRun.summary.marketAccounts.toLocaleString('en-US')} accounts, and the plan reaches ${Math.round(baseRun.summary.marketPct * 100)}% of it. ${baseRun.summary.marketPct > 0.5 ? 'That is the aggressive assumption in this plan — test it first.' : 'Growth tapers as it approaches the ceiling rather than passing it.'}`,
        `Validate the buyer count against: ${research.whereToReadItYourself.slice(0, 3).map((source) => `${source.name} (${source.where})`).join('; ')}.`,
      ],
    },
    {
      id: 'business-model',
      heading: 'Business model',
      paragraphs: [
        `Revenue is ${profile.pricingModel}. The blended price is ${money(arpu)} per paying customer per month, built from the three published tiers and the mix in the assumptions.`,
        `Cost of goods is charged per active account — ${money(baseRun.assumptions.infraPerActive)} of infrastructure and ${money(baseRun.assumptions.supportPerActive)} of support each month — because only ${Math.round(baseRun.assumptions.payingShare * 100)}% of accounts pay. That gives a computed gross margin of ${Math.round(base.grossMargin * 100)}%. We compute it rather than assert it, because a plan claiming 80% margin while serving free accounts at a real cost is worse than no plan.`,
      ],
      table: {
        title: 'Unit economics',
        headers: ['Metric', 'Value', 'How it is derived'],
        rows: [
          ['Blended price', `${money(arpu)}/month`, 'Published pricing tiers × paying-customer mix'],
          ['Monthly churn', `${(baseRun.assumptions.churn * 100).toFixed(1)}%`, 'Category planning rate — replace with your cohort data'],
          ['Customer lifetime', `${base.lifetimeMonths} months`, '1 ÷ monthly churn'],
          ['Gross margin', `${Math.round(base.grossMargin * 100)}%`, 'Computed from per-account infrastructure and support'],
          ['Lifetime value', money(base.ltv), 'Price × gross margin × lifetime'],
          ['Cost per paying customer', money(base.costPerPayingCustomer), `Cost per account (${money(base.costPerAccount)}) ÷ paying share`],
          ['LTV:CAC', base.ltvToCac ? `${base.ltvToCac}:1` : '—', 'Target above 3:1 before scaling spend'],
          ['CAC payback', base.paybackMonths ? `${base.paybackMonths} months` : '—', 'Target under 12 months self-serve'],
        ],
      },
    },
    {
      id: 'go-to-market',
      heading: 'Go-to-market plan',
      paragraphs: [
        `We start with ${research.beachhead.wedge} — ${research.beachhead.whyNow}`,
        `The first channel is founder-led: cheapest to start, and the only one that teaches you the language your buyers use. It becomes the second channel once the messaging stops changing.`,
      ],
      table: {
        title: 'Channels in priority order',
        headers: ['Channel', 'Effort', 'Impact', 'First step'],
        rows: marketing.channels.slice(0, 5).map((channel) => [channel.channel, channel.effort, channel.impact, channel.firstStep]),
      },
      bullets: [
        `First ninety days: ${marketing.gtm.calendar.slice(0, 4).map((week) => `week ${week.week} — ${week.focus}`).join('; ')}.`,
        `Launch: ${marketing.launch.distribution.slice(0, 4).join(', ')}.`,
        'What we will stop: any channel that has not produced a paying customer inside eight weeks.',
      ],
    },
    {
      id: 'operations',
      heading: 'Operations and team',
      paragraphs: [
        `The company is ${company.recommendation.entity.label} in ${company.recommendation.jurisdiction.name}, which matters to the plan because investors and banks will ask, and because the entity decides how the first hires are paid and how equity is granted.`,
        `${founderCount === 1 ? 'A single founder' : `${founderCount} founders`} plus ${HIRE_SCHEDULE.length - 1} staged hires. Each hire is tied to a milestone rather than a month: the schedule below is the model's, and it shifts in every scenario.`,
        `Day-one infrastructure is ${domains.primaryDomain} with ${(mailboxes.boxes || []).length} mailboxes on the Oasis plan, and the static site in this bundle with analytics installed before any acquisition spend.`,
      ],
      table: {
        title: 'Hiring plan',
        headers: ['Month', 'Role', 'Annual (planning)', 'Monthly, burdened'],
        rows: HIRE_SCHEDULE.map((entry) => [`M${entry.month}`, entry.role, money(ROLES[entry.role].annual), money(roleMonthlyCost(entry.role))]),
      },
      bullets: [
        ...oneOffCosts.map((entry) => `${entry.item}: ${entry.cost}. ${entry.note}`),
        'Outsource bookkeeping and payroll from month one. It is cheaper than the first accounting mistake.',
      ],
    },
    {
      id: 'financial-plan',
      heading: 'Financial plan',
      paragraphs: [
        `The projection runs ${baseRun.months.length} months, one month at a time. New accounts come from marketing spend divided by the cost per account plus founder-led work; accounts churn at the modelled rate; only the paying share produces revenue; costs are charged to every account. Each row can be checked by hand against the row above it.`,
        `Base case: ${money(base.mrrMonthEnd)} of monthly recurring revenue in month ${baseRun.months.length} (${money(base.arrMonthEnd)} annualised), ${base.payingCustomersMonthEnd} paying customers from ${base.accountsMonthEnd} accounts, ${money(base.totalRevenue)} of cumulative revenue, and ${money(base.cashMonthEnd)} of cash left. ${runway ? `Cash dips below zero in month ${runway}, which is the gap the raise closes.` : 'Cash stays positive through the whole horizon at this level of funding.'}`,
        `The conservative case ends at ${money(conservative.arrMonthEnd)} annualised and the ambitious case at ${money(ambitious.arrMonthEnd)}. The spread between them is the honest uncertainty in the plan, and it comes from churn and acquisition cost rather than from a growth-rate guess.`,
        breakEven.reached
          ? `Break-even arrives in month ${breakEven.month}. The plan is not asking anyone to believe in a number it does not compute.`
          : breakEven.detail,
      ],
      table: {
        title: 'Scenarios at a glance',
        headers: ['Scenario', 'ARR at end', 'Paying customers', 'Gross margin', 'Break-even', 'Cash at end'],
        rows: [
          ['Conservative', money(conservative.arrMonthEnd), String(conservative.payingCustomersMonthEnd), `${Math.round(conservative.grossMargin * 100)}%`, conservative.breakEvenMonth ? `M${conservative.breakEvenMonth}` : 'Not in horizon', money(conservative.cashMonthEnd)],
          ['Base', money(base.arrMonthEnd), String(base.payingCustomersMonthEnd), `${Math.round(base.grossMargin * 100)}%`, base.breakEvenMonth ? `M${base.breakEvenMonth}` : 'Not in horizon', money(base.cashMonthEnd)],
          ['Ambitious', money(ambitious.arrMonthEnd), String(ambitious.payingCustomersMonthEnd), `${Math.round(ambitious.grossMargin * 100)}%`, ambitious.breakEvenMonth ? `M${ambitious.breakEvenMonth}` : 'Not in horizon', money(ambitious.cashMonthEnd)],
        ],
      },
    },
    {
      id: 'sensitivity',
      heading: 'Sensitivity: what the plan is betting on',
      paragraphs: [
        'Each row below moves a single assumption and holds everything else, so the plan names the number it actually depends on instead of hiding behind a range.',
        `On these assumptions the end state swings most on: ${sensitivityRows[1] && sensitivityRows[1].delta <= (sensitivityRows[2]?.delta ?? 0) ? sensitivityRows[1].label : sensitivityRows[2]?.label || 'acquisition cost'}.`,
      ],
      table: {
        title: 'One assumption at a time',
        headers: ['Change', 'ARR at end', 'Break-even', 'Cash at end', 'Effect on ARR'],
        rows: sensitivityRows.map((row) => [
          row.label,
          money(row.arrMonthEnd),
          row.breakEvenMonth ? `M${row.breakEvenMonth}` : 'Not in horizon',
          money(row.cashMonthEnd),
          row.delta === 0 ? '—' : `${row.delta > 0 ? '+' : '−'}${money(Math.abs(row.delta))}`,
        ]),
      },
    },
    {
      id: 'risks',
      heading: 'Risks and mitigations',
      paragraphs: [
        'A plan without risks reads as either dishonest or unread. These are the ones that actually threaten this business, each with the trigger that tells you the risk has arrived.',
      ],
      bullets: [
        `Acquisition costs more than modelled. Trigger: ${money(baseRun.assumptions.costPerPayingCustomer)} per paying customer is not achievable in the first channel. Response: cut spend to the one channel with measured payback and fix the message before adding budget.`,
        `Customers leave faster than modelled. Trigger: monthly churn above ${(baseRun.assumptions.churn * 100).toFixed(1)}% for two consecutive months. Response: stop acquisition spend and fix onboarding until the cohort flattens.`,
        `The first market is too small. Trigger: fewer than ${milestone} reachable buyers after qualifying the list. Response: move to ${research.beachhead.expansion}.`,
        `A compliance or platform change removes the channel. Trigger: a policy, licensing or API change at ${research.whereToReadItYourself[0]?.name || 'your primary source'}. Response: keep a second channel warm with a small standing budget.`,
        ...(breakEven.reached
          ? []
          : [
              `The plan never covers its own costs inside the horizon. Trigger: month ${breakEven.monthEnd} still spends ${money(breakEven.gap)} more than it earns in gross profit. Response: raise the price, cut the cost base, or extend the runway — and decide which on the first cohort's data, not at the point the cash runs low.`,
            ]),
        ...research.objections.slice(0, 2).map((entry) => `${entry.objection} Trigger: hearing it twice in discovery. Response: ${entry.answer}`),
      ],
    },
    {
      id: 'funding',
      heading: 'Funding request and use of funds',
      paragraphs: [
        `We are asking for ${money(requestedRaise)}.`,
        sizing.funded
          ? `Cash never falls below ${money(base.minCash)} on this plan, so ${money(requestedRaise)} covers the whole horizon plus a three-month buffer of ${money(sizing.buffer)}${sizing.surplus > 0 ? `, leaving ${money(sizing.surplus)} of reserve` : ''}.` +
            // A round far larger than the plan can deploy does not accelerate the
            // model, so the document says that rather than implying the money works
            // harder than the spend plan lets it.
            (sizing.required > 0 && sizing.surplus > sizing.required
              ? ` That is more than the plan can deploy: the spend plan is fixed, so the surplus sits in the bank rather than buying growth, and the round would be sized to the market's expectation rather than to this plan. Say so before an investor does.`
              : '')
          : `At ${money(sizing.asked)} the plan runs out of money mid-execution: the deepest cash position is ${money(sizing.askedRun.summary.peakDrawdown)}. It needs ${money(sizing.recommended)}, which is ${money(sizing.shortfall)} more, and the tables above are generated around that amount.`,
        entered
          ? 'You supplied the amount under test. The figure this plan needs is shown alongside it, so you can compare what you want to raise with what the plan requires.'
          : `No amount was entered, so the plan starts from the ${money(sizing.asked)} that ${identity.profile.label} rounds typically raise and funds that plan rather than the minimum to survive.`,
        'The money buys a specific milestone rather than time: the revenue and customer count in the milestones section, plus one repeatable channel. If the milestone moves, the raise should move with it.',
        DEPLOYMENT.note,
      ],
      table: {
        title: 'Use of funds',
        headers: ['Bucket', 'Share', 'Amount', 'Why'],
        rows: funds.buckets.map((bucket) => [bucket.label, `${bucket.share}%`, money(bucket.dollars), bucket.why]),
      },
      bullets: funds.rules,
    },
  ];
}

/** Headline numbers for the panel and the exported summary. */
export function planHighlights(plan) {
  const base = plan.base.summary;
  return [
    { label: 'ARR at horizon', value: money(base.arrMonthEnd), sub: `Base case, month ${plan.horizonMonths}` },
    { label: 'Paying customers', value: String(base.payingCustomersMonthEnd), sub: `${base.accountsMonthEnd} active accounts` },
    {
      label: 'Break-even',
      value: base.breakEvenMonth ? `Month ${base.breakEvenMonth}` : 'Beyond horizon',
      sub: plan.breakEven.reached
        ? 'First month gross profit covers costs'
        : `${money(plan.breakEven.gap)} a month short at month ${plan.breakEven.monthEnd}`,
    },
    {
      label: 'Funding need',
      value: money(plan.funding.recommended),
      sub: plan.funding.funded
        ? 'The plan in this document is funded, with a three-month buffer'
        : `Raise this to fund the plan; ${money(plan.funding.shortfall)} more than entered`,
    },
    { label: 'LTV:CAC', value: base.ltvToCac ? `${base.ltvToCac}:1` : '—', sub: 'Target above 3:1' },
    { label: 'CAC payback', value: base.paybackMonths ? `${base.paybackMonths} mo` : '—', sub: 'Target under 12 months' },
  ];
}

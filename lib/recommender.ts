import fs from "node:fs";
import path from "node:path";
import {
  Card,
  CardSchema,
  FREQUENCY_MULTIPLIER,
  Portfolio,
  Recommendation,
  SpendCategory,
  SPEND_CATEGORIES,
  UserProfile,
} from "./types";

function loadAllCards(): Card[] {
  const dir = path.join(process.cwd(), "data");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith("cards.json"))
    // cards.json (the generic curated set) is the base layer; issuer-official
    // files (hdfc_cards.json, hsbc_cards.json, ...) load AFTER and override
    // entries with the same id.
    .sort((a, b) => {
      if (a === "cards.json") return -1;
      if (b === "cards.json") return 1;
      return a.localeCompare(b);
    });

  const byId = new Map<string, Card>();
  const sourceOf = new Map<string, string>();
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (!Array.isArray(raw)) continue;
    for (const entry of raw) {
      try {
        const card = applyRealismGuards(CardSchema.parse(entry));
        if (isGarbageCard(card)) continue;
        byId.set(card.id, card);
        sourceOf.set(card.id, f);
      } catch (e) {
        console.warn(`[recommender] skipping invalid card in ${f}:`, (e as Error).message);
      }
    }
  }
  if (process.env.NODE_ENV !== "production") {
    const summary: Record<string, number> = {};
    for (const f of sourceOf.values()) summary[f] = (summary[f] ?? 0) + 1;
    console.log("[recommender] loaded cards by source:", summary);
  }
  return Array.from(byId.values());
}

// ── Data-quality guards for auto-normalized cards ───────────────────────────
// 197 of the 227 cards come from LLM-normalized HTML scrapes. Garbage values are
// common: 50% base rates, ₹15 crore welcome bonuses, generic names like "CLASSIC
// Credit Card". We apply realistic upper bounds at load time — any field above its
// industry-plausible ceiling is treated as a parsing error and clamped (not used
// to dominate ranking).
const MAX_REALISTIC_BASE_RATE = 2;          // % — no Indian card baseline exceeds 2%
const MAX_REALISTIC_RULE_RATE = 12;         // % — capped specials top out around 10%
const MAX_REALISTIC_WELCOME_INR = 25000;    // ₹ — real max for sub-₹15K-fee cards
const MAX_REALISTIC_MILESTONE_INR = 15000;  // ₹ per tier
const HIGH_RATE_THRESHOLD = 5;              // % — anything above this without a cap gets one
const FALLBACK_ANNUAL_CAP_INR = 6000;       // ~₹500/month — industry baseline

// Premium-tier cards (Diners, Infinia, Reserve, Magnus, Zenith, etc.) almost never
// have ₹0 fee in India. If the data claims so, it's a normalization error — flag
// these as "suspect free" so the LTF filter excludes them and the displayed fee is
// not misleadingly 0.
const PREMIUM_TIER_PATTERNS: RegExp[] = [
  /\bdiners\s*club\b/i,
  /\binfinia\b/i,
  /\breserve\b/i,
  /\bmagnus\b/i,
  /\bzenith\b/i,
  /\bburgundy\b/i,
  /\baura\b/i,
  /\beterna\s+premium\b/i,
  /\bpinnacle\b/i,
  /\bemeralde\b/i,
  /\bplatinum\s+plus\b/i,
  /\bworld\s+(elite|premier)\b/i,
];
const SYNTHETIC_PREMIUM_FEE_INR = 5000; // conservative floor for unverified premium cards
function isPremiumTierName(name: string): boolean {
  return PREMIUM_TIER_PATTERNS.some((re) => re.test(name));
}

function applyRealismGuards(card: Card): Card {
  const fixed: Card = {
    ...card,
    rules: card.rules
      .map((r) => ({ ...r }))
      // Drop rules with patently impossible rates (>12% — almost certainly mis-parsed
      // "10X reward points" misread as percentage).
      .filter((r) => r.rate <= MAX_REALISTIC_RULE_RATE),
    milestones: card.milestones.map((m) => ({
      ...m,
      rewardInr: Math.min(m.rewardInr, MAX_REALISTIC_MILESTONE_INR),
    })),
    baseRewardRate: Math.min(card.baseRewardRate, MAX_REALISTIC_BASE_RATE),
    welcomeBenefitInr: Math.min(card.welcomeBenefitInr, MAX_REALISTIC_WELCOME_INR),
  };

  // Cap any uncapped 5%+ rule at a realistic annual reward (industry pattern).
  for (const r of fixed.rules) {
    if (r.rate > HIGH_RATE_THRESHOLD && r.monthlyCap === undefined && r.annualCap === undefined) {
      r.annualCap = FALLBACK_ANNUAL_CAP_INR;
    }
  }

  // Suspect-free premium cards: if name screams "premium tier" but fee is ₹0, the
  // normalization missed the real fee. Apply a synthetic floor so it doesn't pretend
  // to be LTF and doesn't unfairly outrank truly-LTF cards.
  if (
    isPremiumTierName(fixed.name) &&
    fixed.annualFee === 0 &&
    fixed.joiningFee === 0
  ) {
    fixed.joiningFee = SYNTHETIC_PREMIUM_FEE_INR;
    fixed.annualFee = SYNTHETIC_PREMIUM_FEE_INR;
  }
  return fixed;
}

// ── Garbage-card detection ──────────────────────────────────────────────────
// Some auto-normalized entries are extraction failures: names like "Reserve Credit
// Card", "CLASSIC Credit Card", "Platinum Credit Card" — these are tier words pulled
// out of a generic page with no real product attached. Drop them entirely.
const GARBAGE_NAME_PATTERNS: RegExp[] = [
  /^(reserve|classic|platinum|standard|gold|premium|silver|select|signature|titanium)( credit card)?$/i,
  /^credit card$/i,
  /^(rewards|cashback|lifestyle|travel)( credit card)?$/i,
  // URL-slug names: "idfc_millennia_credit_card_apply_page", anything with underscores
  // mid-name, or words like "apply page", "page", "form", "details".
  /_/,
  /\b(apply page|landing page|details page|form|brochure)\b/i,
];
function isGarbageCard(card: Card): boolean {
  if (GARBAGE_NAME_PATTERNS.some((re) => re.test(card.name.trim()))) return true;
  // A card with no rules AND no realistic base rate AND no welcome contributes nothing.
  if (
    card.rules.length === 0 &&
    card.baseRewardRate <= 0 &&
    card.welcomeBenefitInr <= 0 &&
    card.loungeAccessInr <= 0
  ) {
    return true;
  }
  return false;
}

// ── Restricted-eligibility detection ────────────────────────────────────────
// Some issuer cards are only available to specific groups (defense forces, doctors,
// students, salaried-with-specific-employers). The normalized data doesn't tag these,
// so we infer from the card name. Excluded by default; user can opt in.
const RESTRICTED_NAME_PATTERNS: RegExp[] = [
  /assam rifles/i,
  /indian army/i,
  /yoddha/i,
  /coast guard/i,
  /rakshamah/i,
  /sentinel/i,
  /varunah/i,
  /\bnavy\b/i,
  /air ?force/i,
  /defen[sc]e/i,
  /paramilitary/i,
  /\bcrpf\b|\bcisf\b|\bbsf\b|\bitbp\b|\bssb\b/i,
  /\bpolice\b/i,
  /doctor['’]?s?\b/i,
  /\bmedical professional/i,
  /chartered accountant/i,
  /\bca\s+(card|club)/i,
  /\bicai\b/i,
  /\bicsi\b/i,
  /\bicmai\b|\bicwai\b/i,
  /\bcma\b/i,
  /lawyer/i,
  /teacher/i,
  /\bnri\b/i,
  /\bbusiness\b.*\b(visa|mastercard|rupay|amex|diners)/i, // SME-only
  /\bcorporate\b/i,
  /signature.*invite/i,
  /\binvite[- ]only\b/i,
  // Regional/rural bank affinity cards
  /\bbggb\b|\bbupb\b|\bbrkgb\b|nainital bank|pragati/i,
];
function isRestrictedCard(card: Card): boolean {
  if (card.eligibility?.inviteOnly) return true;
  return RESTRICTED_NAME_PATTERNS.some((re) => re.test(card.name));
}

export const ALL_CARDS: Card[] = loadAllCards();

export function getCardById(id: string): Card | undefined {
  return ALL_CARDS.find((c) => c.id === id);
}

type SpendMap = Partial<Record<SpendCategory, number>>;

function annualSpendFromProfile(profile: UserProfile): SpendMap {
  const out: SpendMap = {};
  for (const cat of SPEND_CATEGORIES) {
    const v = profile.monthlySpend?.[cat] ?? 0;
    if (v > 0) {
      const freq = profile.spendFrequency?.[cat] ?? "monthly";
      out[cat] = v * FREQUENCY_MULTIPLIER[freq];
    }
  }
  // add one-off events (only those that can be paid by card or upi if RuPay-enabled card present)
  for (const ev of profile.oneOffEvents ?? []) {
    // We treat events as spend in the chosen mode; routing decides the card.
    // For simplicity, we add to upi_p2m if upi_only, else to "other".
    const target: SpendCategory =
      ev.paymentMode === "upi_only" || ev.paymentMode === "cash_or_upi"
        ? "upi_p2m"
        : "other";
    out[target] = (out[target] ?? 0) + ev.amount;
  }
  return out;
}

interface CategoryBest {
  cardId: string;
  rate: number; // effective % at this slot
  ruleIdx: number;
}

/**
 * For a given annual spend map, compute the maximum reward value achievable by
 * routing each category's spend to one of the candidate cards, respecting per-rule
 * monthly/annual caps. Greedy by descending rate per category — works well because
 * rules are independent across cards once a card is included.
 *
 * Returns rewardValue + per-card category routing (₹ amount per cat assigned to card).
 */
function routeSpendAcrossCards(
  cards: Card[],
  annualSpend: SpendMap
): {
  rewardValue: number;
  perCard: Record<string, { reward: number; routing: Partial<Record<SpendCategory, number>> }>;
} {
  const perCard: Record<string, { reward: number; routing: Partial<Record<SpendCategory, number>>; capRemaining: Map<number, number> }> = {};
  for (const c of cards) {
    perCard[c.id] = {
      reward: 0,
      routing: {},
      capRemaining: new Map(),
    };
    c.rules.forEach((r, i) => {
      const cap =
        r.annualCap !== undefined
          ? r.annualCap
          : r.monthlyCap !== undefined
          ? r.monthlyCap * 12
          : Infinity;
      perCard[c.id].capRemaining.set(i, cap);
    });
  }

  let totalReward = 0;

  for (const cat of Object.keys(annualSpend) as SpendCategory[]) {
    let remaining = annualSpend[cat] ?? 0;
    if (remaining <= 0) continue;

    // Build candidate (card, rule) options for this category, plus base rate fallback.
    type Opt = { cardId: string; rate: number; ruleIdx: number; cap: number };
    const opts: Opt[] = [];
    for (const c of cards) {
      if (c.excludedCategories.includes(cat)) continue;
      // upi_p2m only valid on rupay+upiEnabled
      if (cat === "upi_p2m" && !(c.network === "rupay" && c.upiEnabled)) continue;
      type BestRule = { rate: number; ruleIdx: number; cap: number };
      let bestRule: BestRule | null = null;
      c.rules.forEach((r, i) => {
        if (!r.categories.includes(cat)) return;
        const capLeft = perCard[c.id].capRemaining.get(i) ?? Infinity;
        if (capLeft <= 0) return;
        const cur: BestRule | null = bestRule;
        if (!cur || r.rate > cur.rate) {
          bestRule = { rate: r.rate, ruleIdx: i, cap: capLeft };
        }
      });
      const br = bestRule as BestRule | null;
      if (br) {
        opts.push({ cardId: c.id, rate: br.rate, ruleIdx: br.ruleIdx, cap: br.cap });
      } else {
        // base rate (no cap)
        opts.push({ cardId: c.id, rate: c.baseRewardRate, ruleIdx: -1, cap: Infinity });
      }
    }
    if (opts.length === 0) continue;
    opts.sort((a, b) => b.rate - a.rate);

    for (const opt of opts) {
      if (remaining <= 0) break;
      // amount this option can absorb: min(remaining, cap/rate*100)
      const maxByCap = opt.cap === Infinity ? remaining : (opt.cap * 100) / Math.max(opt.rate, 0.01);
      const take = Math.min(remaining, maxByCap);
      if (take <= 0) continue;
      const reward = (take * opt.rate) / 100;
      perCard[opt.cardId].reward += reward;
      perCard[opt.cardId].routing[cat] = (perCard[opt.cardId].routing[cat] ?? 0) + take;
      if (opt.ruleIdx >= 0) {
        const cur = perCard[opt.cardId].capRemaining.get(opt.ruleIdx) ?? Infinity;
        if (cur !== Infinity) perCard[opt.cardId].capRemaining.set(opt.ruleIdx, cur - reward);
      }
      remaining -= take;
      totalReward += reward;
    }
  }

  // Strip capRemaining before returning
  const out: Record<string, { reward: number; routing: Partial<Record<SpendCategory, number>> }> = {};
  for (const id in perCard) {
    out[id] = { reward: perCard[id].reward, routing: perCard[id].routing };
  }
  return { rewardValue: totalReward, perCard: out };
}

function milestoneValueForCard(card: Card, totalSpendOnCard: number): number {
  // award each milestone whose threshold is met (treat them as cumulative tiers, max-only)
  const sorted = [...card.milestones].sort((a, b) => b.spendThreshold - a.spendThreshold);
  for (const m of sorted) {
    if (totalSpendOnCard >= m.spendThreshold) return m.rewardInr;
  }
  return 0;
}

function effectiveAnnualFee(card: Card, totalSpendOnCard: number): number {
  if (card.feeWaiverSpend !== undefined && totalSpendOnCard >= card.feeWaiverSpend) {
    return 0;
  }
  return card.annualFee;
}

// Welcome bonuses are one-time; amortize over 3 years so they don't dominate year-1 ranking.
const WELCOME_AMORTIZATION_YEARS = 3;

// Lounge cash-equivalent only counts if the user actually travels (or explicitly asked for lounge).
function loungeCountsForProfile(profile: UserProfile, annualSpend: SpendMap): boolean {
  if (profile.preferences?.requireLounge) return true;
  const travel =
    (annualSpend.flights_domestic ?? 0) +
    (annualSpend.flights_intl ?? 0) +
    (annualSpend.hotels_domestic ?? 0) +
    (annualSpend.hotels_intl ?? 0);
  return travel > 0;
}

function evaluatePortfolio(
  cards: Card[],
  profile: UserProfile,
  isFirstYear = true
): Portfolio {
  const annualSpend = annualSpendFromProfile(profile);
  const { perCard } = routeSpendAcrossCards(cards, annualSpend);
  const countLounge = loungeCountsForProfile(profile, annualSpend);

  // Display order: paid (differentiator) first, then LTF supplementary cards.
  // Within each group, higher fee first (heaviest commitment surfaces).
  const orderedCards = [...cards].sort((a, b) => b.annualFee - a.annualFee);

  const breakdown = orderedCards.map((c) => {
    const reward = perCard[c.id]?.reward ?? 0;
    const routing = perCard[c.id]?.routing ?? {};
    const totalSpendOnCard = Object.values(routing).reduce((s, v) => s + (v ?? 0), 0);
    const milestone = milestoneValueForCard(c, totalSpendOnCard);
    const welcome = isFirstYear ? c.welcomeBenefitInr / WELCOME_AMORTIZATION_YEARS : 0;
    const lounge = countLounge ? c.loungeAccessInr : 0;
    const fee = effectiveAnnualFee(c, totalSpendOnCard) + (isFirstYear ? c.joiningFee : 0);
    const net = reward + milestone + welcome + lounge - fee;
    return {
      cardId: c.id,
      rewardValue: round(reward),
      milestoneValue: round(milestone),
      welcomeValue: round(welcome),
      loungeValue: round(lounge),
      effectiveFee: round(fee),
      net: round(net),
      categoryRouting: routing as Record<SpendCategory, number>,
    };
  });

  const totalAnnualValue = round(
    breakdown.reduce((s, b) => s + b.rewardValue + b.milestoneValue + b.welcomeValue + b.loungeValue, 0)
  );
  const totalAnnualFee = round(breakdown.reduce((s, b) => s + b.effectiveFee, 0));
  const netSavings = round(totalAnnualValue - totalAnnualFee);

  return {
    cardIds: orderedCards.map((c) => c.id),
    totalAnnualValue,
    totalAnnualFee,
    netSavings,
    perCardBreakdown: breakdown,
  };
}

// A non-owned card is "pulling its weight" only if it adds at least this much net value.
// Otherwise it's filler — dropping it gives a cleaner, smaller portfolio.
const MIN_MARGINAL_NET_INR = 500;

function round(n: number): number {
  return Math.round(n);
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  const [head, ...rest] = arr;
  return [
    ...combinations(rest, k - 1).map((c) => [head, ...c]),
    ...combinations(rest, k),
  ];
}

export function recommend(profile: UserProfile): Recommendation {
  const ownedIds = new Set(profile.ownedCards.map((o) => o.cardId));
  const ownedCards = ALL_CARDS.filter((c) => ownedIds.has(c.id));
  let newCandidates = ALL_CARDS.filter((c) => !ownedIds.has(c.id));

  const prefs = profile.preferences ?? {};
  const maxNew = prefs.maxNewCards ?? 2;
  const maxFee = prefs.maxAnnualFee ?? 15000;
  const preferRupayUpi = prefs.preferRupayUpi ?? true;
  const preferLtf = prefs.preferLtf ?? false;
  const avoidCoBranded = prefs.avoidCoBranded ?? true;
  const requireLounge = prefs.requireLounge ?? false;

  // Filter candidates by user preferences (owned cards bypass these).
  // Restricted-eligibility cards (defense affinity, doctor-only, invite-only, etc.) are
  // always hidden — they aren't applicable to a general user, and the dataset doesn't
  // mark them explicitly. If a user already owns one, it stays.
  newCandidates = newCandidates.filter((c) => !isRestrictedCard(c));
  if (avoidCoBranded) {
    newCandidates = newCandidates.filter((c) => !c.isCoBranded);
  }
  if (preferLtf) {
    newCandidates = newCandidates.filter((c) => c.annualFee === 0 && c.joiningFee === 0);
  }
  if (requireLounge) {
    newCandidates = newCandidates.filter((c) => c.loungeAccessInr > 0);
  }
  // Strict RuPay toggle: ON → only RuPay+UPI; OFF → exclude all RuPay+UPI cards.
  if (preferRupayUpi) {
    newCandidates = newCandidates.filter(
      (c) => c.network === "rupay" && c.upiEnabled
    );
  } else {
    newCandidates = newCandidates.filter(
      (c) => !(c.network === "rupay" && c.upiEnabled)
    );
  }

  const annualSpend = annualSpendFromProfile(profile);
  const totalAnnualSpend = Object.values(annualSpend).reduce((s, v) => s + (v ?? 0), 0);

  const hasUpiSpend =
    (profile.monthlySpend.upi_p2m ?? 0) > 0 ||
    (profile.oneOffEvents ?? []).some(
      (e) => e.paymentMode === "upi_only" || e.paymentMode === "cash_or_upi"
    );
  const portfolioNeedsRupay = preferRupayUpi && hasUpiSpend;

  const portfolioHasRupayUpi = (cards: Card[]) =>
    cards.some((c) => c.network === "rupay" && c.upiEnabled);

  const ownedHasRupayUpi = portfolioHasRupayUpi(ownedCards);

  const portfolios: Portfolio[] = [];
  for (let k = 0; k <= maxNew; k++) {
    for (const combo of combinations(newCandidates, k)) {
      // First-year sticker cost = joining + annual (this is what the user
      // sees in the breakdown for year-1). Enforce the budget against this.
      const firstYearFee = (c: Card) => c.annualFee + c.joiningFee;
      const totalNewFee = combo.reduce((s, c) => s + firstYearFee(c), 0);
      if (totalNewFee > maxFee) continue;
      // Also block any single card whose first-year sticker cost (annual +
      // joining) exceeds the user's max-fee budget, even if a waiver could
      // reduce its effective fee to zero. "Max fee" = worst-case sticker.
      if (combo.some((c) => firstYearFee(c) > maxFee)) continue;
      const cards = [...ownedCards, ...combo];
      if (cards.length === 0) continue;
      // Enforce RuPay-UPI requirement if user has UPI spend AND preference is on
      if (portfolioNeedsRupay && !ownedHasRupayUpi && !portfolioHasRupayUpi(combo)) continue;

      const p = evaluatePortfolio(cards, profile);

      // ── Filler suppression ───────────────────────────────────────────────
      // Stops *LTF ride-along* cards from inflating multi-card portfolios just
      // because the slot is "free". Specifically: in portfolios of 2+ cards, an
      // *LTF* added card must contribute at least MIN_MARGINAL_NET_INR of net
      // value, otherwise it's filler and the leaner portfolio without it is
      // strictly better.
      //
      // We deliberately do NOT apply this to paid cards — if the user said
      // "max fee ₹6,000", a paid card is a deliberate choice. Let it compete on
      // its actual net merit (it may simply be ranked below LTF alternatives,
      // which is fine and visible to the user).
      //
      // Exception: a card that is the sole RuPay-UPI carrier needed for
      // upi_p2m coverage always passes.
      let pulledWeight = true;
      if (cards.length > 1 && totalAnnualSpend > 0) {
        for (const added of combo) {
          if (added.annualFee > 0) continue; // paid cards always compete on net merit
          const b = p.perCardBreakdown.find((x) => x.cardId === added.id);
          if (!b) continue;
          if (b.net >= MIN_MARGINAL_NET_INR) continue;
          const isOnlyRupay =
            portfolioNeedsRupay &&
            !ownedHasRupayUpi &&
            added.network === "rupay" &&
            added.upiEnabled &&
            combo.filter((c) => c.network === "rupay" && c.upiEnabled).length === 1;
          if (isOnlyRupay) continue;
          pulledWeight = false;
          break;
        }
      }
      if (!pulledWeight) continue;

      portfolios.push(p);
    }
  }

  // Sort: net desc → fewer cards → lower fee → deterministic id order
  portfolios.sort((a, b) => {
    if (b.netSavings !== a.netSavings) return b.netSavings - a.netSavings;
    if (a.cardIds.length !== b.cardIds.length) return a.cardIds.length - b.cardIds.length;
    if (a.totalAnnualFee !== b.totalAnnualFee) return a.totalAnnualFee - b.totalAnnualFee;
    return [...a.cardIds].sort().join(",").localeCompare([...b.cardIds].sort().join(","));
  });

  const seen = new Set<string>();
  const top: Portfolio[] = [];
  const pushUnique = (p: Portfolio) => {
    const key = [...p.cardIds].sort().join(",");
    if (seen.has(key)) return;
    seen.add(key);
    top.push(p);
  };

  // Dedupe first so all coverage passes work off the same unique pool.
  const uniquePortfolios: Portfolio[] = [];
  const uniqueSeen = new Set<string>();
  for (const p of portfolios) {
    const key = [...p.cardIds].sort().join(",");
    if (uniqueSeen.has(key)) continue;
    uniqueSeen.add(key);
    uniquePortfolios.push(p);
  }

  // Precompute helpers
  const cardLookup = new Map<string, Card>();
  for (const c of ALL_CARDS) cardLookup.set(c.id, c);
  const declaredFee = (p: Portfolio) =>
    p.cardIds.reduce((s, id) => s + (cardLookup.get(id)?.annualFee ?? 0), 0);
  const minIncome = (p: Portfolio) => {
    let m = 0;
    for (const id of p.cardIds) {
      const v = cardLookup.get(id)?.eligibility?.minMonthlySalaryInr ?? 0;
      if (v > m) m = v;
    }
    return m;
  };

  // 1) Net-savings winners (default ranking)
  for (const p of uniquePortfolios) {
    pushUnique(p);
    if (top.length >= 40) break;
  }
  // 2) Coverage for "Fee: high → low" — make sure the top-fee portfolios
  // (within the user's max-fee cap) are present even if they lose on net.
  const byFeeDesc = [...uniquePortfolios].sort(
    (a, b) => declaredFee(b) - declaredFee(a) || b.netSavings - a.netSavings
  );
  for (let i = 0; i < byFeeDesc.length && i < 30; i++) pushUnique(byFeeDesc[i]);
  // 3) Coverage for "Income: high → low" similarly
  const byIncomeDesc = [...uniquePortfolios].sort(
    (a, b) => minIncome(b) - minIncome(a) || b.netSavings - a.netSavings
  );
  for (let i = 0; i < byIncomeDesc.length && i < 30; i++) pushUnique(byIncomeDesc[i]);

  // ── Diversity guarantee for fee-budget mode ──────────────────────────────
  // When the user explicitly allows a fee budget (maxAnnualFee > 0), make sure
  // they see what their money buys — even if a pure-LTF combo wins on net.
  // Promote the best paid-card portfolio (one with totalAnnualFee > 0) into
  // top-2 if it's not already there.
  if (maxFee > 0) {
    const hasPaid = top.slice(0, 2).some((p) => p.totalAnnualFee > 0);
    if (!hasPaid) {
      const bestPaid = portfolios.find((p) => p.totalAnnualFee > 0);
      if (bestPaid) {
        const key = [...bestPaid.cardIds].sort().join(",");
        if (!seen.has(key)) {
          top.splice(1, 0, bestPaid);
          seen.add(key);
        }
      }
    }
  }

  const notes: string[] = [];
  if (portfolioNeedsRupay) {
    notes.push(
      "RuPay-only mode: recommendations are restricted to RuPay UPI-enabled cards. Toggle off to allow Visa / Mastercard / Amex / Diners suggestions."
    );
  } else if (preferRupayUpi === false) {
    notes.push(
      "RuPay excluded: turn this filter on if you need to pay UPI-only merchants (caterers, banquet halls, etc.) on credit."
    );
  }
  if (avoidCoBranded) {
    notes.push(
      "Co-branded cards are hidden (toggle off in Preferences to include them). General-purpose cards usually serve a wider range of spends."
    );
  }
  if (totalAnnualSpend === 0) {
    notes.push(
      "You entered ₹0 spend across all categories, so ranking is based purely on welcome bonus (amortized over 3 years), lounge access value, and annual fees — no category rewards are calculated. Add your real monthly spend on the previous step for a portfolio truly optimized to you."
    );
  }
  if (top.length === 0) {
    notes.push(
      "No portfolio adds at least ₹500 of net annual value over your owned cards. Try increasing max annual fee or max new cards — or your current cards may already be optimal."
    );
  }

  return {
    portfolios: top,
    notes,
    llmEnriched: false,
  };
}

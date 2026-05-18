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
        const card = CardSchema.parse(entry);
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

  const breakdown = cards.map((c) => {
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
    cardIds: cards.map((c) => c.id),
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

  // ── Zero-spend fallback ───────────────────────────────────────────────────
  // If the user has no spend at all (e.g. a student exploring), portfolio
  // optimization is meaningless. Rank single cards by general utility — purely
  // deterministic, no branded bias.
  if (totalAnnualSpend === 0 && ownedCards.length === 0) {
    const ranked = [...newCandidates].sort((a, b) => {
      const aLtf = a.annualFee === 0 && a.joiningFee === 0 ? 1 : 0;
      const bLtf = b.annualFee === 0 && b.joiningFee === 0 ? 1 : 0;
      if (aLtf !== bLtf) return bLtf - aLtf;
      if (a.isCoBranded !== b.isCoBranded) return a.isCoBranded ? 1 : -1;
      if (a.baseRewardRate !== b.baseRewardRate) return b.baseRewardRate - a.baseRewardRate;
      const aLounge = (a.loungeVisits?.domestic ?? 0) + (a.loungeVisits?.international ?? 0);
      const bLounge = (b.loungeVisits?.domestic ?? 0) + (b.loungeVisits?.international ?? 0);
      if (aLounge !== bLounge) return bLounge - aLounge;
      return a.id.localeCompare(b.id);
    });
    const top = ranked.slice(0, 5).map((c) => evaluatePortfolio([c], profile));
    return {
      portfolios: top,
      notes: [
        "Zero-spend mode: showing the most broadly useful starter cards. Enter your monthly/annual spend on the previous step to see portfolios optimized for you.",
      ],
      llmEnriched: false,
    };
  }

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
      const totalNewFee = combo.reduce((s, c) => s + c.annualFee, 0);
      if (totalNewFee > maxFee) continue;
      const cards = [...ownedCards, ...combo];
      if (cards.length === 0) continue;
      // Enforce RuPay-UPI requirement if user has UPI spend AND preference is on
      if (portfolioNeedsRupay && !ownedHasRupayUpi && !portfolioHasRupayUpi(combo)) continue;

      const p = evaluatePortfolio(cards, profile);

      // ── Filler suppression ───────────────────────────────────────────────
      // Every *added* card must contribute at least MIN_MARGINAL_NET_INR of
      // net value (reward + milestone + amortized welcome + lounge − fee).
      // The only exception is a card that's the sole RuPay-UPI carrier needed
      // for upi_p2m coverage. This kills "free filler card" bias toward
      // branded / IDFC LTFs that ride along for tiny incremental value.
      let pulledWeight = true;
      for (const added of combo) {
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
  for (const p of portfolios) {
    const key = [...p.cardIds].sort().join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    top.push(p);
    if (top.length >= 5) break;
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

import { recommend } from "../lib/recommender";
import type { UserProfile } from "../lib/types";

type Result = { ok: boolean; msg: string };

function check(label: string, cond: boolean, detail = ""): Result {
  return { ok: cond, msg: `${cond ? "✅" : "❌"} ${label}${detail ? " — " + detail : ""}` };
}

const baseSpend = {
  groceries: 8000,
  dining: 5000,
  fuel: 4000,
  online_shopping: 6000,
  utilities: 3000,
};

function run(label: string, prefs: any, spend: any = {}, owned: string[] = []) {
  const profile = {
    monthlySpend: spend,
    spendFrequency: {},
    ownedCards: owned.map((id) => ({ cardId: id })),
    oneOffEvents: [],
    preferences: prefs,
  } as unknown as UserProfile;
  const r = recommend(profile);
  const k = prefs.maxNewCards;
  const top = r.portfolios[0];

  const results: Result[] = [];
  if (r.portfolios.length === 0) {
    results.push(check("No portfolio (acceptable for tight filters)", true));
  } else {
    // Expected NEW cards = total - owned
    const ownedSet = new Set(owned);
    for (let i = 0; i < Math.min(3, r.portfolios.length); i++) {
      const p = r.portfolios[i];
      const newCount = p.cardIds.filter((id) => !ownedSet.has(id)).length;
      results.push(
        check(
          `[#${i}] new-card count == ${k}`,
          newCount === k,
          `actual ${newCount} | ${p.cardIds.join("+")}`
        )
      );
      // No duplicates
      const uniq = new Set(p.cardIds);
      results.push(check(`[#${i}] no duplicate cardIds`, uniq.size === p.cardIds.length));
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${label} (k=${k}) ===`);
  console.log(
    `  total portfolios: ${r.portfolios.length}` +
      (top ? ` | top: ${top.cardIds.length} cards, net ₹${top.netSavings}` : "")
  );
  for (const res of results) console.log("  " + res.msg);
  return { failed: failed.length, total: results.length };
}

let totalFails = 0;
let totalChecks = 0;

const FILTERS = [
  {
    name: "general (no co-branded, fee 1k–5k, no RuPay)",
    prefs: {
      maxAnnualFee: 4999,
      minAnnualFee: 1000,
      preferRupayUpi: false,
      preferLtf: false,
      avoidCoBranded: true,
      requireLounge: false,
    },
  },
  {
    name: "LTF only",
    prefs: {
      maxAnnualFee: 999,
      minAnnualFee: 0,
      preferRupayUpi: false,
      preferLtf: true,
      avoidCoBranded: true,
      requireLounge: false,
    },
  },
  {
    name: "RuPay only",
    prefs: {
      maxAnnualFee: 999,
      minAnnualFee: 0,
      preferRupayUpi: true,
      preferLtf: false,
      avoidCoBranded: true,
      requireLounge: false,
    },
  },
  {
    name: "Lounge required, fee 5k–10k",
    prefs: {
      maxAnnualFee: 9999,
      minAnnualFee: 5000,
      preferRupayUpi: false,
      preferLtf: false,
      avoidCoBranded: true,
      requireLounge: true,
    },
  },
  {
    name: "premium (fee 10k+)",
    prefs: {
      maxAnnualFee: 1000000,
      minAnnualFee: 10000,
      preferRupayUpi: false,
      preferLtf: false,
      avoidCoBranded: true,
      requireLounge: false,
    },
  },
];

for (const f of FILTERS) {
  for (let k = 1; k <= 5; k++) {
    const r = run(`${f.name}`, { ...f.prefs, maxNewCards: k }, baseSpend);
    totalFails += r.failed;
    totalChecks += r.total;
  }
}

// Owned-cards scenario
console.log("\n--- with owned cards ---");
for (let k = 1; k <= 3; k++) {
  const r = run(
    `owned hsbc_visa_platinum, no co-branded`,
    {
      maxNewCards: k,
      maxAnnualFee: 4999,
      minAnnualFee: 0,
      preferRupayUpi: false,
      preferLtf: false,
      avoidCoBranded: true,
      requireLounge: false,
    },
    baseSpend,
    ["hsbc_visa_platinum"]
  );
  totalFails += r.failed;
  totalChecks += r.total;
}

console.log(`\n\n========== ${totalChecks - totalFails}/${totalChecks} checks passed ==========`);
process.exit(totalFails === 0 ? 0 : 1);

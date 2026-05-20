import { recommend } from "../lib/recommender";
import { UserProfile } from "../lib/types";

const scenarios: { label: string; profile: UserProfile }[] = [
  {
    label: "Low spender (student-ish, ~₹6K/mo)",
    profile: {
      monthlySpend: { dining: 1000, groceries: 2000, online_shopping: 2000, utilities: 1000 },
      spendFrequency: {},
      ownedCards: [],
      oneOffEvents: [],
      preferences: { maxNewCards: 1, maxAnnualFee: 0, preferRupayUpi: false, preferLtf: false, avoidCoBranded: true, requireLounge: false },
    },
  },
  {
    label: "Mid spender, max fee ₹2,000",
    profile: {
      monthlySpend: { dining: 5000, groceries: 3000, fuel: 2000, utilities: 5000, online_shopping: 4000 },
      spendFrequency: {},
      ownedCards: [],
      oneOffEvents: [],
      preferences: { maxNewCards: 2, maxAnnualFee: 2000, preferRupayUpi: false, preferLtf: false, avoidCoBranded: true, requireLounge: false },
    },
  },
  {
    label: "Mid spender, max fee ₹6,000",
    profile: {
      monthlySpend: { dining: 5000, groceries: 3000, fuel: 2000, utilities: 5000, online_shopping: 4000 },
      spendFrequency: {},
      ownedCards: [],
      oneOffEvents: [],
      preferences: { maxNewCards: 2, maxAnnualFee: 6000, preferRupayUpi: false, preferLtf: false, avoidCoBranded: true, requireLounge: false },
    },
  },
  {
    label: "Mid spender, max fee ₹15,000",
    profile: {
      monthlySpend: { dining: 5000, groceries: 3000, fuel: 2000, utilities: 5000, online_shopping: 4000 },
      spendFrequency: {},
      ownedCards: [],
      oneOffEvents: [],
      preferences: { maxNewCards: 2, maxAnnualFee: 15000, preferRupayUpi: false, preferLtf: false, avoidCoBranded: true, requireLounge: false },
    },
  },
  {
    label: "High spender + travel, max fee ₹6,000",
    profile: {
      monthlySpend: { dining: 5000, groceries: 3000, fuel: 2000, utilities: 5000, online_shopping: 4000, flights_domestic: 30000, hotels_domestic: 30000 },
      spendFrequency: { flights_domestic: "annual", hotels_domestic: "annual" },
      ownedCards: [],
      oneOffEvents: [],
      preferences: { maxNewCards: 2, maxAnnualFee: 6000, preferRupayUpi: false, preferLtf: false, avoidCoBranded: true, requireLounge: false },
    },
  },
  {
    label: "High spender + travel, max fee ₹50,000",
    profile: {
      monthlySpend: { dining: 5000, groceries: 3000, fuel: 2000, utilities: 5000, online_shopping: 4000, flights_domestic: 30000, hotels_domestic: 30000 },
      spendFrequency: { flights_domestic: "annual", hotels_domestic: "annual" },
      ownedCards: [],
      oneOffEvents: [],
      preferences: { maxNewCards: 2, maxAnnualFee: 50000, preferRupayUpi: false, preferLtf: false, avoidCoBranded: true, requireLounge: false },
    },
  },
];

for (const s of scenarios) {
  const r = recommend(s.profile);
  console.log(`\n=== ${s.label} ===`);
  for (const p of r.portfolios.slice(0, 3)) {
    const feeStr = p.totalAnnualFee === 0 ? "LTF" : `fee ₹${p.totalAnnualFee.toLocaleString("en-IN")}`;
    console.log(`  ${p.cardIds.join(" + ").padEnd(60)}  net ₹${p.netSavings.toLocaleString("en-IN")} (${feeStr})`);
  }
}

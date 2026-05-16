// Smoke test: simulates the user's stated profile and prints recommendation.
import { recommend } from "../lib/recommender";
import type { UserProfile } from "../lib/types";

const profile: UserProfile = {
  monthlySpend: {
    flights_domestic: 30000, // annual
    hotels_domestic: 30000,  // annual
    fuel: 3000,
    groceries: 5000,
    dining: 3000,
    online_shopping: 5000,
    utilities: 3000,
    upi_p2m: 5000,
  },
  spendFrequency: {
    flights_domestic: "annual",
    hotels_domestic: "annual",
  },
  ownedCards: [
    { cardId: "hsbc_visa_platinum", useCases: ["other"], note: "LTF generic" },
    { cardId: "hdfc_swiggy", useCases: ["dining"], note: "Swiggy cashback" },
  ],
  oneOffEvents: [
    { id: "wed", label: "Wedding (caterers, venue, etc.)", amount: 550000, paymentMode: "cash_or_upi", withinMonths: 6 },
  ],
  preferences: {
    maxNewCards: 2,
    maxAnnualFee: 15000,
    preferRupayUpi: true,
    preferLtf: false,
    avoidCoBranded: true,
    requireLounge: false,
  },
};

const rec = recommend(profile);
console.log("Top portfolios:\n");
rec.portfolios.forEach((p, i) => {
  console.log(`#${i + 1}: ${p.cardIds.join(" + ")}`);
  console.log(`  rewards ₹${p.totalAnnualValue}  fees ₹${p.totalAnnualFee}  net ₹${p.netSavings}`);
  for (const b of p.perCardBreakdown) {
    console.log(`  - ${b.cardId}: net ₹${b.net} (reward ₹${b.rewardValue}, milestone ₹${b.milestoneValue}, welcome ₹${b.welcomeValue}, lounge ₹${b.loungeValue}, fee ₹${b.effectiveFee})`);
  }
  console.log();
});
if (rec.notes.length) {
  console.log("Notes:");
  rec.notes.forEach((n) => console.log(" - " + n));
}

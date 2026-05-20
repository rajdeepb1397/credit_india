import { z } from "zod";

export const SPEND_CATEGORIES = [
  "flights_domestic",
  "flights_intl",
  "hotels_domestic",
  "hotels_intl",
  "fuel",
  "groceries",
  "dining",
  "online_shopping",
  "offline_shopping",
  "utilities",
  "insurance",
  "education",
  "rent",
  "upi_p2m",
  "wallet_loads",
  "other",
] as const;

export type SpendCategory = (typeof SPEND_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<SpendCategory, string> = {
  flights_domestic: "Flights (Domestic)",
  flights_intl: "Flights (International)",
  hotels_domestic: "Hotels (Domestic)",
  hotels_intl: "Hotels (International)",
  fuel: "Fuel",
  groceries: "Groceries",
  dining: "Dining",
  online_shopping: "Online Shopping",
  offline_shopping: "Offline Shopping",
  utilities: "Utilities & Bills",
  insurance: "Insurance",
  education: "Education",
  rent: "Rent",
  upi_p2m: "UPI to Merchant (RuPay)",
  wallet_loads: "Wallets / Excluded",
  other: "Other / General",
};

export const CATEGORY_HINTS: Record<SpendCategory, string> = {
  flights_domestic: "Air tickets within India (MMT, EaseMyTrip, airline sites)",
  flights_intl: "Air tickets outside India",
  hotels_domestic: "Hotel stays within India",
  hotels_intl: "Hotel stays outside India",
  fuel: "Petrol / diesel / CNG (HPCL, IOCL, BPCL, Shell)",
  groceries: "Big Basket, Blinkit, supermarkets, Zepto",
  dining: "Restaurants, Swiggy, Zomato dine-in",
  online_shopping: "Amazon, Flipkart, Myntra, Ajio, etc.",
  offline_shopping: "POS swipes at retail stores",
  utilities: "Electricity, gas, broadband, mobile, DTH",
  insurance: "LIC, health, vehicle premiums",
  education: "School/college fees, ed-tech",
  rent: "House rent (via CRED/NoBroker etc.)",
  upi_p2m: "UPI payments to merchants — RuPay credit cards only",
  wallet_loads: "Paytm/Mobikwik loads — usually excluded from rewards",
  other: "Anything else",
};

export const NETWORKS = ["visa", "mastercard", "rupay", "amex", "diners"] as const;
export type Network = (typeof NETWORKS)[number];

// Some normalized issuer files emit `null` for unknown fields. Coerce them gracefully
// rather than reject otherwise-valid cards.
const numberOr0 = z.preprocess((v) => (v == null ? 0 : v), z.number()).default(0);
const optionalNumber = z.preprocess((v) => (v == null ? undefined : v), z.number().optional());
// If network is null in the source, treat as "visa" (most common Indian default).
// This card will then correctly be excluded by RuPay-only filters since upiEnabled stays false.
const networkOrVisa = z.preprocess((v) => (v == null ? "visa" : v), z.enum(NETWORKS));

export const RewardRuleSchema = z.object({
  categories: z.array(z.enum(SPEND_CATEGORIES)),
  rate: z.number(),
  monthlyCap: z.number().optional(),
  annualCap: z.number().optional(),
  minTxn: z.number().optional(),
  notes: z.string().optional(),
});
export type RewardRule = z.infer<typeof RewardRuleSchema>;

export const MilestoneSchema = z.object({
  spendThreshold: z.number(),
  rewardInr: numberOr0,
  label: z.string(),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const CardSchema = z.object({
  id: z.string(),
  name: z.string(),
  issuer: z.string(),
  network: networkOrVisa,
  upiEnabled: z.preprocess((v) => (v == null ? false : v), z.boolean()).default(false),
  isCoBranded: z.preprocess((v) => (v == null ? false : v), z.boolean()).default(false),
  joiningFee: numberOr0,
  annualFee: numberOr0,
  feeWaiverSpend: optionalNumber,
  welcomeBenefitInr: numberOr0,
  baseRewardRate: z.preprocess((v) => (v == null ? 0.5 : v), z.number()).default(0.5),
  rules: z.array(RewardRuleSchema).default([]),
  excludedCategories: z.array(z.enum(SPEND_CATEGORIES)).default([]),
  milestones: z.array(MilestoneSchema).default([]),
  loungeAccessInr: numberOr0,
  loungeVisits: z
    .object({
      domestic: optionalNumber,
      international: optionalNumber,
    })
    .optional(),
  highlights: z.array(z.string()).default([]),
  caveats: z.array(z.string()).default([]),
  bestFor: z.array(z.string()).default([]),
  eligibility: z
    .object({
      minMonthlySalaryInr: optionalNumber,
      minAnnualItrInr: optionalNumber,
      inviteOnly: z.preprocess((v) => (v == null ? undefined : v), z.boolean().optional()),
    })
    .passthrough()
    .default({}),
  lastVerified: z.string(),
  url: z.string().optional(),
});
export type Card = z.infer<typeof CardSchema>;

export const OwnedCardSchema = z.object({
  cardId: z.string(),
  useCases: z.array(z.enum(SPEND_CATEGORIES)).default([]),
  note: z.string().optional(),
});
export type OwnedCard = z.infer<typeof OwnedCardSchema>;

export const OneOffEventSchema = z.object({
  id: z.string(),
  label: z.string(),
  amount: z.number(),
  paymentMode: z.enum(["any", "upi_only", "card_only", "cash_or_upi"]).default("any"),
  withinMonths: z.number().default(12),
});
export type OneOffEvent = z.infer<typeof OneOffEventSchema>;

export const SPEND_FREQUENCIES = ["monthly", "quarterly", "annual"] as const;
export type SpendFrequency = (typeof SPEND_FREQUENCIES)[number];
export const FREQUENCY_MULTIPLIER: Record<SpendFrequency, number> = {
  monthly: 12,
  quarterly: 4,
  annual: 1,
};
export const FREQUENCY_LABEL: Record<SpendFrequency, string> = {
  monthly: "/mo",
  quarterly: "/qtr",
  annual: "/yr",
};

export const UserProfileSchema = z.object({
  monthlySpend: z.record(z.enum(SPEND_CATEGORIES), z.number()).default({}),
  spendFrequency: z
    .record(z.enum(SPEND_CATEGORIES), z.enum(SPEND_FREQUENCIES))
    .default({}),
  ownedCards: z.array(OwnedCardSchema).default([]),
  oneOffEvents: z.array(OneOffEventSchema).default([]),
  preferences: z
    .object({
      maxNewCards: z.number().min(1).max(5).default(2),
      maxAnnualFee: z.number().default(2000),
      preferRupayUpi: z.boolean().default(true),
      preferLtf: z.boolean().default(false),
      avoidCoBranded: z.boolean().default(true),
      requireLounge: z.boolean().default(false),
    })
    .default({}),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const PortfolioSchema = z.object({
  cardIds: z.array(z.string()),
  totalAnnualValue: z.number(),
  totalAnnualFee: z.number(),
  netSavings: z.number(),
  perCardBreakdown: z.array(
    z.object({
      cardId: z.string(),
      rewardValue: z.number(),
      milestoneValue: z.number(),
      welcomeValue: z.number(),
      loungeValue: z.number(),
      effectiveFee: z.number(),
      net: z.number(),
      categoryRouting: z.record(z.enum(SPEND_CATEGORIES), z.number()),
    })
  ),
  rationale: z.string().optional(),
});
export type Portfolio = z.infer<typeof PortfolioSchema>;

export const RecommendationSchema = z.object({
  portfolios: z.array(PortfolioSchema),
  notes: z.array(z.string()).default([]),
  llmEnriched: z.boolean().default(false),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

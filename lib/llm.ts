import "server-only";
import OpenAI, { AzureOpenAI } from "openai";
import { Card, Portfolio, UserProfile } from "./types";
import { getCardById } from "./recommender";

const DISABLED = process.env.DISABLE_LLM === "1";

function makeClient(): AzureOpenAI | null {
  if (DISABLED) return null;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2024-08-01-preview";
  if (!endpoint || !apiKey) return null;
  return new AzureOpenAI({ endpoint, apiKey, apiVersion });
}

const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o";

/**
 * Generate a short, plain-English rationale for the chosen portfolio.
 * Returns null on any failure (UI falls back to deterministic explanation).
 */
export async function generateRationale(
  portfolio: Portfolio,
  profile: UserProfile
): Promise<string | null> {
  const client = makeClient();
  if (!client) return null;

  const cards = portfolio.cardIds.map((id) => getCardById(id)).filter(Boolean) as Card[];
  const cardSummary = cards.map((c) => ({
    name: c.name,
    issuer: c.issuer,
    network: c.network,
    fee: c.annualFee,
    feeWaiverSpend: c.feeWaiverSpend,
    upiEnabled: c.upiEnabled,
    bestFor: c.bestFor,
  }));

  const breakdown = portfolio.perCardBreakdown.map((b) => ({
    name: getCardById(b.cardId)?.name ?? b.cardId,
    annualReward: b.rewardValue,
    milestone: b.milestoneValue,
    welcome: b.welcomeValue,
    lounge: b.loungeValue,
    fee: b.effectiveFee,
    net: b.net,
    routing: b.categoryRouting,
  }));

  const prompt = `You are a careful Indian credit-card advisor. Write a short rationale (4-6 sentences) explaining why this card portfolio is well-suited for the user. Be specific: mention which card handles which spend category and why. Mention any RuPay-on-UPI advantage if relevant. Avoid hype; be precise about caps and fees. Do NOT invent benefits not in the data.

User profile (annual spend ₹):
${JSON.stringify(profile.monthlySpend, null, 0)}
One-off events: ${JSON.stringify(profile.oneOffEvents, null, 0)}
Owned cards: ${JSON.stringify(profile.ownedCards, null, 0)}

Recommended portfolio:
${JSON.stringify({ cards: cardSummary, breakdown, netSavings: portfolio.netSavings }, null, 0)}

Return only the rationale paragraph.`;

  try {
    const res = await client.chat.completions.create({
      model: DEPLOYMENT,
      messages: [
        { role: "system", content: "You are a precise, conservative Indian credit-card advisor." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 350,
    });
    return res.choices[0]?.message?.content?.trim() ?? null;
  } catch (e) {
    console.error("LLM rationale failed:", e);
    return null;
  }
}

/**
 * Ask the LLM to flag any 2026 updates to the candidate cards (devaluations,
 * new caps, discontinuations). Returns a short bullet list or null.
 *
 * Does NOT modify the dataset — surfaces info to the user.
 */
export async function fetchCardUpdates(cards: Card[]): Promise<string | null> {
  const client = makeClient();
  if (!client) return null;

  const minimal = cards.map((c) => ({ id: c.id, name: c.name, lastVerified: c.lastVerified }));
  const prompt = `For each Indian credit card below, flag ONLY material changes since its lastVerified date that would change reward math (rate cuts, new exclusions, cap changes, discontinuation, fee hikes). If you are not confident, say "no confirmed change". Be terse — one bullet per card max. Today's year is 2026.

${JSON.stringify(minimal, null, 0)}

Return markdown bullets.`;

  try {
    const res = await client.chat.completions.create({
      model: DEPLOYMENT,
      messages: [
        { role: "system", content: "You are an Indian credit-card terms researcher. Be conservative; do not invent changes." },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 500,
    });
    return res.choices[0]?.message?.content?.trim() ?? null;
  } catch (e) {
    console.error("LLM updates failed:", e);
    return null;
  }
}

export function llmEnabled(): boolean {
  return !DISABLED && !!process.env.AZURE_OPENAI_ENDPOINT && !!process.env.AZURE_OPENAI_API_KEY;
}

// Suppress unused import warning when build inspects exports
export const _OpenAI = OpenAI;

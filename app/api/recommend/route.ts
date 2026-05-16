import { NextRequest, NextResponse } from "next/server";
import { ALL_CARDS, getCardById, recommend } from "@/lib/recommender";
import { UserProfileSchema } from "@/lib/types";
import { fetchCardUpdates, generateRationale, llmEnabled } from "@/lib/llm";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = UserProfileSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid profile", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const profile = parsed.data;
  const rec = recommend(profile);

  const useLlm = llmEnabled() && req.nextUrl.searchParams.get("llm") !== "0";

  let updatesNote: string | null = null;
  if (useLlm && rec.portfolios.length > 0) {
    const top = rec.portfolios[0];
    const cards = top.cardIds.map((id) => getCardById(id)).filter(Boolean) as typeof ALL_CARDS;
    const [rationale, updates] = await Promise.all([
      generateRationale(top, profile),
      fetchCardUpdates(cards),
    ]);
    if (rationale) top.rationale = rationale;
    updatesNote = updates;
    rec.llmEnriched = true;
  }

  return NextResponse.json({
    ...rec,
    updatesNote,
    cards: ALL_CARDS,
  });
}

export async function GET() {
  return NextResponse.json({ cards: ALL_CARDS, llmEnabled: llmEnabled() });
}

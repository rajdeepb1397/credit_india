# CardIt — Smart Indian Credit Card Portfolio Recommender

A minimalist, dark-mode web app that recommends the best **1–3 card portfolio** for *your* actual spending pattern in India, factoring in:

- Real category-wise reward rates, caps, milestones, fees, and fee-waivers
- **One-off life events** (e.g. weddings) where merchants only accept UPI/cash
- **Cards you already own** — recommendations complement, not duplicate
- **RuPay-on-UPI** opportunities for daily spends
- 2026 verification via Azure OpenAI (optional)

No signups, no affiliate links. Data is curated JSON; the LLM only enriches & explains.

## Stack
- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Zod for runtime validation
- Framer Motion + Lucide icons
- Azure OpenAI (optional) for rationale + 2026 update checks

## Quick start
```bash
npm install
cp .env.local.example .env.local   # optional: fill Azure OpenAI keys, or set DISABLE_LLM=1
npm run dev
# open http://localhost:3000
```

## Smoke test (CLI)
Runs the recommender against the bundled sample profile and prints results:
```bash
npm run smoke
```

## Environment variables (`.env.local`)
| Var | Purpose |
|---|---|
| `AZURE_OPENAI_ENDPOINT` | e.g. `https://your-resource.openai.azure.com` |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI key |
| `AZURE_OPENAI_DEPLOYMENT` | Deployment name (e.g. `gpt-4o`) |
| `AZURE_OPENAI_API_VERSION` | Default `2024-08-01-preview` |
| `DISABLE_LLM` | Set to `1` to use curated data only |

## Updating card data
1. Edit `data/cards.json` — add/modify card terms.
2. Bump `lastVerified` to today's date for any card you re-checked.
3. (Optional) Run with LLM enabled — the UI surfaces a "2026 update check" note for the recommended cards so you can spot drift.

## Project layout
```
app/                 Next.js app router
  page.tsx           Wizard UI (4 steps)
  api/recommend/     Recommendation API route
lib/
  types.ts           Zod schemas + TS types
  recommender.ts     Portfolio search + greedy category routing
  llm.ts             Azure OpenAI client (server-only)
data/cards.json      Curated India credit card dataset
scripts/smoke.ts     CLI smoke test
```

## Deploy (later)
Hobby tier on Vercel works. Add a custom domain in Vercel → Settings → Domains; point DNS A/CNAME at Vercel; SSL is automatic.

## Caveats
- Card terms change frequently in India. Always verify on the issuer's site before applying.
- The engine assumes you actually route spends to the suggested cards (it's a planner, not a swiper).
- LLM output is not authoritative — it's a hint to re-verify.


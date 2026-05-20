"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  Plus,
  X,
  Sparkles,
  Wallet,
  Plane,
  CreditCard,
  PartyPopper,
  CheckCircle2,
  Info,
  TrendingUp,
} from "lucide-react";
import {
  CATEGORY_HINTS,
  CATEGORY_LABELS,
  Card as CardType,
  FREQUENCY_LABEL,
  OneOffEvent,
  OwnedCard,
  Portfolio,
  SPEND_CATEGORIES,
  SPEND_FREQUENCIES,
  SpendCategory,
  SpendFrequency,
  UserProfile,
} from "@/lib/types";

type Step = "spends" | "owned" | "events" | "results";

const PRESET_CATEGORIES: SpendCategory[] = [
  "flights_domestic",
  "hotels_domestic",
  "fuel",
  "groceries",
  "dining",
  "online_shopping",
  "utilities",
  "upi_p2m",
];

const STORAGE_KEY = "cardpilot_profile_v1";

type FeeBand = "lt1k" | "lt5k" | "lt10k" | "gt10k";
const FEE_BANDS: { value: FeeBand; label: string; min: number; max: number }[] = [
  { value: "lt1k", label: "< ₹1,000", min: 0, max: 999 },
  { value: "lt5k", label: "₹1,000 – ₹4,999", min: 1000, max: 4999 },
  { value: "lt10k", label: "₹5,000 – ₹9,999", min: 5000, max: 9999 },
  { value: "gt10k", label: "₹10,000+", min: 10000, max: 1000000 },
];
function feeBandFromValues(min: number | undefined, max: number | undefined): FeeBand {
  const m = min ?? 0;
  const x = max ?? 1000000;
  for (const b of FEE_BANDS) if (b.min === m && b.max === x) return b.value;
  if (x < 1000) return "lt1k";
  if (x < 5000) return "lt5k";
  if (x < 10000) return "lt10k";
  return "gt10k";
}

const DEFAULT_PROFILE: UserProfile = {
  monthlySpend: {},
  spendFrequency: {},
  ownedCards: [],
  oneOffEvents: [],
  preferences: {
    maxNewCards: 2,
    maxAnnualFee: 999,
    minAnnualFee: 0,
    preferRupayUpi: true,
    preferLtf: false,
    avoidCoBranded: true,
    requireLounge: false,
  },
};

export default function Home() {
  const [step, setStep] = useState<Step>("spends");
  const [cards, setCards] = useState<CardType[]>([]);
  const [llmAvailable, setLlmAvailable] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [result, setResult] = useState<{
    portfolios: Portfolio[];
    notes: string[];
    updatesNote?: string | null;
    llmEnriched: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/recommend")
      .then((r) => r.json())
      .then((d) => {
        setCards(d.cards);
        setLlmAvailable(d.llmEnabled);
      })
      .catch(() => {});
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setProfile(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {}
  }, [profile]);

  async function runRecommend(override?: UserProfile) {
    const p = override ?? profile;
    if (override) setProfile(override);
    setLoading(true);
    setStep("results");
    try {
      const res = await fetch(`/api/recommend?llm=${llmAvailable ? 1 : 0}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(p),
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function resetProfile() {
    if (typeof window !== "undefined") {
      const ok = window.confirm("Reset all your inputs to defaults?");
      if (!ok) return;
    }
    setProfile(DEFAULT_PROFILE);
    setResult(null);
  }

  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-10 sm:px-8 sm:pt-16 lg:px-10">
      <Header />
      <Stepper step={step} onJump={setStep} />

      <div className="mt-8">
        <AnimatePresence mode="wait">
          {step === "spends" && (
            <Section key="spends">
              <SpendsStep profile={profile} setProfile={setProfile} />
              <Nav
                reset={resetProfile}
                next={() => setStep("owned")}
                extra={
                  <button
                    onClick={() => runRecommend()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 px-3 py-2 text-sm text-accent transition hover:bg-accent/10"
                  >
                    <Sparkles className="h-4 w-4" /> Skip to recommendations
                  </button>
                }
              />
            </Section>
          )}
          {step === "owned" && (
            <Section key="owned">
              <OwnedStep profile={profile} setProfile={setProfile} cards={cards} />
              <Nav reset={resetProfile} back={() => setStep("spends")} next={() => setStep("events")} />
            </Section>
          )}
          {step === "events" && (
            <Section key="events">
              <EventsStep profile={profile} setProfile={setProfile} />
              <Nav
                reset={resetProfile}
                back={() => setStep("owned")}
                next={() => runRecommend()}
                nextLabel={
                  <>
                    <Sparkles className="h-4 w-4" /> Find my best card
                  </>
                }
              />
            </Section>
          )}
          {step === "results" && (
            <Section key="results">
              <ResultsStep
                loading={loading}
                result={result}
                cards={cards}
                profile={profile}
                setProfile={setProfile}
                rerun={runRecommend}
                onBack={() => setStep("events")}
                onRestart={() => {
                  setResult(null);
                  setStep("spends");
                }}
              />
            </Section>
          )}
        </AnimatePresence>
      </div>

      <Footer llmAvailable={llmAvailable} />
    </main>
  );
}

/* ---------- Layout pieces ---------- */

function Header() {
  return (
    <header className="mb-10 sm:mb-14">
      <div className="flex items-center gap-3.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-gradient-to-br from-accent to-accent-glow shadow-glow ring-1 ring-accent/40">
          <svg
            viewBox="0 0 24 24"
            className="h-[22px] w-[22px] text-bg"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2.5" y="5.5" width="19" height="13" rx="2.4" />
            <rect x="5" y="9.2" width="3.6" height="2.6" rx="0.6" fill="currentColor" stroke="none" />
            <path d="M5 15.2h7" />
            <path d="M14 15.2h5" />
          </svg>
        </div>
        <span className="text-[17px] font-semibold tracking-tight text-fg">
          Card<span className="mx-[1px] inline-block -translate-y-[1px] rotate-[18deg] text-accent">-</span>It
        </span>
        <span className="ml-auto rounded-full border border-border bg-bg-subtle/40 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-fg-subtle">
          India · 2026
        </span>
      </div>
      <h1 className="mt-10 text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl md:text-5xl">
        Find your{" "}
        <span className="bg-gradient-to-r from-accent via-accent-mint to-accent-gold bg-clip-text text-transparent">
          best card
        </span>
        <span className="text-fg-muted">.</span>
      </h1>
      <p className="mt-4 max-w-2xl text-pretty text-base text-fg-muted sm:text-lg">
        Tell what you spend — it shows you what you need.
      </p>
    </header>
  );
}

function Stepper({ step, onJump }: { step: Step; onJump: (s: Step) => void }) {
  const steps: { id: Step; label: string }[] = [
    { id: "spends", label: "Spends" },
    { id: "owned", label: "Owned" },
    { id: "events", label: "Events" },
    { id: "results", label: "Result" },
  ];
  const idx = steps.findIndex((s) => s.id === step);
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => {
        const active = s.id === step;
        const done = i < idx;
        return (
          <button
            key={s.id}
            onClick={() => onJump(s.id)}
            className={`group flex items-center gap-2 rounded-full px-3 py-1 text-xs transition ${
              active
                ? "bg-bg-card text-fg ring-1 ring-accent/40"
                : "text-fg-subtle hover:text-fg"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                active
                  ? "bg-accent text-bg"
                  : done
                  ? "bg-accent/20 text-accent"
                  : "bg-bg-card text-fg-subtle"
              }`}
            >
              {done ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
            </span>
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="rounded-2xl border border-border bg-bg-card/60 p-5 backdrop-blur sm:p-7"
    >
      {children}
    </motion.section>
  );
}

function Nav({
  back,
  next,
  nextLabel,
  extra,
  reset,
}: {
  back?: () => void;
  next?: () => void;
  nextLabel?: React.ReactNode;
  extra?: React.ReactNode;
  reset?: () => void;
}) {
  return (
    <div className="mt-7 flex flex-wrap items-center justify-between gap-2">
      {back ? (
        <button
          onClick={back}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-fg-muted transition hover:bg-bg-hover hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        {reset && (
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-fg-muted transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
            title="Clear all inputs and reset to defaults"
          >
            Reset
          </button>
        )}
        {extra}
        {next && (
          <button
            onClick={next}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-accent to-accent-glow px-4 py-2 text-sm font-medium text-bg shadow-glow transition hover:brightness-110"
          >
            {nextLabel ?? (
              <>
                Continue <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function Footer({ llmAvailable }: { llmAvailable: boolean }) {
  return (
    <footer className="mt-12 flex items-center justify-between text-xs text-fg-subtle">
      <span>Curated dataset · last verified Jan 2026</span>
      <span className="flex items-center gap-1.5">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            llmAvailable ? "bg-accent-mint" : "bg-fg-subtle"
          }`}
        />
        {llmAvailable ? "LLM enrichment on" : "LLM offline (curated only)"}
      </span>
    </footer>
  );
}

/* ---------- Step: Spends ---------- */

function SpendsStep({
  profile,
  setProfile,
}: {
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
}) {
  const [extra, setExtra] = useState<SpendCategory[]>(() =>
    (Object.keys(profile.monthlySpend ?? {}) as SpendCategory[]).filter(
      (k) => !PRESET_CATEGORIES.includes(k)
    )
  );
  const visible = useMemo(
    () => Array.from(new Set([...PRESET_CATEGORIES, ...extra])),
    [extra]
  );
  const remaining = SPEND_CATEGORIES.filter((c) => !visible.includes(c));

  function setSpend(cat: SpendCategory, v: number) {
    setProfile({
      ...profile,
      monthlySpend: { ...profile.monthlySpend, [cat]: v },
    });
  }
  function setFreq(cat: SpendCategory, f: SpendFrequency) {
    setProfile({
      ...profile,
      spendFrequency: { ...profile.spendFrequency, [cat]: f },
    });
  }

  return (
    <div>
      <StepHeader
        icon={<Wallet className="h-4 w-4" />}
        title="What do you spend?"
        sub="Enter ₹ per category and choose how often. Skip categories that don't apply."
      />
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visible.map((cat) => (
          <SpendInput
            key={cat}
            cat={cat}
            value={profile.monthlySpend[cat] ?? 0}
            freq={profile.spendFrequency?.[cat] ?? "monthly"}
            onChange={(v) => setSpend(cat, v)}
            onFreqChange={(f) => setFreq(cat, f)}
          />
        ))}
      </div>
      {remaining.length > 0 && (
        <div className="mt-4">
          <details className="group">
            <summary className="inline-flex cursor-pointer items-center gap-1 text-xs text-fg-subtle hover:text-fg">
              <Plus className="h-3.5 w-3.5" /> Add more categories
            </summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {remaining.map((c) => (
                <button
                  key={c}
                  onClick={() => setExtra((e) => [...e, c])}
                  className="rounded-full border border-border bg-bg-subtle px-2.5 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
                >
                  + {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </details>
        </div>
      )}

      <Preferences profile={profile} setProfile={setProfile} />
    </div>
  );
}

function SpendInput({
  cat,
  value,
  freq,
  onChange,
  onFreqChange,
}: {
  cat: SpendCategory;
  value: number;
  freq: SpendFrequency;
  onChange: (v: number) => void;
  onFreqChange: (f: SpendFrequency) => void;
}) {
  return (
    <label className="group flex flex-col gap-1 rounded-xl border border-border bg-bg-subtle/40 p-3 transition focus-within:border-accent/50 hover:bg-bg-subtle">
      <div className="flex items-center justify-between text-xs">
        <span className="text-fg">{CATEGORY_LABELS[cat]}</span>
        <div className="flex items-center gap-0.5 rounded-md bg-bg-hover p-0.5 text-[10px]">
          {SPEND_FREQUENCIES.map((f) => (
            <button
              key={f}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onFreqChange(f);
              }}
              className={`rounded px-1.5 py-0.5 uppercase tracking-wider transition ${
                freq === f
                  ? "bg-accent text-bg"
                  : "text-fg-subtle hover:text-fg"
              }`}
            >
              {FREQUENCY_LABEL[f].replace("/", "")}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-fg-subtle">₹</span>
        <input
          inputMode="numeric"
          value={value || ""}
          onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, "")) || 0)}
          placeholder="0"
          className="w-full bg-transparent text-base font-medium tabular-nums outline-none placeholder:text-fg-subtle/60"
        />
        <span className="text-[10px] text-fg-subtle">{FREQUENCY_LABEL[freq]}</span>
      </div>
      <span className="text-[10px] text-fg-subtle">{CATEGORY_HINTS[cat]}</span>
    </label>
  );
}

function Preferences({
  profile,
  setProfile,
}: {
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
}) {
  const p = profile.preferences ?? {
    maxNewCards: 2,
    maxAnnualFee: 999,
    minAnnualFee: 0,
    preferRupayUpi: true,
    preferLtf: false,
    avoidCoBranded: true,
  };
  return (
    <div className="mt-6 rounded-xl border border-border bg-bg-subtle/40 p-4">
      <div className="mb-3 text-xs font-medium uppercase tracking-wider text-fg-subtle">
        Preferences
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PrefNumber
          label="Max new cards"
          value={p.maxNewCards}
          min={1}
          max={5}
          onChange={(v) => setProfile({ ...profile, preferences: { ...p, maxNewCards: v } })}
        />
        <PrefSelect
          label="Annual fee range"
          value={feeBandFromValues(p.minAnnualFee, p.maxAnnualFee)}
          options={FEE_BANDS.map((b) => ({ value: b.value, label: b.label }))}
          onChange={(v) => {
            const band = FEE_BANDS.find((b) => b.value === v)!;
            setProfile({
              ...profile,
              preferences: { ...p, minAnnualFee: band.min, maxAnnualFee: band.max },
            });
          }}
        />
        <PrefToggle
          label="Require RuPay (UPI-on-credit)"
          value={p.preferRupayUpi}
          onChange={(v) => setProfile({ ...profile, preferences: { ...p, preferRupayUpi: v } })}
        />
        <PrefToggle
          label="Prefer Lifetime-Free cards"
          value={p.preferLtf}
          onChange={(v) => setProfile({ ...profile, preferences: { ...p, preferLtf: v } })}
        />
        <PrefToggle
          label="Avoid co-branded cards"
          value={p.avoidCoBranded}
          onChange={(v) => setProfile({ ...profile, preferences: { ...p, avoidCoBranded: v } })}
        />
      </div>
    </div>
  );
}

function PrefNumber({
  label,
  value,
  min = 0,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span className="text-fg-muted">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-28 rounded-md border border-border bg-bg px-2 py-1 text-right tabular-nums outline-none focus:border-accent/50"
      />
    </label>
  );
}

function PrefSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span className="text-fg-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-44 rounded-md border border-border bg-bg px-2 py-1 text-fg outline-none focus:border-accent/50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PrefToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between text-sm">
      <span className="text-fg-muted">{label}</span>
      <button
        onClick={() => onChange(!value)}
        type="button"
        aria-pressed={value}
        className={`relative h-5 w-9 rounded-full transition ${
          value ? "bg-accent" : "bg-bg-hover"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-bg shadow transition-all ${
            value ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}

function eligibilityBadge(c: CardType): string {
  const e = c.eligibility ?? {};
  if (e.inviteOnly) return "Invite-only";
  if (e.minMonthlySalaryInr) {
    const m = e.minMonthlySalaryInr;
    if (m >= 150000) return "Recommended for high-income users";
    if (m >= 75000) return "Best for senior salaried users";
    if (m >= 35000) return "Good for salaried users";
    return "Entry-level salaried";
  }
  if (e.minAnnualItrInr) {
    const lakh = e.minAnnualItrInr / 100000;
    if (lakh >= 6) return "For self-employed with strong ITR";
    return "Self-employed friendly (ITR-based)";
  }
  return "No income docs usually required";
}

function networkLabel(c: CardType): string {
  switch (c.network) {
    case "rupay":
      return "RuPay";
    case "visa":
      return "Visa";
    case "mastercard":
      return "Mastercard";
    case "amex":
      return "Amex";
    case "diners":
      return "Diners";
    default:
      return c.network;
  }
}

function NetworkBadge({ card }: { card: CardType }) {
  const palette: Record<string, string> = {
    rupay: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
    visa: "border-sky-400/40 bg-sky-400/10 text-sky-300",
    mastercard: "border-orange-400/40 bg-orange-400/10 text-orange-300",
    amex: "border-cyan-400/40 bg-cyan-400/10 text-cyan-300",
    diners: "border-zinc-400/40 bg-zinc-400/10 text-zinc-300",
  };
  const cls = palette[card.network] ?? "border-border bg-bg-subtle/60 text-fg-subtle";
  const isRupayUpi = card.network === "rupay" && card.upiEnabled;
  return (
    <span
      className={`ml-1.5 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${cls}`}
      title={isRupayUpi ? "RuPay · UPI-enabled" : networkLabel(card)}
    >
      {networkLabel(card)}
      {isRupayUpi ? " · UPI" : ""}
    </span>
  );
}

/* ---------- Step: Owned ---------- */

function OwnedStep({
  profile,
  setProfile,
  cards,
}: {
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
  cards: CardType[];
}) {
  const [picker, setPicker] = useState("");
  const ownedIds = new Set(profile.ownedCards.map((o) => o.cardId));
  const available = cards.filter((c) => !ownedIds.has(c.id));

  function add(id: string) {
    if (!id) return;
    const n: OwnedCard = { cardId: id, useCases: [] };
    setProfile({ ...profile, ownedCards: [...profile.ownedCards, n] });
    setPicker("");
  }
  function remove(id: string) {
    setProfile({
      ...profile,
      ownedCards: profile.ownedCards.filter((o) => o.cardId !== id),
    });
  }
  function update(id: string, patch: Partial<OwnedCard>) {
    setProfile({
      ...profile,
      ownedCards: profile.ownedCards.map((o) => (o.cardId === id ? { ...o, ...patch } : o)),
    });
  }

  return (
    <div>
      <StepHeader
        icon={<CreditCard className="h-4 w-4" />}
        title="What cards do you already carry?"
        sub="We'll suggest cards that complement these — not duplicate them."
      />

      <div className="mt-5 space-y-2">
        {profile.ownedCards.length === 0 && (
          <p className="text-sm text-fg-subtle">No cards added yet — that&apos;s fine, skip if so.</p>
        )}
        {profile.ownedCards.map((o) => {
          const c = cards.find((x) => x.id === o.cardId);
          if (!c) return null;
          return (
            <div
              key={o.cardId}
              className="rounded-xl border border-border bg-bg-subtle/40 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">
                    {c.name}
                    <NetworkBadge card={c} />
                  </div>
                  <div className="text-xs text-fg-subtle">
                    {c.issuer} · {eligibilityBadge(c)}
                  </div>
                </div>
                <button
                  onClick={() => remove(o.cardId)}
                  className="rounded-md p-1 text-fg-subtle hover:bg-bg-hover hover:text-fg"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                value={o.note ?? ""}
                onChange={(e) => update(o.cardId, { note: e.target.value })}
                placeholder="What do you use it for? (e.g., generic backup, Swiggy)"
                className="mt-2 w-full rounded-md border border-border bg-bg px-2 py-1.5 text-xs outline-none focus:border-accent/50"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <select
          value={picker}
          onChange={(e) => setPicker(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm outline-none focus:border-accent/50"
        >
          <option value="">+ Add a card you already own…</option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              [{networkLabel(c)}{c.network === "rupay" && c.upiEnabled ? "·UPI" : ""}] {c.name} ({c.issuer}) — {eligibilityBadge(c)}
            </option>
          ))}
        </select>
        <button
          onClick={() => add(picker)}
          disabled={!picker}
          className="rounded-lg bg-bg-hover px-3 py-2 text-sm text-fg disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}

/* ---------- Step: Events ---------- */

function EventsStep({
  profile,
  setProfile,
}: {
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
}) {
  const [draft, setDraft] = useState<Omit<OneOffEvent, "id">>({
    label: "",
    amount: 0,
    paymentMode: "cash_or_upi",
    withinMonths: 6,
  });
  function add() {
    if (!draft.label || !draft.amount) return;
    setProfile({
      ...profile,
      oneOffEvents: [
        ...profile.oneOffEvents,
        { ...draft, id: Math.random().toString(36).slice(2, 9) },
      ],
    });
    setDraft({ label: "", amount: 0, paymentMode: "cash_or_upi", withinMonths: 6 });
  }
  function remove(id: string) {
    setProfile({ ...profile, oneOffEvents: profile.oneOffEvents.filter((e) => e.id !== id) });
  }

  return (
    <div>
      <StepHeader
        icon={<PartyPopper className="h-4 w-4" />}
        title="Any one-off big spends coming up?"
        sub="Wedding, home renovation, big trip. Especially useful for cash/UPI-only merchants."
      />

      <div className="mt-5 space-y-2">
        {profile.oneOffEvents.map((ev) => (
          <div
            key={ev.id}
            className="flex items-center justify-between rounded-xl border border-border bg-bg-subtle/40 p-3 text-sm"
          >
            <div>
              <div className="font-medium">{ev.label}</div>
              <div className="text-xs text-fg-subtle">
                ₹{ev.amount.toLocaleString("en-IN")} ·{" "}
                {ev.paymentMode.replace("_", "/")} · within {ev.withinMonths}mo
              </div>
            </div>
            <button
              onClick={() => remove(ev.id)}
              className="rounded-md p-1 text-fg-subtle hover:bg-bg-hover hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 rounded-xl border border-border bg-bg-subtle/40 p-3 sm:grid-cols-5">
        <input
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          placeholder="Wedding, renovation…"
          className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm outline-none focus:border-accent/50 sm:col-span-2"
        />
        <input
          inputMode="numeric"
          value={draft.amount || ""}
          onChange={(e) =>
            setDraft({ ...draft, amount: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })
          }
          placeholder="Amount ₹"
          className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm outline-none focus:border-accent/50"
        />
        <select
          value={draft.paymentMode}
          onChange={(e) =>
            setDraft({ ...draft, paymentMode: e.target.value as OneOffEvent["paymentMode"] })
          }
          className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm outline-none focus:border-accent/50"
        >
          <option value="any">Any mode</option>
          <option value="card_only">Card only</option>
          <option value="upi_only">UPI only</option>
          <option value="cash_or_upi">Cash / UPI</option>
        </select>
        <button
          onClick={add}
          className="rounded-md bg-accent/15 px-2 py-1.5 text-sm text-accent hover:bg-accent/25"
        >
          + Add
        </button>
      </div>
    </div>
  );
}

/* ---------- Step: Results ---------- */

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs transition ${
        active
          ? "border-accent/40 bg-accent/15 text-accent"
          : "border-border bg-bg text-fg-muted hover:bg-bg-hover hover:text-fg"
      }`}
    >
      {active ? "✓ " : ""}
      {label}
    </button>
  );
}

function ResultsStep({
  loading,
  result,
  cards,
  profile,
  setProfile,
  rerun,
  onBack,
  onRestart,
}: {
  loading: boolean;
  result: {
    portfolios: Portfolio[];
    notes: string[];
    updatesNote?: string | null;
    llmEnriched: boolean;
  } | null;
  cards: CardType[];
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
  rerun: (override?: UserProfile) => void;
  onBack: () => void;
  onRestart: () => void;
}) {
  const prefs = profile.preferences ?? {
    maxNewCards: 2,
    maxAnnualFee: 999,
    minAnnualFee: 0,
    preferRupayUpi: true,
    preferLtf: false,
    avoidCoBranded: true,
    requireLounge: false,
  };
  function togglePref(key: "preferRupayUpi" | "preferLtf" | "avoidCoBranded" | "requireLounge") {
    const next = { ...profile, preferences: { ...prefs, [key]: !prefs[key] } };
    rerun(next);
  }
  function setMax(key: "maxNewCards" | "maxAnnualFee", v: number) {
    const next = { ...profile, preferences: { ...prefs, [key]: v } };
    rerun(next);
  }
  function setFeeBand(v: FeeBand) {
    const band = FEE_BANDS.find((b) => b.value === v)!;
    const next = {
      ...profile,
      preferences: { ...prefs, minAnnualFee: band.min, maxAnnualFee: band.max },
    };
    rerun(next);
  }

  type SortKey = "default" | "fee_asc" | "fee_desc" | "income_asc" | "income_desc";
  const [sortBy, setSortBy] = useState<SortKey>("default");
  const [showAll, setShowAll] = useState(false);

  const cardById = useMemo(() => {
    const m = new Map<string, CardType>();
    for (const c of cards) m.set(c.id, c);
    return m;
  }, [cards]);

  function portfolioMinIncome(p: Portfolio): number {
    let max = 0;
    for (const id of p.cardIds) {
      const c = cardById.get(id);
      const v = c?.eligibility?.minMonthlySalaryInr ?? 0;
      if (v > max) max = v;
    }
    return max;
  }

  function portfolioDeclaredFee(p: Portfolio): number {
    let sum = 0;
    for (const id of p.cardIds) {
      const c = cardById.get(id);
      sum += (c?.annualFee ?? 0) + (c?.joiningFee ?? 0);
    }
    return sum;
  }

  const sortedPortfolios = useMemo(() => {
    if (!result) return [];
    const arr = [...result.portfolios];
    switch (sortBy) {
      case "fee_asc":
        arr.sort((a, b) => portfolioDeclaredFee(a) - portfolioDeclaredFee(b) || b.netSavings - a.netSavings);
        break;
      case "fee_desc":
        arr.sort((a, b) => portfolioDeclaredFee(b) - portfolioDeclaredFee(a) || b.netSavings - a.netSavings);
        break;
      case "income_asc":
        arr.sort((a, b) => portfolioMinIncome(a) - portfolioMinIncome(b) || b.netSavings - a.netSavings);
        break;
      case "income_desc":
        arr.sort((a, b) => portfolioMinIncome(b) - portfolioMinIncome(a) || b.netSavings - a.netSavings);
        break;
      default:
        break;
    }
    return arr.slice(0, 5);
  }, [result, sortBy, cardById]);

  const filterBar = (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-bg-subtle/40 p-3">
      <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-fg-subtle">
        Filters
      </span>
      <FilterChip
        active={prefs.preferRupayUpi}
        onClick={() => togglePref("preferRupayUpi")}
        label="RuPay only"
      />
      <FilterChip
        active={prefs.preferLtf}
        onClick={() => togglePref("preferLtf")}
        label="Lifetime-free"
      />
      <FilterChip
        active={prefs.avoidCoBranded}
        onClick={() => togglePref("avoidCoBranded")}
        label="No co-branded"
      />
      <FilterChip
        active={!!prefs.requireLounge}
        onClick={() => togglePref("requireLounge")}
        label="Lounge access"
      />
      <div className="ml-auto flex items-center gap-2 text-xs text-fg-subtle">
        <label className="inline-flex items-center gap-1.5">
          Cards
          <input
            type="number"
            min={1}
            max={5}
            value={prefs.maxNewCards}
            onChange={(e) => setMax("maxNewCards", Number(e.target.value) || 1)}
            className="w-12 rounded-md border border-border bg-bg px-1.5 py-0.5 text-fg outline-none focus:border-accent/50"
          />
        </label>
        <label className="inline-flex items-center gap-1.5">
          Annual fee
          <select
            value={feeBandFromValues(prefs.minAnnualFee, prefs.maxAnnualFee)}
            onChange={(e) => setFeeBand(e.target.value as FeeBand)}
            className="rounded-md border border-border bg-bg px-2 py-0.5 text-fg outline-none focus:border-accent/50"
          >
            {FEE_BANDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div>
        {filterBar}
        <div className="py-12 text-center">
          <div className="mx-auto h-1 w-40 overflow-hidden rounded-full bg-bg-hover">
            <div className="h-full w-1/3 shimmer rounded-full" />
          </div>
          <p className="mt-4 text-sm text-fg-muted">Crunching the math across all options…</p>
        </div>
      </div>
    );
  }
  if (!result) return null;
  const top = sortedPortfolios[0];
  const rest = sortedPortfolios.slice(1);
  const visibleRest = showAll ? rest.slice(0, 4) : rest.slice(0, 2);
  const hasMore = rest.length > visibleRest.length;
  return (
    <div>
      <StepHeader
        icon={<TrendingUp className="h-4 w-4" />}
        title="Recommendations"
        sub={
          result.llmEnriched
            ? "Curated dataset · enriched with 2026 LLM check"
            : "Curated dataset · tweak filters below to re-run instantly"
        }
      />

      {filterBar}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-xs text-fg-subtle">
        <label className="inline-flex items-center gap-1.5">
          Sort by
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="rounded-md border border-border bg-bg px-2 py-1 text-fg outline-none focus:border-accent/50"
          >
            <option value="default">Best match (net savings)</option>
            <option value="fee_asc">Max fee: low to high</option>
            <option value="fee_desc">Max fee: high to low</option>
            <option value="income_asc">Income: low to high</option>
            <option value="income_desc">Income: high to low</option>
          </select>
        </label>
      </div>

      {!top ? (
        <div className="mt-6 rounded-xl border border-border bg-bg-subtle/40 p-6 text-center text-sm text-fg-muted">
          No cards fit your filters. Try toggling off RuPay-only / LTF / No-cobranded, or raising max fee.
        </div>
      ) : (
        <>
          <div className="mt-6">
            <PortfolioCard portfolio={top} cards={cards} primary />
          </div>

          {visibleRest.length > 0 && (
            <div className="mt-10">
              <div className="mb-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border-strong to-transparent" />
                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-fg-subtle">
                  Other options
                </span>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border-strong to-transparent" />
              </div>
              <div className="space-y-4">
                {visibleRest.map((p, i) => (
                  <PortfolioCard key={i} portfolio={p} cards={cards} />
                ))}
              </div>
              {hasMore && (
                <div className="mt-5 flex justify-center">
                  <button
                    onClick={() => setShowAll(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-subtle/40 px-4 py-2 text-sm text-fg-muted transition hover:border-accent/40 hover:bg-accent/5 hover:text-accent"
                  >
                    Load more
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {(result.notes.length > 0 || result.updatesNote) && (
        <div className="mt-6 rounded-xl border border-border bg-bg-subtle/40 p-4 text-sm text-fg-muted">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-fg-subtle">
            <Info className="h-3.5 w-3.5" /> Notes
          </div>
          <ul className="list-disc space-y-1 pl-5">
            {result.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
          {result.updatesNote && (
            <div className="mt-3 whitespace-pre-wrap text-xs text-fg-subtle">
              <div className="mb-1 font-medium text-fg-muted">2026 update check (LLM):</div>
              {result.updatesNote}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-fg-muted transition hover:bg-bg-hover hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" /> Edit spends
        </button>
        <button
          onClick={onRestart}
          className="inline-flex items-center gap-1.5 rounded-lg bg-bg-hover px-3 py-2 text-sm text-fg hover:bg-bg-card"
        >
          Start over
        </button>
      </div>
    </div>
  );
}

function PortfolioCard({
  portfolio,
  cards,
  primary = false,
}: {
  portfolio: Portfolio;
  cards: CardType[];
  primary?: boolean;
}) {
  const portfolioCards = portfolio.cardIds
    .map((id) => cards.find((x) => x.id === id))
    .filter((x): x is CardType => Boolean(x));
  return (
    <div
      className={`rounded-2xl border p-5 sm:p-6 ${
        primary
          ? "border-accent/30 bg-gradient-to-br from-bg-card to-bg-subtle shadow-glow"
          : "border-border bg-bg-subtle/40"
      }`}
    >
      {/* Header: label + estimated savings */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-fg-subtle">
            {primary ? "Top match" : "Alternative"}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {portfolioCards.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center rounded-full border border-border bg-bg/60 px-2.5 py-1 text-xs font-medium text-fg"
              >
                {c.name}
                <NetworkBadge card={c} />
              </span>
            ))}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-fg-subtle">
            Estimated annual savings
          </div>
          <div className="mt-1 text-3xl font-semibold tabular-nums text-accent-mint sm:text-4xl">
            ₹{portfolio.netSavings.toLocaleString("en-IN")}
          </div>
          {portfolio.totalAnnualFee > 0 && (
            <div className="mt-0.5 text-xs text-fg-subtle">
              after ₹{portfolio.totalAnnualFee.toLocaleString("en-IN")} in fees
            </div>
          )}
        </div>
      </div>

      {/* Per-card details */}
      <div className="mt-5 space-y-3">
        {portfolio.perCardBreakdown.map((b) => {
          const c = cards.find((x) => x.id === b.cardId);
          if (!c) return null;
          const routed = Object.entries(b.categoryRouting)
            .filter(([, v]) => (v ?? 0) > 0)
            .sort((a, b) => (b[1] as number) - (a[1] as number));
          const isLtf = (c.annualFee ?? 0) === 0 && (c.joiningFee ?? 0) === 0;
          const lounge = c.loungeVisits;
          const summaryParts: string[] = [];
          if (b.rewardValue > 0)
            summaryParts.push(`₹${b.rewardValue.toLocaleString("en-IN")} rewards`);
          if (b.welcomeValue > 0)
            summaryParts.push(`₹${b.welcomeValue.toLocaleString("en-IN")} welcome`);
          if (b.milestoneValue > 0)
            summaryParts.push(`₹${b.milestoneValue.toLocaleString("en-IN")} milestone`);
          if (!isLtf && b.effectiveFee > 0)
            summaryParts.push(`₹${b.effectiveFee.toLocaleString("en-IN")} fee`);
          return (
            <div key={b.cardId} className="rounded-xl border border-border bg-bg/40 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <div className="flex items-center text-base font-semibold text-fg">
                    <span className="truncate">{c.name}</span>
                    <NetworkBadge card={c} />
                    {isLtf && (
                      <span className="ml-1.5 inline-flex items-center rounded-md border border-accent-mint/30 bg-accent-mint/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-accent-mint">
                        LTF
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-fg-muted">
                    {c.issuer} · {eligibilityBadge(c)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-fg-subtle">
                    Annual value
                  </div>
                  <div className="text-lg font-semibold tabular-nums text-fg">
                    ₹{b.net.toLocaleString("en-IN")}
                  </div>
                </div>
              </div>

              {summaryParts.length > 0 && (
                <div className="mt-3 text-sm text-fg-muted">{summaryParts.join("  ·  ")}</div>
              )}

              {(lounge?.domestic || lounge?.international) && (
                <div className="mt-2 text-xs text-accent-mint">
                  {lounge.domestic ? `${lounge.domestic} domestic lounge visits/yr` : ""}
                  {lounge.domestic && lounge.international ? " · " : ""}
                  {lounge.international ? `${lounge.international} international/yr` : ""}
                </div>
              )}

              {routed.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {routed.slice(0, 3).map(([cat, amt]) => (
                    <span
                      key={cat}
                      className="rounded-md border border-border bg-bg-hover/60 px-2 py-0.5 text-[11px] text-fg-muted"
                    >
                      {CATEGORY_LABELS[cat as SpendCategory]}: ₹
                      {Math.round(amt as number).toLocaleString("en-IN")}/yr
                    </span>
                  ))}
                </div>
              )}

              {c.url && (
                <div className="mt-3">
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-accent transition hover:text-accent-glow"
                  >
                    View official details <ArrowRight className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {portfolio.rationale && (
        <div className="mt-4 rounded-xl border border-accent/20 bg-accent/5 p-4 text-sm text-fg">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-accent">
            <Sparkles className="h-3 w-3" /> Why this match
          </div>
          {portfolio.rationale}
        </div>
      )}
    </div>
  );
}

function StepHeader({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-accent">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
          {icon}
        </span>
        <h2 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">{title}</h2>
      </div>
      <p className="mt-1.5 text-sm text-fg-muted">{sub}</p>
    </div>
  );
}

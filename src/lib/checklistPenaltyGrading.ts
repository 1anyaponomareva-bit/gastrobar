export type PenaltyGradingTier = {
  min: number;
  max: number;
  fineVnd: number;
  remarkOnly?: boolean;
};

export const CHECKLIST_PENALTY_TIERS: PenaltyGradingTier[] = [
  { min: 1, max: 11, fineVnd: 0, remarkOnly: true },
  { min: 12, max: 21, fineVnd: 100_000 },
  { min: 22, max: 31, fineVnd: 300_000 },
  { min: 32, max: 41, fineVnd: 500_000 },
  { min: 42, max: Number.POSITIVE_INFINITY, fineVnd: 1_000_000 },
];

export type PenaltyGradingResult = {
  points: number;
  tier: PenaltyGradingTier;
  fineVnd: number;
  remarkOnly: boolean;
};

export function formatPenaltyVnd(amount: number): string {
  const normalized = Math.max(0, Math.round(amount));
  return `${normalized.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} VND`;
}

export function getPenaltyGrading(points: number): PenaltyGradingResult | null {
  if (points <= 0) return null;

  const tier =
    CHECKLIST_PENALTY_TIERS.find(
      (entry) => points >= entry.min && points <= entry.max,
    ) ?? CHECKLIST_PENALTY_TIERS[CHECKLIST_PENALTY_TIERS.length - 1];

  return {
    points,
    tier,
    fineVnd: tier.fineVnd,
    remarkOnly: Boolean(tier.remarkOnly),
  };
}

export function formatPenaltyTierRange(
  tier: PenaltyGradingTier,
  locale: "ru" | "en",
): string {
  if (tier.max === Number.POSITIVE_INFINITY) {
    return locale === "ru"
      ? `${tier.min} балла и выше`
      : `${tier.min} points and above`;
  }

  return locale === "ru"
    ? `${tier.min}–${tier.max} ${tier.max === 1 ? "балл" : tier.max < 5 ? "балла" : "баллов"}`
    : `${tier.min}–${tier.max} points`;
}

export function getPenaltyVerdictText(
  grading: PenaltyGradingResult,
  locale: "ru" | "en",
): { title: string; verdict: string; tierRange: string } {
  const tierRange = formatPenaltyTierRange(grading.tier, locale);

  if (locale === "ru") {
    return {
      title: "Штрафные баллы",
      verdict: grading.remarkOnly
        ? "Замечание"
        : `Удержание: ${formatPenaltyVnd(grading.fineVnd)}`,
      tierRange,
    };
  }

  return {
    title: "Penalty points",
    verdict: grading.remarkOnly
      ? "Verbal warning"
      : `Deduction: ${formatPenaltyVnd(grading.fineVnd)}`,
    tierRange,
  };
}

import type { Minor } from './types';

export interface LifeEventConfig {
  threshold: number;
  minIndependentSignals: number;
  weights: Record<string, number>;
}

export interface EngineConfig {
  detectors: {
    overdraft: { threshold: number; bufferMinor: Minor; horizonDays: number; minHistoryDays: number; severityScaleMinor: Minor };
    contract_expiry: { threshold: number; horizonDays: number };
    recurring_increase: { threshold: number; minIncreasePct: number; minIncreaseMinor: Minor; minOccurrences: number };
    relocation: LifeEventConfig & { minHomeRatio: number; minHomeMonthlyMinor: Minor };
    job_change: LifeEventConfig & { minIncomeChangePct: number; mobilityRatioHigh: number; mobilityRatioLow: number };
    vehicle: LifeEventConfig & { minAutoRatio: number; minAutoMonthlyMinor: Minor; minSavingsRatio: number };
    housing: LifeEventConfig & { minSavingsRatio: number };
    savings_goal: { threshold: number };
    expatriation: LifeEventConfig & { minIntlMonthlyMinor: Minor; consularWindowDays: number };
    birth: { threshold: number };
    first_job: { threshold: number };
    separation: { threshold: number };
  };
  feedback: { rejectCooldownDays: number; snoozeDays: number };
  /** Fenêtres des événements récents (jours). */
  recentEventDays: number;
  minHistoryForNoveltyDays: number;
}

/**
 * Seuils fixés à la main à partir des fixtures de DÉVELOPPEMENT (src/data/personas.ts)
 * et d'un raisonnement de conception. Ils n'ont pas été ajustés sur le jeu d'évaluation.
 * Voir docs/SCORING.md.
 */
export const DEFAULT_CONFIG: EngineConfig = {
  detectors: {
    overdraft: { threshold: 0.5, bufferMinor: 10_000, horizonDays: 30, minHistoryDays: 60, severityScaleMinor: 50_000 },
    contract_expiry: { threshold: 0.6, horizonDays: 60 },
    recurring_increase: { threshold: 0.5, minIncreasePct: 0.15, minIncreaseMinor: 500, minOccurrences: 3 },
    relocation: {
      threshold: 0.55,
      minIndependentSignals: 2,
      weights: { declared: 0.6, moving_service: 0.3, home_activity: 0.25, new_utility: 0.2 },
      minHomeRatio: 1.5,
      minHomeMonthlyMinor: 5_000,
    },
    job_change: {
      threshold: 0.55,
      minIndependentSignals: 2,
      weights: { declared: 0.6, new_income_source: 0.35, income_level: 0.2, mobility: 0.15 },
      minIncomeChangePct: 0.1,
      mobilityRatioHigh: 1.4,
      mobilityRatioLow: 0.6,
    },
    vehicle: {
      threshold: 0.55,
      minIndependentSignals: 2,
      weights: { declared: 0.6, auto_activity: 0.35, savings_increase: 0.2 },
      minAutoRatio: 2,
      minAutoMonthlyMinor: 10_000,
      minSavingsRatio: 1.5,
    },
    housing: {
      threshold: 0.55,
      minIndependentSignals: 2,
      weights: { declared: 0.6, real_estate_fees: 0.35, savings_increase: 0.2 },
      minSavingsRatio: 1.5,
    },
    savings_goal: { threshold: 0 },
    expatriation: {
      threshold: 0.55,
      minIndependentSignals: 2,
      weights: { declared: 0.6, intl_transfers: 0.3, consular_fees: 0.3 },
      minIntlMonthlyMinor: 20_000,
      consularWindowDays: 90,
    },
    // Événements délicats : uniquement sur déclaration explicite, jamais déduits.
    birth: { threshold: 1 },
    first_job: { threshold: 1 },
    separation: { threshold: 1 },
  },
  feedback: { rejectCooldownDays: 90, snoozeDays: 7 },
  recentEventDays: 60,
  minHistoryForNoveltyDays: 120,
};

/**
 * Eco-points tiers — visual progression for profile UI.
 * Реализация уровней вынесена в profile-level (смысл портала молодёжи Сочи).
 */
export {
  ecoTier,
  ecoTierProgress,
  ECO_EARN_HINTS,
  profileLevel,
  profileLevelProgress,
  profileContribution,
  PROFILE_LEVELS,
  type ProfileLevel,
} from '@/lib/profile-level';

export type { ProfileLevel as EcoTierLike } from '@/lib/profile-level';

/** @deprecated use ProfileLevel / ecoTier() */
export type EcoTier = {
  id: string;
  label: string;
  color: string;
  min: number;
  next?: number;
};

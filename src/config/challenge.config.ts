import { registerAs } from '@nestjs/config';
import { z } from 'zod';

import { ConfigurationValidationError } from '../common/exceptions/configuration-validation.error';
import { formatZodIssues } from '../common/validation/format-zod-issues';
import {
  LEADERBOARD_TIE_BREAKERS,
  type LeaderboardTieBreaker,
} from '../modules/leaderboard/domain/leaderboard-tie-breaker';
import { RANKED_SOLO_QUEUE_ID } from './riot.constants';
import {
  PLATFORM_ROUTING,
  RIOT_PLATFORMS,
  RIOT_REGIONAL_ROUTES,
  type RiotPlatform,
  type RiotRegionalRoute,
} from './routing.config';

export const CHALLENGE_CONFIG_NAMESPACE = 'challenge';

export interface ChallengeConfiguration {
  readonly id: string;
  readonly name: string;
  readonly seasonLabel: string;
  readonly description: string;
  /** ISO 8601 instant. Always handled as UTC internally. */
  readonly startAt: string;
  /** ISO 8601 instant. Always handled as UTC internally. */
  readonly endAt: string;
  /** IANA zone used to turn match instants into the challenge's calendar days. */
  readonly timeZone: string;
  /** New weekday match credits granted per participant. Weekends are unlimited. */
  readonly weekdayMatchLimit: number;
  readonly queueId: number;
  readonly syncIntervalMinutes: number;
  /**
   * Overlap subtracted from the newest known match timestamp when asking Riot for
   * new match ids. Protects against clock skew; duplicates are removed by matchId.
   */
  readonly syncOverlapMinutes: number;
  /**
   * How long a resolved Riot ID (Account-V1) stays valid before being refreshed.
   * Riot IDs rarely change, so re-resolving them on every cycle only burns rate limit.
   */
  readonly accountRefreshTtlHours: number;
  /** How long the Summoner-V4 profile (icon, level) stays valid before being refreshed. */
  readonly profileRefreshTtlHours: number;
  /**
   * Maximum age of `startAt` accepted when initializing. Capturing a baseline long after
   * the challenge started silently discards everything played in between, so beyond this
   * margin the administrator must acknowledge it explicitly.
   */
  readonly lateBaselineGraceHours: number;
  readonly defaultPlatform: RiotPlatform;
  readonly defaultRegionalRoute: RiotRegionalRoute;
  /**
   * When set, matches shorter than this are ignored for statistics (remakes).
   * `null` keeps every match, which is the default: remakes are stored with their
   * own flags so the rules can evolve without losing data.
   */
  readonly minimumMatchDurationSeconds: number | null;
  readonly leaderboardTieBreakers: readonly LeaderboardTieBreaker[];
  readonly legalDisclaimer: string;
}

export const CHALLENGE: ChallengeConfiguration = {
  id: 'soloq-challenge-2026',
  name: 'SoloQ Challenge',
  seasonLabel: 'Temporada 2026',
  description:
    'Reto competitivo de ascenso en Ranked Solo/Duo de League of Legends entre participantes invitados.',
  // Viernes 7 de agosto de 2026 a las 00:00 hora local (LA1, UTC-4).
  startAt: '2026-08-07T04:00:00.000Z',
  endAt: '2026-12-31T23:59:59.999Z',
  timeZone: 'America/La_Paz',
  weekdayMatchLimit: 5,
  queueId: RANKED_SOLO_QUEUE_ID,
  syncIntervalMinutes: 5,
  syncOverlapMinutes: 30,
  accountRefreshTtlHours: 24,
  profileRefreshTtlHours: 6,
  lateBaselineGraceHours: 24,
  defaultPlatform: 'LA1',
  defaultRegionalRoute: 'AMERICAS',
  minimumMatchDurationSeconds: null,
  leaderboardTieBreakers: [
    'CURRENT_VISIBLE_RANK',
    'PROGRESS_UNITS',
    'EVENT_WINS',
    'EVENT_WIN_RATE',
    'RIOT_ID',
  ],
  legalDisclaimer:
    'SoloQ Challenge no está avalado por Riot Games y no refleja las opiniones ni los puntos de ' +
    'vista de Riot Games ni de nadie involucrado oficialmente en la producción o gestión de ' +
    'League of Legends. League of Legends y Riot Games son marcas registradas o marcas ' +
    'comerciales de Riot Games, Inc. League of Legends © Riot Games, Inc.',
};

const isoInstant = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'must be a valid ISO 8601 instant');

const ianaTimeZone = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'must be a valid IANA time zone');

const challengeConfigurationSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    seasonLabel: z.string().trim().min(1),
    description: z.string().trim().min(1),
    startAt: isoInstant,
    endAt: isoInstant,
    timeZone: ianaTimeZone,
    weekdayMatchLimit: z.number().int().min(1),
    queueId: z.number().int().positive(),
    syncIntervalMinutes: z.number().int().min(1),
    syncOverlapMinutes: z.number().int().min(0),
    accountRefreshTtlHours: z.number().int().min(0),
    profileRefreshTtlHours: z.number().int().min(0),
    lateBaselineGraceHours: z.number().int().min(0),
    defaultPlatform: z.enum(RIOT_PLATFORMS),
    defaultRegionalRoute: z.enum(RIOT_REGIONAL_ROUTES),
    minimumMatchDurationSeconds: z.number().int().positive().nullable(),
    leaderboardTieBreakers: z.array(z.enum(LEADERBOARD_TIE_BREAKERS)).min(1),
    legalDisclaimer: z.string().trim().min(1),
  })
  .superRefine((configuration, context) => {
    if (Date.parse(configuration.endAt) <= Date.parse(configuration.startAt)) {
      context.addIssue({ code: 'custom', path: ['endAt'], message: 'must be after startAt' });
    }

    const expectedRoute = PLATFORM_ROUTING[configuration.defaultPlatform].regionalRoute;
    if (configuration.defaultRegionalRoute !== expectedRoute) {
      context.addIssue({
        code: 'custom',
        path: ['defaultRegionalRoute'],
        message: `must be ${expectedRoute} for platform ${configuration.defaultPlatform}`,
      });
    }

    const uniqueTieBreakers = new Set(configuration.leaderboardTieBreakers);
    if (uniqueTieBreakers.size !== configuration.leaderboardTieBreakers.length) {
      context.addIssue({
        code: 'custom',
        path: ['leaderboardTieBreakers'],
        message: 'must not contain duplicates',
      });
    }
  });

export function validateChallengeConfiguration(
  configuration: ChallengeConfiguration,
): ChallengeConfiguration {
  const result = challengeConfigurationSchema.safeParse(configuration);

  if (!result.success) {
    throw new ConfigurationValidationError(
      `Invalid challenge configuration: ${formatZodIssues(result.error)}`,
    );
  }

  return configuration;
}

export const challengeConfig = registerAs(CHALLENGE_CONFIG_NAMESPACE, () =>
  validateChallengeConfiguration(CHALLENGE),
);

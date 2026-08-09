import { z } from 'zod';

export const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;
export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

export const LOG_LEVELS = ['error', 'warn', 'log', 'debug', 'verbose'] as const;
export type LogLevelName = (typeof LOG_LEVELS)[number];

export const STORAGE_DRIVERS = ['filesystem', 'vercel-blob'] as const;
export type StorageDriver = (typeof STORAGE_DRIVERS)[number];

const DEFAULT_PORT = 3001;
const DEFAULT_DATA_DIR = './data';
const DEFAULT_RIOT_TIMEOUT_MS = 8_000;
const DEFAULT_RIOT_MAX_CONCURRENCY = 4;
const DEFAULT_RIOT_MAX_RETRIES = 3;
const DEFAULT_PUBLIC_CACHE_TTL_SECONDS = 30;
const DEFAULT_CORS_ORIGINS = 'http://localhost:3000';
const DEFAULT_RATE_LIMIT = 120;
const DEFAULT_RATE_LIMIT_TTL_SECONDS = 60;
const DEFAULT_BODY_LIMIT = '64kb';

const MIN_ADMIN_API_KEY_LENGTH = 24;
const MIN_PORT = 1;
const MAX_PORT = 65_535;
const MIN_RIOT_TIMEOUT_MS = 1_000;
const MAX_RIOT_TIMEOUT_MS = 60_000;
const MAX_RIOT_CONCURRENCY = 20;
const MAX_RIOT_RETRIES = 5;
const MAX_CACHE_TTL_SECONDS = 3_600;

const booleanFromEnv = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(NODE_ENVIRONMENTS).default('development'),
    PORT: z.coerce.number().int().min(MIN_PORT).max(MAX_PORT).default(DEFAULT_PORT),

    /** Riot API key. Optional so the app can boot (and serve stored data) without it. */
    RIOT_API_KEY: z.string().trim().min(1).optional(),

    /** Administrative API key for the `/admin` endpoints. Mandatory in production. */
    ADMIN_INTERNAL_API_KEY: z.string().trim().min(MIN_ADMIN_API_KEY_LENGTH).optional(),

    /** Local development uses the filesystem; Vercel production uses private Blob storage. */
    STORAGE_DRIVER: z.enum(STORAGE_DRIVERS).default('filesystem'),

    CHALLENGE_DATA_DIR: z.string().trim().min(1).default(DEFAULT_DATA_DIR),

    /** Injected by Vercel when a Blob store is connected to the project. */
    BLOB_READ_WRITE_TOKEN: z.string().trim().min(1).optional(),

    /** Used exclusively by Vercel Cron to authenticate the scheduled synchronization route. */
    CRON_SECRET: z.string().trim().min(16).optional(),

    RIOT_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(MIN_RIOT_TIMEOUT_MS)
      .max(MAX_RIOT_TIMEOUT_MS)
      .default(DEFAULT_RIOT_TIMEOUT_MS),
    RIOT_MAX_CONCURRENCY: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_RIOT_CONCURRENCY)
      .default(DEFAULT_RIOT_MAX_CONCURRENCY),
    RIOT_MAX_RETRIES: z.coerce
      .number()
      .int()
      .min(0)
      .max(MAX_RIOT_RETRIES)
      .default(DEFAULT_RIOT_MAX_RETRIES),

    PUBLIC_CACHE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(0)
      .max(MAX_CACHE_TTL_SECONDS)
      .default(DEFAULT_PUBLIC_CACHE_TTL_SECONDS),

    /** Comma separated list of allowed browser origins. `*` allows every origin. */
    CORS_ORIGINS: z.string().trim().default(DEFAULT_CORS_ORIGINS),

    LOG_LEVEL: z.enum(LOG_LEVELS).default('log'),

    SYNC_ENABLED: booleanFromEnv.default(true),
    SWAGGER_ENABLED: booleanFromEnv.default(true),

    PUBLIC_RATE_LIMIT: z.coerce.number().int().min(1).default(DEFAULT_RATE_LIMIT),
    PUBLIC_RATE_LIMIT_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .default(DEFAULT_RATE_LIMIT_TTL_SECONDS),

    REQUEST_BODY_LIMIT: z.string().trim().min(2).default(DEFAULT_BODY_LIMIT),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production' && !environment.ADMIN_INTERNAL_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['ADMIN_INTERNAL_API_KEY'],
        message: `is required when NODE_ENV=production (minimum ${MIN_ADMIN_API_KEY_LENGTH} characters)`,
      });
    }

    if (environment.STORAGE_DRIVER === 'vercel-blob' && !environment.BLOB_READ_WRITE_TOKEN) {
      context.addIssue({
        code: 'custom',
        path: ['BLOB_READ_WRITE_TOKEN'],
        message: 'is required when STORAGE_DRIVER=vercel-blob',
      });
    }
  });

export type EnvironmentVariables = z.infer<typeof environmentSchema>;

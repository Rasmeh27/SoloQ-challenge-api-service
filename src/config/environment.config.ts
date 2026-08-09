import { registerAs } from '@nestjs/config';

import { ConfigurationValidationError } from '../common/exceptions/configuration-validation.error';
import { formatZodIssues } from '../common/validation/format-zod-issues';
import type {
  EnvironmentVariables,
  LogLevelName,
  NodeEnvironment,
  StorageDriver,
} from './environment.schema';
import { environmentSchema } from './environment.schema';

export const ENVIRONMENT_CONFIG_NAMESPACE = 'environment';

const CORS_ORIGIN_SEPARATOR = ',';
const ALLOW_ANY_ORIGIN = '*';

export interface RiotHttpEnvironment {
  readonly requestTimeoutMs: number;
  readonly maxConcurrency: number;
  readonly maxRetries: number;
}

export interface RateLimitEnvironment {
  readonly limit: number;
  readonly ttlSeconds: number;
}

export interface AppEnvironment {
  readonly nodeEnv: NodeEnvironment;
  readonly isProduction: boolean;
  readonly isTest: boolean;
  readonly port: number;
  /** `null` when the key is not configured; never logged nor exposed. */
  readonly riotApiKey: string | null;
  /** `null` when the key is not configured; administrative endpoints then fail closed. */
  readonly adminInternalApiKey: string | null;
  readonly storageDriver: StorageDriver;
  readonly challengeDataDir: string;
  /** `null` unless private Vercel Blob persistence is configured. */
  readonly blobReadWriteToken: string | null;
  /** `null` disables the Vercel Cron endpoint. */
  readonly cronSecret: string | null;
  readonly riot: RiotHttpEnvironment;
  readonly publicCacheTtlSeconds: number;
  readonly corsOrigins: readonly string[];
  readonly allowAnyCorsOrigin: boolean;
  readonly logLevel: LogLevelName;
  readonly synchronizationEnabled: boolean;
  readonly swaggerEnabled: boolean;
  readonly rateLimit: RateLimitEnvironment;
  readonly requestBodyLimit: string;
}

export function parseEnvironmentVariables(source: Record<string, unknown>): EnvironmentVariables {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    throw new ConfigurationValidationError(
      `Invalid environment variables: ${formatZodIssues(result.error)}`,
    );
  }

  return result.data;
}

function parseCorsOrigins(rawOrigins: string): readonly string[] {
  return rawOrigins
    .split(CORS_ORIGIN_SEPARATOR)
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function toAppEnvironment(variables: EnvironmentVariables): AppEnvironment {
  const corsOrigins = parseCorsOrigins(variables.CORS_ORIGINS);

  return {
    nodeEnv: variables.NODE_ENV,
    isProduction: variables.NODE_ENV === 'production',
    isTest: variables.NODE_ENV === 'test',
    port: variables.PORT,
    riotApiKey: variables.RIOT_API_KEY ?? null,
    adminInternalApiKey: variables.ADMIN_INTERNAL_API_KEY ?? null,
    storageDriver: variables.STORAGE_DRIVER,
    challengeDataDir: variables.CHALLENGE_DATA_DIR,
    blobReadWriteToken: variables.BLOB_READ_WRITE_TOKEN ?? null,
    cronSecret: variables.CRON_SECRET ?? null,
    riot: {
      requestTimeoutMs: variables.RIOT_REQUEST_TIMEOUT_MS,
      maxConcurrency: variables.RIOT_MAX_CONCURRENCY,
      maxRetries: variables.RIOT_MAX_RETRIES,
    },
    publicCacheTtlSeconds: variables.PUBLIC_CACHE_TTL_SECONDS,
    corsOrigins: corsOrigins.filter((origin) => origin !== ALLOW_ANY_ORIGIN),
    allowAnyCorsOrigin: corsOrigins.includes(ALLOW_ANY_ORIGIN),
    logLevel: variables.LOG_LEVEL,
    synchronizationEnabled: variables.SYNC_ENABLED,
    swaggerEnabled: variables.SWAGGER_ENABLED,
    rateLimit: {
      limit: variables.PUBLIC_RATE_LIMIT,
      ttlSeconds: variables.PUBLIC_RATE_LIMIT_TTL_SECONDS,
    },
    requestBodyLimit: variables.REQUEST_BODY_LIMIT,
  };
}

export function loadAppEnvironment(): AppEnvironment {
  return toAppEnvironment(parseEnvironmentVariables(process.env));
}

export const environmentConfig = registerAs(ENVIRONMENT_CONFIG_NAMESPACE, loadAppEnvironment);

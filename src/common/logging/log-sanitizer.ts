export const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_PATTERN =
  /(api[-_]?key|token|authorization|secret|password|cookie|credential)/i;
const RIOT_API_KEY_PATTERN = /RGAPI-[0-9a-fA-F-]{8,}/g;
const QUERY_SEPARATOR = '?';

/** Removes anything that looks like a Riot API key from free form text. */
export function sanitizeText(value: string): string {
  return value.replace(RIOT_API_KEY_PATTERN, REDACTED);
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

/**
 * Sanitizes a request URL before logging it: values of sensitive query parameters are
 * redacted by name, and anything shaped like a Riot API key is removed from the rest.
 * Request headers are never logged at all.
 */
export function sanitizeUrl(url: string): string {
  const separatorIndex = url.indexOf(QUERY_SEPARATOR);

  if (separatorIndex === -1) {
    return sanitizeText(url);
  }

  const path = url.slice(0, separatorIndex);
  const parameters = new URLSearchParams(url.slice(separatorIndex + 1));

  for (const key of [...parameters.keys()]) {
    if (isSensitiveKey(key)) {
      parameters.set(key, REDACTED);
    }
  }

  const query = parameters.toString();

  return sanitizeText(query.length === 0 ? path : `${path}${QUERY_SEPARATOR}${query}`);
}

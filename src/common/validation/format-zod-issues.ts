import type { ZodError } from 'zod';

const ISSUE_SEPARATOR = '; ';
const PATH_SEPARATOR = '.';

/**
 * Renders Zod issues as a single readable line. Only paths and messages are used,
 * never the received values, so secrets present in the validated object are not echoed.
 */
export function formatZodIssues(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.map((segment) => String(segment)).join(PATH_SEPARATOR);
      return path.length > 0 ? `${path} ${issue.message}` : issue.message;
    })
    .join(ISSUE_SEPARATOR);
}

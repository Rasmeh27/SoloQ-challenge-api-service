/**
 * Thrown while the application boots when environment variables or the static
 * challenge/participants configuration are invalid. It intentionally fails fast:
 * a misconfigured challenge must never start serving data.
 */
export class ConfigurationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ConfigurationValidationError.name;
  }
}

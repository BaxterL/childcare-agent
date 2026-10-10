export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

/** Validate a CLI string against an enum-like option list. */
export function parseEnum<const T extends readonly string[]>(
  options: T,
  value: string,
  label: string,
): T[number] {
  if (!(options as readonly string[]).includes(value)) {
    fail(`invalid ${label}: "${value}"; allowed: ${options.join(", ")}`);
  }
  return value as T[number];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Accept a YYYY-MM-DD date from the CLI, or undefined when omitted. */
export function parseDate(value: string | undefined, label: string): string | null {
  if (value === undefined) return null;
  if (!DATE_RE.test(value)) {
    fail(`invalid ${label}: "${value}"; expected YYYY-MM-DD`);
  }
  return value;
}

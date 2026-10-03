/**
 * Removes personal data and credentials before anything leaves the app for
 * an error tracker or a log line: emails, Indian and international phone
 * numbers, bearer tokens, JWTs and secret-looking query parameters inside
 * strings, and whole values under sensitive keys (auth headers, cookies,
 * passwords, tokens, email / phone fields). Pure and cycle-safe.
 */

export const FILTERED = "[Filtered]";

const SENSITIVE_KEY =
  /(authori[sz]ation|cookie|passw(or)?d|secret|token|api[-_]?key|otp|signature|session|^e-?mail$|^phone|^mobile|^contact$)/i;

const STRING_RULES: readonly [RegExp, string][] = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${FILTERED}`],
  [/\bBasic\s+[A-Za-z0-9+/=]{8,}/g, `Basic ${FILTERED}`],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[jwt]"],
  [
    /([?&#](?:access_token|refresh_token|token|key|api_key|apikey|secret|password|signature|sig|otp|auth|code)=)[^&#\s"']+/gi,
    `$1${FILTERED}`,
  ],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  [/(?<!\w)\+\d{1,3}[\s-]?\d[\d\s-]{6,13}\d(?!\w)/g, "[phone]"],
  [/(?<![\w+])(?:(?:0091|91|0)[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\w)/g, "[phone]"],
];

export function scrubString(input: string): string {
  let out = input;
  for (const [pattern, replacement] of STRING_RULES) out = out.replace(pattern, replacement);
  return out;
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

export function scrub<T>(value: T, maxDepth = 10): T {
  const seen = new WeakSet<object>();
  const walk = (input: unknown, depth: number): unknown => {
    if (typeof input === "string") return scrubString(input);
    if (input === null || typeof input !== "object") return input;
    if (seen.has(input)) return "[Circular]";
    if (depth >= maxDepth) return "[Truncated]";
    seen.add(input);
    if (Array.isArray(input)) return input.map((item) => walk(item, depth + 1));
    if (input instanceof Error) {
      return {
        name: input.name,
        message: scrubString(input.message),
        stack: input.stack && scrubString(input.stack),
      };
    }
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(input)) {
      out[key] =
        isSensitiveKey(key) && item !== null && item !== undefined ? FILTERED : walk(item, depth + 1);
    }
    return out;
  };
  return walk(value, 0) as T;
}

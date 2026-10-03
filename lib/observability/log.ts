import { scrub, scrubString } from "./scrub";

/**
 * Structured logger: one JSON line per call with level, msg, time and an
 * optional context object (scrubbed of personal data and credentials).
 * Vercel and most log drains index JSON lines. `debug` is dropped in
 * production.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogContext = Record<string, unknown>;

type Sink = (level: LogLevel, line: string) => void;

const defaultSink: Sink = (level, line) => {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

export function formatLogLine(
  level: LogLevel,
  msg: string,
  context?: LogContext,
  now: Date = new Date(),
): string {
  const entry: Record<string, unknown> = { level, msg: scrubString(msg), time: now.toISOString() };
  if (context && Object.keys(context).length) entry.context = scrub(context);
  try {
    return JSON.stringify(entry);
  } catch {
    return JSON.stringify({ level, msg: entry.msg, time: entry.time, context: "[unserializable]" });
  }
}

export function createLogger(options: { sink?: Sink; base?: LogContext; debug?: boolean } = {}) {
  const sink = options.sink ?? defaultSink;
  const debugEnabled = options.debug ?? process.env.NODE_ENV !== "production";
  const write = (level: LogLevel, msg: string, context?: LogContext) => {
    if (level === "debug" && !debugEnabled) return;
    try {
      sink(level, formatLogLine(level, msg, options.base ? { ...options.base, ...context } : context));
    } catch {
      // Logging must never throw.
    }
  };
  return {
    debug: (msg: string, context?: LogContext) => write("debug", msg, context),
    info: (msg: string, context?: LogContext) => write("info", msg, context),
    warn: (msg: string, context?: LogContext) => write("warn", msg, context),
    error: (msg: string, context?: LogContext) => write("error", msg, context),
    child: (base: LogContext) => createLogger({ ...options, base: { ...options.base, ...base } }),
  };
}

export type Logger = ReturnType<typeof createLogger>;

export const logger: Logger = createLogger();

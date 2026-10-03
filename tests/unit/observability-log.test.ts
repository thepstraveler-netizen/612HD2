import { describe, expect, it } from "vitest";
import { createLogger, formatLogLine, type LogLevel } from "@/lib/observability/log";

describe("structured logger", () => {
  it("formats one scrubbed JSON line", () => {
    const line = formatLogLine(
      "info",
      "sent to a@b.co",
      { key: "booking.confirmed", phone: "9876543210" },
      new Date(0),
    );
    expect(JSON.parse(line)).toEqual({
      level: "info",
      msg: "sent to [email]",
      time: "1970-01-01T00:00:00.000Z",
      context: { key: "booking.confirmed", phone: "[Filtered]" },
    });
    expect(JSON.parse(formatLogLine("warn", "x", {})).context).toBeUndefined();
  });

  it("writes through the sink, merges child context and drops debug when disabled", () => {
    const out: [LogLevel, string][] = [];
    const log = createLogger({ sink: (level, line) => out.push([level, line]), debug: false });
    log.debug("hidden");
    log.child({ area: "webhook" }).error("failed", { error: new Error("boom") });
    expect(out).toHaveLength(1);
    expect(out[0][0]).toBe("error");
    const entry = JSON.parse(out[0][1]);
    expect(entry.context.area).toBe("webhook");
    expect(entry.context.error).toMatchObject({ name: "Error", message: "boom" });
  });
});

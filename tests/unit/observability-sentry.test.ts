import { describe, expect, it, vi } from "vitest";
import { createConsoleReporter, createErrorReporter, parseSampleRate } from "@/lib/observability/errors";
import { buildEnvelope, buildEvent, envelopeUrl, parseDsn, parseStack } from "@/lib/observability/sentry";

describe("parseDsn", () => {
  it("parses a sentry.io DSN", () => {
    expect(parseDsn("https://abc123@o4507.ingest.us.sentry.io/4508123")).toEqual({
      raw: "https://abc123@o4507.ingest.us.sentry.io/4508123",
      protocol: "https",
      publicKey: "abc123",
      host: "o4507.ingest.us.sentry.io",
      path: "",
      projectId: "4508123",
    });
  });

  it("keeps a path prefix and port, and drops a legacy secret", () => {
    const dsn = parseDsn("http://pub:secret@sentry.local:9000/sub/path/7");
    expect(dsn).toMatchObject({
      host: "sentry.local:9000",
      path: "/sub/path",
      projectId: "7",
      publicKey: "pub",
    });
    expect(dsn?.raw).toBe("http://pub@sentry.local:9000/sub/path/7");
  });

  it.each([
    [undefined],
    [""],
    ["not a url"],
    ["https://sentry.io/1"],
    ["https://k@sentry.io/"],
    ["ftp://k@h/1"],
    ["https://k@h/abc"],
  ])("rejects %s", (input) => {
    expect(parseDsn(input)).toBeNull();
  });

  it("builds the envelope endpoint with query auth", () => {
    const dsn = parseDsn("https://abc@o1.ingest.sentry.io/42")!;
    expect(envelopeUrl(dsn)).toBe(
      "https://o1.ingest.sentry.io/api/42/envelope/?sentry_key=abc&sentry_version=7&sentry_client=ps-traveler%2F1.0",
    );
    expect(envelopeUrl(parseDsn("http://k@h:9000/p/3")!)).toMatch(
      /^http:\/\/h:9000\/p\/api\/3\/envelope\/\?/,
    );
  });
});

describe("events and envelopes", () => {
  it("parses V8 and Gecko stacks oldest first", () => {
    const v8 =
      "TypeError: x\n    at inner (/app/.next/server/page.js:10:5)\n    at /app/node_modules/react/index.js:1:2";
    expect(parseStack(v8)).toEqual([
      {
        function: undefined,
        filename: "/app/node_modules/react/index.js",
        lineno: 1,
        colno: 2,
        in_app: false,
      },
      { function: "inner", filename: "/app/.next/server/page.js", lineno: 10, colno: 5, in_app: true },
    ]);
    expect(parseStack("handler@https://site/_next/chunk.js:3:9")).toEqual([
      { function: "handler", filename: "https://site/_next/chunk.js", lineno: 3, colno: 9, in_app: true },
    ]);
    expect(parseStack(undefined)).toEqual([]);
  });

  it("builds an event from errors and non-errors", () => {
    const now = new Date("2026-10-03T10:00:00.000Z");
    const event = buildEvent({
      error: new RangeError("too big"),
      platform: "node",
      environment: "production",
      release: "abc",
      tags: { area: "x" },
      eventId: "f".repeat(32),
      now,
    });
    expect(event).toMatchObject({
      event_id: "f".repeat(32),
      timestamp: now.getTime() / 1000,
      platform: "node",
      level: "error",
      environment: "production",
      release: "abc",
      tags: { area: "x" },
    });
    expect(event.exception.values[0]).toMatchObject({ type: "RangeError", value: "too big" });
    expect(buildEvent({ error: "boom", platform: "javascript" }).exception.values[0]).toEqual({
      type: "Error",
      value: "boom",
    });
    expect(buildEvent({ error: { a: 1 }, platform: "javascript" }).exception.values[0].value).toBe('{"a":1}');
    expect(buildEvent({ error: "x", platform: "node" }).event_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("serialises an envelope as three newline-delimited JSON lines", () => {
    const dsn = parseDsn("https://abc@o1.ingest.sentry.io/42")!;
    const event = buildEvent({ error: new Error("é"), platform: "node", eventId: "a".repeat(32) });
    const envelope = buildEnvelope(event, dsn, new Date("2026-10-03T10:00:00.000Z"));
    expect(envelope.endsWith("\n")).toBe(true);
    const [header, item, payload] = envelope.trimEnd().split("\n");
    expect(JSON.parse(header)).toEqual({
      event_id: "a".repeat(32),
      sent_at: "2026-10-03T10:00:00.000Z",
      dsn: "https://abc@o1.ingest.sentry.io/42",
    });
    expect(JSON.parse(item)).toEqual({
      type: "event",
      content_type: "application/json",
      length: new TextEncoder().encode(payload).length,
    });
    expect(JSON.parse(payload).exception.values[0].value).toBe("é");
  });
});

describe("reporters", () => {
  it("parses the sample rate", () => {
    expect(parseSampleRate(undefined)).toBe(1);
    expect(parseSampleRate("")).toBe(1);
    expect(parseSampleRate("0.25")).toBe(0.25);
    expect(parseSampleRate("5")).toBe(1);
    expect(parseSampleRate("-1")).toBe(0);
    expect(parseSampleRate("abc")).toBe(1);
  });

  it("falls back to a console JSON line without a DSN", async () => {
    const lines: string[] = [];
    const reporter = createErrorReporter({ platform: "node", sink: (l) => lines.push(l) });
    expect(reporter.kind).toBe("console");
    await reporter.captureException(new Error("failed for a@b.co"), {
      tags: { area: "x" },
      request: { url: "/trip?token=t", headers: { cookie: "c" } },
    });
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({ level: "error", msg: "Error: failed for [email]" });
    expect(entry.context.tags).toEqual({ area: "x" });
    expect(entry.context.request).toEqual({
      url: "/trip?token=[Filtered]",
      headers: { cookie: "[Filtered]" },
    });
  });

  it("posts a scrubbed envelope to Sentry when a DSN is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const reporter = createErrorReporter({
      dsn: "https://abc@o1.ingest.sentry.io/42",
      platform: "javascript",
      environment: "preview",
      fetch: fetchMock,
    });
    expect(reporter.kind).toBe("sentry");
    await reporter.captureException(new Error("user 9876543210 failed"), {
      request: { url: "https://site/x", headers: { Authorization: "Bearer zzz", "User-Agent": "UA" } },
      extra: { email: "a@b.co", count: 2 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/42/envelope/?sentry_key=abc");
    const body = String(init.body);
    expect(body).not.toContain("9876543210");
    expect(body).not.toContain("zzz");
    expect(body).not.toContain("a@b.co");
    const payload = JSON.parse(body.trimEnd().split("\n")[2]);
    expect(payload.exception.values[0].value).toBe("user [phone] failed");
    expect(payload.request.headers).toEqual({ Authorization: "[Filtered]", "User-Agent": "UA" });
    expect(payload.extra).toEqual({ email: "[Filtered]", count: 2 });
    expect(payload.environment).toBe("preview");
  });

  it("respects the sample rate and falls back to the console on failure", async () => {
    const lines: string[] = [];
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    const sampled = createErrorReporter({
      dsn: "https://abc@o1.ingest.sentry.io/42",
      platform: "node",
      sampleRate: "0.5",
      random: () => 0.9,
      fetch: fetchMock,
      sink: (l) => lines.push(l),
    });
    await sampled.captureException(new Error("dropped"));
    expect(fetchMock).not.toHaveBeenCalled();

    const failing = createErrorReporter({
      dsn: "https://abc@o1.ingest.sentry.io/42",
      platform: "node",
      sampleRate: "0.5",
      random: () => 0.1,
      fetch: fetchMock,
      sink: (l) => lines.push(l),
    });
    await expect(failing.captureException(new Error("kept"))).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(lines[0]).msg).toBe("Error: kept");
  });

  it("console reporter never throws", async () => {
    const reporter = createConsoleReporter(() => {
      throw new Error("sink down");
    });
    await expect(reporter.captureException(new Error("x"))).resolves.toBeUndefined();
  });
});

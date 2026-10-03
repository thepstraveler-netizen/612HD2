import { describe, expect, it } from "vitest";
import { FILTERED, scrub, scrubString } from "@/lib/observability/scrub";

describe("scrubString", () => {
  it.each([
    ["mail priya.s+trip@example.co.in now", "mail [email] now"],
    ["call 9876543210", "call [phone]"],
    ["call 98765 43210.", "call [phone]."],
    ["call 09876543210", "call [phone]"],
    ["call +91 98765 43210", "call [phone]"],
    ["intl +44 7911 123456", "intl [phone]"],
    ["Authorization: Bearer abc.def-123", "Authorization: Bearer [Filtered]"],
    ["Basic dXNlcjpwYXNzd29yZA==", "Basic [Filtered]"],
    ["jwt eyJhbGciOi.eyJzdWIiOiIx.c2lnbmF0dXJl", "jwt [jwt]"],
    ["/trip?token=abc123&x=1", "/trip?token=[Filtered]&x=1"],
    ["/cb?code=XYZ#access_token=s3cr3t", "/cb?code=[Filtered]#access_token=[Filtered]"],
  ])("%s", (input, expected) => {
    expect(scrubString(input)).toBe(expected);
  });

  it("leaves ordinary text, ids, timestamps and hex alone", () => {
    const text =
      "booking PS-ABC123 total 125000 at 1730000000000 id a9876543210bcdef3c2d1e0f12345678 line 42:17 2026-11-12";
    expect(scrubString(text)).toBe(text);
  });
});

describe("scrub", () => {
  it("filters sensitive keys and scrubs nested strings", () => {
    const input = {
      headers: {
        authorization: "Bearer x",
        Cookie: "sb-access-token=abc",
        "x-razorpay-signature": "sig",
        "user-agent": "Mozilla/5.0",
      },
      user: { email: "a@b.co", phone: "9876543210", name: "Asha" },
      note: "reach me at a@b.co",
      list: ["9876543210", 42, null],
      password: "hunter2",
      apiKey: "k",
      empty: { token: null },
    };
    expect(scrub(input)).toEqual({
      headers: {
        authorization: FILTERED,
        Cookie: FILTERED,
        "x-razorpay-signature": FILTERED,
        "user-agent": "Mozilla/5.0",
      },
      user: { email: FILTERED, phone: FILTERED, name: "Asha" },
      note: "reach me at [email]",
      list: ["[phone]", 42, null],
      password: FILTERED,
      apiKey: FILTERED,
      empty: { token: null },
    });
  });

  it("does not mutate its input and handles cycles, depth and errors", () => {
    const input: Record<string, unknown> = { a: "x@y.com" };
    input.self = input;
    const out = scrub(input);
    expect(input.a).toBe("x@y.com");
    expect(out.self).toBe("[Circular]");
    expect(scrub({ a: { b: { c: 1 } } }, 2)).toEqual({ a: { b: "[Truncated]" } });
    const err = scrub({ err: new Error("bad email a@b.co") }).err as { name: string; message: string };
    expect(err).toMatchObject({ name: "Error", message: "bad email [email]" });
  });
});

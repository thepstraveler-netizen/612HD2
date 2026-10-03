import { describe, expect, it } from "vitest";
import {
  RATE_LIMIT_KEYS,
  securitySettingsFormSchema,
  securitySettingsFormValues,
  securitySettingsValue,
} from "@/schemas/security";

const settings = {
  require_admin_mfa: false,
  turnstile_enabled: true,
  rate_limits: {
    auth: { limit: 10, window_seconds: 600 },
    enquiry: { limit: 5, window_seconds: 600 },
    coupon: { limit: 30, window_seconds: 600 },
    partner: { limit: 3, window_seconds: 3600 },
    review: { limit: 10, window_seconds: 3600 },
    upload: { limit: 30, window_seconds: 600 },
    export: { limit: 5, window_seconds: 3600 },
  },
};

describe("Settings → Security form", () => {
  it("round-trips the stored value through the form (windows in minutes)", () => {
    const form = securitySettingsFormValues(settings);
    expect(form.rate_limits.export).toEqual({ limit: 5, window_minutes: 60 });
    const parsed = securitySettingsFormSchema.parse(form);
    expect(securitySettingsValue(parsed)).toEqual(settings);
  });

  it("accepts the strings number inputs send and the MFA switch", () => {
    const form = securitySettingsFormValues(settings);
    const parsed = securitySettingsFormSchema.parse({
      ...form,
      require_admin_mfa: true,
      rate_limits: { ...form.rate_limits, auth: { limit: "20", window_minutes: "15" } },
    });
    const value = securitySettingsValue(parsed);
    expect(value.require_admin_mfa).toBe(true);
    expect(value.rate_limits.auth).toEqual({ limit: 20, window_seconds: 900 });
  });

  it("rejects zero, fractions and windows over a day", () => {
    const form = securitySettingsFormValues(settings);
    for (const bad of [
      { limit: 0, window_minutes: 10 },
      { limit: 1.5, window_minutes: 10 },
      { limit: 5, window_minutes: 1441 },
      { limit: "", window_minutes: 10 },
    ]) {
      const result = securitySettingsFormSchema.safeParse({
        ...form,
        rate_limits: { ...form.rate_limits, coupon: bad },
      });
      expect(result.success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("covers every limiter bucket", () => {
    expect([...RATE_LIMIT_KEYS].sort()).toEqual(Object.keys(settings.rate_limits).sort());
  });

  it("rounds odd stored windows to at least one minute", () => {
    const form = securitySettingsFormValues({
      ...settings,
      rate_limits: { ...settings.rate_limits, auth: { limit: 3, window_seconds: 20 } },
    });
    expect(form.rate_limits.auth.window_minutes).toBe(1);
  });
});

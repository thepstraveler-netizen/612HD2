import { describe, expect, it, vi } from "vitest";
import { createMsg91Provider, MSG91_FLOW_URL } from "@/lib/notifications/msg91";
import { parseProviderSettings, redactSecrets, type OutgoingMessage } from "@/lib/notifications/providers";
import { createWhatsAppProvider, whatsAppParam } from "@/lib/notifications/whatsapp";

const to = { email: "guest@example.com", phone: "098765 43210", userId: "u1" };
const message: OutgoingMessage = {
  key: "booking.confirmed",
  locale: "hi",
  subject: "booking.confirmed",
  body: "rendered",
  templateBody: "P&S: booking {{code}} at {{hotel}} on {{check_in}}. {{trip_url}} ({{code}})",
  values: { code: "PS-ABC123", hotel: "Demo Kunj\nVrindavan", check_in: "12 Nov", trip_url: null },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function lastCall(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> };
}

describe("MSG91 provider", () => {
  const config = { authKey: "msg91-secret-key", senderId: "PSTRVL" };
  const templates = { "booking.confirmed": { template_id: "65f0dlt" } };

  it("is skipped when not configured and never calls fetch", async () => {
    const fetchMock = vi.fn();
    const provider = createMsg91Provider({ config: null, templates, fetch: fetchMock });
    expect(await provider.send(to, message)).toEqual({
      status: "skipped",
      provider: "msg91",
      error: "msg91 not configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is skipped without a valid phone or template id", async () => {
    const fetchMock = vi.fn();
    const provider = createMsg91Provider({ config, templates, fetch: fetchMock });
    expect((await provider.send({ ...to, phone: "12345" }, message)).error).toBe("no valid phone number");
    expect((await provider.send(to, { ...message, key: "payment.link" })).error).toBe(
      "no DLT template id for payment.link",
    );
    const blank = createMsg91Provider({
      config,
      templates: { "booking.confirmed": { template_id: "" } },
      fetch: fetchMock,
    });
    expect((await blank.send(to, message)).status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts a flow request with var1..varN from the body's placeholder order", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ type: "success", message: "req-123" }));
    const provider = createMsg91Provider({ config, templates, fetch: fetchMock });
    expect(await provider.send(to, message)).toEqual({ status: "sent", provider: "msg91", id: "req-123" });
    const { url, init, body } = lastCall(fetchMock);
    expect(url).toBe(MSG91_FLOW_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authkey).toBe("msg91-secret-key");
    expect(body).toEqual({
      template_id: "65f0dlt",
      short_url: "0",
      sender: "PSTRVL",
      recipients: [
        {
          mobiles: "919876543210",
          var1: "PS-ABC123",
          var2: "Demo Kunj\nVrindavan",
          var3: "12 Nov",
          var4: "",
        },
      ],
    });
  });

  it("uses an explicit variable order and omits sender when unset", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ type: "success", message: "r" }));
    const provider = createMsg91Provider({
      config: { authKey: "k", senderId: null },
      templates: { "booking.confirmed": { template_id: "t", variables: ["hotel", "code"] } },
      fetch: fetchMock,
    });
    await provider.send(to, message);
    const { body } = lastCall(fetchMock);
    expect(body.sender).toBeUndefined();
    expect(body.recipients).toEqual([
      { mobiles: "919876543210", var1: "Demo Kunj\nVrindavan", var2: "PS-ABC123" },
    ]);
  });

  it("maps provider errors to failed without leaking the key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ type: "error", message: "Template ID Missing" }))
      .mockResolvedValueOnce(
        jsonResponse({ type: "error", message: "Invalid authkey msg91-secret-key" }, 401),
      )
      .mockResolvedValueOnce(new Response("oops", { status: 502 }))
      .mockRejectedValueOnce(new Error("socket hang up"));
    const provider = createMsg91Provider({ config, templates, fetch: fetchMock });
    expect(await provider.send(to, message)).toEqual({
      status: "failed",
      provider: "msg91",
      error: "Template ID Missing",
    });
    const second = await provider.send(to, message);
    expect(second.status).toBe("failed");
    expect(second.error).toBe("HTTP 401: Invalid authkey [redacted]");
    expect((await provider.send(to, message)).error).toBe("HTTP 502: HTTP 502");
    expect((await provider.send(to, message)).error).toBe("socket hang up");
  });
});

describe("WhatsApp Cloud provider", () => {
  const config = { token: "EAAGsecrettoken", phoneNumberId: "1234567890", apiVersion: "v21.0" };
  const templates = {
    "booking.confirmed": { name: "booking_confirmed", languages: { en: "en", hi: "hi_IN" } },
  };

  it("is skipped when not configured, without a phone or without a template", async () => {
    const fetchMock = vi.fn();
    expect(
      (await createWhatsAppProvider({ config: null, templates, fetch: fetchMock }).send(to, message)).error,
    ).toBe("whatsapp not configured");
    const provider = createWhatsAppProvider({ config, templates, fetch: fetchMock });
    expect((await provider.send({ ...to, phone: null }, message)).status).toBe("skipped");
    expect((await provider.send(to, { ...message, key: "quote.sent" })).error).toBe(
      "no WhatsApp template for quote.sent",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a template message with body parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ messages: [{ id: "wamid.HBg" }] }));
    const provider = createWhatsAppProvider({ config, templates, fetch: fetchMock });
    expect(await provider.send(to, message)).toEqual({
      status: "sent",
      provider: "whatsapp_cloud",
      id: "wamid.HBg",
    });
    const { url, init, body } = lastCall(fetchMock);
    expect(url).toBe("https://graph.facebook.com/v21.0/1234567890/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer EAAGsecrettoken");
    expect(body).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "919876543210",
      type: "template",
      template: {
        name: "booking_confirmed",
        language: { code: "hi_IN" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "PS-ABC123" },
              { type: "text", text: "Demo Kunj Vrindavan" },
              { type: "text", text: "12 Nov" },
              { type: "text", text: "-" },
            ],
          },
        ],
      },
    });
  });

  it("falls back to the locale as language and sends no components without params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ messages: [{ id: "x" }] }));
    const provider = createWhatsAppProvider({
      config,
      templates: { "booking.confirmed": { name: "hello", params: [] } },
      fetch: fetchMock,
    });
    await provider.send(to, { ...message, locale: "en" });
    const { body } = lastCall(fetchMock);
    expect(body.template).toEqual({ name: "hello", language: { code: "en" }, components: [] });
  });

  it("maps Graph API errors and redacts the token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "(#132001) Template name does not exist", code: 132001 } }, 400),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "Bad token EAAGsecrettoken", code: 190 } }, 401),
      )
      .mockResolvedValueOnce(jsonResponse({}, 200))
      .mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
    const provider = createWhatsAppProvider({ config, templates, fetch: fetchMock });
    expect((await provider.send(to, message)).error).toBe("132001: (#132001) Template name does not exist");
    expect((await provider.send(to, message)).error).toBe("190: Bad token [redacted]");
    expect(await provider.send(to, message)).toMatchObject({ status: "failed", error: "HTTP 200" });
    expect(await provider.send(to, message)).toMatchObject({ status: "failed", error: "timed out" });
  });

  it("cleans parameters", () => {
    expect(whatsAppParam("a\n\tb    c")).toBe("a b c");
    expect(whatsAppParam("")).toBe("-");
    expect(whatsAppParam(undefined)).toBe("-");
    expect(whatsAppParam(1500)).toBe("1500");
  });
});

describe("provider settings", () => {
  it("parses and defaults", () => {
    expect(parseProviderSettings(null)).toEqual({ sms: {}, whatsapp: {} });
    expect(parseProviderSettings({ sms: { a: {} } })).toEqual({
      sms: { a: { template_id: "" } },
      whatsapp: {},
    });
    expect(parseProviderSettings({ sms: "nope" })).toEqual({ sms: {}, whatsapp: {} });
    expect(parseProviderSettings({ sms: { a: { template_id: "x", variables: ["bad name"] } } })).toEqual({
      sms: {},
      whatsapp: {},
    });
  });

  it("redacts secrets and caps length", () => {
    expect(redactSecrets("key abcd1234 rejected", ["abcd1234", null])).toBe("key [redacted] rejected");
    expect(redactSecrets("x".repeat(900), [])).toHaveLength(500);
  });
});

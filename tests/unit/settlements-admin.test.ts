import { describe, expect, it } from "vitest";
import {
  agreementNeedsNewVersion,
  applicationStatusTone,
  documentStatusTone,
  formatBytes,
  humanizeKey,
  isKnownDocumentKind,
  maskAccountNumber,
  nextFreeSlug,
  NEW_VENDOR,
  partnersSettingsFormValues,
  partnersSettingsValue,
  readApplicationDetails,
  readApplicationDocuments,
  readBankDetails,
  vendorFormValues,
  vendorSlugBase,
  vendorStatusTone,
  vendorUpdateRow,
} from "@/lib/partners/admin-rows";
import {
  commissionReport,
  commissionReportCsv,
  defaultReportRange,
  fileSafe,
  ledgerQueryString,
  payoutStatusTone,
  settlementsSettingsFormValues,
  settlementsSettingsValue,
  summariseUnsettled,
} from "@/lib/settlements/admin-rows";
import {
  balanceDirection,
  lastCycleEnd,
  payoutReference,
  statementCsv,
  sumLedger,
  type LedgerAmounts,
  type StatementRow,
} from "@/lib/settlements/statement";
import { partnersSettingsSchema } from "@/schemas/partners";
import { settlementsSettingsSchema } from "@/schemas/settlements";
import {
  applicationFiltersSchema,
  ledgerFiltersSchema,
  partnersSettingsFormSchema,
  reportRangeSchema,
  settlementsSettingsFormSchema,
  vendorAdminSchema,
  vendorFiltersSchema,
} from "@/schemas/vendor-admin";
import type { Tables } from "@/types/database";

const ZERO: LedgerAmounts = {
  gross_paise: 0,
  platform_collected_paise: 0,
  vendor_collected_paise: 0,
  commission_paise: 0,
  commission_tax_paise: 0,
  tcs_paise: 0,
  tds_paise: 0,
  adjustment_paise: 0,
  net_paise: 0,
};

/** A ledger row whose net follows the database check constraint. */
function row(partial: Partial<LedgerAmounts>): LedgerAmounts {
  const r = { ...ZERO, ...partial };
  r.net_paise =
    r.platform_collected_paise -
    r.commission_paise -
    r.commission_tax_paise -
    r.tcs_paise -
    r.tds_paise +
    r.adjustment_paise;
  return r;
}

// ---------------------------------------------------------------- statement.ts

describe("sumLedger", () => {
  it("returns zeros for no rows", () => {
    expect(sumLedger([])).toEqual({ count: 0, ...ZERO });
  });

  it("adds every amount column and counts rows", () => {
    const online = row({
      gross_paise: 100_000,
      platform_collected_paise: 100_000,
      commission_paise: 10_000,
      commission_tax_paise: 1_800,
    });
    const cash = row({
      gross_paise: 50_000,
      vendor_collected_paise: 50_000,
      commission_paise: 5_000,
      commission_tax_paise: 900,
    });
    const manual = row({ adjustment_paise: -2_500 });
    const t = sumLedger([online, cash, manual]);
    expect(t.count).toBe(3);
    expect(t.gross_paise).toBe(150_000);
    expect(t.platform_collected_paise).toBe(100_000);
    expect(t.vendor_collected_paise).toBe(50_000);
    expect(t.commission_paise).toBe(15_000);
    expect(t.commission_tax_paise).toBe(2_700);
    expect(t.adjustment_paise).toBe(-2_500);
    expect(t.net_paise).toBe(online.net_paise + cash.net_paise + manual.net_paise);
    expect(t.net_paise).toBe(100_000 - 15_000 - 2_700 - 2_500);
  });

  it("does not mutate its input", () => {
    const rows = [row({ platform_collected_paise: 10 })];
    const copy = structuredClone(rows);
    sumLedger(rows);
    expect(rows).toEqual(copy);
  });
});

describe("balanceDirection", () => {
  it("pays the vendor on a positive net, collects on a negative one", () => {
    expect(balanceDirection(1)).toBe("pay_vendor");
    expect(balanceDirection(-1)).toBe("collect");
    expect(balanceDirection(0)).toBe("settled");
  });
});

describe("payoutReference", () => {
  it("pads to five digits", () => {
    expect(payoutReference(1)).toBe("PO-00001");
    expect(payoutReference(12)).toBe("PO-00012");
    expect(payoutReference(99_999)).toBe("PO-99999");
  });

  it("keeps longer numbers whole", () => {
    expect(payoutReference(123_456)).toBe("PO-123456");
  });
});

describe("lastCycleEnd", () => {
  it("returns the day before the current cycle started (cycles counted from 2026-01-01)", () => {
    // 7-day cycles: Jan 1–7, Jan 8–14, …
    expect(lastCycleEnd("2026-01-08", 7)).toBe("2026-01-07");
    expect(lastCycleEnd("2026-01-14", 7)).toBe("2026-01-07");
    expect(lastCycleEnd("2026-01-15", 7)).toBe("2026-01-14");
  });

  it("returns the end of the previous year during the first cycle", () => {
    expect(lastCycleEnd("2026-01-01", 7)).toBe("2025-12-31");
    expect(lastCycleEnd("2026-01-07", 7)).toBe("2025-12-31");
  });

  it("is yesterday for daily cycles", () => {
    expect(lastCycleEnd("2026-03-01", 1)).toBe("2026-02-28");
    expect(lastCycleEnd("2026-01-01", 1)).toBe("2025-12-31");
  });

  it("gives every day of a cycle the same cut-off and crosses month ends", () => {
    // 2026-10-03 is day 275; 14-day cycles: 266–279 → started 2026-09-24
    const ends = ["2026-09-24", "2026-10-03", "2026-10-07"].map((d) => lastCycleEnd(d, 14));
    expect(new Set(ends)).toEqual(new Set(["2026-09-23"]));
    expect(lastCycleEnd("2026-10-08", 14)).toBe("2026-10-07");
  });

  it("is never on or after today", () => {
    for (const cycle of [1, 3, 7, 15, 30, 60]) {
      for (const today of ["2026-01-01", "2026-02-28", "2026-07-15", "2026-12-31", "2027-03-01"]) {
        expect(lastCycleEnd(today, cycle) < today, `${today}/${cycle}`).toBe(true);
      }
    }
  });
});

describe("statementCsv", () => {
  const base: StatementRow = {
    ...row({ gross_paise: 123_456, platform_collected_paise: 123_456, commission_paise: 12_346 }),
    entry_date: "2026-10-01",
    booking_code: "PST-ABC123",
    kind: "booking",
    payout_reference: "PO-00007",
    note: null,
  };

  it("writes a header and amounts in rupees with two decimals", () => {
    const [header, line] = statementCsv([base]).split("\n");
    expect(header).toBe(
      "date,booking,kind,gross,collected_by_platform,collected_by_vendor,commission,gst_on_commission,tcs,tds,adjustment,net,payout,note",
    );
    expect(line).toBe(
      "2026-10-01,PST-ABC123,booking,1234.56,1234.56,0.00,123.46,0.00,0.00,0.00,0.00,1111.10,PO-00007,",
    );
  });

  it("writes negative amounts and empty nulls", () => {
    const manual: StatementRow = {
      ...row({ adjustment_paise: -5 }),
      entry_date: "2026-10-02",
      booking_code: null,
      kind: "manual",
      payout_reference: null,
      note: "Damaged linen",
    };
    expect(statementCsv([manual]).split("\n")[1]).toBe(
      "2026-10-02,,manual,0.00,0.00,0.00,0.00,0.00,0.00,0.00,-0.05,-0.05,,Damaged linen",
    );
  });

  it("quotes commas, quotes and new lines in notes", () => {
    const lines = statementCsv([{ ...base, note: 'Refund, "partial"\nsee mail' }]);
    expect(lines.endsWith(',PO-00007,"Refund, ""partial""\nsee mail"')).toBe(true);
  });

  it("is only the header for no rows", () => {
    expect(statementCsv([]).split("\n")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- settlements/admin-rows.ts

describe("settlement admin rows", () => {
  it("tones payout statuses", () => {
    expect(payoutStatusTone("paid")).toBe("success");
    expect(payoutStatusTone("pending")).toBe("warning");
    expect(payoutStatusTone("cancelled")).toBe("muted");
  });

  it("summarises unsettled rows per vendor, largest balance either way first", () => {
    const out = summariseUnsettled([
      { vendor_id: "a", entry_date: "2026-09-10", net_paise: 1_000 },
      { vendor_id: "b", entry_date: "2026-09-05", net_paise: -5_000 },
      { vendor_id: "a", entry_date: "2026-09-01", net_paise: 2_000 },
      { vendor_id: "c", entry_date: "2026-09-20", net_paise: 3_000 },
    ]);
    expect(out).toEqual([
      { vendorId: "b", count: 1, netPaise: -5_000, oldest: "2026-09-05" },
      { vendorId: "a", count: 2, netPaise: 3_000, oldest: "2026-09-01" },
      { vendorId: "c", count: 1, netPaise: 3_000, oldest: "2026-09-20" },
    ]);
    expect(summariseUnsettled([])).toEqual([]);
  });

  it("builds the commission report per vendor, sorted by name, with a grand total", () => {
    const names = new Map([
      ["v1", "Shri Dham"],
      ["v2", "Annapurna Bhojnalaya"],
    ]);
    const report = commissionReport(
      [
        {
          vendor_id: "v1",
          ...row({ gross_paise: 1_000, platform_collected_paise: 1_000, commission_paise: 100 }),
        },
        {
          vendor_id: "v2",
          ...row({ gross_paise: 2_000, vendor_collected_paise: 2_000, commission_paise: 300 }),
        },
        {
          vendor_id: "v1",
          ...row({ gross_paise: 500, platform_collected_paise: 500, commission_paise: 50 }),
        },
        { vendor_id: "v3", ...row({ adjustment_paise: 10 }) },
      ],
      names,
    );
    expect(report.rows.map((r) => [r.vendorName, r.count, r.gross_paise, r.commission_paise])).toEqual([
      ["Annapurna Bhojnalaya", 1, 2_000, 300],
      ["Shri Dham", 2, 1_500, 150],
      ["v3", 1, 0, 0],
    ]);
    expect(report.totals.count).toBe(4);
    expect(report.totals.commission_paise).toBe(450);
    expect(report.totals.net_paise).toBe(report.rows.reduce((s, r) => s + r.net_paise, 0));
  });

  it("writes the commission report CSV with a TOTAL line and safe vendor names", () => {
    const report = commissionReport(
      [
        {
          vendor_id: "x",
          ...row({ gross_paise: 10_050, platform_collected_paise: 10_050, commission_paise: 1_005 }),
        },
        { vendor_id: "y", ...row({ adjustment_paise: 100 }) },
      ],
      new Map([
        ["x", "=HYPERLINK(evil)"],
        ["y", 'Gupta, "Sons"'],
      ]),
    );
    const lines = commissionReportCsv(report).split("\n");
    expect(lines[0]).toBe(
      "vendor,entries,gross,collected_by_platform,collected_by_vendor,commission,gst_on_commission,tcs,tds,adjustment,net",
    );
    expect(lines[1]).toBe("'=HYPERLINK(evil),1,100.50,100.50,0.00,10.05,0.00,0.00,0.00,0.00,90.45");
    expect(lines[2]).toBe('"Gupta, ""Sons""",1,0.00,0.00,0.00,0.00,0.00,0.00,0.00,1.00,1.00');
    expect(lines[3]).toBe("TOTAL,2,100.50,100.50,0.00,10.05,0.00,0.00,0.00,1.00,91.45");
  });

  it("makes download-safe file name fragments", () => {
    expect(fileSafe("Shri Dham & Sons")).toBe("shri-dham-sons");
    expect(fileSafe("  --- ")).toBe("vendor");
    expect(fileSafe("राधा")).toBe("vendor");
    expect(fileSafe("a".repeat(60))).toHaveLength(40);
  });

  it("builds the ledger CSV query string from the page filters", () => {
    expect(ledgerQueryString("v1", { view: "all" })).toBe("vendor=v1");
    expect(ledgerQueryString("v1", { from: "2026-09-01", to: "2026-09-30", view: "unsettled" })).toBe(
      "vendor=v1&from=2026-09-01&to=2026-09-30&view=unsettled",
    );
  });

  it("defaults the report to the first of last month through today", () => {
    expect(defaultReportRange("2026-10-03")).toEqual({ from: "2026-09-01", to: "2026-10-03" });
    expect(defaultReportRange("2026-01-15")).toEqual({ from: "2025-12-01", to: "2026-01-15" });
  });

  it("maps settlements settings to the form (%) and back (bps), keeping the provider", () => {
    const stored = settlementsSettingsSchema.parse({
      commission_tax_bps: 1800,
      tcs_bps: 100,
      tds_bps: 0,
      cycle_days: 14,
    });
    const form = settlementsSettingsFormValues(stored);
    expect(form).toEqual({
      commission_tax_percent: "18",
      tcs_percent: "1",
      tds_percent: "0",
      cycle_days: 14,
    });
    const parsed = settlementsSettingsFormSchema.parse({ ...form, tds_percent: "0.75" });
    expect(settlementsSettingsValue(parsed, "manual")).toEqual({
      commission_tax_bps: 1800,
      tcs_bps: 100,
      tds_bps: 75,
      cycle_days: 14,
      provider: "manual",
    });
  });
});

// ---------------------------------------------------------------- partners/admin-rows.ts

describe("partner admin rows", () => {
  it("tones application, vendor and document statuses", () => {
    expect(applicationStatusTone("submitted")).toBe("warning");
    expect(applicationStatusTone("under_review")).toBe("info");
    expect(applicationStatusTone("approved")).toBe("success");
    expect(applicationStatusTone("rejected")).toBe("danger");
    expect(vendorStatusTone("active")).toBe("success");
    expect(vendorStatusTone("pending")).toBe("warning");
    expect(vendorStatusTone("suspended")).toBe("danger");
    expect(documentStatusTone("verified")).toBe("success");
    expect(documentStatusTone("pending")).toBe("warning");
    expect(documentStatusTone("rejected")).toBe("danger");
  });

  it("reads application documents leniently", () => {
    expect(readApplicationDocuments(null)).toEqual([]);
    expect(readApplicationDocuments({ path: "x" })).toEqual([]);
    expect(
      readApplicationDocuments([
        { kind: "pan", path: "partners/a/b.pdf", name: "pan.pdf", mime_type: "application/pdf", size: 2048 },
        { path: "partners/a/c.jpg" },
        { kind: "gst" },
        "junk",
      ]),
    ).toEqual([
      { kind: "pan", path: "partners/a/b.pdf", name: "pan.pdf", mime_type: "application/pdf", size: 2048 },
      {
        kind: "other",
        path: "partners/a/c.jpg",
        name: "document",
        mime_type: "application/octet-stream",
        size: 0,
      },
    ]);
  });

  it("reads application details as text pairs, skipping nested values", () => {
    expect(
      readApplicationDetails({ room_count: 12, ac: true, licence: "UP-1", nested: { a: 1 }, none: null }),
    ).toEqual([
      ["room_count", "12"],
      ["ac", "true"],
      ["licence", "UP-1"],
    ]);
    expect(readApplicationDetails([1, 2])).toEqual([]);
  });

  it("humanizes detail keys", () => {
    expect(humanizeKey("room_count")).toBe("Room count");
    expect(humanizeKey("fleet")).toBe("Fleet");
  });

  it("reads bank details or null, and masks account numbers", () => {
    expect(readBankDetails(null)).toBeNull();
    expect(readBankDetails({ holder: " ", account_number: "" })).toBeNull();
    expect(
      readBankDetails({
        holder: " Ram Lal ",
        account_number: "123456789012",
        ifsc: "SBIN0001234",
        upi_id: 5,
      }),
    ).toEqual({
      holder: "Ram Lal",
      account_number: "123456789012",
      ifsc: "SBIN0001234",
      bank: "",
      upi_id: "",
    });
    expect(maskAccountNumber("123456789012")).toBe("••••••••9012");
    expect(maskAccountNumber("12345678901234567")).toBe("••••••••4567");
    expect(maskAccountNumber("1234567")).toBe("•••4567");
    expect(maskAccountNumber("1234")).toBe("1234");
  });

  it("knows document kinds and formats sizes", () => {
    expect(isKnownDocumentKind("fssai")).toBe(true);
    expect(isKnownDocumentKind("passport")).toBe(false);
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2 MB");
  });

  it("derives slugs like approval does and finds the first free one", () => {
    expect(vendorSlugBase("Shri Krishna Dham & Sons")).toBe("shri-krishna-dham-sons");
    expect(vendorSlugBase("राधा")).toBe("partner");
    expect(nextFreeSlug("dham", [])).toBe("dham");
    expect(nextFreeSlug("dham", ["dham", "dham-2", "dham-4"])).toBe("dham-3");
  });

  it("maps a vendor row to the form and the form back to updatable columns", () => {
    const vendor = {
      id: "6f1c2b8e-1d0a-4c55-9a77-0d2f4b3c1e90",
      kind: "hotel",
      name: "Shri Dham",
      status: "active",
      commission_bps: 1250,
      contact_name: null,
      phone: "+919876543210",
      email: null,
      address: null,
      city: "Vrindavan",
      gstin: null,
      pan: null,
      notes: null,
    } as Tables<"vendors">;
    const form = vendorFormValues(vendor);
    expect(form).toMatchObject({
      kind: "hotel",
      commission_percent: "12.5",
      contact_name: "",
      city: "Vrindavan",
    });
    const parsed = vendorAdminSchema.parse({ ...form, pan: "abcde1234f" });
    const update = vendorUpdateRow(parsed);
    expect(update).toMatchObject({
      commission_bps: 1250,
      contact_name: null,
      pan: "ABCDE1234F",
      phone: "+919876543210",
    });
    expect(update).not.toHaveProperty("kind");
  });

  it("round-trips partners settings through the form", () => {
    const stored = partnersSettingsSchema.parse({
      business_types: ["hotel", "pharmacy"],
      required_documents: { pharmacy: ["drug_licence", "gst"] },
      commission_bps: { hotel: 1500 },
      max_file_mb: 5,
      agreement: { version: "2", body: { en: "Terms", hi: null } },
    });
    const form = partnersSettingsFormValues(stored);
    expect(form.types.hotel.commission_percent).toBe("15");
    expect(form.types.restaurant.commission_percent).toBe("10");
    expect(form.agreement_body).toEqual({ en: "Terms", hi: "" });
    const value = partnersSettingsValue(partnersSettingsFormSchema.parse(form));
    expect(value.business_types).toEqual(["hotel", "pharmacy"]);
    expect(value.required_documents).toEqual({ pharmacy: ["drug_licence", "gst"] });
    expect(value.commission_bps.hotel).toBe(1500);
    expect(value.max_file_mb).toBe(5);
    expect(partnersSettingsSchema.safeParse(value).success).toBe(true);
  });

  it("asks for a new agreement version only when the text changed and the version did not", () => {
    const stored = { version: "1", body: { en: "Old terms", hi: null } };
    expect(agreementNeedsNewVersion(null, { version: "1", body: { en: "New", hi: null } })).toBe(false);
    expect(agreementNeedsNewVersion(stored, { version: "1", body: { en: "Old terms ", hi: "" } })).toBe(
      false,
    );
    expect(agreementNeedsNewVersion(stored, { version: "1", body: { en: "New terms", hi: null } })).toBe(
      true,
    );
    expect(
      agreementNeedsNewVersion(stored, { version: "1", body: { en: "Old terms", hi: "नई शर्तें" } }),
    ).toBe(true);
    expect(agreementNeedsNewVersion(stored, { version: "2", body: { en: "New terms", hi: null } })).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------- schemas/vendor-admin.ts

describe("vendor admin schemas", () => {
  const valid = { ...NEW_VENDOR, name: "Shri Dham" };

  it("accepts the new-vendor defaults with a name and normalises contact fields", () => {
    const parsed = vendorAdminSchema.parse({ ...valid, phone: "98765 43210", gstin: "09abcde1234f1z5" });
    expect(parsed.phone).toBe("+919876543210");
    expect(parsed.gstin).toBe("09ABCDE1234F1Z5");
    expect(parsed.commission_percent).toBe(10);
  });

  it("returns translatable message keys", () => {
    const issue = (input: object) => vendorAdminSchema.safeParse({ ...valid, ...input }).error?.issues[0];
    expect(issue({ name: "A" })).toMatchObject({ message: "required", path: ["name"] });
    expect(issue({ phone: "12" })).toMatchObject({ message: "invalidPhone" });
    expect(issue({ email: "not-an-email" })).toMatchObject({ message: "invalidEmail" });
    expect(issue({ gstin: "123" })).toMatchObject({ message: "invalidGstin" });
    expect(issue({ pan: "ABC" })).toMatchObject({ message: "invalidPan" });
    expect(issue({ commission_percent: "101" })).toMatchObject({ message: "invalid" });
    expect(issue({ notes: "x".repeat(2001) })).toMatchObject({ message: "invalid" });
  });

  it("falls back on bad list filters instead of failing", () => {
    expect(applicationFiltersSchema.parse({})).toEqual({ status: "open", q: undefined });
    expect(applicationFiltersSchema.parse({ status: "nope" }).status).toBe("open");
    expect(applicationFiltersSchema.parse({ status: "rejected" }).status).toBe("rejected");
    expect(vendorFiltersSchema.parse({ kind: "spaceship", status: "active" })).toEqual({
      q: undefined,
      kind: undefined,
      status: "active",
    });
    expect(ledgerFiltersSchema.parse({ from: "2026-13-01", view: "weird" })).toEqual({
      from: undefined,
      to: undefined,
      view: "all",
    });
    expect(reportRangeSchema.parse({ from: "2026-09-01", to: "x" })).toEqual({
      from: "2026-09-01",
      to: undefined,
    });
  });

  it("validates the settings forms with message keys", () => {
    const settlements = (input: object) =>
      settlementsSettingsFormSchema.safeParse({
        commission_tax_percent: "18",
        tcs_percent: "0",
        tds_percent: "0",
        cycle_days: "7",
        ...input,
      });
    expect(settlements({}).data?.cycle_days).toBe(7);
    expect(settlements({ cycle_days: "0" }).error?.issues[0]?.message).toBe("invalid");
    expect(settlements({ cycle_days: "abc" }).error?.issues[0]?.message).toBe("invalid");
    expect(settlements({ commission_tax_percent: "29" }).error?.issues[0]?.message).toBe("invalid");

    const partners = partnersSettingsFormValues(partnersSettingsSchema.parse({}));
    expect(partnersSettingsFormSchema.safeParse(partners).success).toBe(true);
    expect(
      partnersSettingsFormSchema.safeParse({ ...partners, business_types: [] }).error?.issues[0]?.message,
    ).toBe("required");
    expect(
      partnersSettingsFormSchema.safeParse({ ...partners, max_file_mb: "50" }).error?.issues[0]?.message,
    ).toBe("invalid");
    expect(
      partnersSettingsFormSchema.safeParse({ ...partners, agreement_version: " " }).error?.issues[0]?.message,
    ).toBe("required");
  });
});

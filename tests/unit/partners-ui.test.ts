import { describe, expect, it } from "vitest";
import {
  PARTNER_DETAIL_FIELDS,
  bpsPercent,
  checkFile,
  detailErrors,
  documentSlots,
  fileSizeLabel,
  indiaToday,
  nextCycleEnd,
  normalizeDetails,
  pickVendorId,
  statementColumns,
  unsettledTotals,
  vendorHref,
} from "@/lib/partners/ui";
import {
  applicationReference,
  defaultCommissionBps,
  documentExtension,
  isOpenApplication,
  missingDocuments,
} from "@/lib/partners/status";
import {
  PARTNER_BUSINESS_TYPES,
  bankDetailsSchema,
  partnerApplicationSchema,
  partnersSettingsSchema,
  type PartnerApplicationInput,
} from "@/schemas/partners";

const USER = "11111111-1111-4111-8111-111111111111";
const FILE = "22222222-2222-4222-8222-222222222222";

describe("applicationReference", () => {
  it("pads the number to five digits", () => {
    expect(applicationReference(1)).toBe("PA-00001");
    expect(applicationReference(42)).toBe("PA-00042");
    expect(applicationReference(12345)).toBe("PA-12345");
  });
  it("keeps longer numbers whole", () => {
    expect(applicationReference(123456)).toBe("PA-123456");
  });
});

describe("missingDocuments", () => {
  const settings = { required_documents: { hotel: ["id_proof", "property_proof", "gst"] as const } };
  const s = { required_documents: { hotel: [...settings.required_documents.hotel] } };

  it("lists what is still missing in settings order", () => {
    expect(missingDocuments(s, "hotel", [{ kind: "property_proof" }])).toEqual(["id_proof", "gst"]);
  });
  it("is empty once every required kind is uploaded (extras ignored)", () => {
    const uploaded = [
      { kind: "gst" },
      { kind: "id_proof" },
      { kind: "property_proof" },
      { kind: "other" },
    ] as const;
    expect(missingDocuments(s, "hotel", uploaded)).toEqual([]);
  });
  it("asks for nothing when a type has no required documents", () => {
    expect(missingDocuments(s, "shop", [])).toEqual([]);
  });
});

describe("defaultCommissionBps", () => {
  it("uses the type's setting", () => {
    expect(defaultCommissionBps({ commission_bps: { hotel: 1500 } }, "hotel")).toBe(1500);
  });
  it("keeps an explicit zero", () => {
    expect(defaultCommissionBps({ commission_bps: { shop: 0 } }, "shop")).toBe(0);
  });
  it("falls back to 10%", () => {
    expect(defaultCommissionBps({ commission_bps: {} }, "transport")).toBe(1000);
  });
});

describe("documentExtension", () => {
  it("maps each allowed type", () => {
    expect(documentExtension("application/pdf")).toBe("pdf");
    expect(documentExtension("image/png")).toBe("png");
    expect(documentExtension("image/webp")).toBe("webp");
    expect(documentExtension("image/jpeg")).toBe("jpg");
  });
  it("defaults to jpg", () => {
    expect(documentExtension("image/heic")).toBe("jpg");
  });
});

describe("isOpenApplication", () => {
  it("is open until decided", () => {
    expect(isOpenApplication("submitted")).toBe(true);
    expect(isOpenApplication("under_review")).toBe(true);
    expect(isOpenApplication("approved")).toBe(false);
    expect(isOpenApplication("rejected")).toBe(false);
  });
});

describe("onboarding form helpers", () => {
  it("has questions for every business type", () => {
    for (const type of PARTNER_BUSINESS_TYPES) expect(PARTNER_DETAIL_FIELDS[type].length).toBeGreaterThan(0);
  });

  it("flags required, bad numbers, bad options and long text", () => {
    expect(detailErrors("hotel", {})).toEqual({ property_kind: "required", rooms: "required" });
    expect(detailErrors("hotel", { property_kind: "castle", rooms: "12a" })).toEqual({
      property_kind: "invalid",
      rooms: "invalidNumber",
    });
    expect(detailErrors("hotel", { property_kind: "hotel", rooms: "2001" })).toEqual({
      rooms: "invalidNumber",
    });
    expect(detailErrors("other", { what_you_offer: "x".repeat(201) })).toEqual({ what_you_offer: "tooLong" });
    expect(detailErrors("hotel", { property_kind: "resort", rooms: " 40 " })).toEqual({});
  });

  it("keeps only this type's answers, numbers as numbers", () => {
    expect(
      normalizeDetails("hotel", {
        property_kind: "resort",
        rooms: "40",
        nearest_temple: "  ",
        cuisine: "Thali",
      }),
    ).toEqual({ property_kind: "resort", rooms: 40 });
  });

  it("splits documents into required (deduped) and optional (never the agreement)", () => {
    const slots = documentSlots(
      { required_documents: { restaurant: ["fssai", "id_proof", "fssai"] } },
      "restaurant",
    );
    expect(slots.required).toEqual(["fssai", "id_proof"]);
    expect(slots.optional).not.toContain("fssai");
    expect(slots.optional).not.toContain("agreement");
    expect(slots.optional).toContain("other");
    expect(documentSlots({ required_documents: {} }, "shop").required).toEqual([]);
  });

  it("checks files before upload", () => {
    expect(checkFile({ type: "application/pdf", size: 1000 }, 8)).toBeNull();
    expect(checkFile({ type: "text/plain", size: 1000 }, 8)).toBe("badFile");
    expect(checkFile({ type: "image/png", size: 0 }, 8)).toBe("badFile");
    expect(checkFile({ type: "image/png", size: 8 * 1024 * 1024 }, 8)).toBeNull();
    expect(checkFile({ type: "image/png", size: 8 * 1024 * 1024 + 1 }, 8)).toBe("tooLarge");
  });

  it("labels file sizes", () => {
    expect(fileSizeLabel(100)).toBe("1 KB");
    expect(fileSizeLabel(340 * 1024)).toBe("340 KB");
    expect(fileSizeLabel(1.25 * 1024 * 1024)).toBe("1.3 MB");
  });
});

describe("vendor portal helpers", () => {
  const vendors = [{ id: "a" }, { id: "b" }];

  it("picks the requested vendor only when it is the user's", () => {
    expect(pickVendorId(vendors, "b")).toBe("b");
    expect(pickVendorId(vendors, "zzz")).toBe("a");
    expect(pickVendorId(vendors, undefined)).toBe("a");
    expect(pickVendorId([], "a")).toBeNull();
  });

  it("keeps ?v= only for multi-vendor users", () => {
    expect(vendorHref("/vendor/earnings", "b", true)).toBe("/vendor/earnings?v=b");
    expect(vendorHref("/vendor/earnings", "b", false)).toBe("/vendor/earnings");
    expect(vendorHref("/vendor/earnings", null, true)).toBe("/vendor/earnings");
  });

  it("uses the India day", () => {
    expect(indiaToday(new Date("2026-10-02T18:29:00Z"))).toBe("2026-10-02");
    expect(indiaToday(new Date("2026-10-02T18:31:00Z"))).toBe("2026-10-03");
  });

  it("finds the next cut-off", () => {
    // 7-day cycles from 2026-01-01: the cycle running on the 10th ends on the 14th.
    expect(nextCycleEnd("2026-01-10", 7)).toBe("2026-01-14");
    expect(nextCycleEnd("2026-01-14", 7)).toBe("2026-01-14");
    expect(nextCycleEnd("2026-01-15", 7)).toBe("2026-01-21");
  });

  it("totals only rows no payout has gathered", () => {
    const row = (net: number, payout: string | null) => ({
      gross_paise: 1000,
      platform_collected_paise: 1000,
      vendor_collected_paise: 0,
      commission_paise: 100,
      commission_tax_paise: 18,
      tcs_paise: 0,
      tds_paise: 0,
      adjustment_paise: 0,
      net_paise: net,
      payout_id: payout,
    });
    const totals = unsettledTotals([row(882, null), row(-500, null), row(882, "p1")]);
    expect(totals.count).toBe(2);
    expect(totals.net_paise).toBe(382);
    expect(totals.gross_paise).toBe(2000);
  });

  it("formats basis points as a percent", () => {
    expect(bpsPercent(1500)).toBe("15");
    expect(bpsPercent(1250)).toBe("12.5");
    expect(bpsPercent(1825)).toBe("18.25");
    expect(bpsPercent(0)).toBe("0");
  });

  it("shows tax and adjustment columns only when used", () => {
    const zero = { tcs_paise: 0, tds_paise: 0, adjustment_paise: 0 };
    expect(statementColumns([zero])).toEqual({ tcs: false, tds: false, adjustment: false });
    expect(statementColumns([zero, { ...zero, tds_paise: 10, adjustment_paise: -5 }])).toEqual({
      tcs: false,
      tds: true,
      adjustment: true,
    });
  });
});

describe("partnersSettingsSchema", () => {
  it("fills defaults from an empty object", () => {
    const s = partnersSettingsSchema.parse({});
    expect(s.business_types).toEqual([...PARTNER_BUSINESS_TYPES]);
    expect(s.max_file_mb).toBe(8);
    expect(s.agreement.version).toBe("1");
  });
});

describe("bankDetailsSchema", () => {
  const issues = (input: unknown) => {
    const r = bankDetailsSchema.safeParse(input);
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}:${i.message}`);
  };

  it("accepts UPI only", () => {
    expect(issues({ upi_id: "shop.name@okhdfc" })).toEqual([]);
  });

  it("accepts a full bank account and upper-cases the IFSC", () => {
    const r = bankDetailsSchema.parse({
      holder: "Radhe Stores",
      account_number: "123456789012",
      ifsc: "hdfc0001234",
    });
    expect(r.ifsc).toBe("HDFC0001234");
    expect(r.upi_id).toBe("");
  });

  it("needs at least one way to pay", () => {
    expect(issues({})).toEqual(["upi_id:payoutRequired"]);
  });

  it("asks for the missing part of a bank account", () => {
    expect(issues({ account_number: "123456789012", holder: "A" })).toContain("ifsc:required");
    expect(issues({ account_number: "123456789012", ifsc: "HDFC0001234" })).toContain("holder:required");
    // A holder name alone (UPI set): the account number is what is missing.
    expect(issues({ holder: "A", upi_id: "ab@upi" })).toEqual(["account_number:required"]);
  });

  it("rejects malformed account, IFSC and UPI", () => {
    expect(issues({ account_number: "12ab", ifsc: "HDFC0001234", holder: "A" })).toContain(
      "account_number:invalidAccount",
    );
    expect(issues({ account_number: "12345", ifsc: "HDFC0001234", holder: "A" })).toContain(
      "account_number:invalidAccount",
    );
    expect(issues({ account_number: "123456789012", ifsc: "HDFC1001234", holder: "A" })).toContain(
      "ifsc:invalidIfsc",
    );
    expect(issues({ upi_id: "no-at-sign" })).toContain("upi_id:invalidUpi");
  });
});

describe("partnerApplicationSchema", () => {
  const valid: PartnerApplicationInput = {
    businessType: "hotel",
    businessName: "Radhe Guest House",
    contactName: "Shyam Sharma",
    phone: "98765 43210",
    email: "shyam@example.com",
    city: "Vrindavan",
    address: "Parikrama Marg, Vrindavan",
    gstin: "",
    pan: "",
    website: "",
    details: { property_kind: "guest_house", rooms: 12 },
    documents: [
      {
        kind: "id_proof",
        path: `partners/${USER}/${FILE}.pdf`,
        name: "aadhaar.pdf",
        mime_type: "application/pdf",
        size: 1000,
      },
    ],
    agreementVersion: "1",
    agreementName: "Shyam Sharma",
    acceptAgreement: true,
    locale: "hi",
  };
  const firstIssue = (input: unknown) => {
    const r = partnerApplicationSchema.safeParse(input);
    return r.success ? null : `${r.error.issues[0]?.path.join(".")}:${r.error.issues[0]?.message}`;
  };

  it("accepts a complete application and normalises it", () => {
    const r = partnerApplicationSchema.parse(valid);
    expect(r.phone).toBe("+919876543210");
    expect(r.gstin).toBe("");
    expect(r.message).toBe("");
  });

  it("upper-cases and checks GSTIN and PAN", () => {
    const r = partnerApplicationSchema.parse({ ...valid, gstin: " 09aaach7409r1zz ", pan: "aaach7409r" });
    expect(r.gstin).toBe("09AAACH7409R1ZZ");
    expect(r.pan).toBe("AAACH7409R");
    expect(firstIssue({ ...valid, gstin: "09AAACH7409R1Z" })).toBe("gstin:invalidGstin");
    expect(firstIssue({ ...valid, gstin: "09AAACH7409R0ZZ" })).toBe("gstin:invalidGstin");
    expect(firstIssue({ ...valid, pan: "AAACH740R" })).toBe("pan:invalidPan");
    expect(firstIssue({ ...valid, pan: "1AACH7409R" })).toBe("pan:invalidPan");
  });

  it("needs the agreement accepted and a typed name", () => {
    expect(firstIssue({ ...valid, acceptAgreement: false })).toBe("acceptAgreement:acceptAgreement");
    expect(firstIssue({ ...valid, acceptAgreement: undefined })).toBe("acceptAgreement:acceptAgreement");
    expect(firstIssue({ ...valid, agreementName: " A " })).toBe("agreementName:required");
  });

  it("only takes files from the onboarding upload area", () => {
    const doc = valid.documents?.[0];
    expect(firstIssue({ ...valid, documents: [{ ...doc, path: `vendors/${USER}/${FILE}.pdf` }] })).toMatch(
      /^documents\.0\.path:/,
    );
    expect(firstIssue({ ...valid, documents: [{ ...doc, path: `partners/${USER}/${FILE}.exe` }] })).toMatch(
      /^documents\.0\.path:/,
    );
  });

  it("rejects unknown business types and bad contact details", () => {
    expect(firstIssue({ ...valid, businessType: "casino" })).toBe("businessType:required");
    expect(firstIssue({ ...valid, email: "not-an-email" })).toBe("email:invalidEmail");
    expect(firstIssue({ ...valid, phone: "12345" })).toBe("phone:invalidPhone");
  });
});

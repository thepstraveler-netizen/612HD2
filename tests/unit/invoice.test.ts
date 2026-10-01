import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { invoiceRows, invoiceTotals, percent, rupees, type InvoiceItem } from "@/lib/invoices/document";
import { latin1, renderInvoicePdf } from "@/lib/invoices/pdf";

const item = (overrides: Partial<InvoiceItem>): InvoiceItem => ({
  kind: "room",
  description: "Deluxe (Room only) · 2026-11-02 · room 1",
  sac: "996311",
  quantity: 1,
  amount_paise: 200_000,
  discount_paise: 0,
  tax_rate_bps: 500,
  tax_paise: 10_000,
  sort_order: 1,
  ...overrides,
});

describe("invoice rows", () => {
  it("groups identical room-nights and keeps differing prices apart", () => {
    const rows = invoiceRows(
      [
        item({}),
        item({ description: "Deluxe (Room only) · 2026-11-03 · room 1", sort_order: 2 }),
        item({
          description: "Deluxe (Room only) · 2026-11-04 · room 1",
          amount_paise: 240_000,
          tax_paise: 12_000,
          sort_order: 3,
        }),
        item({
          kind: "addon",
          description: "Breakfast",
          quantity: 4,
          amount_paise: 60_000,
          tax_paise: 3_001,
          sort_order: 4,
        }),
      ],
      "996311",
    );
    expect(rows.map((r) => [r.description, r.quantity, r.unitPaise])).toEqual([
      ["Deluxe (Room only) - room night", 2, 200_000],
      ["Deluxe (Room only) - room night", 1, 240_000],
      ["Breakfast", 4, 15_000],
    ]);
    expect(rows[2]).toMatchObject({ cgstPaise: 1_500, sgstPaise: 1_501, totalPaise: 63_001 });
    const totals = invoiceTotals(rows);
    expect(totals.totalPaise).toBe(200_000 * 2 + 240_000 + 60_000 + 10_000 * 2 + 12_000 + 3_001);
    expect(totals.cgstPaise + totals.sgstPaise).toBe(10_000 * 2 + 12_000 + 3_001);
  });

  it("formats money and rates for the PDF", () => {
    expect(rupees(123_456_78)).toBe("Rs. 1,23,456.78");
    expect(percent(500)).toBe("5%");
    expect(percent(1250)).toBe("12.50%");
    expect(latin1("₹100 · डेमो")).toBe("Rs.100 - ????");
  });

  it("renders a PDF", async () => {
    const rows = invoiceRows([item({})], "996311");
    const bytes = await renderInvoicePdf({
      number: "PST/26-27/00001",
      issuedAt: "01 Oct 2026",
      bookingCode: "PS01234567",
      seller: {
        name: "The P & S Traveler Group",
        gstin: "09ABCDE1234F1Z5",
        state: "Uttar Pradesh",
        stateCode: "09",
      },
      buyer: { name: "Test Guest", phone: "+919876543210" },
      placeOfSupply: "Uttar Pradesh (09)",
      stay: { hotel: "Demo · Prem Sarovar", checkIn: "2026-11-02", checkOut: "2026-11-03", guests: 2 },
      rows,
      totals: invoiceTotals(rows),
      paidPaise: 210_000,
      refundedPaise: 0,
      terms: "",
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getTitle()).toBe("Tax invoice PST/26-27/00001");
  });
});

import { splitGst, type LineKind } from "@/lib/pricing/booking";

/**
 * The GST tax invoice as plain data, built from a booking's stored lines.
 * Room-nights with the same room, plan, price and tax rate are grouped
 * into one row with a quantity, so a long stay stays readable.
 * Accommodation is taxed where the property is (intra-state), so tax is
 * shown as equal CGST + SGST.
 */

export type InvoiceItem = {
  kind: LineKind;
  description: string;
  sac: string | null;
  quantity: number;
  amount_paise: number;
  discount_paise: number;
  tax_rate_bps: number;
  tax_paise: number;
  sort_order: number;
};

export type InvoiceParty = {
  name: string;
  address?: string | null;
  gstin?: string | null;
  email?: string | null;
  phone?: string | null;
  state?: string | null;
  stateCode?: string | null;
};

export type InvoiceRow = {
  description: string;
  sac: string;
  quantity: number;
  unitPaise: number;
  amountPaise: number;
  discountPaise: number;
  taxablePaise: number;
  rateBps: number;
  cgstPaise: number;
  sgstPaise: number;
  totalPaise: number;
};

export type InvoiceDocument = {
  number: string;
  issuedAt: string;
  bookingCode: string;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  placeOfSupply: string;
  stay: { hotel: string; checkIn: string | null; checkOut: string | null; guests: number };
  rows: InvoiceRow[];
  totals: {
    amountPaise: number;
    discountPaise: number;
    taxablePaise: number;
    cgstPaise: number;
    sgstPaise: number;
    totalPaise: number;
  };
  paidPaise: number;
  refundedPaise: number;
  terms: string;
};

export function invoiceRows(items: readonly InvoiceItem[], fallbackSac: string): InvoiceRow[] {
  const groups = new Map<string, InvoiceRow>();
  for (const item of [...items].sort((a, b) => a.sort_order - b.sort_order)) {
    const unit = Math.round(item.amount_paise / item.quantity);
    const label =
      item.kind === "room" ? `${item.description.split(" · ")[0]} - room night` : item.description;
    const key = [item.kind, label, unit, item.discount_paise, item.tax_rate_bps].join("|");
    const row = groups.get(key) ?? {
      description: label,
      sac: item.sac ?? fallbackSac,
      quantity: 0,
      unitPaise: unit,
      amountPaise: 0,
      discountPaise: 0,
      taxablePaise: 0,
      rateBps: item.tax_rate_bps,
      cgstPaise: 0,
      sgstPaise: 0,
      totalPaise: 0,
    };
    const { cgstPaise, sgstPaise } = splitGst(item.tax_paise);
    row.quantity += item.quantity;
    row.amountPaise += item.amount_paise;
    row.discountPaise += item.discount_paise;
    row.taxablePaise += item.amount_paise - item.discount_paise;
    row.cgstPaise += cgstPaise;
    row.sgstPaise += sgstPaise;
    row.totalPaise += item.amount_paise - item.discount_paise + item.tax_paise;
    groups.set(key, row);
  }
  return [...groups.values()];
}

export function invoiceTotals(rows: readonly InvoiceRow[]): InvoiceDocument["totals"] {
  const sum = (pick: (r: InvoiceRow) => number) => rows.reduce((s, r) => s + pick(r), 0);
  return {
    amountPaise: sum((r) => r.amountPaise),
    discountPaise: sum((r) => r.discountPaise),
    taxablePaise: sum((r) => r.taxablePaise),
    cgstPaise: sum((r) => r.cgstPaise),
    sgstPaise: sum((r) => r.sgstPaise),
    totalPaise: sum((r) => r.totalPaise),
  };
}

/** `123456` → `Rs. 1,234.56` (the PDF's standard fonts have no ₹ glyph). */
export function rupees(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const value = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Math.abs(paise) / 100,
  );
  return `${sign}Rs. ${value}`;
}

export function percent(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { percent, rupees, type InvoiceDocument } from "./document";

/**
 * Renders a GST tax invoice to an A4 PDF. Uses the built-in Helvetica so no
 * font files ship with the app; text is kept to Latin-1 (English names,
 * "Rs." for the rupee sign) because standard fonts cannot encode more.
 */

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 40;
const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.4, 0.43, 0.48);
const LINE = rgb(0.85, 0.87, 0.9);

/** Replaces anything Helvetica cannot draw (e.g. Devanagari, ₹) so drawing never throws. */
export function latin1(text: string): string {
  return text
    .replace(/₹/g, "Rs.")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[·•]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = latin1(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function renderInvoicePdf(doc: InvoiceDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Tax invoice ${doc.number}`);
  pdf.setAuthor(latin1(doc.seller.name));
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdf.addPage(A4);
  let y = A4[1] - MARGIN;
  const width = A4[0] - MARGIN * 2;

  const text = (value: string, x: number, size = 9, font = regular, color = INK) => {
    page.drawText(latin1(value), { x, y, size, font, color });
  };
  const right = (value: string, xRight: number, size = 9, font = regular) => {
    const v = latin1(value);
    page.drawText(v, { x: xRight - font.widthOfTextAtSize(v, size), y, size, font, color: INK });
  };
  const rule = () => {
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + width, y }, thickness: 0.6, color: LINE });
  };
  const ensure = (space: number) => {
    if (y - space < MARGIN) {
      page = pdf.addPage(A4);
      y = A4[1] - MARGIN;
    }
  };

  // Header
  text("TAX INVOICE", MARGIN, 16, bold);
  right(`Invoice no. ${doc.number}`, MARGIN + width, 10, bold);
  y -= 14;
  right(`Date: ${doc.issuedAt}`, MARGIN + width, 9);
  y -= 12;
  right(`Booking: ${doc.bookingCode}`, MARGIN + width, 9);
  y -= 18;
  rule();
  y -= 16;

  // Parties
  const col = width / 2;
  const partyLines = (p: InvoiceDocument["seller"]) =>
    [
      p.address,
      p.gstin ? `GSTIN: ${p.gstin}` : null,
      p.state ? `State: ${p.state}${p.stateCode ? ` (${p.stateCode})` : ""}` : null,
      p.phone ? `Phone: ${p.phone}` : null,
      p.email ? `Email: ${p.email}` : null,
    ].filter((l): l is string => Boolean(l));
  const top = y;
  text("Supplier", MARGIN, 8, bold, MUTED);
  y -= 12;
  text(doc.seller.name, MARGIN, 10, bold);
  y -= 12;
  for (const l of partyLines(doc.seller).flatMap((l) => wrap(l, regular, 9, col - 12))) {
    text(l, MARGIN);
    y -= 11;
  }
  const leftEnd = y;
  y = top;
  text("Billed to", MARGIN + col, 8, bold, MUTED);
  y -= 12;
  text(doc.buyer.name, MARGIN + col, 10, bold);
  y -= 12;
  for (const l of partyLines(doc.buyer).flatMap((l) => wrap(l, regular, 9, col - 12))) {
    text(l, MARGIN + col);
    y -= 11;
  }
  y = Math.min(y, leftEnd) - 6;
  text(`Place of supply: ${doc.placeOfSupply}`, MARGIN, 9);
  y -= 12;
  const stay = [
    doc.stay.hotel,
    doc.stay.checkIn && doc.stay.checkOut ? `${doc.stay.checkIn} to ${doc.stay.checkOut}` : null,
    `${doc.stay.guests} guest(s)`,
  ]
    .filter(Boolean)
    .join("  |  ");
  for (const l of wrap(`Stay: ${stay}`, regular, 9, width)) {
    text(l, MARGIN);
    y -= 11;
  }
  y -= 8;

  // Table
  const cols = {
    desc: MARGIN,
    sac: MARGIN + 190,
    qty: MARGIN + 250,
    taxable: MARGIN + 335,
    rate: MARGIN + 375,
    cgst: MARGIN + 425,
    sgst: MARGIN + 470,
    total: MARGIN + width,
  };
  const header = () => {
    rule();
    y -= 12;
    text("Description", cols.desc, 8, bold);
    text("SAC", cols.sac, 8, bold);
    right("Qty", cols.qty + 20, 8, bold);
    right("Taxable", cols.taxable, 8, bold);
    right("GST", cols.rate, 8, bold);
    right("CGST", cols.cgst, 8, bold);
    right("SGST", cols.sgst, 8, bold);
    right("Amount", cols.total, 8, bold);
    y -= 6;
    rule();
    y -= 12;
  };
  header();
  for (const row of doc.rows) {
    const lines = wrap(row.description, regular, 8, cols.sac - cols.desc - 8);
    ensure(lines.length * 10 + 8);
    if (y > A4[1] - MARGIN - 1) header();
    text(lines[0], cols.desc, 8);
    text(row.sac, cols.sac, 8);
    right(String(row.quantity), cols.qty + 20, 8);
    right(rupees(row.taxablePaise), cols.taxable, 8);
    right(percent(row.rateBps), cols.rate, 8);
    right(rupees(row.cgstPaise), cols.cgst, 8);
    right(rupees(row.sgstPaise), cols.sgst, 8);
    right(rupees(row.totalPaise), cols.total, 8);
    for (const extra of lines.slice(1)) {
      y -= 10;
      text(extra, cols.desc, 8);
    }
    if (row.discountPaise > 0) {
      y -= 10;
      text(
        `(${rupees(row.amountPaise)} less discount ${rupees(row.discountPaise)})`,
        cols.desc,
        7,
        regular,
        MUTED,
      );
    }
    y -= 14;
  }
  rule();
  y -= 14;

  // Totals
  ensure(110);
  const totals: [string, string, boolean?][] = [
    ["Gross amount", rupees(doc.totals.amountPaise)],
    ...(doc.totals.discountPaise
      ? ([["Discount", `- ${rupees(doc.totals.discountPaise)}`]] as [string, string][])
      : []),
    ["Taxable value", rupees(doc.totals.taxablePaise)],
    ["CGST", rupees(doc.totals.cgstPaise)],
    ["SGST", rupees(doc.totals.sgstPaise)],
    ["Invoice total", rupees(doc.totals.totalPaise), true],
    ["Paid", rupees(doc.paidPaise)],
    ...(doc.refundedPaise ? ([["Refunded", rupees(doc.refundedPaise)]] as [string, string][]) : []),
    ["Balance due", rupees(Math.max(0, doc.totals.totalPaise - doc.paidPaise))],
  ];
  for (const [label, value, strong] of totals) {
    text(label, cols.rate - 40, strong ? 10 : 9, strong ? bold : regular);
    right(value, cols.total, strong ? 10 : 9, strong ? bold : regular);
    y -= strong ? 16 : 13;
  }

  y -= 10;
  ensure(40);
  for (const l of wrap(
    doc.terms || "This is a computer-generated invoice and needs no signature.",
    regular,
    8,
    width,
  )) {
    text(l, MARGIN, 8, regular, MUTED);
    y -= 10;
  }
  return pdf.save();
}

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { invoiceRows, invoiceTotals, type InvoiceDocument } from "@/lib/invoices/document";
import { renderInvoicePdf } from "@/lib/invoices/pdf";
import { createClient } from "@/lib/supabase/server";

/**
 * GST invoice PDF for a booking. Read with the caller's own session, so
 * row-level security decides access: the guest, staff with bookings or
 * payments access, and the hotel's vendor.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sellerSchema = z
  .object({
    name: z.string().default(""),
    legal_name: z.string().default(""),
    address: z.string().default(""),
    gstin: z.string().default(""),
    phone: z.string().default(""),
    email: z.string().default(""),
    state: z.string().default(""),
    state_code: z.string().default(""),
    sac_accommodation: z.string().default("996311"),
    terms: z.string().default(""),
  })
  .partial()
  .loose();

const buyerSchema = z.object({
  name: z.string(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  gst: z
    .object({ gstin: z.string(), company: z.string(), address: z.string().optional() })
    .nullable()
    .optional(),
});

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[A-Z0-9]{6,16}$/.test(code)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "sign in" }, { status: 401 });

  const supabase = await createClient();
  const { data: booking } = await supabase.from("bookings").select("*").eq("code", code).maybeSingle();
  if (!booking) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [{ data: invoice }, { data: items }] = await Promise.all([
    supabase.from("invoices").select("*").eq("booking_id", booking.id).maybeSingle(),
    supabase.from("booking_items").select("*").eq("booking_id", booking.id).order("sort_order"),
  ]);
  if (!invoice) return NextResponse.json({ error: "no invoice yet" }, { status: 404 });

  const seller = sellerSchema.parse(invoice.seller ?? {});
  const buyer = buyerSchema.safeParse(invoice.buyer);
  const snapshot = booking.snapshot as { hotel?: { name?: { en?: string }; address?: string | null } };
  const place = seller.state
    ? `${seller.state}${seller.state_code ? ` (${seller.state_code})` : ""}`
    : "India";
  const rows = invoiceRows(items ?? [], seller.sac_accommodation ?? "996311");

  const doc: InvoiceDocument = {
    number: invoice.number,
    issuedAt: dateFormat.format(new Date(invoice.issued_at)),
    bookingCode: booking.code,
    seller: {
      name: seller.legal_name || seller.name || "The P & S Traveler Group",
      address: seller.address,
      gstin: seller.gstin,
      phone: seller.phone,
      email: seller.email,
      state: seller.state,
      stateCode: seller.state_code,
    },
    buyer:
      buyer.success && buyer.data.gst
        ? {
            name: buyer.data.gst.company,
            address: buyer.data.gst.address,
            gstin: buyer.data.gst.gstin,
            email: buyer.data.email,
            phone: buyer.data.phone,
          }
        : {
            name: buyer.success ? buyer.data.name : booking.contact_name,
            email: booking.contact_email,
            phone: booking.contact_phone,
          },
    placeOfSupply: place,
    stay: {
      hotel: [snapshot.hotel?.name?.en, snapshot.hotel?.address].filter(Boolean).join(", "),
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      guests: (booking.adults ?? 0) + booking.children,
    },
    rows,
    totals: invoiceTotals(rows),
    paidPaise: booking.paid_paise,
    refundedPaise: booking.refunded_paise,
    terms: seller.terms ?? "",
  };

  const pdf = await renderInvoicePdf(doc);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${booking.code}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

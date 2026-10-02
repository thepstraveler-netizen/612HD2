import "server-only";
import { hasServiceRole } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { effectiveQuoteStatus, type QuoteLine, type QuoteState } from "./quote";
import { leadReference } from "./status";

/**
 * The no-login quote page (/quote/<token>). The 48-hex token in the link
 * is the only credential; it is never readable through the API.
 */

export type PublicQuote = {
  title: string;
  reference: string;
  number: number;
  customerName: string;
  status: QuoteState;
  lines: QuoteLine[];
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  payNowPaise: number;
  paidPaise: number;
  validUntil: string;
  notes: string | null;
  terms: string | null;
  /** Razorpay Payment Link; null when payment is collected by hand. */
  payUrl: string | null;
  bookingCode: string | null;
};

export async function getQuoteByToken(token: string): Promise<PublicQuote | null> {
  if (!/^[0-9a-f]{48}$/.test(token) || !hasServiceRole()) return null;
  const admin = createAdminClient();
  const { data: quote } = await admin.from("quotes").select("*").eq("token", token).maybeSingle();
  if (!quote) return null;
  const [{ data: lead }, { data: booking }] = await Promise.all([
    admin.from("leads").select("number, name").eq("id", quote.lead_id).maybeSingle(),
    quote.booking_id
      ? admin.from("bookings").select("code, paid_paise, status").eq("id", quote.booking_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!lead) return null;
  const status = effectiveQuoteStatus(quote.status, quote.valid_until);
  return {
    title: quote.title,
    reference: leadReference(lead.number),
    number: quote.number,
    customerName: lead.name,
    status,
    lines: (Array.isArray(quote.lines) ? quote.lines : []) as unknown as QuoteLine[],
    subtotalPaise: quote.subtotal_paise,
    taxPaise: quote.tax_paise,
    totalPaise: quote.total_paise,
    payNowPaise: quote.pay_now_paise,
    paidPaise: booking?.paid_paise ?? 0,
    validUntil: quote.valid_until,
    notes: quote.notes,
    terms: quote.terms,
    payUrl: status === "sent" ? quote.payment_link_url : null,
    bookingCode: status === "paid" ? (booking?.code ?? null) : null,
  };
}

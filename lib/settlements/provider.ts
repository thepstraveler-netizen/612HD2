import type { BankDetails } from "@/schemas/partners";

/**
 * Payout adapter. Business logic (ledger, payouts) never talks to a payment
 * provider directly: it asks the configured provider to send money and
 * records what came back. "manual" means finance pays by bank transfer or
 * UPI outside the app and types the reference in; a Razorpay Route or
 * RazorpayX adapter can implement `send` later without touching the ledger.
 */
export type PayoutRequest = {
  payoutId: string;
  vendorName: string;
  amountPaise: number;
  bank: BankDetails | null;
};

export type PayoutSendResult =
  { status: "manual" } | { status: "sent"; reference: string } | { status: "failed"; error: string };

export interface PayoutProvider {
  readonly key: string;
  /** True when the provider moves money itself (otherwise staff mark payouts paid by hand). */
  readonly automatic: boolean;
  send(request: PayoutRequest): Promise<PayoutSendResult>;
}

export const manualProvider: PayoutProvider = {
  key: "manual",
  automatic: false,
  async send() {
    return { status: "manual" };
  },
};

const PROVIDERS: Record<string, PayoutProvider> = { manual: manualProvider };

/** The provider for a settings key; unknown keys fall back to manual. */
export function payoutProvider(key: string): PayoutProvider {
  return PROVIDERS[key] ?? manualProvider;
}

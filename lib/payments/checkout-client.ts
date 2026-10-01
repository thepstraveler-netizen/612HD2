"use client";

/**
 * Opens Razorpay Checkout in the browser. The script loads only when the
 * guest pays, from Razorpay's own CDN as their integration requires.
 */

export type RazorpayResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
type RazorpayInstance = { open: () => void; on: (event: string, cb: () => void) => void };
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;
declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

function loadRazorpay(): Promise<RazorpayCtor> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(window.Razorpay);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("razorpay")));
    script.onerror = () => reject(new Error("razorpay"));
    document.body.appendChild(script);
  });
}

export async function openRazorpay(input: {
  order: { id: string; amountPaise: number; keyId: string };
  prefill: { name: string; email: string; contact: string };
  description: string;
  bookingCode: string;
  onSuccess: (response: RazorpayResponse) => void;
  onDismiss: () => void;
}): Promise<boolean> {
  let Razorpay: RazorpayCtor;
  try {
    Razorpay = await loadRazorpay();
  } catch {
    return false;
  }
  const checkout = new Razorpay({
    key: input.order.keyId,
    amount: input.order.amountPaise,
    currency: "INR",
    order_id: input.order.id,
    name: "The P & S Traveler Group",
    description: input.description,
    prefill: input.prefill,
    notes: { booking: input.bookingCode },
    handler: input.onSuccess,
    modal: { ondismiss: input.onDismiss },
  });
  checkout.on("payment.failed", input.onDismiss);
  checkout.open();
  return true;
}

/** Money is stored and computed as integer paise; these helpers only format it. */

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, fractionDigits: number): Intl.NumberFormat {
  const key = `${locale}:${fractionDigits}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale === "hi" ? "hi-IN" : "en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatters.set(key, f);
  }
  return f;
}

/** `123450` → `₹1,234.50`; whole rupees drop the decimals (`₹1,234`). */
export function formatPaise(paise: number, locale = "en"): string {
  const whole = paise % 100 === 0;
  return formatter(locale, whole ? 0 : 2).format(paise / 100);
}

/** Rupees typed by an admin (`"1,499.50"`) → paise, or null when not a valid amount. */
export function rupeesToPaise(input: string | number): number | null {
  const text = String(input).replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [rupees, fraction = ""] = text.split(".");
  return Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
}

export function paiseToRupeesInput(paise: number | null | undefined): string {
  if (paise == null) return "";
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

/**
 * Indian mobile numbers in every shape customers type them ("98765 43210",
 * "09876543210", "+91-98765-43210", "0091 9876543210", "919876543210")
 * normalised to E.164 (+919876543210). Only 10-digit mobiles starting 6-9
 * are accepted, since SMS and WhatsApp cannot reach landlines.
 */
export function normalizeIndianPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!/^[+\d][\d\s().-]*$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    if (!digits.startsWith("91")) return null;
    digits = digits.slice(2);
  } else if (digits.length === 14 && digits.startsWith("0091")) {
    digits = digits.slice(4);
  } else if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

/** E.164 without the plus, which MSG91 and the WhatsApp Cloud API expect. */
export function providerDigits(e164: string): string {
  return e164.replace(/^\+/, "");
}

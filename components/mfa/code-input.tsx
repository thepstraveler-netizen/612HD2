"use client";

import { Input } from "@/components/ui/input";

/** One field for a 6-digit authenticator code (lets phones offer the code from SMS/apps). */
export function CodeInput({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
}) {
  return (
    <Input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d\s]/g, "").slice(0, 7))}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9 ]*"
      maxLength={7}
      placeholder="123456"
      aria-invalid={invalid}
      aria-describedby={describedBy}
      autoFocus={autoFocus}
      className="h-12 max-w-48 text-center font-mono text-xl tracking-[0.3em]"
    />
  );
}

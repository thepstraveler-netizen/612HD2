import type { ReactNode } from "react";
import "./globals.css";

/**
 * The real root layout (with <html>) lives in app/[locale]/layout.tsx so the
 * `lang` attribute follows the active locale. This pass-through exists so
 * app/not-found.tsx has a parent.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}

import { ChevronDown } from "lucide-react";
import type { Faq } from "@/lib/catalog/types";
import { pickLocalized } from "@/lib/i18n/localized";
import { cn } from "@/lib/utils";

/** Native <details> accordion: accessible and works without JavaScript. */
export function FaqList({ faqs, locale, className }: { faqs: Faq[]; locale: string; className?: string }) {
  return (
    <div className={cn("divide-y rounded-2xl border bg-card", className)}>
      {faqs.map((faq) => (
        <details key={faq.id} className="group px-4">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 font-medium [&::-webkit-details-marker]:hidden">
            {pickLocalized(faq.question, locale)}
            <ChevronDown className="size-4 shrink-0 transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <p className="pb-4 text-sm text-muted-foreground">{pickLocalized(faq.answer, locale)}</p>
        </details>
      ))}
    </div>
  );
}

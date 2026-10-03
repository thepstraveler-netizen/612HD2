"use client";

import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CHOOSE_PLAN_EVENT, type ChoosePlanDetail } from "@/lib/catalog/b2b-ui";

/**
 * "Choose this plan": an in-page link to the enquiry form (works without
 * JavaScript); with it, the form preselects the plan and takes focus.
 */
export function ChoosePlanButton({
  planId,
  targetId,
  label,
  planName,
  highlighted,
}: {
  planId: string;
  targetId: string;
  label: string;
  /** Read after the label by screen readers, so each card's button is distinct. */
  planName: string;
  highlighted: boolean;
}) {
  return (
    <Button asChild size="lg" variant={highlighted ? "default" : "outline"} className="w-full">
      <a
        href={`#${targetId}`}
        onClick={() =>
          window.dispatchEvent(new CustomEvent<ChoosePlanDetail>(CHOOSE_PLAN_EVENT, { detail: { planId } }))
        }
      >
        {label}
        <span className="sr-only">: {planName}</span>
        <ChevronRight aria-hidden="true" />
      </a>
    </Button>
  );
}

"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RetryButton({ label }: { label: string }) {
  return (
    <Button type="button" onClick={() => window.location.reload()}>
      <RotateCw aria-hidden="true" /> {label}
    </Button>
  );
}

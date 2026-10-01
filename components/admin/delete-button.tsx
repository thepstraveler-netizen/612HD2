"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { MutationResult } from "@/lib/admin/mutate";

export function DeleteButton({
  id,
  action,
  redirectTo,
}: {
  id: string;
  action: (input: unknown) => Promise<MutationResult>;
  redirectTo: string;
}) {
  const t = useTranslations("cms");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      className="text-destructive"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t("actions.confirmDelete"))) return;
        startTransition(async () => {
          const result = await action({ id });
          if (result.ok) {
            toast.success(t("actions.deleted"));
            router.push(redirectTo);
          } else {
            toast.error(t(`errors.${result.error}`));
          }
        });
      }}
    >
      <Trash2 /> {t("actions.delete")}
    </Button>
  );
}

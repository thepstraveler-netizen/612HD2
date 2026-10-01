import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthCard({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>
          <h1 className="text-2xl font-bold">{title}</h1>
        </CardTitle>
        {lead ? <CardDescription>{lead}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
      {footer ? <CardFooter className="justify-center text-sm">{footer}</CardFooter> : null}
    </Card>
  );
}

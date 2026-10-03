import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { mfaSatisfied } from "@/lib/mfa/server";
import { exportFileName } from "@/lib/privacy/assemble";
import { buildAccountExport } from "@/lib/privacy/export";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * "Download my data": everything tied to the signed-in account as a JSON
 * attachment (D-095). Read with the service role, scoped by the session's
 * user id; each download is logged in privacy_requests and rate limited
 * (`security.defaults.rate_limits.export`).
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.profile?.is_blocked) {
    return NextResponse.json({ error: "signin" }, { status: 401 });
  }
  if (!(await mfaSatisfied(session))) {
    return NextResponse.json({ error: "mfaRequired" }, { status: 403 });
  }
  const limited = await enforceRateLimit("export", { userId: session.user.id });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rateLimited", retryAfter: limited.retryAfter },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  const userId = session.user.id;
  let body: string;
  const now = new Date();
  try {
    const data = await buildAccountExport(userId, session.profile?.email ?? session.user.email ?? null);
    body = JSON.stringify(data, null, 2);
    const { error } = await createAdminClient().rpc("log_data_export", { p_user: userId });
    if (error) throw new Error(`log_data_export: ${error.message}`);
  } catch (error) {
    console.error("[privacy] export failed", error);
    return NextResponse.json({ error: "exportFailed" }, { status: 500 });
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(now)}"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

import "@/lib/security/zod-jitless";
import { installGlobalErrorHandlers } from "@/lib/observability/client";

// Runs before the app hydrates, so errors during hydration are caught too.
// components/observability/error-reporting.tsx installs the same handlers
// (once) as a fallback.
installGlobalErrorHandlers();

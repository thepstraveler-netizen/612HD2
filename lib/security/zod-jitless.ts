/**
 * Browser-only side effect, imported first in instrumentation-client.ts. Zod v4
 * probes `new Function("")` to decide whether it may compile fast parsers;
 * under our CSP (no 'unsafe-eval') that probe is blocked and reported as a
 * securitypolicyviolation even though Zod catches it. Jitless mode skips the
 * probe; parsing is unchanged, just not JIT-compiled.
 *
 * Zod keeps its config on `globalThis.__zod_globalConfig` and reads it lazily,
 * so setting the flag there before any parse avoids importing zod (and its
 * ~30 KB) on pages that never use it.
 */
type ZodGlobal = typeof globalThis & { __zod_globalConfig?: Record<string, unknown> };

const g = globalThis as ZodGlobal;
// Mutate in place: if zod already loaded, it holds a reference to this object.
(g.__zod_globalConfig ??= {}).jitless = true;

export {};

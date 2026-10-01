# Decisions

Defaults chosen where the master build prompt left room. Each entry says what was chosen and why; change any of them by telling Claude in the project.

### D-001 · Locale routing: `en` unprefixed, `hi` under `/hi`

next-intl `localePrefix: "as-needed"`. English URLs stay clean for SEO and sharing; Hindi gets its own crawlable URLs with `hreflang`. The admin, vendor and driver areas are localized too (`/hi/admin`).

### D-002 · Tailwind CSS v4 + hand-written shadcn/ui components

`create-next-app@15` ships Tailwind v4, which shadcn supports. The shadcn registry was not reachable from the build environment, so the Phase 1 primitives (button, input, label, card, badge, separator, skeleton, avatar, tabs, tooltip, collapsible, sheet, dropdown-menu, form, sonner) were written by hand following the new-york v4 source. `components.json` is committed, so `pnpm dlx shadcn@latest add <component>` works for anything added later.

### D-003 · RBAC matrix lives in TypeScript and is generated into SQL

`lib/permissions/*.ts` is the single source; `pnpm rbac:generate` writes the seed migration; a unit test fails on drift. This keeps `has_permission()` (RLS) and `requirePermission()` (server) on exactly the same matrix. Runtime changes by a super admin in `role_permissions` are still possible; matrix changes in code ship as a new generated migration.

### D-004 · Exact-match permission keys, no wildcards

`hotels.write` does not imply `hotels.read`; each role is granted both explicitly. Simpler to audit and to index.

### D-005 · Only super admins can grant `super_admin` or edit the matrix

Prevents an `admin` from escalating to `super_admin`. Enforced in RLS and covered by DB tests.

### D-006 · Middleware checks sign-in only; layouts check permissions

Middleware runs on every request at the edge, so it does one cheap `getUser()` call. Permission checks need the role tables and run in server layouts/pages (cached once per request). RLS is the final gate.

### D-007 · Database tests run the real migrations in PGlite

`tests/db` boots an in-process Postgres (PGlite) with a small Supabase stub (`auth.users`, `auth.uid()`, API roles) and applies every migration. RLS, triggers and the audit log are tested in CI without Docker or a Supabase project. Full Supabase-local tests can be added in the hardening phase.

### D-008 · Service icons/accents in code until the `services` table exists

Phase 1 renders the 14 services from `lib/services.ts` so the shell works with no database. Phase 2 moves names, copy, ordering, visibility and config into the `services` table (admin-editable, en + hi); the code registry then only maps a slug to its icon and accent colour. The header nav follows the same path into the CMS.

### D-009 · User menu is a client component

It reads the session with the browser Supabase client so public pages (home, services) stay statically rendered and fast. It only shows shortcuts; every protected area re-checks on the server.

### D-010 · Auth email links go through `/auth/callback` (PKCE), `/auth/confirm` kept for custom templates

Works with Supabase's default email templates. The redirect origin is taken from the request host so Vercel preview deployments send users back to the preview. `next` is restricted to same-origin paths to prevent open redirects.

### D-011 · Auth errors never reveal whether an account exists

Magic link and password reset always answer "check your inbox". Sign-in returns one generic "email or password is incorrect".

### D-012 · Security headers now, strict CSP in Phase 11

HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and `Permissions-Policy` are set in `next.config.ts`. A nonce-based CSP lands once Razorpay, Maps and Turnstile origins are final. Rate limiting (Upstash) and Turnstile also arrive with the first public forms (phases 4 and 8); Supabase Auth's built-in rate limits cover Phase 1.

### D-013 · Audit actor comes from JWT claims, not a foreign key

`audit_logs.actor_id` has no FK so history survives user deletion. Service-role and SQL-console changes are recorded with `actor_role` set and a null actor.

### D-014 · Repository had no default branch

The repo was empty, so `main` was created with a single empty "initialize repository" commit, and Phase 1 is a pull request into it.

### D-015 · pnpm

Lockfile is `pnpm-lock.yaml`; CI uses `pnpm install --frozen-lockfile`. `packageManager` is pinned in `package.json` for Corepack/Vercel.

## Phase 2 · Catalog core

### D-016 · Localized content is `jsonb {en, hi}`, English required

Every admin-editable string is one jsonb column validated by `public.is_localized()` in Postgres and `localizedSchema` in zod. Hindi is optional per field; `pickLocalized()` falls back to English and the admin form flags missing Hindi. This keeps one row per item instead of a translations table, which is enough for two languages.

### D-017 · Baseline content ships as a migration, demo content as seed

`20261002000500_content_baseline.sql` inserts cities, areas, the 14 services, home sections, navigation, business settings and feature flags idempotently (`on conflict do nothing`), so a fresh production database renders the full site. Demo banners, testimonials, FAQs and amenities live in `supabase/seed.sql` and only load locally or on demand.

### D-018 · Public pages read through a cached, cookie-less client

`lib/catalog/queries.ts` uses an anon client without cookies inside `unstable_cache` tagged `catalog`, so Home and Services stay static (ISR). Every CMS server action calls `revalidateTag("catalog")`, so admin edits show up on the next request. Banners also revalidate every 5 minutes so start/end windows apply without an edit.

### D-019 · Offline fallback only when Supabase is not configured

When `NEXT_PUBLIC_SUPABASE_URL` is missing (CI, E2E, first local run) the catalog reads `lib/catalog/fallback.ts`, which mirrors the baseline migration. With Supabase configured, the database is the only source; a query error shows empty sections rather than stale static copy.

### D-020 · Home section content is edited as validated JSON for now

Home sections are fixed slots (hero, pillars, about, …) that admins can reorder, hide and retitle. Their structured content is edited as JSON and validated per section type (`sectionContentSchemas`) on the server; one bad row is skipped on the public page, never breaks it. Dedicated visual editors per section type can replace the JSON box later without a schema change.

### D-021 · Banners belong to the Offers module

Homepage offer banners are guarded by `offers.read/offers.write` (marketing), not `cms.write`, because they carry coupon codes. The coupon rules themselves arrive with the coupon engine in Phase 4.

### D-022 · Media: browser uploads straight to Storage, then registers a row

The admin image uploader uploads to the public `media` bucket with the user's session (Storage RLS requires `cms.write` or `offers.write`), then a server action records the file in the `media` table (audited) and returns its id. `documents` and `prescriptions` are private buckets where users can only touch their own `<uid>/` folder and staff read with `vendors.read` / `medicine.read`.

### D-023 · Admin forms send raw values; the server re-validates

Forms use react-hook-form with `zodResolver(schema, undefined, { raw: true })` for instant field errors, then send the raw values to the server action, which parses them with the same schema. The server never trusts client-side transforms.

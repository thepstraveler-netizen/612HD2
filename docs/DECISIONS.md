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

### D-024 · Hosted Supabase project and function grants

The hosted project `ps-traveler` (Free plan, Mumbai `ap-south-1`) was created and migrated through the Supabase connector, so its migration history has connector timestamps instead of the file names. Before running `supabase db push` against it, mark the existing files as applied with `supabase migration repair --status applied <version>`. `enable_audit()` uses `create or replace trigger` (Postgres 14+), so it never needs a destructive statement. `20261002000600_function_grants.sql` revokes API access to trigger-only SECURITY DEFINER functions, which the Supabase security advisor flagged.

### D-025 · Hotel availability: room-type allotment with optional per-date overrides

Each room type sells `total_units` every night. A `hotel_inventory` row exists only for dates that differ: fewer or more units, stop-sell (`is_closed`), a minimum stay on arrival, and `sold_units` (written by bookings in Phase 4). Nightly price is resolved in one place, `lib/availability/engine.ts`: a `hotel_rates` override for that plan and date wins; otherwise the best matching `hotel_pricing_rules` row (highest priority, then most specific scope plan > room > hotel, then latest start) adjusts the plan's base price by percent, flat amount or fixed price; otherwise the base price. The same pure functions price the listing, the detail page and (Phase 4) the server-side booking check.

### D-026 · GST on rooms comes from an admin-editable slab table

`tax.hotel_gst_slabs` holds the accommodation slabs by tariff per room per night (from 22 Sep 2025: up to ₹1,000 exempt, ₹1,001–7,500 at 5%, above at 18%). The slab is chosen per room-night on the room rate plus extra-guest charges. A rate change is a settings edit, not a deploy.

### D-027 · Hotel search runs in memory over the cached catalog

Published hotels with rooms, plans, rules, photos and amenities are read once and cached under the `catalog` tag; per-date inventory and rate overrides for the searched stay are cached for 60 s under `hotel-calendar`. Filtering, pricing, sorting and paging happen in the pure `searchHotels` (unit tested). This is fast and simple at a few hundred properties; if the catalog grows past that, move filtering into a Postgres function with the same inputs. All listing state lives in the URL; invalid values are dropped one by one instead of failing the page.

### D-028 · "Lowest price & best rated" and sold-out ordering

The value sort puts hotels rated 4.0 or more first, cheapest first, then the rest by price. Hotels that cannot take the requested stay (sold out, stop-sell, minimum stay) stay in the results with the reason shown, always after bookable ones; hotels that cannot host the party at all are left out. "Popular" ranks sponsored, then featured, then by rating count.

### D-029 · Distance from temples uses the areas table; map uses free tiles

Landmarks are the existing `areas` rows (temples, stations) with coordinates, so distance filtering and "nearby" lists need no extra table or API: straight-line (haversine) distance. The map view uses Leaflet with an XYZ tile server stored in `hotels.search_defaults.map_tiles` (OpenStreetMap by default, with attribution). OSM's public tiles are fine for low traffic; switch the URL to a provider's key-based tiles before heavy traffic. "Open in Maps" links need no key.

### D-030 · Until online booking opens, "Book" goes to WhatsApp

Checkout and payments arrive in Phase 4. Until then the detail page's booking card shows the exact price breakdown and a WhatsApp link pre-filled with hotel, dates, room, plan and guests (plus a call button), using the business profile numbers.

### D-031 · Demo hotels on the hosted project

Six fictional hotels (names start with "Demo ·") and one draft were loaded into the hosted project from `supabase/seed.sql` so the listing, filters and admin calendar can be tried before real partners are added. Archive or delete them from Admin → Hotels before launch. Hotel-visibility helper functions (`can_read_hotel`, `room_hotel_id`, `plan_hotel_id`, `is_vendor_member`) stay executable by `anon`/`authenticated` because RLS policies call them; they return booleans or ids only.

### D-032 · Bulk CSV export now, import later

Admin → Hotels exports one row per rate plan (formula-injection safe). Bulk CSV import needs a review step for partner data and arrives with partner onboarding in Phase 9.

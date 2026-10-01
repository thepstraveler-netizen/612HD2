# Architecture

The P & S Traveler Group platform is a single Next.js 15 (App Router, React 19, TypeScript strict) app on Vercel, backed by Supabase (Postgres, Auth, Storage, Realtime). This document describes what exists after **Phase 1 (Foundation)** and where later phases plug in.

## Request flow

```
Browser ──► middleware.ts
             1. next-intl: resolve locale (en at "/", hi at "/hi")
             2. Supabase: refresh session cookie on the same response
             3. /account, /admin, /vendor, /driver: redirect to /login?next=… when signed out
        ──► app/[locale]/… layouts
             requireUser() / requirePermission() (lib/auth/guards.ts)
        ──► Server Components / Server Actions query Supabase as the user
             Postgres RLS + has_permission() enforce the same matrix again
```

Authorization is enforced twice, by design: the server guard decides what a user _sees_, RLS decides what the database _returns or accepts_. A bug in one layer cannot leak data on its own.

## Folder map

```
app/
  layout.tsx                 pass-through (html lives in [locale]/layout.tsx)
  auth/callback/route.ts     PKCE code exchange (Google, magic link, signup, reset)
  auth/confirm/route.ts      token-hash flow for custom email templates
  [locale]/
    layout.tsx               <html lang>, fonts, providers, metadata + hreflang
    (public)/                home, services/[slug], partner, forbidden
    (auth)/                  login, signup, forgot-password
    account/                 signed-in customer area (+ update-password)
    admin/                   shell + sidebar for 18 modules, [module] placeholder, audit log
    vendor/  driver/         guarded portal shells
components/
  ui/                        shadcn/ui (new-york) primitives
  shared/                    Logo, SectionTitle (brush ribbon), ServiceCard, EmptyState, motifs
  layout/                    SiteHeader, SiteFooter, MobileNav, LanguageSwitcher, ThemeToggle, UserMenu, PortalShell
  admin/                     AdminSidebarNav, AdminMobileNav
  auth/                      forms (react-hook-form + zod)
i18n/                        routing, navigation, request config
messages/                    en.json, hi.json (parity enforced by a unit test)
lib/
  supabase/                  client.ts (browser), server.ts (RSC/actions), admin.ts (service role, server-only), middleware.ts
  auth/                      session.ts (cached per request), guards.ts, actions.ts (server actions)
  permissions/               constants.ts (roles, modules, keys), matrix.ts (defaults), check.ts, sql.ts (seed generator)
  admin/modules.ts           sidebar grouping, icons, build phase per module
  routing/protected.ts       locale splitting + protected path rules (pure, tested)
  services.ts                14 services: slug, icon, accent, bookable vs enquiry
  env.ts / env.server.ts     zod-validated env; service-role key is server-only
schemas/                     zod schemas shared by client and server
supabase/migrations/         SQL migrations (source of truth for the schema)
scripts/                     rbac seed generator, first super-admin bootstrap
tests/unit  tests/db  tests/e2e
types/database.ts            Supabase types (hand-written for Phase 1; regenerate with `pnpm db:types`)
```

## Supabase clients

| Client  | File                     | Runs as                        | Use for                                                                  |
| ------- | ------------------------ | ------------------------------ | ------------------------------------------------------------------------ |
| Browser | `lib/supabase/client.ts` | the user (anon key)            | client interactivity (user menu, realtime later)                         |
| Server  | `lib/supabase/server.ts` | the user (cookies)             | Server Components, Server Actions, Route Handlers                        |
| Admin   | `lib/supabase/admin.ts`  | service role, **bypasses RLS** | webhooks, cron, bootstrap; never imported by client code (`server-only`) |

## RBAC

Tables: `roles`, `permissions`, `role_permissions`, `user_roles`.

- Roles: `super_admin`, `admin`, `manager`, `agent`, `vendor`, `driver`, `customer`.
- Permission keys are `<module>.read` / `<module>.write` for each of the 18 admin modules, plus `payments.refund`, `users.manage_roles`, `audit.read`, `vendor.portal`, `driver.portal`.
- `lib/permissions/constants.ts` + `matrix.ts` are the single source of truth. `pnpm rbac:generate` renders `supabase/migrations/20261001000400_rbac_seed.sql`; a unit test fails if they drift.
- Postgres: `has_permission(key)`, `has_role(key)`, `is_staff()`, `current_user_permissions()`, `current_user_roles()`, all `SECURITY DEFINER` with an empty `search_path`.
- Server: `requirePermission(key)` for pages, `assertPermission(key)` for Server Actions (throws `AuthorizationError`).
- Escalation guard: only a `super_admin` can grant or revoke `super_admin`, and only super admins can change the matrix itself.

Default matrix: super_admin and admin get everything; manager reads everything and writes operations but cannot refund, change settings or manage roles; agent works leads and bookings and reads the catalog; vendor and driver only get their portal; customer has no admin permissions.

## Profiles

`profiles` is created by a trigger on `auth.users` insert, and the same trigger assigns the `customer` role. Users can edit their own name, phone, avatar and locale; a guard trigger stops them changing `email` (owned by Supabase Auth), `is_blocked` or `deleted_at` without `customers.write`.

## Audit log

`audit_logs` is append-only: RLS allows reads with `audit.read`, and insert/update/delete are revoked from API roles. `public.audit_trigger()` writes actor (JWT `sub`), action, table, record id (composite keys supported), before/after JSON, changed fields, IP and user agent. No-op and `updated_at`-only updates are skipped. Later phases call `select public.enable_audit('public.<table>');` for every new table.

## Internationalisation

next-intl with `localePrefix: "as-needed"`: English at `/`, Hindi at `/hi`. All UI strings live in `messages/*.json`; a unit test checks key parity and placeholder parity. Admin-editable content is stored as jsonb `{en, hi}` (checked by `public.is_localized()`), read with `pickLocalized()` which falls back to English. Fonts: Plus Jakarta Sans (UI), Noto Sans Devanagari (Hindi fallback), Dancing Script (taglines only).

## Catalog and CMS

- Public reads: `lib/catalog/queries.ts` (cookie-less anon client inside `unstable_cache`, tag `catalog`). Falls back to `lib/catalog/fallback.ts` only when Supabase env vars are missing.
- Writes: `lib/cms/actions.ts` server actions → `lib/admin/mutate.ts` (`assertPermission` → zod (`schemas/cms.ts`) → write as the user (RLS) → audit trigger → `revalidateTag("catalog")`).
- Admin UI: `components/admin/*` (DataTable, form fields, image uploader) and routes under `app/[locale]/admin/{cms,offers,settings}`; edit routes take `[id]` = uuid or `new`.
- Media: browser uploads to the `media` bucket, `registerMedia` records the row; `mediaUrl()` builds the public URL.

## Hotels

- Data: `hotels` → `hotel_rooms` → `hotel_rate_plans`; per-date `hotel_inventory` / `hotel_rates`; `hotel_pricing_rules`; `hotel_media`, `hotel_amenities`. Visibility goes through `can_read_hotel()`.
- Pure logic: `lib/availability/engine.ts` (rates, occupancy, quotes), `lib/pricing/tax.ts` (GST slabs), `lib/hotels/search.ts` (filter/sort/page), `lib/hotels/calendar-edit.ts`, `lib/hotels/csv.ts`, `lib/dates.ts`, `lib/money.ts`, `lib/geo.ts`.
- Reads: `lib/hotels/queries.ts` (catalog cached under `catalog`, calendar under `hotel-calendar`); admin reads in `lib/hotels/admin.ts`.
- Writes: `lib/hotels/actions.ts` through `lib/admin/mutate.ts` with `hotels.write`.
- UI: `components/hotels/*` (public), `components/admin/hotel-*` (admin), routes `app/[locale]/(public)/hotels` and `app/[locale]/admin/hotels`, CSV at `/api/admin/hotels/export`.

## Bookings and payments

- Trust model: customers have no write policies on booking tables. Server actions (`lib/bookings/actions.ts`) re-price from the database (`lib/bookings/hotel-checkout.ts`), then `lib/bookings/service.ts` calls SECURITY DEFINER functions (`create_hotel_booking`, `record_payment`, `cancel_booking`, `record_refund`, …) with the service-role client. Staff actions pass the actor, which `set_actor()` hands to the audit trigger.
- Inventory: `inventory_locks` hold rooms for `hold_minutes`; `hotel_inventory.held_units` is re-derived from live locks, and rows are locked `FOR UPDATE` in date order so two checkouts can't both take the last room.
- Payments: `lib/payments/razorpay.ts` (server-only REST client), `signature.ts` (HMAC, constant-time), `checkout-client.ts` (popup). The webhook `/api/webhooks/razorpay` stores each event once in `payment_events` and applies it with the same idempotent `record_payment` the browser callback uses.
- Pure logic: `lib/pricing/booking.ts` (lines, discount allocation, GST, payable now), `lib/coupons/engine.ts`, `lib/refunds/policy.ts`, `lib/bookings/state.ts` (status machine, booking codes), `lib/invoices/*` (rows, totals, PDF), `lib/notifications/render.ts`.
- Customer UI: `/hotels/[slug]/book` (`components/booking/checkout-form.tsx`), `/account/trips`, invoice PDF at `/api/invoices/[code]`. Admin UI under `app/[locale]/admin/{bookings,payments,offers/coupons,notifications}`.

## Design system

Brand and accent tokens from the poster are CSS variables in `app/globals.css`, mapped onto the shadcn semantic tokens and exposed to Tailwind (`bg-brand-navy`, `text-accent-teal`, …). Dark mode via `next-themes` (`.dark` class). Buttons and inputs default to 44px height for tap targets.

## Where later phases plug in

| Phase | Adds                                                                                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------- |
| 2     | catalog schema + seed, media/storage, CMS (home sections, banners, services table), DataTable                     |
| 3     | `app/[locale]/admin/hotels`, `/hotels` listing + detail, availability engine in `lib/availability`                |
| 4     | `lib/pricing`, `lib/coupons`, Razorpay (`lib/payments`, `/api/webhooks/razorpay`), inventory locks, notifications |
| 5–8   | cabs, local rides, food/essentials/medicine, packages + leads CRM                                                 |
| 9–11  | partner onboarding, settlements, reviews/loyalty/PWA/SEO, hardening (CSP, rate limits, Turnstile)                 |

A dedicated folder (e.g. `app/[locale]/admin/hotels/page.tsx`) takes precedence over the generic `admin/[module]` placeholder, so modules can be replaced one at a time.

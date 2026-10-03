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

## Cabs

- Data: catalog `cab_places`, `cab_categories` → `cab_models`, `cab_fare_rules` (per km, per category × one way / round trip), `cab_routes` → `cab_route_fares`, `cab_local_packages` → `cab_local_fares`, `cab_addons`, `cab_surcharges`; fleet `drivers`, `vehicles`, `fleet_documents`; operations `trips` (one per cab booking) and `trip_events`. Settings in `cabs.defaults`.
- Pure logic: `lib/cabs/pricing.ts` (fare lines, peak, night, advance, timing), `lib/cabs/search.ts` (search → trip plan → offer per category), `lib/cabs/time.ts` (India time), `lib/cabs/distance.ts` (distance provider adapter).
- Server: `lib/cabs/queries.ts` (catalog cached under `catalog`), `checkout.ts` (prices a checkout), `service.ts` (`create_cab_booking` + Razorpay order through the shared `openPaymentOrder`), `actions.ts` (preview, book, verify, driver step), `driver.ts` (trip by link token).
- Trip lifecycle: `create_cab_booking` makes the trip `awaiting_payment`; the `bookings_sync_trip` trigger moves it to `unassigned` when the booking is confirmed and to `cancelled` when the booking is cancelled, fails or expires; `assign_trip` and `set_trip_status` (service role only) move it through assigned → en route → arrived → picked up (OTP) → completed, which completes the booking.
- UI: `/cabs` (search, results, review), My Trips, `/driver/trip/[token]` (no login), and `app/[locale]/admin/cabs` (dispatch board, trips, catalog, fleet).

## Local rides

- Data: catalog `ride_vehicle_types`, `ride_zones` (centre + radius), `ride_points` (landmarks), `ride_fare_rules` (zone × vehicle type × point_to_point / hourly); operations `ride_requests` (one per ride booking) and `ride_events`. Vehicles are shared with cabs (`vehicles.ride_vehicle_type_id`), as are drivers. Settings in `rides.defaults`.
- Pure logic: `lib/rides/pricing.ts` (fares, night surcharge, zone lookup, distance estimate), `lib/rides/search.ts` (search → ride plan → offer per vehicle type), `lib/rides/ui.ts`, `lib/rides/admin-rows.ts`.
- Server: `queries.ts` (catalog cached under `catalog`), `checkout.ts`, `service.ts` (`create_ride_booking`; Razorpay order only for online payment), `actions.ts` (preview, book, verify, rate, driver step), `driver.ts`, `admin.ts` / `admin-actions.ts`.
- Ride lifecycle: pay-the-driver rides are confirmed at once and become `requested`; online rides start `awaiting_payment` and the `bookings_sync_ride` trigger moves them on payment, cancellation or expiry; `assign_ride` and `set_ride_status` move them through assigned → en route → arrived → picked up (OTP) → completed, which completes the booking; `rate_ride` takes one rating.
- UI: `/rides` (search and results), `/rides/review`, My Trips, `/driver/ride/[token]` (no login), `app/[locale]/admin/rides` (live board, ride detail, catalog, fares, vehicles).

## Food, essentials and medicine

- Data: `delivery_zones`, `stores` (restaurant / grocery / pharmacy, owned by a vendor, served zones in `store_zones`), catalog `store_categories`, `store_items`, `item_variants`, `item_addon_groups`, `item_addons`; customers' `addresses`; `delivery_partners` (riders); operations `orders` (one per order booking), `order_items`, `order_events`; medicine `prescriptions` and `medicine_quotes`. Settings in `delivery.defaults`.
- Pure logic: `lib/delivery/cart.ts` (cart resolution against the live menu, cart and quote price lines, delivery fee, payment modes), `hours.ts` (opening hours in India time), `status.ts` (order steps).
- Server: `queries.ts` (zones, stores, menus cached under `catalog`; live menu for checkout), `checkout.ts`, `service.ts` (`create_order`, `set_order_status` via `moveOrder`, `assign_delivery_partner`), `actions.ts` (cart preview, place order, verify payment, rate, address book, prescription upload, accept or decline a quote).
- Order lifecycle: cash-on-delivery orders are confirmed at once and become `placed`; online orders start `awaiting_payment` and the `bookings_sync_order` trigger moves them on payment, or cancels them and returns stock on expiry or cancellation. The store moves them accepted → preparing → ready → out for delivery; the rider delivers with the customer's OTP, which completes the booking.

## Packages, travel enquiries and leads

- Data: `packages`, `package_itinerary_days`, `package_pricing_tiers`, `package_departures`, `package_bookings` (one per package booking); `leads`, `lead_activities`, `quotes`. Settings in `packages.defaults`, `leads.defaults` (staff only) and `travel.defaults`.
- Pure logic: `lib/packages/pricing.ts` (tier pick, price lines, tier coverage checks, departure rules), `lib/leads/status.ts` (pipeline moves, follow-up states, summaries), `lib/leads/quote.ts` (quote pricing, pay-now amount), `lib/leads/attribution.ts` (UTM / referrer → source).
- Server: `lib/packages/queries.ts` (catalog cached under `catalog`; live package for checkout), `checkout.ts`, `service.ts` (`create_package_booking`, Razorpay order for the advance), `actions.ts`; `lib/leads/capture.ts` (`create_lead` + notifications), `actions.ts` (public `submitEnquiry`), `crm.ts` (pipeline and lead reads), `crm-actions.ts` (assign, status, activities, follow-ups, quotes, offline payment), `quote-page.ts` (no-login quote page).
- External inventory: `lib/travel/provider.ts` (`TravelInventoryProvider`; `manual` today).
- Quote lifecycle: draft → sent (`send_quote` writes an unpaid `package` / `travel` booking with the quote's lines; a Razorpay Payment Link is attached) → paid (the `bookings_sync_quote` trigger marks the quote paid and the lead Won when the booking confirms) or expired / cancelled with the booking.

## Partners, B2B services and settlements

- Data: `service_plans` and `service_portfolio` (B2B service pages); `partner_applications` (Partner With Us), `vendor_documents`; vendors gained PAN, address, city, bank / UPI details and the accepted agreement; `vendor_ledger_entries` and `vendor_payouts`. Settings in `partners.defaults` (public) and `settlements.defaults` (staff only).
- Applications: `submit_partner_application` (one open application per account), `review_partner_application` (under review / rejected with a reason), `approve_partner_application` (creates the vendor, owner membership, vendor role and verified documents). Vendors edit their own details and add documents through `update_vendor_profile` and `add_vendor_document`, which check membership.
- Ledger: the `bookings_sync_vendor_ledger` trigger calls `sync_vendor_ledger` whenever a completed booking's status, payments or refunds change. `booking_settlement_vendor` picks the vendor (booking's own, else the cab / ride vehicle's, else the driver's). Payouts: `create_vendor_payout`, `mark_vendor_payout_paid`, `cancel_vendor_payout`; manual credits / debits with `add_vendor_adjustment`.
- Server: `lib/partners` (settings, pure helpers in `status.ts`, public `actions.ts`, staff `admin-actions.ts`, vendor `vendor-actions.ts`), `lib/settlements` (settings, pure statement helpers in `statement.ts`, `admin-actions.ts`, and the `PayoutProvider` adapter in `provider.ts`, `manual` today).

## Reviews, rewards, referrals and reports

- Data: `reviews` and `review_media` (photos in the public `media` bucket under `reviews/<user id>/`), `wishlists`, `travellers`, `loyalty_ledger`, `referrals`, `customer_notes`; `profiles.referral_code`, `coupons.user_id` (personal reward codes), `packages.rating_count`, `stores.rating_count`. Settings in `reviews.defaults` and `loyalty.defaults` (both public).
- Reviews: `review_target` decides eligibility, `submit_review`, `moderate_review`, `reply_review`; the `reviews_refresh_stats` trigger keeps cached ratings in step. Public reads see only public columns.
- Points: `bookings_sync_loyalty` → `sync_booking_loyalty` on completion and refunds (also pays referral bonuses), `redeem_points` (creates a personal coupon; a trigger on `coupon_redemptions` blocks anyone else), `adjust_points`, `expire_loyalty_points` (pg_cron daily). Referrals: `ensure_referral_code`, `claim_referral`.
- Reports: `report_*` and `admin_customer*` functions in `20261010000300_reports.sql`, service role only.
- Server: `lib/reviews`, `lib/loyalty`, `lib/referrals`, `lib/wishlist`, `lib/account`, `lib/reports`, `lib/customers`, `lib/engagement` (settings), `lib/seo` (metadata, JSON-LD, sitemap), `lib/pwa`; `public/sw.js` is the service worker.

## Design system

Brand and accent tokens from the poster are CSS variables in `app/globals.css`, mapped onto the shadcn semantic tokens and exposed to Tailwind (`bg-brand-navy`, `text-accent-teal`, …). Dark mode via `next-themes` (`.dark` class). Buttons and inputs default to 44px height for tap targets.

## Where later phases plug in

| Phase | Adds                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------- |
| 2     | catalog schema + seed, media/storage, CMS (home sections, banners, services table), DataTable                             |
| 3     | `app/[locale]/admin/hotels`, `/hotels` listing + detail, availability engine in `lib/availability`                        |
| 4     | `lib/pricing`, `lib/coupons`, Razorpay (`lib/payments`, `/api/webhooks/razorpay`), inventory locks, notifications         |
| 5     | cabs: catalog, fares, fleet, dispatch board, `/cabs`, driver trip links (`lib/cabs`)                                      |
| 6     | local rides: zones, landmarks, fares, live requests board, `/rides`, driver ride links (`lib/rides`)                      |
| 7     | food, essentials, medicine: stores, menus, cart, orders board, vendor dashboard, prescriptions (`lib/delivery`)           |
| 8     | packages, flight / train / bus enquiries, leads CRM, quotes with payment links (`lib/packages`, `lib/leads`)              |
| 9     | B2B service plans and portfolio, Partner With Us, vendor portal earnings, settlements (`lib/partners`, `lib/settlements`) |
| 10    | reviews, P&S Rewards, referrals, wishlist, account pages, dashboard, reports, customers, SEO, PWA                         |
| 11    | hardening (CSP, rate limits, Turnstile)                                                                                   |

Every admin module now has its own folder under `app/[locale]/admin`.

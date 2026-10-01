# Changelog

## Phase 4 · Booking & payments

### Added

- Database: bookings, booking items (one line per room-night, add-on and fee), guests, inventory holds, coupons and redemptions, payments, payment events, refunds, invoices with per-year numbering, notification templates and logs. RLS on every table: guests read their own bookings, vendor members read their hotel's, staff need `bookings.read` / `payments.read`; nobody writes from the browser. Audit on bookings, payments, refunds, invoices, coupons and templates.
- Booking functions in Postgres (run only by the server): hold rooms with row locks so the last room can't be sold twice, confirm on payment, release on cancel or expiry, record payments and refunds idempotently, issue invoices. Unpaid holds expire after 15 minutes (pg_cron every 5 minutes, plus a sweep on every booking).
- Pricing (`lib/pricing/booking.ts`): room-night lines, early check-in / late checkout / breakfast add-ons, coupon discount spread across lines, GST per room-night slab, optional convenience fee with 18% GST, full / part (advance) / pay-at-hotel amounts. Everything is recomputed on the server; a changed price is shown again before charging.
- Coupons (`lib/coupons`): percent or flat, cap, minimum order, date window, total and per-user limits, first-booking only, private codes.
- Razorpay: order + Checkout popup (cards, UPI, netbanking, wallets), signature check on return, webhook at `/api/webhooks/razorpay` as the source of truth (deduplicated by event id), auto-capture, automatic refund if a payment lands after the hold expired, payment links.
- `/hotels/[slug]/book`: review page with guest details, other guests, special requests, GST invoice details, add-ons, coupon, payment option and the full breakdown. "Reserve now" on the hotel page when online booking is switched on (`booking.hotels` flag).
- My Trips (`/account/trips`): upcoming / past / cancelled, trip detail with price breakdown, payments and refunds, "Pay now" for a held booking, self-service cancellation with the refund worked out from the rate plan's policy, and a GST tax invoice PDF (`/api/invoices/[code]`).
- Notifications: confirmation and cancellation emails (English and Hindi) through Resend with DB templates; SMS and WhatsApp templates stored and logged as skipped until Phase 11 providers are connected.
- Settings: `payments.defaults` (advance %, convenience fee, pay at hotel, hold minutes, customer cancellation) and `business.invoice` (legal name, GSTIN state, invoice prefix, SAC codes, terms).
- Demo seed: add-on prices on three demo hotels; coupons DEMO10, DEMOFLAT300 and DEMOFIRST.
- Tests: 16 database tests (double booking, expiry, replayed payments and webhooks, amount mismatch, late payment, refunds, coupon limits, RLS), 33 unit tests (pricing, coupons, refunds, state machine, signatures, invoice), 4 Playwright tests.

### Changed

- Availability subtracts rooms on hold; the hotel calendar reads live inventory at checkout.
- Audit trigger records the staff member who triggered a server-side booking change.

## Phase 3 · Hotels

### Added

- Database: vendors and vendor members, hotels, room types, rate plans, per-date inventory and rate overrides, seasonal and weekday pricing rules, hotel photos and amenities. RLS (public sees published hotels only; staff with `hotels.read` and the hotel's vendor members see drafts; `hotels.write` edits) and audit triggers on every table.
- Settings: GST slabs for rooms, hotel search defaults (price buckets, landmark radii, page size, map tiles); 16 amenities; a "Stays near the temples" home section; the header Hotels tab now opens `/hotels`.
- Availability and pricing engine (`lib/availability`): occupancy split across rooms, min/max stay, stop-sell, sold out, extra adult/child charges, GST per room-night, cheapest offer.
- `/hotels`: search by city/area/property, dates, rooms and guests; sort by popularity, price both ways, rating, or lowest price & best rated; filters for price (buckets and custom), star category, guest rating, property type, amenities, breakfast, couple friendly, free cancellation and distance from a temple or landmark; list or map view; deal banner; sponsored and featured tags; photo carousels; pagination. All in the URL, English and Hindi.
- `/hotels/[slug]`: photo mosaic with full-screen lightbox, about, highlights, amenities, rooms with every rate plan priced for your dates, house rules, food, map and nearby temples, rating, and a booking card with the full price breakdown (WhatsApp booking until Phase 4). SEO metadata and schema.org Hotel data.
- Admin → Hotels: list with CSV export; hotel form (details, location, tags, policies, amenities, payment add-ons, vendor and commission, SEO); photo gallery; rooms and rate plans; month calendar per room with bulk edit by date range and weekday (open/close, units, min stay, price override); seasonal pricing rules.
- Demo seed: six demo hotels around Banke Bihari, Prem Mandir, ISKCON, Nidhivan and Krishna Janmabhoomi, with Kartik, Holi, Janmashtami and weekend pricing.
- Tests: 13 availability, 13 hotel search, 24 admin helper and 9 database tests; 12 Playwright tests for the hotel pages.

### Changed

- Admin mutations share one helper, `lib/admin/mutate.ts`.
- Home search card's Hotels tab searches `/hotels` with rooms and adults.

## Phase 2 · Catalog core

### Added

- Database: cities and areas, media library, services (with kind, accent, icon, highlights, SEO), categories, amenities, tags, home sections, offer banners, testimonials, FAQs, navigation menus, CMS pages, settings and feature flags. RLS and audit triggers on every table.
- Storage buckets: public `media`, private `documents` and `prescriptions`, with policies.
- Baseline content migration (14 services in English and Hindi, home sections, menus, business profile, feature flags) and demo seed (banners with coupon codes, testimonials, FAQs).
- Public site now reads from the database: Home (hero with search card, pillars, offers carousel, services, about, testimonials, why collaborate, FAQs, partner CTA), new Services index, service pages with highlights and FAQs, header and footer menus, business contact links.
- Admin CMS: Services, Home sections, Testimonials, FAQs and Navigation, each with a searchable table and an edit form (English + Hindi fields, image upload, unsaved-changes warning).
- Admin Offers: offer banners with coupon code, tab, image, link and start/end window.
- Admin Settings: business profile and feature-flag switches.
- Reusable admin pieces: DataTable (TanStack Table), form fields, image uploader, delete button.
- Tests: 11 database tests for the catalog (RLS, audit, storage policies, banner windows), 9 schema unit tests, 8 more Playwright tests.

### Changed

- Services, menus and footer contact details are no longer hard-coded.

## Phase 1 · Foundation

### Added

- Next.js 15 App Router project (React 19, TypeScript strict, Tailwind v4, pnpm).
- P&S design tokens from the poster (navy/blue/sky + 9 service accents) with dark mode; Plus Jakarta Sans, Noto Sans Devanagari and Dancing Script fonts.
- shadcn/ui primitives and brand components: Logo (P&S circle mark), SectionTitle (brush ribbon), ServiceCard, EmptyState, temple-skyline and peacock-feather motifs.
- English + Hindi via next-intl (`/` and `/hi`), language switcher, full Hindi translation of every UI string.
- Sticky header with the 10 nav tabs, mobile drawer, theme toggle, user menu; footer with "Together for a Better Vrindavan".
- Home (hero, four pillars, about, 14-service grid, partner CTA), service pages for all 14 services, Partner With Us page, 404 and forbidden pages.
- Supabase browser, server and service-role clients via `@supabase/ssr`; middleware session refresh + route protection for `/account`, `/admin`, `/vendor`, `/driver`.
- Auth: Google OAuth, email + password, email magic link, sign-up with confirmation, forgot/reset password, sign-out.
- Migrations: extensions and helpers, RBAC tables and `has_permission()`, profiles with signup trigger, generated RBAC seed, audit log with triggers, super-admin bootstrap function.
- Server guards `requireUser`, `requirePermission`, `assertPermission`.
- Admin shell with collapsible sidebar for all 18 modules (filtered by permission), dashboard, per-module placeholders, audit log viewer.
- Guarded vendor and driver portal shells.
- Tests: 44 unit + database tests (RLS, escalation, audit, i18n parity, routing, schemas) and 18 Playwright smoke tests; GitHub Actions CI.
- Docs: ARCHITECTURE, DECISIONS, DEPLOYMENT; `.env.example`; Husky + lint-staged.

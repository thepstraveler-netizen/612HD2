# Changelog

## Phase 5 · Cabs

### Added

- Database: cab places, car categories and models, per-km fare rules, routes and tours with per-category fares, local hire packages, add-ons, peak pricing rules, drivers, vehicles, fleet documents, trips and trip events. RLS on every table (catalog is public; fleet is cab staff only; a trip is visible to its customer, booking staff, cab staff and the assigned driver's login) and audit on all of them. Trips are written only by server functions: `create_cab_booking`, `assign_trip`, `set_trip_status`, plus a trigger that keeps each trip in step with its booking's payment, cancellation and expiry.
- Starter catalog (review before launch): 14 places, 5 categories (hatchback, sedan, SUV, Innova Crysta, Tempo Traveller), 18 routes (one way from Vrindavan, station and airport transfers, Braj darshan and Vrindavan temple tours), local 4 h/40 km, 8 h/80 km and 12 h/120 km, roof carrier and child seat add-ons, `cabs.defaults` settings, confirmation and driver-assigned message templates.
- Fare engine (`lib/cabs`): fixed route fares, per-km one way and round trip with minimum km, driver allowance per day, night charge, peak multipliers, add-ons, coupons, 5% GST under SAC 996601, part payment (advance with a minimum, rest to the driver), booking window checks, and distance from the route or a straight-line estimate.
- `/cabs`: search with Outstation (one way / round trip), Local, Airport & station transfers and Sightseeing tabs; popular routes. Results with distance and time, filters by car type, model and fuel, "model or similar" cards with seats, luggage, AC, fuel, km included and extra km rate. Review page with inclusions and exclusions, cancellation rules, add-ons, coupon, Part pay or Full pay and the fare breakup, paid through Razorpay.
- My Trips for cabs: trip status, driver and vehicle once assigned, the 4-digit pickup OTP, balance to pay the driver, invoice and self-service cancellation per the cab refund rules.
- Driver trip link `/driver/trip/<token>` (no login): pickup details, tap to call, maps links, cash to collect, and Start → Arrived → Picked up (customer's OTP) → Complete, or no-show. Reassigning a trip retires the old link.
- Admin → Cabs: dispatch board (unassigned / assigned / in progress; assign driver and vehicle with upgrades; status steps; copy driver link), trips list and timeline, routes and route fares, fare rules grid, local packages, places, categories and models, add-ons, peak pricing, drivers and vehicles with documents and expiry alerts. Settings → Cabs.
- Notifications: cab confirmation (email in English and Hindi, SMS) and driver assigned (email, SMS, WhatsApp) with the OTP.
- Demo seed: two demo drivers, two demo vehicles, a weekend peak rule and coupon DEMOCAB5.
- Tests: 12 database tests (RLS, booking, payment and cancel sync, expiry, assignment, OTP, driver token never readable, audit), unit tests for fares, trip planning, admin helpers, expiry alerts and UI helpers, 7 Playwright tests for the cab pages.

### Changed

- Coupon lookup is shared between hotels and cabs (`lib/coupons/check.ts`); self-service cancellation and booking notifications handle cab bookings; the Razorpay order step is shared (`openPaymentOrder`).
- The "Cabs" links in the header and home search open `/cabs`. The `/driver` portal moved into a route group so trip links work without signing in.
- Invoices for cab bookings show the trip in place of the hotel.
- Media uploads are allowed for `cabs.write` (category photos).

## Phase 4 · Booking & payments

### Added

- Database: bookings, booking items (one line per room-night, add-on and fee), guests, inventory holds, coupons and redemptions, payments, payment events, refunds, invoices with per-year numbering, notification templates and logs. RLS on every table: guests read their own bookings, vendor members read their hotel's, staff need `bookings.read` / `payments.read`; nobody writes from the browser. Audit on bookings, payments, refunds, invoices, coupons and templates.
- Booking functions in Postgres (run only by the server): hold rooms with row locks so the last room can't be sold twice, confirm on payment, release on cancel or expiry, record payments and refunds idempotently, issue invoices. Unpaid holds expire after 15 minutes (pg_cron every 5 minutes, plus a sweep on every booking).
- Pricing (`lib/pricing/booking.ts`): room-night lines, early check-in / late checkout / breakfast add-ons, coupon discount spread across lines, GST per room-night slab, optional convenience fee with 18% GST, full / part (advance) / pay-at-hotel amounts. Everything is recomputed on the server; a changed price is shown again before charging.
- Coupons (`lib/coupons`): percent or flat, cap, minimum order, date window, total and per-user limits, first-booking only, private codes.
- Razorpay: order + Checkout popup (cards, UPI, netbanking, wallets), signature check on return, webhook at `/api/webhooks/razorpay` as the source of truth (deduplicated by event id), auto-capture, automatic refund if a payment lands after the hold expired, payment links.
- `/hotels/[slug]/book`: review page with guest details, other guests, special requests, GST invoice details, add-ons, coupon, payment option and the full breakdown. "Reserve now" on the hotel page when online booking is switched on (`booking.hotels` flag).
- My Trips (`/account/trips`): upcoming / past / cancelled, trip detail with price breakdown, payments and refunds, "Pay now" for a held booking, self-service cancellation with the refund worked out from the rate plan's policy, and a GST tax invoice PDF (`/api/invoices/[code]`).
- Admin: Bookings (filters by status, date, hotel and guest; detail with lines, guests, payments, refunds, notifications and audit trail; cancel with suggested refund, refund, mark completed, record cash/UPI, send a payment link for the balance, resend confirmation), Payments (payments, refunds, webhook events), Offers → Coupons, Notifications (templates in English and Hindi with preview, delivery log), Settings → Payments & checkout and Invoice. The hotel calendar shows rooms on hold.
- Notifications: confirmation and cancellation emails (English and Hindi) through Resend with DB templates; SMS and WhatsApp templates stored and logged as skipped until Phase 11 providers are connected.
- Settings: `payments.defaults` (advance %, convenience fee, pay at hotel, hold minutes, customer cancellation) and `business.invoice` (legal name, GSTIN state, invoice prefix, SAC codes, terms).
- Demo seed: add-on prices on three demo hotels; coupons DEMO10, DEMOFLAT300 and DEMOFIRST.
- Tests: 17 database tests (double booking, expiry, replayed payments and webhooks, amount mismatch, late payment, refunds, coupon limits, RLS), unit tests for pricing, coupons, refunds, the state machine, signatures, invoices and admin helpers, 4 Playwright tests.

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

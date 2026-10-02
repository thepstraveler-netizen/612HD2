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

## Phase 4 · Booking & payments

### D-033 · Customers never write booking tables; trusted server code does

`bookings`, `booking_items`, `payments`, `refunds`, `invoices` and `inventory_locks` have read policies only. The Next.js server authorises the caller, recomputes the price from the database, and then calls SECURITY DEFINER functions (`create_hotel_booking`, `record_payment`, `cancel_booking`, `record_refund`, …) with the service-role key. Those functions are not executable by `anon`/`authenticated`, run in one transaction each and re-check totals, inventory and coupon limits under row locks. Staff actions pass their user id as `p_actor`; the functions set `app.actor_id`, which the audit trigger now records when there is no JWT subject. Phase 4 therefore needs `SUPABASE_SERVICE_ROLE_KEY` on the server; without it, checkout stays closed and the site falls back to WhatsApp booking.

### D-034 · Holds with a TTL instead of a long-lived lock

A booking holds its rooms in `inventory_locks` (one row per room-night, default 15 minutes, `payments.defaults.hold_minutes`) and in `hotel_inventory.held_units`. Reservation locks the night rows in date order, re-derives held units from live locks (so an expired hold frees the room immediately) and only then checks `units − sold − held`. That makes double booking impossible under concurrency. `expire_stale_bookings()` marks unpaid bookings expired every 5 minutes through pg_cron (Supabase) and is also called before each new booking. A payment that arrives after the hold expired still confirms if the room is free; otherwise the booking fails and the payment is refunded automatically.

### D-035 · Razorpay webhook is the source of truth

The browser callback (`verifyHotelPayment`) checks the checkout signature and fetches the payment from Razorpay to confirm quickly, but the webhook at `/api/webhooks/razorpay` applies the same payment too. Webhook events are stored once per `x-razorpay-event-id` (redeliveries are acknowledged and skipped); payments are applied idempotently on the order/payment id, and the captured amount must equal the order amount. Authorised-only payments are captured by the server. Razorpay is called with `fetch` and basic auth; no SDK.

### D-036 · Price lines are stored and GST is applied per room-night after discount

The server builds one line per room per night plus add-ons and the convenience fee (`lib/pricing/booking.ts`). A coupon is split across discountable lines in proportion (largest remainder, exact to the paisa); each room-night's GST slab is decided on its discounted value; add-ons take the stay's highest room-night rate (they are part of the stay); the fee is taxed at its own rate (`fee_tax_bps`, 18%) and never discounted. The booking stores these lines, so invoices and refunds always match what was charged. The browser sends the total it showed; if the server's total differs, the booking is refused with the new price instead of charging something else.

### D-037 · Payment options come from the hotel and settings

Full online payment is offered when Razorpay keys are set. Part payment is offered when the hotel has a `part_payment_percent` (or, if `part_payment_enabled` is on, the global `advance_percent`); the advance is rounded up to whole rupees. Pay at hotel needs both the hotel's switch and the global `pay_at_hotel_enabled`; those bookings confirm immediately with nothing paid and staff record the cash/UPI later. Online booking as a whole stays behind the `booking.hotels` feature flag; WhatsApp remains as a secondary option.

### D-038 · Checkout needs an account

Guests sign in (email, Google or email link) before the review page, so bookings, invoices and cancellations live in My Trips and coupon limits per user can be enforced. A guest-checkout path can be added later with phone OTP.

### D-039 · Refunds follow the rate plan's rules, by booking value

A rate plan's rules give the refundable share of the booking value when cancelling at least N hours before check-in (India time, the hotel's check-in hour). The hotel keeps the rest as the cancellation charge, and the guest gets back whatever they paid beyond that charge, so an advance is refunded only if it exceeds the charge. Guests can cancel confirmed stays themselves before check-in (switch: `customer_cancellation_enabled`); staff can override the amount. Refunds go back through Razorpay to the original payment; offline payments are recorded as refunded by staff.

### D-040 · GST invoices are numbered per financial year and issued on confirmation

Invoice numbers look like `PST/26-27/00001` (prefix from `business.invoice`, counter per Indian financial year, at most 16 characters). The invoice is issued when the booking is confirmed, with the seller details frozen from settings, SAC 996311 for accommodation, and CGST + SGST because accommodation is taxed where the property is. The PDF is generated on request (`/api/invoices/<code>`, RLS decides who may download) with pdf-lib and the built-in Helvetica, so it is English-only with "Rs." for the rupee sign. Who the supplier of record is (the platform as e-commerce operator or the hotel) is a tax question for the business's CA; the seller block is fully configurable.

### D-041 · Notifications are templates plus provider adapters

`notification_templates` holds editable text per key, channel and language with `{{placeholders}}`; every send is logged in `notification_logs`. Email goes through Resend when `RESEND_API_KEY` is set; SMS and WhatsApp adapters log "skipped" until their providers are configured. A failed notification never fails a booking.

### D-042 · Admin booking screens

The bookings list is filtered and paged in the database (25 per page) with the filters in the URL, so a filtered view can be bookmarked. Payments, refunds, webhook events and notification logs show the latest 200 rows. A booking shows only the actions its status allows and the staff member's permissions cover (`canTransition`), and the server checks again. Cancelling needs `bookings.write`; refunding needs `payments.refund` and is capped at paid minus already refunded. If a cancel succeeds but the refund fails, staff see that and can retry the refund. A balance is collected with a Razorpay payment link (an open link is re-sent rather than a second one created, so the balance can't be paid twice) or recorded as cash/UPI.

### D-043 · Goodwill refunds keep the stay on

A refund on a confirmed or completed booking (a goodwill gesture or a price correction) leaves its status alone, so staff can still complete it, collect the balance or cancel it later. Only cancelled or failed bookings move to refunded / partially refunded.

### D-044 · Coupons, templates and settings are edited, not deleted

A coupon that has been reserved or redeemed can't be deleted, only switched off. Notification templates can't change key, channel or language after creation and are switched off rather than deleted. Settings forms overwrite only their own keys in the stored JSON, so keys added later survive.

### D-045 · Cabs are booked on request and dispatched, not held from inventory

A cab booking reserves a car category, not a specific vehicle: once paid, the trip lands on the dispatch board and staff assign a driver and vehicle. There is no per-vehicle availability lock; operations can always add a vendor car. Staff may assign a vehicle of a higher category (a free upgrade) but never a lower one by mistake, because the board lists the booked category first and labels the rest as upgrades.

### D-046 · Places come from an admin catalog; distance from routes or an estimate

Pickup and drop points are an admin-managed list (cities, stations, airport, temples) rather than free-text map search, so prices are predictable and no maps API key is needed. Distance and time come from the admin's route row when one exists; otherwise straight-line distance × a road factor (default 1.25) at an average speed from settings. A maps provider can be plugged in behind `DistanceProvider` (`lib/cabs/distance.ts`) later. The exact street address is captured on the review page and passed to the driver.

### D-047 · Cab fares: fixed route fares first, then the per-km rule

Transfers and sightseeing tours are always fixed-fare per category. Outstation one-way trips use a fixed route fare when the admin set one, otherwise `max(min km, km) × rate + driver allowance`. Round trips are always per km: `max(min km per day × days, 2 × km) × rate + allowance × days`, with days counted on the India calendar. Local hire uses the package fare (4 h/40 km, 8 h/80 km, 12 h/120 km). A peak multiplier (highest matching rule by date window, weekday, trip type and category) applies to the base fare only, never to allowances or add-ons. A night charge applies when pickup falls in the night window. Coupons apply to fare, peak surcharge and add-ons, not to allowances, night charge or fees.

### D-048 · GST on cabs is 5% under SAC 996601, from settings

Passenger transport by a cab operator is billed at 5% (without input tax credit) under SAC 996601, both editable in `cabs.defaults`, so the business's CA can change them without code. The convenience fee keeps its own 18% rate.

### D-049 · Part pay for cabs: an advance online, the rest to the driver

The advance is the larger of the configured share (default 20%) and a minimum (default ₹500), rounded up to whole rupees and never more than the total; when that would be the whole fare, only full payment is offered. Pay-at-pickup with nothing online is not offered for cabs (the database refuses it), so every dispatched trip has a confirmed customer. The driver page shows the cash to collect.

### D-050 · Drivers work from a secret trip link; pickup needs the customer's OTP

Drivers don't need an account: every assignment issues a fresh 48-character link `/driver/trip/<token>` that expires two days after the trip, and reassigning a trip invalidates the previous driver's link. The token is never readable through the API (column grant) and is checked with the service role. At pickup the driver enters the customer's 4-digit OTP (shown in My Trips and the confirmation message) when `require_pickup_otp` is on; staff can move a trip along from the dispatch board without it. Completing the trip completes the booking. Drivers may also be linked to a login for the `/driver` portal later.

### D-051 · The customer sees driver and vehicle details copied onto the trip

Driver name and phone, vehicle model and registration are copied onto the trip at assignment, so the customer can read them under RLS without access to the fleet tables (which hold licences, documents and other trips). Cancellation refund rules for cabs come from settings and are frozen into the booking snapshot at booking time.

### D-052 · Local rides are their own service, not a cab trip type

Bike, e-rickshaw, cycle rickshaw and in-town car rides are short, cheap and often "right now", while cabs are planned trips paid in advance. Rides get their own catalog (`ride_vehicle_types`, `ride_zones`, `ride_points`, `ride_fare_rules`) and requests (`ride_requests`, `ride_events`), booked as `bookings` rows with service `ride`. Drivers are shared with cabs; a vehicle is either a cab (car category) or a ride vehicle (ride type), never both, and a cycle rickshaw may have no registration.

### D-053 · Zones are circles and pickups are landmarks or the browser's location

Each town (Vrindavan, Mathura, Govardhan, Barsana) is a centre and radius, so no GIS extension or maps key is needed. Pickup and drop are a landmark from the admin list (temples, ghats, stations) or "my location" from the browser; a free location belongs to the nearest zone whose circle contains it, and anything outside every zone is refused. Fares follow the pickup's zone. Distance is straight line × a road factor (default 1.3), like cabs (D-046), and rides longer than `max_ride_km` (default 40) are sent to cabs. Starter coordinates are approximate and must be checked on a map before launch.

### D-054 · Ride fares: per zone × vehicle type × mode

Point to point: `max(min fare, base + max(0, km − included km) × per km)`. Hourly: `hourly rate × max(min hours, hours)` with `km per hour × hours` included. Extra km and waiting beyond the free minutes are shown as terms and settled with the driver, not charged at booking. A night surcharge (`night_bps`, e.g. +25%) applies to the fare when pickup is in the night window. Fares round to whole rupees. Coupons apply to fare and night charge, not to the convenience fee.

### D-055 · GST on rides is set per vehicle type

GST lives on each ride vehicle type (`tax_bps`) instead of one global rate: the starter data charges 5% on bikes and cars and 0% on e-rickshaws and cycle rickshaws (non-AC contract carriage is commonly exempt). This is a starting point; the business's CA should confirm the rates and SAC (`rides.defaults.sac`, default 996601), which are editable without code.

### D-056 · Rides can be paid to the driver, and then need no gateway

Customers choose Pay the driver (stored as `payment_mode = pay_at_hotel`, nothing online) or Pay online (the whole fare through Razorpay, with the convenience fee). A pay-the-driver ride is confirmed at once and goes straight to the live requests board, so rides can launch before Razorpay keys exist; `rides.defaults.pay_later_enabled` switches this off. Part payment is not offered for rides. Vehicle types marked "on request" (cycle rickshaw by default) are pay-the-driver only, so nobody prepays for a ride staff may still decline.

### D-057 · Ride now picks up after the lead time

"Ride now" sets pickup to now + `min_lead_minutes` (default 10), rounded up to 5 minutes; scheduled rides must be at least that far ahead and within `max_advance_days` (default 7). Dispatch, driver links and the pickup OTP work as for cabs (D-050): every assignment issues a fresh `/driver/ride/<token>` link valid until a day after pickup, never readable through the API.

### D-058 · Customers rate a completed ride once

After a ride is completed the customer can rate it 1 to 5 with an optional comment from My Trips, once (`rate_ride`). Ratings are visible to ride staff on the ride; driver averages and public reviews come with the reviews phase.

### D-059 · One catalog for restaurants, essentials shops and pharmacies

A `store` is a restaurant, a grocery/essentials shop or a partner pharmacy, owned by a vendor. All three share one catalog (categories, items, variants, add-on groups and add-ons) and one order model, so the vendor dashboard, admin board and checkout are written once. Items carry a diet mark (veg, egg, non-veg, or n/a for products) plus Jain and Sattvik flags, which the database refuses on egg or non-veg items. Stock is optional per item (`track_stock`) and per variant.

### D-060 · Delivery is priced by zone, with a free-delivery threshold

Each town is a delivery zone with a fee, an optional "free above" amount and a delivery time. A store lists the zones it serves and the customer picks the zone with their address; there is no distance pricing and no maps key. Delivery is free when items after the coupon reach the zone's threshold. The ETA shown is the store's preparation time plus the zone's delivery time, counted from when the store accepts.

### D-061 · Orders are bookings; cash on delivery is confirmed at once

An order is a `bookings` row (service `food`, `essentials` or `medicine`) plus one `orders` row with its items, like cab trips (D-045). Price lines, coupons, Razorpay payments, refunds, invoices and My Trips are shared. Cash on delivery is stored as `payment_mode = pay_at_hotel`, confirmed immediately and sent straight to the store, so ordering works before Razorpay keys exist; it is capped by `delivery.defaults.max_cod_paise` (default ₹3,000) and can be switched off. Online orders hold their stock for `hold_minutes` (default 15) until paid. Only ASAP delivery is offered in this phase; scheduled delivery can come later.

### D-062 · Medicines only through a reviewed prescription and a licensed pharmacy

There is no medicine shelf to add to a cart. The customer uploads a prescription (images or PDF, up to 5 files) to the private `prescriptions` bucket under their own folder; staff with `medicine.write` or the assigned partner pharmacy review it (opening the files through short-lived signed URLs) and send a priced quote; the customer accepts it and pays online or on delivery, and the quote becomes the order. Only a quote that is live, unexpired and matches the prescription and pharmacy can become an order (checked in `create_order`). A pharmacy store cannot be saved without a drug licence number, the platform never dispenses itself, and the medicine page shows a compliance notice (editable in Settings → Delivery) that prescription drugs are never sold without a valid prescription.

### D-063 · Stock is taken when the order is placed and returned if it fails

`create_order` takes tracked stock in the same transaction that creates the order, so two customers can't buy the last item. Stock goes back when the booking expires unpaid, fails, is cancelled or refunded before delivery, or when the store rejects the order (`restock_order`); a rejected order is never restocked twice. Menus are cached for at most a minute and every order clears the cache; checkout always reads the live menu.

### D-064 · The store drives the order; the rider confirms delivery with the customer's OTP

Order steps are Placed → Accepted → Preparing → Ready → Out for delivery → Delivered (the customer's tracker folds Ready into Preparing). The store accepts or rejects (rejection cancels the booking and refunds everything paid), prepares and marks ready; a rider is assigned by staff or the store (a platform rider, or the store's own) and gets a fresh no-login link `/delivery/order/<token>` valid for a day, never readable through the API. Delivery needs the customer's 4-digit OTP when `require_delivery_otp` is on (staff can move an order without it). Delivering completes the booking. Customers may cancel themselves only before the store accepts (`cancel_until`).

### D-065 · GST on orders: store rate on food, item rate on products, 18% on delivery

Restaurant food and packaging are taxed at the store's rate (default 5%, SAC 996331). Products take the item's own GST rate and HSN code when set, otherwise the store's rate. Medicine quotes carry GST and HSN per line (default 12%). The delivery fee is taxed at `delivery_tax_bps` (default 18%, SAC 996813) and the convenience fee at its own rate, online only. Coupons reduce items only, never packaging, delivery or fees. Restaurant supplies through an e-commerce operator have special GST rules (section 9(5)); **the business's CA should confirm these rates and codes**, which are all editable without code.

### D-066 · Customers rate a delivered order once

After delivery the customer can rate the order 1 to 5 with a comment, once (`rate_order`). Ratings show on the vendor dashboard; store ratings shown on listings are still set by staff until the reviews phase.

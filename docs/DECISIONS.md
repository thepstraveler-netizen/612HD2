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

## Phase 8 · Packages, flights / trains / buses and the leads CRM

### D-067 · Package prices are per traveller by group size

A package has pricing tiers by group size (for example 1–2, 3–5 and 6–12 travellers); the tier whose range holds the whole group (adults + children) sets the price per adult, and children pay the tier's child price when it has one, otherwise the adult price. A departure date can add a per-traveller supplement for festival or peak dates. Admin checks that tiers don't overlap and cover every group size the package allows. Packages are either fixed group departures (dated, optionally with a seat limit) or private tours on any date the customer picks.

### D-068 · Packages are booked online with an advance; enquiries are always open

Every package takes enquiries. A package set to "book" can also be booked online when the `booking.packages` flag is on and Razorpay is configured: the customer pays the advance (the package's own %, else `packages.defaults.advance_percent`, default 25%) or the full price, and the balance is collected later with a payment link from Bookings. There is no pay-later for packages. A package booking is a `bookings` row (service `package`) plus one `package_bookings` row, like cab trips (D-045). Seats are counted from confirmed bookings plus unpaid holds that have not expired (`hold_minutes`, default 20), re-checked under a lock on the departure, so an abandoned checkout frees its seats on its own. Online booking closes `book_until_days` (default 2) before departure.

### D-069 · One leads table for every enquiry form

Package enquiries, flight / train / bus requests, enquiry-only service pages and leads typed in by agents (calls, WhatsApp, walk-ins) all write one `leads` row through `create_lead`, with what was asked in `details`. Customers don't need to sign in to enquire; a signed-in customer is linked to their lead. Spam control for now is a hidden honeypot field and a per-phone limit (`max_per_phone_per_hour`, default 5); a CAPTCHA (Turnstile) comes with the hardening phase. The CRM is staff-only: leads, activities and quotes are readable with `leads.read` and written only by server functions after a permission check.

### D-070 · New leads go to the least busy agent; every agent sees every lead

With `leads.defaults.auto_assign = least_loaded` (the default), a new lead is assigned to the active `agent` with the fewest open leads (New, Contacted or Quoted); set it to `none` to assign by hand. Leads can be reassigned to anyone holding `leads.write`. Agents can see all leads, not only their own, so a colleague can pick up a customer who calls back while the owner is away; the board filters to "Me" with one tap.

### D-071 · Pipeline rules

Leads move New → Contacted → Quoted → Won or Lost. Logging a call, WhatsApp, email or SMS on a new lead marks it Contacted. Quoted is reached only by sending a quote; Won happens automatically when a quote is paid, or by hand for a sale closed outside the system. Lost needs a reason (from an editable list), and a lost lead can be reopened. Each lead has a next follow-up time (the first one defaults to 2 hours after the enquiry); the board shows overdue and due-today follow-ups. The same rules are enforced in `set_lead_status` and mirrored in `lib/leads/status.ts`.

### D-072 · A sent quote is an unpaid booking with a Razorpay Payment Link

Agents build a quote from free lines (description, quantity, price before GST, GST % and SAC per line); the server prices it with the shared booking pricing. Sending it creates an unpaid booking (service `package` for package leads, `travel` otherwise) holding exactly those lines, opens a Razorpay Payment Link for the full total or an advance, and sends the customer a no-login quote page `/quote/<token>` (a 48-character token never readable through the API). When the link is paid the booking confirms through the normal payment path (invoice included) and a trigger marks the quote paid and the lead Won. A customer holds only one payable quote: sending a new one withdraws the previous one, cancels its booking and cancels its link at Razorpay (a payment that still arrives on a withdrawn quote is refunded automatically). A quote expires with its validity (`quote_valid_hours`, default 48), which is also the link's expiry. Without Razorpay keys a quote can still be sent and staff with `payments.write` record the money received (cash, UPI, bank transfer), which confirms the booking. Quote bookings from customers who never signed in have no account owner; their quote page shows the paid status and booking code.

### D-073 · Flights, trains and buses go through an inventory adapter, quoted by hand for now

`/travel` takes a flight, train or bus request and creates a lead; the travel desk finds fares, sends a quote and issues the tickets after payment. All inventory access goes through the `TravelInventoryProvider` interface (`lib/travel/provider.ts`, chosen by `travel.defaults.provider`). The only provider today is `manual` (no live results), so a live airline, rail or bus aggregator can be added later without touching the enquiry, CRM or payment code, and even then the picked option is re-priced and goes through a quote before payment.

### D-074 · Lead sources come from UTM tags and the referrer

On the first page of a visit the browser keeps the `utm_*` tags, the referring site and the landing page for the session; every enquiry sends them along. The CRM source is the explicit source if any, else `utm_source`, else the referring site (Instagram, Facebook, WhatsApp, Google, YouTube), else "website", limited to the editable `leads.defaults.sources` list. Campaign links should carry `utm_source` (for example `?utm_source=instagram&utm_campaign=kartik`).

### D-075 · GST on packages and quotes

Packages are taxed at the package's rate, default 5% under SAC 998555 (tour operator services); the CA may prefer 18% with input tax credit, and the rate is editable per package. Quote lines carry their own GST and SAC so an agent can, for example, pass an air fare through at the airline's rate and add a service fee at 18%. **The business's CA should confirm these defaults**, which are all editable without code.

### D-076 · Agents message customers from their own WhatsApp

Customers get an automatic acknowledgement of their enquiry and the quote with its payment link (`lead.received`, `quote.sent`; email now, SMS and WhatsApp once those providers are set up in a later phase), and agents get an email when a lead is assigned to them (`lead.assigned`). For one-to-one chats the CRM fills in quick-reply templates (`crm.intro`, `crm.follow_up`, `quote.sent`, editable in Notifications) and opens them in the agent's own WhatsApp; the agent then logs the message on the timeline. No WhatsApp Business API is needed for this.

## Phase 9 · B2B services, partner onboarding and vendor settlements

### D-077 · B2B services sell through plans and enquiries, not a cart

The six business services (hotel photography, OTA handling, calling centre, Instagram reels marketing, lead generation, travel agent & data) get admin-editable plans (`service_plans`: name, price or "price on request", price suffix such as "per month", features, a "popular" mark) and a portfolio (`service_portfolio`: an image and / or a reel or listing link with a caption and client name). Picking a plan opens the same enquiry form as before with the plan preselected, so every request lands in the leads CRM with the plan in its details and the travel desk quotes it like any other lead (D-072). The sample plan prices in the seed are examples to edit before launch.

### D-078 · Partners apply with their own account

The Partner With Us form needs the applicant to sign in first (Google, email or magic link). The same account becomes the owner of the vendor when the application is approved, gets the `vendor` role and opens the partner dashboard at `/vendor`; there is no separate invite step. One open application per account. Documents are uploaded straight to the private `documents` bucket under `partners/<user id>/` with one-time signed upload URLs and are only ever served to staff and the vendor through short-lived signed links.

### D-079 · What each business type is asked for is a setting

`partners.defaults` lists the business types offered (the poster's list plus pharmacies and service providers), the documents required per type (for example FSSAI for restaurants, drug licence for pharmacies, RC for transport), the default commission per type (hotels and restaurants 15%, pharmacies 8%, others 10%), the upload size limit and the partner agreement with its version. The applicant accepts the agreement by typing their name; the version, name and time are kept on the application and copied to the vendor. Changing the agreement text should bump its version; an application sent against an old version is refused and the form reloads the new text.

### D-080 · Approval creates the vendor in one step

Approving an application (`approve_partner_application`) creates an active vendor of the matching kind with a unique slug, makes the applicant its owner, grants the vendor role and copies the documents as verified. Staff can override the commission at approval. Rejecting needs a reason, which is emailed to the applicant, who may apply again. Vendors can later update their own contact, GST / PAN and bank or UPI details and add documents from the portal (new documents wait for staff verification); name, status and commission stay with staff.

### D-081 · The settlement ledger is written from completed bookings

When a booking that belongs to a vendor completes (the hotel's or store's vendor, or the vendor that owns the cab or ride vehicle, else the driver), a ledger row records the gross value (total minus refunds), what the platform collected (online payments, payments staff recorded as received by P&S, and cash on delivery brought in by the platform's own riders, minus refunds), what the vendor collected directly (pay at hotel, the balance paid to a vendor's driver, cash taken by the store's own riders), the commission at the vendor's rate, GST on that commission, TCS and TDS, and the net: collected by the platform minus commission, GST, TCS and TDS. A negative net means the vendor holds money that belongs to the platform. Rates are frozen when the booking first settles. A later refund or payment changes the same row while it is unsettled, or adds an adjustment row once it has been paid out, so a payout never changes after the fact. Packages and travel quotes are the platform's own sales and have no vendor. Finance can add manual credits or debits with a reason. Staff should record a payment on a booking only when P&S itself received the money; cash a hotel or driver took stays out of the booking's payments so it counts as collected by the vendor.

### D-082 · TCS and TDS are placeholders until the CA sets them

`settlements.defaults` holds GST on commission (18%), TCS and TDS rates (both 0 = not withheld) and the settlement cycle (7 days). E-commerce operators may have to collect TCS under GST and deduct TDS under section 194-O on what they pay partners; the rates and thresholds depend on the business's registration and change over time, so **the business's CA should set them**. They apply to bookings that settle after the change.

### D-083 · Payouts are made by hand through an adapter

A payout gathers a vendor's unsettled rows up to a cut-off date (cycles end every `cycle_days` days for everyone) into one pending payout; finance pays it by bank transfer or UPI outside the app (or collects it, when the vendor owes money) and records the method and UTR, and the vendor is emailed. A pending payout can be cancelled, which releases its rows. One pending payout per vendor at a time. Money movement goes through a `PayoutProvider` interface (`lib/settlements/provider.ts`); only `manual` exists, and a Razorpay Route or RazorpayX adapter can be added later without changing the ledger. Creating, paying and cancelling payouts and adjustments need `payments.refund`, like refunds.

## Phase 10 · Reviews, rewards, referrals, wishlist, PWA, SEO and reports

### D-084 · Only customers who booked can review, and staff moderate first

A review belongs to one booking (one review per booking) and only the customer who made it can write it. It opens once the booking is completed, or for a hotel stay or package once its end date has passed while it is still confirmed (staff do not always mark stays completed), and stays open for `window_days` (180) after that. The subject is the booking's hotel, package or store; cab, ride and travel bookings are reviewed as the service. Reviews wait in Admin → Reviews until staff publish them (`reviews.defaults.auto_publish` turns that off); rejecting needs a note. Staff can post one public reply. Only published reviews count towards the cached ratings on hotels, packages and stores. The public sees the first name and initial ("Priya S."), never who wrote it or for which booking. Review photos go to the public `media` bucket under `reviews/<user id>/` with unguessable names and are listed only once the review is published.

### D-085 · P&S Rewards points are spent as a personal coupon

Points live in a ledger. A completed booking earns `earn_bps` (1%) of its total minus refunds, in points worth `point_value_paise` (₹1) each; the rate is frozen when the booking first earns, and a later refund takes the matching points back. Staff can credit or debit points with a reason; a published review can earn a bonus. To spend points, the customer turns them into a one-time coupon only they can use (`PSR…`, valid `code_valid_days`), so checkout, server-side pricing and the coupon engine stay unchanged and the discount is recomputed on the server like any coupon. A code that lapses unused gives its points back. Earned points expire after `expiry_days` (365; oldest first). All of it, including turning the programme off, is in `loyalty.defaults`.

### D-086 · Referral bonuses are paid on the friend's first completed booking

Every customer gets a referral code. A new customer can claim a friend's code until their first booking completes; when it does, both get points (`referrer_points`, `referee_points`). Paying on completion rather than signup stops self-referral farming with throwaway accounts.

### D-087 · Wishlist hearts load in the browser; referrals are claimed on the first account visit

Catalog pages stay static or cached: each page loads the signed-in customer's wishlist once in the browser and every heart shares it; saving writes straight to `wishlists` under RLS. A `?ref=CODE` link stores the code in a first-party cookie for 30 days, and the claim runs once the customer opens their account (where sign-up lands), then the cookie is deleted whatever the result. A reward code used by anyone but its owner is reported as "not found", and reward codes never show in public coupon lists.

### D-088 · Review summaries are cached for ten minutes

The rating summary and first page of reviews on hotel, package and store pages are cached under a `reviews` tag and refreshed when staff publish, reject or reply. Photos are uploaded before the review is sent, so an abandoned form can leave an unused photo in `media/reviews/<user id>/`.

### D-089 · How report numbers are counted

Dashboard and report figures are summed in SQL functions only the server can call, after it checks the viewer's permission, using India dates. Most reports count a booking on the day it was created; occupancy uses stay dates, cancellations the day of cancellation and vendor commission the ledger date. A booking counts as sold while it is confirmed, completed or partially refunded; revenue is paid minus refunded and booked value is total minus refunded. Conversion is bookings that ever confirmed divided by all bookings created (including expired and failed). Agent figures follow the lead's current assignee. Reward codes are grouped into one "PSR" row in coupon usage. The figures need `reports.read` or `payments.read`; the "needs attention" list needs `dashboard.read` and shows each item only to staff who can open it. Low stock means 5 units or fewer.

### D-090 · Staff actions on customers

Staff notes and block / unblock are written as the signed-in staff member, so RLS and the audit log apply, and staff cannot block themselves. Points adjustments need a reason and record the staff member. A blocked customer cannot use their account, book, redeem points or write reviews.

### D-091 · SEO: canonical and hreflang per page, sitemap from the catalog

Every public page sets its own canonical URL and `hreflang` links (en, hi, x-default = English) through one helper; the layout only sets the site defaults. `sitemap.xml` lists every public page and every published hotel, package and store in both languages, read from the public catalog and falling back to the static pages if the database is unreachable. `robots.txt` keeps admin, account, partner, driver, rider, checkout, quote, auth and API pages out of search. Structured data: Organization / TravelAgency on the home page, Hotel, TaxiService, Product + TouristTrip for packages, Restaurant / GroceryStore for stores, Service for business services and breadcrumbs on detail pages; ratings appear only once there is at least one published review. Share images and app icons are drawn by the app, so no image files are committed; they are English-only because the image font has no Devanagari.

### D-092 · The PWA is a hand-written service worker; analytics only on Vercel

The site installs as an app (manifest and icons). A small service worker loads pages from the network first and falls back to an offline page; static files and images are cached with size limits; a booking page the customer opened while online (My Trips → a booking) is kept, up to 20, so it opens without signal, and the saved copies are deleted on sign-out. Admin, account forms, checkout, API and auth requests are never cached. Vercel Web Analytics and Speed Insights (free, cookieless) load only on Vercel, with booking codes and tokens stripped from the URLs they report; they must be switched on in the Vercel project.

## Phase 11 · Hardening

### D-093 · Rate limits: fixed windows, database by default, Upstash optional

Sign-in, sign-up, magic link, password reset, enquiries, partner applications, coupon lookups, review submissions, upload links and data exports are limited per visitor in fixed windows set in Admin → Settings → Security (`security.defaults.rate_limits`). Each request counts against its IP (Vercel's forwarded-for header first) and, when signed in, the account; magic link and reset are also counted per email address, hashed before it is stored. Sign-in is never limited by email alone, so nobody can lock another person out. Counts live in `rate_limit_hits` through `hit_rate_limit()` (a pg_cron job clears old windows hourly); when `UPSTASH_REDIS_REST_URL` and its token are set, Upstash is used instead. If the limiter itself fails the request is allowed and the error logged. Coupon lookups include price previews, so a customer re-pricing many times could reach the limit (30 per 10 minutes by default).

### D-094 · Cloudflare Turnstile on public forms, optional

Sign-in, sign-up, magic link, password reset, enquiry and partner forms carry a Turnstile check when both `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set and `turnstile_enabled` is on. Without keys the widget isn't loaded and nothing is checked. Tokens are single use and renewed after each submit; if Cloudflare can't be reached the visitor is let through rather than locked out.

### D-095 · Data export and account deletion (DPDP)

Account → Privacy & security downloads everything tied to the account as JSON (explicit columns only: no gateway payloads, tokens, OTPs, staff notes or storage paths) and logs each download as a completed `privacy_requests` row. Deletion is a request: the customer can ask at any time and cancel; staff complete it in Admin → Customers → Privacy requests once no booking is awaiting payment or confirmed. Completing deletes the auth user, which removes the profile, addresses, travellers, wishlist, points, reviews and roles; bookings, payments and invoices are kept without the account link because tax law requires them. The request keeps the email as the record of who asked. Uploaded files (prescriptions, partner documents, review photos) are not deleted yet and need a manual clean-up.

### D-096 · Content-Security-Policy without nonces

Every route sends a fixed CSP built at build time (`lib/security/csp.ts`) that allows only this site, Supabase, Razorpay, Cloudflare Turnstile, Vercel Analytics and, when configured, Sentry; framing by other sites is refused. Nonces would make every page render per request and lose static caching, so inline scripts are allowed with `'unsafe-inline'`; the protection comes from the short list of origins, `object-src 'none'`, `base-uri 'self'` and `form-action 'self'`. Zod runs in its no-`eval` mode in the browser. Supabase URL and the browser Sentry DSN must be set when building.

### D-097 · Two-step sign-in (TOTP) for staff

Anyone can add an authenticator app in Account → Privacy & security (Supabase Auth MFA, free). Once a factor is verified, every guarded page, server action and admin export asks for the 6-digit code while the session is single-step. Staff (anyone with an admin module read permission) must set one up when Settings → Security → "Require two-step sign-in for staff" is on. The check is in the app (`lib/mfa`, `assertPermission`, the admin layout and export routes); RLS does not look at the session level, so a staff token that skipped the code is still limited only by RLS if used against the database API directly. Making RLS check the level is left for when staff accounts warrant it.

### D-098 · Security review fixes

A review of the code before launch led to these changes. Post-login redirects reject control characters and backslashes, so `/%09/evil.example` can't leave the site. Pickup OTPs for cabs and rides are no longer in the database API grant (a driver with a linked login could read them); customers and staff get them through `trip_otp` / `ride_otp`. Every OTP check from a driver, rider or store is limited to 5 tries per trip or order per 15 minutes, counted before the check and reported like a wrong code. Only medicine staff can create or change medicine quotes (pharmacies read them). Blocking or unblocking a staff account needs `users.manage_roles`, so a manager can't lock out an admin. Hotel commission rates are hidden from visitors. Settlement CSVs neutralise spreadsheet formulas. CMS links can't start with `//`. Saved offline trip pages are cleared whenever a page redirects to sign-in, not only on the sign-out button. Grant-narrowing changes like these must reach the live database only after the matching code is deployed.

### D-099 · Maintenance mode

The `site.maintenance_mode` flag shows a branded English / Hindi page (not indexed) on public pages. It is read from the cached flags, so pages stay static; the page is served with status 200 because a static layout can't set 503. Staff open "Staff preview", which turns on Next draft mode after checking their permission, to browse the real site with a banner. Admin, account, sign-in and the vendor, driver and rider pages stay reachable. Server actions already in progress (such as a checkout) are not blocked. Saving the flag takes effect at once; otherwise within 5 minutes.

### D-100 · SMS through MSG91 and WhatsApp through the Cloud API

Both are optional and used only when their keys are set; otherwise messages are logged as skipped, as before. Indian DLT rules and WhatsApp both require pre-approved templates, so each template key's MSG91 flow id and WhatsApp template name live in the `notifications.providers` setting, and the approved provider template (not the stored body text) is what customers receive. Variables are sent in the order given there or the order of placeholders in the stored body. Only Indian mobile numbers (+91, starting 6 to 9) are messaged. Every attempt is logged with provider, message id and an error with credentials removed.

### D-101 · Error reporting without an SDK

Server errors (`onRequestError`) and browser errors (error boundaries and window listeners) are sent to Sentry's envelope endpoint with `fetch` when `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are set, after removing emails, phone numbers, tokens, cookies and auth headers; otherwise they are written to the logs as one JSON line. This keeps the Sentry SDK out of the bundle and works on Sentry's free plan. Logs use a small JSON-lines logger with the same scrubbing.

### D-102 · Database advisor findings

All 79 foreign keys the Supabase performance advisor listed as unindexed now have indexes. Accepted as they are: the security advisor's warnings about `can_read_*`, `has_permission`, `is_staff` and similar functions being callable by signed-in users and visitors (RLS policies call them and they only reveal the caller's own access), "multiple permissive policies" (a small cost per query, kept for readable policies), "unused index" (no traffic yet) and `invoice_counters` having RLS without policies (only server functions touch it). Leaked-password protection needs a paid Supabase plan and stays off.

### D-103 · Upload scanning hook

`lib/security/file-scan.ts` defines a `FileScanner` interface with a no-op default. Browsers upload straight to Supabase Storage, so there is no single server step to scan in; when a scanner is chosen it should run from the actions that record an upload (partner application, vendor document, prescription, review) or a Storage webhook.

### D-104 · A refund that fails stops counting

When Razorpay reports a refund as failed after it was recorded, its amount is taken off the booking's refunded total, the payment and booking status are worked out again from the refunds that didn't fail (a fully failed refund puts the booking back to cancelled), and staff can issue the refund again. A failed refund stays failed even if an older webhook for it arrives later.

## Follow-ups after Phase 11

### D-105 · Page clicks respond at once

Clicks felt slow or dead for four reasons, each fixed:

- **Servers far from the database.** Vercel ran the server code in its default US region while Supabase is in Mumbai, so every query crossed the world (about a quarter of a second each, several per page). `vercel.json` now pins functions to `bom1` (Mumbai), which the free plan allows (one region).
- **Middleware asked Supabase Auth on every click.** It now uses `getClaims()`, which checks the session token's signature locally against the project's published keys and only calls Auth to refresh an expired session; visitors with no auth cookie skip it entirely. Pages that read data still confirm the user server-side.
- **Nothing happened until the next page was ready.** A thin progress bar at the top starts the moment a link or a navigating button (`router.push` / `replace`, wrapped in `i18n/navigation.ts`) is clicked. The account, admin, partner and driver areas also have loading skeletons (`loading.tsx`), which let Next prefetch those pages. Public pages do not, because a loading screen there sends the 200 status before a page can say "not found", turning real 404s into soft ones.
- **Tabs left open across a deploy.** An old tab could ask the new deployment for code it no longer has, so a link or button did nothing until a reload. `components/pwa/build-watcher.tsx` compares the tab's build with `/api/version` when the tab comes back into view; once the site has moved on, the next link click loads the page in full, and a missing script chunk or server action reloads the page once. Vercel's Skew Protection would do this too but is not on the free plan.

### D-106 · Hotel CSV import

Admin → Hotels → Import CSV reads the export's own columns, so prices and rooms can be edited in a spreadsheet and imported back. Each row is one rate plan; a row without a room only adds or updates the hotel. Hotels match on slug, rooms and plans on their English name (ignoring case). The file is checked in full first (line and column for every problem, nothing written while any remain), then `import_hotels()` applies it in one transaction as the signed-in staff member, so the existing RLS policies and audit log apply and one bad row (an unknown city, a deleted hotel) rolls back the whole file. Imports never delete anything and leave photos, amenities, policies and Hindi names alone. Up to 2,000 rows and 800 KB per file.

### D-107 · Staff and roles screen

Admin → Settings → Staff and roles (`users.manage_roles`) grants a role to an existing account by email and removes roles with one click. Writes run as the staff member, so the existing RLS rules apply: only a super admin can give or remove super admin. Role changes are now audited (`user_roles` had no audit trigger), staff can't remove their own roles, and the database refuses to remove the last super admin. The person must sign up first; inviting by email can come later.

### D-108 · No double-booked drivers or vehicles

`assign_trip` and `assign_ride` refuse a driver or vehicle that already has an active cab trip or local ride (assigned, on the way, arrived or picked up) whose time overlaps. A job runs from pickup to its estimated end: a cab trip's return time if set, an hourly ride's booked hours, otherwise distance ÷ average speed, otherwise a default length; a buffer is kept free between jobs. The speed, default lengths and buffer are in the `dispatch.overlap` setting (40 km/h, 4 h for trips, 1 h for rides, 30 minutes). The driver and vehicle rows are locked while checking, so two staff can't assign the same driver at once. Staff see "That driver already has another trip or ride around that time".

### D-109 · Account deletion removes uploaded files

Completing a deletion now removes the customer's prescriptions (`prescriptions/<user id>/`), partner application documents (`documents/partners/<user id>/`) and review photos (`media/reviews/<user id>/`), found both by listing those folders and from the database rows, before the account itself is deleted. If any file can't be removed, nothing is deleted and staff are asked to try again. Vendor documents belong to the business, not to one member, and are kept.

## Phones

### D-110 · Phone layout rules

Most visitors and many staff use phones, so every page was checked at 375px and these rules now apply:

- **Nothing scrolls sideways.** Wide grids sit in their own swipeable box (with a "swipe" hint in admin); lists become cards below `md` instead of squeezed tables.
- **The main action stays in reach.** Pages with one obvious next step (book, pay, the driver's next step, save) pin it to the bottom of the screen on phones, padded clear of the iPhone home bar. Public and account pages otherwise show a bottom tab bar; it hides on pages that pin their own bar (hotel and tour pages, checkouts, the quote page, cab and ride review) so two bars never stack. Bars hide from `lg` up, where the booking card is beside the content.
- **Tap targets are 44px** and form inputs use 16px text (iOS zooms into smaller text).
- **Secondary things fold.** Extra filters, header actions and the footer link groups fold away on phones; destructive actions sit last in a "More actions" menu, away from the main button.
- **Desktop is unchanged.** All of this is below `md` or `lg`; the 1280px screenshots match the old ones.

The shared pieces are `MobileTabBar`, `MobileActionBar` (public detail pages), `StickyActionBar` and `MobilePayBar` (checkouts and driver links), and in admin `DataTable` cards, `AdminActionBar`, `CardSaveRow` / `PageSaveRow`, `MoreFilters`, `HeaderActions`, `SectionJumpNav` and `ScrollRow`. New screens should use them rather than building their own.

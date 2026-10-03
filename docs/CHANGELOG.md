# Changelog

## Phase 10 · Reviews, rewards, referrals, wishlist, PWA, SEO and reports

### Added

- Database: verified reviews with photos and a staff reply, wishlist, saved travellers, a P&S Rewards points ledger, referrals and staff notes on customers. RLS and audit on every table. Reviews, points and referrals change only through server functions (`submit_review`, `moderate_review`, `reply_review`, `redeem_points`, `adjust_points`, `claim_referral`, `ensure_referral_code`, `expire_loyalty_points`); triggers keep hotel, package and store ratings in step with published reviews and award points when a booking completes (taken back on refunds). Reward codes are personal coupons only their owner can use. Daily job: lapsed reward codes give their points back and old points expire.
- Reports: database functions for the dashboard, sales, occupancy, vendor performance, agent performance, coupon usage, cancellations, pending actions and the customer list.
- Starter data: `reviews.defaults` (moderation, review window, photos) and `loyalty.defaults` (earn rate, point value, redemption limits, code validity, expiry, review and referral bonuses); "review is live" email template.
- My Trips: rate a finished stay, trip or order (stars, title, text, photos) and see its status; "Write a review" hints in the list.
- Hotel, package and food / essentials store pages: reviews with average, star breakdown, photos, staff replies and "Load more".
- Account: menu with Overview, Wishlist, Rewards, Refer & earn, Travellers, Addresses and Profile. Hearts on hotel, package and store cards and pages. Rewards page with balance, history and "turn points into a code". Refer & earn with a share link and WhatsApp share; `?ref=` links are remembered and claimed after sign-up. Saved travellers can fill the hotel booking guest form.
- Admin: a real dashboard (date range, KPIs, revenue and bookings charts, by-service split, top hotels and routes, "needs attention"); Reports with six reports and CSV export; Customers (search, profile, bookings, points with adjustments, referrals, reviews, notes, block / unblock); Reviews moderation queue (publish, reject with a note, reply); Settings → Reviews & rewards.
- SEO: canonical and hreflang on every public page, `sitemap.xml`, `robots.txt`, structured data (Organization / TravelAgency, Hotel, TaxiService, Product + TouristTrip, Restaurant / GroceryStore, Service, breadcrumbs, ratings), branded share images.
- PWA: installable app with icons, an offline page in English and Hindi, and booking pages you opened while online available offline.
- Vercel Web Analytics and Speed Insights (on Vercel only).
- Tests: database tests for reviews, points, referrals, privacy of wishlists, travellers and notes, and every report; unit and browser tests for the new screens, sitemap, robots, manifest, offline page and structured data.

### Changed

- The admin dashboard replaces the module grid as the landing view (the grid moved to the bottom); the generic "coming in a later phase" admin placeholder is gone.
- Personal reward codes never appear in coupon suggestions or public coupon lists.
- The site layout no longer marks every page as a copy of the home page (each page has its own canonical URL).

## Phase 9 · B2B services, partner onboarding and vendor settlements

### Added

- Database: plans and portfolio items for the business service pages; partner applications; vendor documents; vendors gained PAN, address, city, bank / UPI details and the accepted agreement; a vendor settlement ledger and payouts. RLS and audit on every table. Applications, ledger rows and payouts change only through server functions (`submit_partner_application`, `review_partner_application`, `approve_partner_application`, `update_vendor_profile`, `add_vendor_document`, `create_vendor_payout`, `mark_vendor_payout_paid`, `cancel_vendor_payout`, `add_vendor_adjustment`); a trigger writes ledger rows when a vendor's booking completes and follows later refunds and payments.
- Starter data: `partners.defaults` (business types, required documents per type, default commission per type, upload limit, partner agreement in English and Hindi) and `settlements.defaults` (GST on commission, TCS and TDS placeholders, settlement cycle); application, approval, rejection and payout email templates. Sample plans on the six business service pages.
- Business service pages (hotel photography, OTA handling, calling centre, Instagram reels marketing, lead generation, travel agent & data): pricing cards with features and a "Popular" mark, "Choose this plan" preselecting the plan in the enquiry form, a portfolio gallery with a photo viewer and reel links, structured data for the plans. The plan travels with the lead into the CRM.
- `/partner`: Partner With Us pitch, and for signed-in visitors a four-step application (business type, details with questions per type, documents uploaded to private storage, agreement signed by typing your name) with its status afterwards.
- Partner dashboard `/vendor` for every kind of partner: earnings (balance not yet settled, who owes whom, settlement cycle, ledger, payouts, CSV statement) and business details (contact, GST / PAN, bank or UPI for payouts, documents with verification status). Store partners keep their order screens.
- Admin → Vendors: application queue with document links, approve (commission), under review, reject with a reason; vendor list and vendor page with status, commission, notes, members, documents to verify and payout details.
- Admin → Payments → Settlements: balances per vendor, vendor ledger with manual credits and debits, create a payout up to a cut-off date, mark it paid with the UTR or cancel it, payout list, commission report with CSV export. Settings → Partners & settlements.
- Admin → CMS → Services: plan and portfolio editors.
- Payouts go through a `PayoutProvider` adapter; `manual` today.
- Tests: database tests for plans, applications (one open per person, approval into a vendor with role and documents, slugs, rejection reasons), the ledger (commission, GST, pay at hotel, refunds before and after a payout, cab vendor from the vehicle, cash on delivery by platform riders), payouts and vendor self-service, plus unit and browser tests for the new screens.

### Changed

- The vendor dashboard works for hotels, transport and other partners, not only stores.
- Lead summaries and the lead page show the plan a customer picked.

## Phase 8 · Packages, flights / trains / buses and leads CRM

### Added

- Database: tour packages with a day-wise itinerary, inclusions and exclusions, per-traveller pricing tiers by group size (with child prices), departure dates with seats and peak-date supplements, and package bookings; leads with activities (notes, calls, WhatsApp, email, SMS, status changes, assignments, quotes, follow-ups) and quotes. RLS and audit on every table. Leads and quotes change only through server functions (`create_lead`, `assign_lead`, `set_lead_status`, `log_lead_activity`, `save_quote`, `send_quote`, `cancel_quote`, `record_quote_offline_payment`, `create_package_booking`); a trigger marks a quote paid and its lead Won when the quote's booking is paid.
- Starter data: `packages.defaults`, `leads.defaults` and `travel.defaults` settings; flag `booking.packages` (off); enquiry, assignment, quote and confirmation templates plus WhatsApp quick replies.
- Pricing (`lib/packages`, `lib/leads`): group-size tiers, child prices, departure supplements, advance or full payment, coupons, GST; departure rules (seats left, online booking closes before departure); quote lines with GST per line and an advance or full pay-now amount; pipeline rules and follow-up due states; lead source from UTM tags and the referrer.
- `/packages` and `/packages/<slug>`: listing with categories, detail with itinerary, inclusions, prices by group size, departures with seats left, cancellation policy, an enquiry form and (for bookable packages) online booking with an advance through `/checkout/package`.
- `/travel`: flight, train and bus request form (classes and notice from settings) that creates a lead. All inventory goes through the `TravelInventoryProvider` adapter; today it is quoted by the travel desk.
- Enquiry forms on enquiry-only service pages; the Packages and Flights / Trains / Buses service pages link to the new pages. UTM tags and referrer are captured for every enquiry.
- `/quote/<token>` (no login): the quote with GST, validity, a Pay button (Razorpay Payment Link) and the paid state.
- My Trips for package and travel bookings.
- Admin → Packages: package editor (details, photos, itinerary, pricing tiers with coverage checks, departures with seats booked). Settings → Packages & leads.
- Admin → Leads: pipeline board and list with filters (status, type, source, assignee, overdue / due today, search), new lead from a call, lead page with assignment, status, call / WhatsApp / email quick replies, activity timeline with call logs, follow-up reminders, and the quote builder (save, send with payment link, withdraw, record an offline payment).
- Demo seed: three "Demo ·" packages (a private tour, a fixed-departure yatra with seats, an enquiry-only tour).
- Tests: 18 database tests (catalog RLS, seat counting and expiry, booking rules, lead capture, auto-assignment, throttling, staff-only CRM, pipeline rules, assignment checks, quote totals, send → payment link → Won, replacing and withdrawing quotes, expiry, offline payment), unit tests for package pricing, quotes, pipeline rules and source tracking, and UI tests.

### Changed

- Booking notifications, invoices and price lines handle package and travel bookings (`package.confirmed`, `travel.confirmed`; line kinds `package` and `service`).
- The header "Packages" and "Flights / Trains / Buses" links and the home search tabs open `/packages` and `/travel` (the header links are updated on the live database when this phase merges).

## Phase 7 · Food, essentials and medicine

### Added

- Database: delivery zones, stores (restaurant, essentials shop or partner pharmacy, owned by a vendor), served zones, menu categories, items with diet marks (veg, egg, non-veg) and Jain / Sattvik tags, variants, add-on groups and add-ons, optional stock counts, customers' address books, delivery riders, orders with items and a timeline, prescriptions and medicine quotes. RLS and audit on every table. Orders are written only by server functions (`create_order`, `set_order_status`, `assign_delivery_partner`, `rate_order`, `submit_prescription`) and a trigger keeps each order in step with its booking. A pharmacy can't be saved without a drug licence number.
- Starter data: zones for Vrindavan, Mathura, Govardhan and Barsana with delivery fees and free-delivery thresholds; `delivery.defaults` settings; flags `booking.food`, `booking.essentials`, `booking.medicine` (all off); order and medicine-quote message templates.
- Pricing (`lib/delivery`): cart checked against the live menu (sizes, add-on limits, stock), packaging, zone delivery fee with free delivery above a threshold, GST per store or per item and on delivery, coupons on items only, convenience fee online only, minimum order, cash-on-delivery limit, opening hours in India time (including slots past midnight).
- `/food` and `/essentials`: store listings with veg, Jain, Sattvik, 24×7, open-now and area filters; store menus with sizes, add-ons, diet marks, MRP and sold-out states; a one-store cart that survives reloads; `/checkout/order` with saved addresses, area, coupon, free-delivery progress, cash on delivery or Razorpay.
- `/medicine`: compliance notice, prescription upload (up to 5 images or PDFs) to the private bucket, licensed partner pharmacies. `/account/prescriptions`: status, the pharmacy's quote with GST, accept (cash on delivery or online) or decline.
- My Trips for orders: live tracker (Placed → Accepted → Preparing → On the way → Delivered), ETA, delivery OTP, rider, items, cancel before the store accepts, rating once delivered, invoice.
- Vendor dashboard `/vendor`: today's summary, pause or resume each store, live orders (accept, reject with refund, preparing, ready, assign a rider, deliver with OTP), menu availability, prices and stock, ratings, riders.
- Rider link `/delivery/order/<token>` (no login): pickup and drop with call and map buttons, cash to collect, picked up, delivered with the customer's OTP.
- Admin → Food & Essentials: live order board, stores with weekly hours and served areas, menu editor, zones, riders, settlements per vendor. Admin → Medicine: prescription review queue with signed file links, quote builder, partner pharmacies, medicine orders, settlements. Settings → Delivery.
- Demo seed: a demo restaurant, essentials shop and pharmacy with a small menu, a demo rider and coupon DEMOFOOD20.
- Tests: 18 database tests (catalog, RLS, cash and online orders, expiry and stock return, sold out, store reject with refund, rider assignment, OTP delivery, rating once, rider token and OTP never readable by stores, prescription → quote → order, audit), unit tests for cart pricing, hours, order steps, admin, vendor and shop helpers, Playwright tests for the shop pages, medicine page and rider link.

### Changed

- Booking notifications, self-service cancellation, coupons and invoices handle food, essentials and medicine orders. Bookings gained the `essentials` service.
- The header "Food", "Essentials" and "Medicine" links open the new pages (applied on the live database when this phase merges).

## Phase 6 · Local rides

### Added

- Database: ride vehicle types, zones (a centre and radius per town), landmarks, fare rules per zone × vehicle type × mode, ride requests and ride events. RLS on every table (catalog is public; a ride is visible to its customer, booking staff, ride staff and the assigned driver's login) and audit on all of them. Rides are written only by server functions: `create_ride_booking`, `assign_ride`, `set_ride_status`, `rate_ride`, plus a trigger that keeps each ride in step with its booking. Vehicles can now be a cab or a ride vehicle, and a cycle rickshaw needs no registration.
- Starter catalog (review before launch): bike, e-rickshaw, cycle rickshaw and car; zones for Vrindavan, Mathura, Govardhan and Barsana; 18 landmarks (temples, ghats, stations, bus stands); point-to-point and hourly fares in every zone; `rides.defaults` settings; `booking.rides` flag (off); confirmation and driver-assigned message templates.
- Fare engine (`lib/rides`): point to point with a minimum fare and included km, hourly with a minimum of hours and km per hour included, night surcharge, GST per vehicle type, coupons, convenience fee on online payment only, zone lookup and distance estimate.
- `/rides`: vehicle tabs, drop-to-a-place or by-the-hour, pickup and drop from landmarks or "Use my location", ride now or schedule, passengers, and one priced card per vehicle. Rides outside the towns or too long point to cabs. Review page with fare breakup, cancellation policy, coupon, and Pay the driver or Pay online (Razorpay).
- Pay-the-driver rides are confirmed at once and need no payment gateway.
- My Trips for rides: status, vehicle, pickup OTP, driver and vehicle once assigned, amount to pay the driver, cancellation, and a 1 to 5 star rating after the ride.
- Driver ride link `/driver/ride/<token>` (no login): pickup and drop with maps links, tap to call, amount to collect, and Start → Arrived → Picked up (customer's OTP) → Complete, or no-show.
- Admin → Rides: live requests board that refreshes itself (new, under way, recently finished), ride detail with timeline, assign driver and ride vehicle, status steps, driver link with WhatsApp share, vehicle types, zones, landmarks, fare grid per zone, ride vehicles. Settings → Local rides.
- Home search card "Rides" tab and "Book a ride" buttons on the bike, rickshaw and car service pages.
- Demo seed: a demo bike and e-rickshaw for the demo drivers.
- Tests: 11 database tests (catalog, RLS, pay-the-driver and online bookings, expiry, hourly, assignment, OTP, rating once, driver token never readable, audit), unit tests for fares, zones, ride planning, admin helpers and UI helpers, Playwright tests for the ride pages and driver link.

### Changed

- Booking notifications, self-service cancellation and invoices handle ride bookings. Cab admin lists only cab vehicles.
- The header "Bikes" and "Rickshaw" links open `/rides` (applied on the live database when this phase merges).

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

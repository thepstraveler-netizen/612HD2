# Deployment

From zero to a running Phase 1 site. Later phases add steps (storage buckets, Razorpay, cron); those are listed at the end so environments can be prepared once.

## 0. Prerequisites

- Node 22 and pnpm 10 (`corepack enable`)
- Supabase CLI (`brew install supabase/tap/supabase` or `npx supabase`)
- A Supabase account, a Vercel account, and a Google Cloud project for OAuth

## 1. Run locally

```bash
pnpm install
cp .env.example .env.local     # fill in the Supabase values below
pnpm dev                       # http://localhost:3000 and http://localhost:3000/hi
```

The public pages render without Supabase; sign-in and the protected areas need it.

### Optional: local Supabase

```bash
supabase init        # once; keeps the existing supabase/migrations folder
supabase start       # prints a local URL, anon key and service-role key
supabase db reset    # applies every migration in supabase/migrations
```

Put the printed URL and keys into `.env.local`. Local emails land in Inbucket (the URL is printed by `supabase start`).

## 2. Create the Supabase project

1. Create a project (region: Mumbai `ap-south-1` for Indian users).
2. Settings → API: copy the Project URL, `anon` key and `service_role` key.
3. Link and push the schema:

   ```bash
   supabase link --project-ref <project-ref>
   supabase db push
   ```

4. Check Table Editor: `roles` has 7 rows, `permissions` has 41, `services` has 14.
5. Optional demo content (banners, testimonials, FAQs): run `supabase/seed.sql` in the SQL editor. Skip it in production if you'll add your own.

## 3. Configure Auth

Authentication → URL Configuration:

- **Site URL:** `https://<your-domain>`
- **Redirect URLs:** add
  - `http://localhost:3000/**`
  - `https://<your-domain>/**`
  - `https://*-<your-vercel-team>.vercel.app/**` (preview deployments)

Authentication → Providers:

- **Email:** enabled, "Confirm email" on.
- **Google:** in Google Cloud Console create an OAuth client (Web), add the authorised redirect URI shown by Supabase (`https://<project-ref>.supabase.co/auth/v1/callback`), then paste the client id and secret into Supabase.

Email templates work as-is (they use the `/auth/callback` PKCE flow). For production email delivery, set a custom SMTP provider (Resend) under Authentication → Emails.

## 4. Create the first super admin

```bash
pnpm admin:create owner@example.com "Owner Name"
```

This creates the user with a confirmed email (or promotes an existing one) and grants `super_admin`. Log in at `/login` with the email link or with Google using the same address, then open `/admin`.

## 5. Deploy to Vercel

1. Import the GitHub repo in Vercel (framework: Next.js; install `pnpm install`; build `pnpm build`).
2. Environment variables (Settings → Environment Variables):

   | Variable                        | Preview              | Production              |
   | ------------------------------- | -------------------- | ----------------------- |
   | `NEXT_PUBLIC_SITE_URL`          | preview URL or blank | `https://<your-domain>` |
   | `NEXT_PUBLIC_SUPABASE_URL`      | ✓                    | ✓                       |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓                    | ✓                       |
   | `SUPABASE_SERVICE_ROLE_KEY`     | ✓ (server only)      | ✓ (server only)         |

   Use a separate Supabase project for previews if you want test data isolated from production.

3. Deploy. Add the custom domain under Settings → Domains; Vercel issues the SSL certificate.

## 6. Phase 1 smoke test

- [ ] `/` shows the English home with 14 services; `/hi` shows Hindi; the language switcher keeps the current page.
- [ ] Sign up with email → confirmation email → lands on `/account` with the role "Customer".
- [ ] Log out, log in with Google, and with an email link.
- [ ] "Forgot password" email → `/account/update-password` → new password works.
- [ ] As a customer, `/admin` shows "You don't have access".
- [ ] As the super admin, `/admin` shows the sidebar with all 18 modules and the audit log, which lists the profile/role changes.
- [ ] Signed out, `/admin`, `/account`, `/vendor`, `/driver` redirect to `/login?next=…`.

## 7. Phase 2 smoke test

- [ ] `/services` lists the 14 services; `/services/car` shows highlights.
- [ ] As the super admin, Admin → CMS → Services: rename a service, save, and the home page shows the new name on refresh.
- [ ] Upload a hero image for a service; it appears on the service page.
- [ ] Admin → Offers: create a banner with a coupon code and today's dates; it appears in the home offers carousel.
- [ ] Admin → Settings: change the WhatsApp number; the footer link updates.
- [ ] Admin → Audit log lists each of those changes.
- [ ] Storage → buckets shows `media` (public), `documents` and `prescriptions` (private).

## 8. Phase 3 smoke test

- [ ] `/hotels` lists the six demo hotels; pick dates and prices change to the stay total with GST.
- [ ] Try each sort, the price, rating, couple-friendly and "within 1 km of Banke Bihari" filters, and the Map view.
- [ ] Search 14–15 Nov 2026: Janmabhoomi Inn shows sold out and sorts last.
- [ ] Open a hotel, pick a rate plan, and check the booking card's breakdown; "Book on WhatsApp" opens a filled-in message.
- [ ] Admin → Hotels: edit a hotel, upload photos, add a room with two plans, then close a few dates and set a price in the calendar; the public page reflects it within a minute.
- [ ] Admin → Hotels → Export CSV downloads the rate plans.
- [ ] Before launch, archive the "Demo ·" hotels.

## 9. Phase 4 setup and smoke test

### Setup

1. Razorpay (Dashboard → Account & Settings → API Keys; use **Test mode** first): add to Vercel
   - `NEXT_PUBLIC_RAZORPAY_KEY_ID` (`rzp_test_…`)
   - `RAZORPAY_KEY_SECRET` (server only)
2. Razorpay → Webhooks → Add: URL `https://<your-domain>/api/webhooks/razorpay`, a secret you make up, events `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`, `payment_link.paid`. Put the same secret in `RAZORPAY_WEBHOOK_SECRET`.
3. `SUPABASE_SERVICE_ROLE_KEY` must be set (bookings are written only by the server).
4. Optional email: `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL` (a sender on a domain verified in Resend). Without them bookings still work; emails are logged as skipped.
5. Redeploy, then Admin → Settings → Feature flags → turn on `booking.hotels`.
6. Holds expire through pg_cron (`expire-stale-bookings`, every 5 minutes), created by the migration. Check Database → Cron jobs; if pg_cron isn't enabled, enable it under Database → Extensions and re-run the last block of `20261004000100_bookings_payments.sql`. No Vercel Cron or `CRON_SECRET` is needed.

### Smoke test

- [ ] Signed out, "Reserve now" on a hotel goes to login and back to the review page.
- [ ] Book a demo hotel with coupon `DEMO10`; pay with Razorpay test card `4111 1111 1111 1111` (any future date, any CVV) or UPI `success@razorpay`. The booking shows Confirmed in My Trips.
- [ ] Download the invoice PDF; the number looks like `PST/26-27/00001` and tax is split into CGST and SGST.
- [ ] Razorpay → Webhooks → the delivery shows 200; resending it changes nothing (one payment, one invoice).
- [ ] Book the last room of a night in two browsers at once: the second gets "sold out".
- [ ] Start a booking and close the popup; after 15 minutes the trip shows Expired and the room is available again.
- [ ] Admin → Settings → Payments: switch on "Pay at hotel" (off by default). Pay at hotel on Demo · Radha Kunj then confirms without payment.
- [ ] Cancel a refundable booking from My Trips; the refund appears in Razorpay and on the trip.
- [ ] Admin → Bookings, Payments, Coupons and Notifications list the above; the audit log shows each change.

## 10. Phase 5 setup and smoke test

### Setup

1. Apply the two Phase 5 migrations (`20261005000100_cabs.sql`, `20261005000200_cabs_baseline.sql`). They add the cab tables and a starter catalog: 14 places around Braj, Delhi, Agra and Jaipur, 5 car categories, per-km rules, 18 routes and tours with fares, local packages and two add-ons. **Review every fare in Admin → Cabs before going live**; they are starting points, not market rates.
2. Razorpay keys and webhook from §9 are required: cabs are always paid online (full, or an advance with the rest to the driver).
3. Admin → Settings → Cabs: advance %, minimum advance, GST rate and SAC, booking window, night hours, pickup OTP, cancellation refunds.
4. Admin → Cabs → Drivers and Vehicles: add your real fleet with document expiry dates.
5. Admin → Settings → Feature flags → turn on `booking.cabs`.

### Smoke test

- [ ] `/cabs`: each tab (Outstation one way / round trip, Local, Transfers, Sightseeing) leads to results with prices incl. GST, approximate distance and time.
- [ ] Results filters (car type, model, fuel) work; a 7-person search shows small cars last and disabled.
- [ ] Review page: add a roof carrier, apply `DEMOCAB5` (local demo seed only), choose Part pay; the fare breakup and "pay driver" balance add up to the total.
- [ ] Pay with test card `4111 1111 1111 1111`. My Trips shows the cab, "Driver to be assigned" and a 4-digit pickup OTP.
- [ ] Admin → Cabs → Dispatch: the trip is under Unassigned. Assign a driver and vehicle; My Trips now shows the driver, phone and registration.
- [ ] Copy the driver link and open it on a phone (signed out): Start trip → Arrived → Picked up (wrong OTP is refused, the customer's OTP works) → Complete. The booking becomes Completed.
- [ ] Reassign another trip: the old driver link stops working.
- [ ] Cancel a paid trip from My Trips more than 24 h before pickup: full refund in Razorpay; the trip disappears from the dispatch board.
- [ ] Drivers / Vehicles lists flag documents expiring within 30 days.

## 11. Phase 6 setup and smoke test

### Setup

1. Apply the two Phase 6 migrations (`20261006000100_rides.sql`, `20261006000200_rides_baseline.sql`). On the live project they are already applied except the two header link updates at the end of the baseline file, which are run when this phase merges. **Check every landmark on a map and every fare in Admin → Rides before going live**; coordinates are approximate and fares are starting points.
2. Admin → Settings → Local rides: pay-the-driver on or off, booking window, longest ride, night hours, pickup OTP, cancellation refunds. Ask your CA to confirm GST per vehicle type (Admin → Rides → Vehicle types) and the SAC.
3. Admin → Rides → Vehicles: add bikes and rickshaws; drivers are shared with cabs (Admin → Cabs → Drivers).
4. Admin → Settings → Feature flags → turn on `booking.rides`. Razorpay is optional: without keys only Pay the driver is offered.

### Smoke test

- [ ] `/rides`: pick Bike, ISKCON Temple → Banke Bihari Temple, Ride now. Each vehicle shows a fare incl. GST; a 3-person search marks the bike too small.
- [ ] "Use my location" in the browser fills the pickup; a pickup outside the four towns says rides aren't available there and offers cabs.
- [ ] By the hour: 3 hours from Prem Mandir prices bike, e-rickshaw, rickshaw and car.
- [ ] Review, choose Pay the driver, book: My Trips shows the ride as confirmed with a 4-digit OTP.
- [ ] Admin → Rides: the ride is under New requests within 20 seconds. Assign a demo driver and the demo bike; My Trips shows the driver.
- [ ] Open the driver link on a phone (signed out): Start → Arrived → Picked up (wrong OTP refused) → Complete. The booking becomes Completed and My Trips offers a rating; rate it once.
- [ ] Cancel another pay-the-driver ride from My Trips before the driver starts: it leaves the board.
- [ ] With Razorpay keys: Pay online with test card `4111 1111 1111 1111`; the ride appears on the board after payment.

## 12. Phase 7 setup and smoke test

### Setup

1. Apply the three Phase 7 migrations in order (`20261007000050_delivery_service.sql` on its own first, then `20261007000100_delivery.sql`, then `20261007000200_delivery_baseline.sql`). On the live project they are already applied except the three header link updates in the baseline file, which are run when this phase merges.
2. Admin → Settings → Delivery: delivery OTP, cash on delivery and its limit, payment hold, delivery GST and SAC codes, quote validity, when customers may cancel, and the medicine notice (have it reviewed). **Ask your CA to confirm GST on food, products, medicines and delivery (D-065).**
3. Admin → Food & Essentials → Zones: check delivery fees and free-delivery thresholds. Stores: add restaurants and shops (each needs a vendor in Admin → Vendors), opening hours, served areas and menus. Riders: add platform riders.
4. Admin → Medicine → Partner pharmacies: add each licensed pharmacy with its drug licence number.
5. To give a restaurant owner the vendor dashboard, give their account the vendor role and add them as a member of their vendor.
6. Remove the "Demo ·" stores, the demo rider and coupon DEMOFOOD20 before launch if they were seeded.
7. Admin → Settings → Feature flags: turn on `booking.food`, `booking.essentials` and `booking.medicine` when ready. Razorpay is optional: without keys only cash on delivery is offered.

### Smoke test

- [ ] `/food` lists the restaurants; Veg only, Jain and Open now filter the list.
- [ ] Open a menu, add the Braj Thali (Deluxe) with an extra roti; the cart bar shows the right total. Adding from another store asks to replace the cart.
- [ ] Checkout: pick an area and address. Delivery is free above the area's threshold; below the minimum order, Place order is blocked.
- [ ] Place a cash-on-delivery order: My Trips shows it as Placed with a 4-digit OTP.
- [ ] `/vendor/orders` (as the store's vendor) or Admin → Food & Essentials: the order appears. Accept, Preparing, Ready, assign the demo rider.
- [ ] Open the rider link on a phone (signed out): Picked up, then Delivered with a wrong OTP (refused) and the right one. My Trips shows Delivered and offers a rating once.
- [ ] Reject another order from the vendor dashboard: it is cancelled and the stock comes back.
- [ ] `/medicine`: upload a prescription. Admin → Medicine: open it (files open via signed links), assign the pharmacy, send a quote. `/account/prescriptions`: accept it with cash on delivery; the order appears on the medicine board.
- [ ] With Razorpay keys: pay online with test card `4111 1111 1111 1111`; the order reaches the store after payment.

## 13. Phase 8 setup and smoke test

### Setup

1. Apply the two Phase 8 migrations in order (`20261008000100_packages_leads.sql`, then `20261008000200_packages_leads_baseline.sql`). On the live project they are already applied except the two header link updates in the baseline file, which are run when this phase merges.
2. Admin → Settings → Packages & leads: advance %, seat hold, how many days before departure online booking closes, cancellation policy; lead auto-assignment, enquiry limit, first follow-up, quote validity and default GST, sources and lost reasons; travel classes and the notice on `/travel`. **Ask your CA to confirm GST on packages and quote lines (D-075).**
3. Give your calling team the **agent** role: after each agent signs up, run `select public.grant_role_by_email('agent@example.com', 'agent');` in the Supabase SQL editor (a roles screen comes with Admin → Customers in phase 10). New leads are shared among agents automatically.
4. Admin → Packages: add your real packages, itineraries, prices and departure dates. Archive the three "Demo ·" packages before launch if they were seeded.
5. Admin → Notifications: review `lead.received`, `quote.sent` and the WhatsApp quick replies `crm.intro` and `crm.follow_up`.
6. Razorpay (test keys first) is needed for online package booking and for quote payment links; the webhook must include `payment_link.paid`. Without keys, enquiries and quotes still work and staff record payments by hand.
7. Admin → Settings → Feature flags: turn on `booking.packages` when packages set to "Book online" should take bookings.
8. Campaign links: add `?utm_source=instagram&utm_campaign=<name>` (or facebook, google, …) so leads show where they came from.

### Smoke test

- [ ] `/packages` lists the packages; open the Braj 84 Kos yatra: itinerary, prices by group size and departures with seats left show.
- [ ] Send an enquiry from a package page while signed out: you get a reference (LD-…) and the lead appears in Admin → Leads under New, assigned to an agent.
- [ ] `/travel?mode=train`: send a train request with `?utm_source=instagram` on the first page; the lead's source is Instagram.
- [ ] Open the lead as an agent: log a call (connected, 3 minutes) and set a follow-up for tomorrow; the lead moves to Contacted. Open the WhatsApp quick reply; the message is filled in.
- [ ] Build a quote (fare + service fee at 18%), send it. The lead moves to Quoted; the quote page opens signed out and shows the Pay button (with Razorpay keys).
- [ ] Pay the link with test card `4111 1111 1111 1111`: the quote page shows Paid with a booking code, the lead is Won and the booking is confirmed in Admin → Bookings.
- [ ] Without Razorpay: send a quote, then Record payment (UPI) as a manager; the booking confirms and the lead is Won.
- [ ] Send a second quote on the same lead: the first is withdrawn.
- [ ] Mark another lead Lost (reason required) and reopen it.
- [ ] With `booking.packages` on and Razorpay keys: book the private Vrindavan tour for 3 adults with the 25% advance; My Trips shows the tour with the balance due.

## 14. Phase 9 setup and smoke test

### Setup

1. Apply the two Phase 9 migrations in order (`20261009000100_partners_settlements.sql`, then `20261009000200_partners_settlements_baseline.sql`). Run the Phase 9 part of `supabase/seed.sql` for the sample service plans if you want them.
2. Admin → Settings → Partners & settlements: business types you accept, documents required per type, default commission per type, the partner agreement (bump its version whenever you change the text); GST on commission, TCS and TDS rates and the settlement cycle. **Ask your CA to set TCS and TDS (D-082); they start at 0.**
3. Admin → CMS → Services: replace the sample plan prices on the business service pages and add portfolio photos or reel links.
4. Admin → Notifications: review `partner.application_received`, `partner.application_approved`, `partner.application_rejected` and `payout.paid`.
5. Existing hotels, stores and transport partners created before this phase have no owner account: ask each to apply through `/partner`, or add their login to `vendor_members` and grant the `vendor` role (`select public.grant_role_by_email('owner@example.com', 'vendor');`).

### Smoke test

- [ ] `/services/instagram-marketing` shows the plans; "Choose this plan" fills the plan in the enquiry form, and the lead in Admin → Leads shows the plan.
- [ ] `/partner` signed out shows the pitch and a sign-in button; signed in, apply as a hotel with the required documents and accept the agreement; you get a PA-… reference and the page shows "Submitted".
- [ ] Admin → Vendors → Applications: open it, view a document, approve at 15%. The applicant can open `/vendor` and sees Earnings and Business.
- [ ] As the vendor, add bank details and a document on Business; the document shows "Pending" until staff verify it in Admin → Vendors.
- [ ] Complete a booking that belongs to the vendor (for example a pay-at-hotel stay marked completed): Admin → Payments → Settlements shows the vendor owes the commission; `/vendor/earnings` shows the same row.
- [ ] Create a payout up to today, mark it paid with a UTR; the vendor gets the email and the payout shows as paid on both sides. Cancel another pending payout and check its rows are unsettled again.
- [ ] Download the commission report CSV and the vendor statement CSV.

## 15. Phase 10 setup and smoke test

### Setup

1. Apply the three Phase 10 migrations in order (`20261010000100_engagement.sql`, `20261010000200_engagement_baseline.sql`, `20261010000300_reports.sql`). On Supabase the first one schedules the daily `expire-loyalty-points` job.
2. Vercel → the project → Settings → Environment Variables: make sure `NEXT_PUBLIC_SITE_URL=https://thepstraveler.vercel.app` (or your domain) is set for Production, or canonical links, the sitemap and structured data point at localhost. Redeploy after changing it.
3. Vercel → the project → Analytics and Speed Insights: click Enable on both (free on Hobby). Until then their scripts return 404, which is harmless.
4. Admin → Settings → Reviews & rewards: decide whether reviews need approval, and set the earn rate (1% by default), point value (₹1), redemption limits, code validity, expiry, review bonus and referral bonuses, or switch P&S Rewards off.
5. Google Search Console (optional, free): add the site and submit `/sitemap.xml`.

### Smoke test

- [ ] As a customer with a completed booking (or a hotel stay whose checkout has passed), open My Trips → the booking, rate it with a photo; it shows "Waiting for approval".
- [ ] Admin → Reviews: publish it and reply; the hotel page shows the review, the reply and the new rating, and the customer gets the email and the review bonus.
- [ ] Mark a booking completed in admin; the customer's Rewards page shows the points. Turn 100 points into a code and use it on a booking; another account cannot use the same code.
- [ ] Open `/?ref=<your code>` in a private window, sign up, open the account; complete that account's first booking and check both accounts got the referral points.
- [ ] Tap the heart on a hotel and find it under Account → Wishlist; add a traveller and pick it on the hotel booking form.
- [ ] Admin dashboard shows figures for the last 30 days; Reports → Sales downloads a CSV; Customers → a customer → adjust points and add a note.
- [ ] `/robots.txt`, `/sitemap.xml` and `/manifest.webmanifest` load; on a phone, "Add to home screen" installs the app; with the phone offline, a booking you opened before still opens and other pages show the offline page.

## Later phases (prepare when you reach them)

- **Optional:** a Google Maps key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`), restricted to your domains, for road distances; cabs and rides work without it (D-046, D-053).
- **Phase 11:** SMS (MSG91) and WhatsApp keys, Sentry DSN, Upstash Redis, Cloudflare Turnstile keys.

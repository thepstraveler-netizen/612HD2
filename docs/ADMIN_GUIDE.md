# Admin guide

This guide is for The P & S Traveler Group's team: the people who run hotels, cabs, rides, deliveries, packages, leads, payments and partners from the admin area every day. You do not need to be a developer to use it.

The admin area lives at **/admin** on the website (for example thepstraveler.vercel.app/admin). It also works in Hindi at **/hi/admin**; use the language switch at the top right. Everything here works on a phone, but the boards and calendars are easiest on a laptop.

Contents:

1. Signing in and roles
2. Finding your way around
3. The modules, in sidebar order
4. Partner, driver and rider screens
5. Common tasks, step by step
6. Phase 11 additions (privacy, two-step sign-in, security)
7. Good habits and where to get help

---

## 1. Signing in and roles

### Signing in

1. Open **/login**.
2. Sign in with Google, with your email and password, or ask for an email link ("magic link") and click it in your inbox.
3. Open **/admin**. If you see "You don't have access", your account has no staff role yet (see "How a role is given" below).

If you sign out or your session ends, opening any admin page sends you back to the sign-in page and then returns you to where you were.

### Roles

Every account has one or more roles. A role decides which parts of the admin area you can see and what you can change. Customers, partners and drivers have roles too, but only the four staff roles open the admin area.

| Role                            | Who it is for                          | What they can do                                                                                                                                                                                                                                                                     |
| ------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Super admin                     | The owner                              | Everything, including making other people super admins.                                                                                                                                                                                                                              |
| Admin                           | Senior staff                           | Everything, except making someone a super admin.                                                                                                                                                                                                                                     |
| Manager                         | Operations leads                       | Sees every module. Changes hotels, cabs, rides, food, medicine, packages, leads, bookings, offers, CMS, vendors, customers and reviews. Can read the audit log. **Cannot** refund, record payments, send payment links, pay vendors, edit notification templates or change Settings. |
| Agent (travel / calling centre) | Calling team and travel desk           | Sees the dashboard, hotels, cabs, rides, packages, customers, offers, leads and bookings. Works leads (including quotes with payment links) and can act on bookings (cancel, mark completed, resend confirmation). Cannot refund, record payments or open the other modules.         |
| Vendor / partner                | Hotel, restaurant, shop, transport ... | Only the partner dashboard at /vendor, for their own business.                                                                                                                                                                                                                       |
| Driver                          | Drivers                                | Only the driver page. Drivers normally work from trip links and need no account (see section 4).                                                                                                                                                                                     |
| Customer                        | Everyone who signs up                  | No admin access. Every new account starts as a customer.                                                                                                                                                                                                                             |

Some actions need a special permission on top of the module:

- **Refunds** (and vendor payouts and settlement adjustments): super admin and admin only.
- **Recording a payment or sending a payment link on a booking**: super admin and admin only (this is the "payments" change permission).
- **Settings**: super admin and admin only. Managers see Settings but cannot save.
- **Audit log**: super admin, admin and manager.

Buttons you are not allowed to use are either hidden or refused with "You don't have permission to do that". The server always checks again, so a hidden button is never the only protection.

### How a role is given

There is no "Users" screen in Settings yet. Roles are given in one of these ways:

- **The first super admin** is created once by the developer with the "admin:create" script described in DEPLOYMENT.md.
- **Staff roles (admin, manager, agent)**: the person signs up on the website first. Then someone with access to the Supabase dashboard opens the SQL editor and runs the "grant role by email" function with the person's email and the role (agent, manager, admin and so on). DEPLOYMENT.md, Phase 8 step 3, shows the exact line to paste. Ask the developer if you do not have Supabase access.
- **Partners (vendor role)**: approving a partner application gives the vendor role automatically (see Vendors below). For a partner added by hand, the same SQL function gives the vendor role, and the developer adds their login to the vendor's partner accounts.

You can see which roles a person has on their customer page (Admin → Customers → the person → Profile → Roles).

To take a role away, ask the developer; there is no button for it yet.

---

## 2. Finding your way around

- **Sidebar** (left on a laptop, the menu button at the top left on a phone). Modules are grouped into Overview, Catalog, Sales, People, Content and System. You only see the modules your role can open.
- **Audit log** link at the bottom of the sidebar (if your role can read it): every change anyone made, newest first, with who, when and which fields changed.
- **View site** at the top opens the public website in the same tab.
- **Language** and **light/dark** switches sit at the top right.
- Lists keep their filters in the web address, so you can bookmark a filtered view or send it to a colleague.
- Most edit pages warn you if you try to leave with unsaved changes.
- Prices are typed in rupees. Text that customers see usually has an English box and a Hindi box; Hindi is optional and English is shown when it is empty.

---

## 3. The modules, in sidebar order

### Overview

#### Dashboard

The first page after you open /admin.

- **Date range**: last 7, 30 or 90 days, or your own from–to dates (India dates).
- **Figures**: revenue (collected minus refunds), bookings, conversion (bookings that were paid or confirmed out of all bookings started), average order value, booked value, discounts given, cancellations and new customers.
- **Charts**: revenue and bookings by day, and a split by service.
- **Top hotels** and **top cab routes**.
- **Needs attention**: paid cab trips without a driver, ride requests waiting, new leads to contact, overdue follow-ups, partner applications, reviews waiting, refunds pending or failed, vendor payouts to pay, and low-stock food, essentials and medicine (5 units or fewer). Each line only shows to staff who can open that module; click it to go there.
- **All modules** at the bottom is a grid of every module you can open.

Agents see a shorter dashboard with only the work waiting for them.

#### Reports & Exports

Six reports, each for any date range up to a year, each with **Download CSV** (opens in Excel or Google Sheets):

- **Sales**: bookings, totals, discounts, tax, refunds and revenue per day and service.
- **Hotel occupancy**: room-nights sold against room-nights on sale, room revenue and average daily rate per hotel.
- **Vendor performance**: bookings, booked value, cancellations, ratings, commission and net payable per vendor.
- **Agent performance**: leads per agent, how far they got, won value and calls logged.
- **Coupon usage**: uses, discount given and booking value per coupon (all personal reward codes are grouped into one "PSR" line).
- **Cancellations**: by service, who cancelled and why, and the amount refunded.

Other CSV downloads live where the data is: hotels and rate plans (Hotels → Export CSV), the vendor commission report and each vendor's ledger (Payments → Vendor settlements). Reports need the Reports or Payments read permission.

### Catalog

#### Hotels

Properties, rooms, prices and availability. Changes go live straight away.

**Hotel list.** Search and open a hotel, **New hotel** to add one, and **Export CSV** to download every room and rate plan (one row per rate plan).

**Hotel page** has four tabs:

1. **Details**: basics (name, type, star category, description), location (city, area, address, map coordinates), stay information (check-in and check-out times), tags such as couple friendly or featured, house rules, amenities, **Payment and add-ons** (part-payment share, whether this hotel allows pay at hotel, prices for early check-in, late checkout and breakfast), **Partner** (which vendor owns the hotel and the commission), guest rating, and search-engine text. The status is **Draft** (only staff see it), **Published** (on the website) or **Archived** (hidden). Photos are managed on the same page: the first photo is the cover; drag to reorder and press **Save order**.
2. **Rooms & rates**: each room type with how many rooms of that type you sell each night, guests included, maximum adults and children, room amenities, and one or more **rate plans** (for example "Room only" and "With breakfast"). Each plan has a nightly price, extra adult and child prices, minimum and maximum nights, whether it is refundable and until how many hours before check-in cancellation is free, and its inclusions.
3. **Calendar** (the rate and inventory calendar): one month per room type. Each day shows rooms left, rooms sold, rooms on hold during checkout, closed days and price overrides (in blue). Use **Bulk edit** to change a range of dates at once:
   1. Choose **From** and **To** dates, and optionally **Only on** certain weekdays (for example only Saturdays and Sundays).
   2. Availability: keep as is, **Open for sale** or **Close (stop sell)**.
   3. **Rooms to sell** and **Minimum nights** (leave empty to keep the current value).
   4. Price: keep prices, **Set a price for these dates** for one rate plan, or **Remove price overrides**.
   5. Press **Apply to dates**. The public site shows the change within about a minute.
4. **Pricing rules**: seasonal and weekday prices such as Holi, Janmashtami, Kartik or weekends. A rule raises or lowers the price by a percentage, a flat amount, or sets a fixed price, for a date window and optional weekdays, for the whole hotel, one room or one plan. When several rules match, the highest priority wins. A calendar price override always beats a rule.

**CSV import.** There is no CSV import yet; only the export exists. Add hotels and rooms through the forms.

**Before launch**, archive the "Demo ·" hotels.

#### Cabs

The cab sub-menu: Dispatch, Trips, Routes, Fares, Local packages, Places, Categories & models, Add-ons, Peak pricing, Drivers, Vehicles.

- **Dispatch** (the dispatch board): paid trips by pickup time in three columns: **Needs a driver**, **Assigned**, **In progress**. Late pickups are marked. On a trip:
  - **Assign** picks a driver and a vehicle. Vehicles of the booked category are listed first; bigger ones are marked "upgrade" (free for the customer).
  - **Reassign** changes the driver or vehicle; the old driver's link stops working and a new one is made.
  - **Copy driver link** gives you the no-login trip page to send the driver (WhatsApp is easiest).
  - Status steps: **On the way**, **Arrived**, **Picked up**, **Complete trip**, or **No-show**. Staff can move a trip without the customer's OTP; completing the trip completes the booking.
- **Trips**: every trip in any status, with its timeline.
- **Routes**: known routes with distance and time (transfers, tours, outstation) and a fixed fare per car category.
- **Fares**: per-km rates for outstation trips without a fixed route fare (one way and round trip, minimum km, driver allowance).
- **Local packages**: hourly hire such as 4 h / 40 km, 8 h / 80 km, 12 h / 120 km, with a fare per category.
- **Places**: pickup and drop points offered in the search (cities, stations, airports, temples) with coordinates.
- **Categories & models**: hatchback, sedan, SUV and so on, with the example models, seats, luggage and photos.
- **Add-ons**: extras such as a roof carrier or child seat.
- **Peak pricing**: raise the base fare on festival dates or busy weekdays; the highest matching rule applies.
- **Drivers** and **Vehicles**: your fleet with documents (licence, RC, insurance, permit, PUC, fitness). Papers expiring within 30 days are flagged at the top. Scans are private and open through links that expire after a few minutes.

Changing cabs needs the Cabs change permission (managers and admins). Agents can look but not assign.

#### Bike / Rickshaw / Car (local rides)

The ride sub-menu: Live requests, Vehicle types, Zones, Landmarks, Fares, Vehicles.

- **Live requests**: the ride board, refreshed every 20 seconds, grouped into new, under way and recently finished. Open a ride to assign a driver and ride vehicle, move it through On the way → At pickup → Passenger on board → Completed (or No-show), see its timeline, and copy or WhatsApp the driver link.
- **Vehicle types**: bike, e-rickshaw, cycle rickshaw, car: seats, GST rate and whether bookings are **Instant** (confirmed at once) or **On request** (staff confirm first; pay-the-driver only).
- **Zones**: each town is a circle around a centre with a radius. A pickup belongs to the nearest zone that contains it.
- **Landmarks**: temples, ghats, stations and markets offered as pickup and drop points. Copy coordinates from Google Maps (right-click the spot).
- **Fares**: per zone, a fare for each vehicle type, point to point and hourly.
- **Vehicles**: bikes, rickshaws and cars used for rides. Drivers are shared with cabs (add them under Cabs → Drivers).

#### Food & Essentials

Restaurants and essentials (grocery) shops share this module. Sub-menu: Live orders, Stores, Delivery zones, Riders, Settlements.

- **Live orders** (the order board): columns from new orders through accepted, preparing, ready and out for delivery, plus orders finished in the last 24 hours. Filter by store. Each card shows the address, customer, payment (cash on delivery with the amount to collect, or paid online) and the rider. Actions: **Accept**, **Preparing**, **Ready for pickup**, **Out for delivery**, **Mark delivered**, **Reject** (needs a reason; cancels the order, returns stock and refunds everything paid), **Assign rider** / **Change rider** (the old rider's link stops working) and **Rider link**.
- **Stores**: each restaurant or shop, its vendor, weekly opening hours, ordering terms (minimum order, preparation time, GST), the zones it delivers to, and a pause switch. **Menu** opens the menu editor: categories, items (veg / egg / non-veg, Jain, Sattvik, MRP, price, GST and HSN for products), sizes, add-on groups and add-ons, stock counts and sold-out switches. Each row saves on its own and the shop updates within a minute.
- **Delivery zones**: areas you deliver to (shared with medicine), each with a delivery fee, a free-delivery threshold and a delivery time.
- **Riders**: platform riders can take any order; a store's own riders only that vendor's orders.
- **Settlements**: delivered orders per vendor for a period: what they earned, the commission and what is owed. (The money itself is settled in Payments → Vendor settlements.)

#### Medicine

Sub-menu: Prescriptions, Medicine orders, Partner pharmacies, Settlements.

- **Prescriptions** (the prescription queue): tabs To review, Quoted, Ordered, Rejected, Expired, All. Open a prescription to see the files (they open through short-lived private links), mark it as being reviewed, **assign a partner pharmacy**, then build a **Quote**: list each medicine with pack, quantity, price, GST and HSN. Sending a quote replaces any live quote, tells the customer and stays valid for the hours set in Settings → Delivery. You can withdraw a quote or **reject** the prescription with a reason the customer sees.
- **Medicine orders**: the order board for medicine orders (same actions as Food & Essentials).
- **Partner pharmacies**: licensed pharmacies; a pharmacy cannot be saved without its drug licence number.
- **Settlements**: as for food.

The customer accepts the quote from their account (cash on delivery or online) and it becomes an order. Medicines are never sold without a reviewed prescription.

#### Packages

Tour packages. Each package has:

- **Details and photos**: name, category, description, inclusions and exclusions, GST rate, status (**Live**, **Hidden**, **Archived**) and mode: **Enquiry only** (visitors send an enquiry to the Leads CRM) or **Book online** (visitors can also pay an advance, when the booking.packages flag is on).
- **Itinerary**: one entry per day.
- **Pricing tiers**: price per traveller by group size (for example 1–2, 3–5, 6–12), with an optional child price. The tiers must cover every group size the package allows; the editor warns about gaps and overlaps.
- **Departures**: dates a group leaves, seats, and an optional peak-date supplement per traveller. "Seats booked" counts confirmed bookings and unpaid holds that have not expired.

Archive a package instead of deleting it; **Restore** brings it back.

### Sales

#### Bookings & Orders

Every booking of every service (hotel, cab, ride, food, essentials, medicine, package, travel), newest first, 25 per page. Filter by status, service and dates, or search by booking code, guest name or phone.

Open a booking to see the stay or trip, guest names, every price line with GST, totals, paid, refunded and balance due, contact details, GST invoice details, the invoice PDF (issued when the booking is confirmed), payments, refunds, messages sent and the change history.

Actions (only the ones the booking's status and your role allow are shown):

- **Cancel booking**: rooms or seats go back on sale and the guest is told. The form suggests a refund from the cancellation policy; you can change it, up to what was paid. If you cannot refund, the cancellation refunds nothing and someone with refund access can refund afterwards.
- **Refund**: refund without cancelling, for goodwill or an overcharge. The stay stays on.
- **Mark completed**: after the stay or trip. Completing a booking writes the vendor's settlement line and gives the customer their reward points.
- **Record payment**: cash, UPI, card or bank transfer received by P&S itself, with an optional reference. Only record money P&S received; cash a hotel or driver took stays out, so it counts as collected by the vendor.
- **Send payment link**: a Razorpay link for the balance due. If a link is already open it is sent again instead of making a second one.
- **Resend confirmation**.

Staff cannot create a hotel, cab or ride booking from this screen. To book for a caller, use a lead and a quote (see "Create a booking for a caller and send a payment link" in section 5).

#### Payments & Refunds

Sub-menu: Payments, Refunds, Webhook events, Vendor settlements.

- **Payments**: the latest 200 payments, online (Razorpay) and recorded offline, with status, method and reference.
- **Refunds**: the latest 200 refunds and their status. Failed or pending refunds also show on the dashboard.
- **Webhook events**: the messages Razorpay sent the site about payments and refunds, with the result of each. Useful for checking a payment the customer says they made.
- **Vendor settlements**:
  - **Overview**: unsettled balance per vendor, how many rows, the oldest, and whether a payout is waiting. The settlement cycle and the end of the last full cycle are shown at the top.
  - **Vendor ledger** (click a vendor): every booking, adjustment and payout, filterable by dates and settled / unsettled, with **Download CSV**. Net = collected by us − commission − GST on commission − TCS − TDS + adjustments. A positive net is paid to the vendor; a negative net is collected from them. **Manual adjustment** adds a credit (we owe the vendor more) or a debit (the vendor owes us) with a reason the vendor sees.
  - **Payouts**: every payout, newest first. Open one to mark it paid or cancel it.
  - **Commission report**: gross value, commission and tax per vendor for a date range, with CSV.

Creating, paying and cancelling payouts and adding adjustments need refund access (super admin, admin).

#### Offers & Coupons

Sub-menu: Banners, Coupons.

- **Banners**: the offers carousel on the home page. Each banner has an image, text, a coupon code to show, which tab it belongs to, a link, and a start and end time. Banners outside their window hide themselves (checked every few minutes).
- **Coupons**: discount codes customers type at checkout.
  - Code (3–24 capital letters, numbers, - or \_), description.
  - Percentage (with an optional maximum discount) or flat amount.
  - Minimum order, start and end, total uses, uses per guest, first booking only.
  - Services it applies to (none ticked means all) and, for hotels, only certain hotels.
  - **Suggest at checkout** shows it to every guest while valid; leave it off for private codes you share yourself.
  - **Active** switches it on or off. A coupon that has been used cannot be deleted; switch it off instead.

Personal reward codes (starting with PSR) are made by customers from their points and never appear here as public coupons.

#### Leads CRM

Every enquiry: package enquiries, flight / train / bus requests, business service enquiries, and leads typed in by staff from calls, WhatsApp or walk-ins.

**Board and list.** Columns New → Contacted → Quoted → Won / Lost. Filter by status, type, source, assignee ("Me" in one tap), overdue or due today, or search. New leads are shared automatically to the agent with the fewest open leads (this can be switched to "assign by hand" in Settings → Packages & leads). Every agent can see every lead.

**New lead** for a phone call, WhatsApp or counter enquiry.

**Lead page:**

- Assign to someone with the Leads change permission.
- Status: logging a call, WhatsApp, email or SMS on a new lead moves it to Contacted. Quoted happens only by sending a quote. Won happens on its own when a quote is paid, or by hand (**Mark won**) for a sale closed outside the system. **Mark lost** needs a reason; a lost lead can be reopened.
- Contact buttons: call, **WhatsApp quick replies** (filled in from the templates and opened in your own WhatsApp; log the message afterwards) and send by email.
- **Activity** timeline: notes, call logs (connected or not, duration), messages, status changes and quotes.
- **Follow-up**: the next follow-up time. Overdue and due-today follow-ups show on the board and dashboard.
- **Quotes**:
  1. **New quote**: add lines (description, quantity, price before GST, GST % and SAC per line), choose full payment or an advance, and save as a draft.
  2. **Send**: creates an unpaid booking with exactly those lines, opens a Razorpay payment link, and sends the customer a no-login quote page. Any earlier quote that is still out is withdrawn.
  3. **Copy quote link** / **Copy payment link** to share again.
  4. When the customer pays, the booking confirms (with its invoice), the quote shows Paid and the lead becomes Won.
  5. **Record payment** if the customer paid by cash, office UPI or bank transfer (needs the payments change permission: super admin or admin).
  6. **Withdraw** cancels the quote, its booking and its payment link.

Quotes expire after the validity set in Settings (48 hours by default). Without Razorpay keys a quote is still sent, without a payment link, and staff record the payment by hand.

### People

#### Customers

Search by name, email or phone; filter by active or blocked and by whether they have bookings.

A customer's page shows:

- **Profile**: email, phone, joined date, language, referral code, status and **roles**.
- **Summary**: confirmed bookings, spend (paid minus refunds), completed bookings and points balance.
- **Bookings** with links to each.
- **P&S Rewards points**: the full history. **Adjust points** adds or removes points with a reason (recorded with your name).
- **Referrals**: who they referred and who referred them.
- **Reviews** they wrote.
- **Staff notes**: notes only staff see. Notes can be deleted.
- **Block / Unblock**: a blocked customer cannot use their account, book, redeem points or write reviews. You cannot block yourself.

Changing anything here needs the Customers change permission. For privacy requests, see section 6.

#### Vendors & Partners

Sub-menu: Vendors, Applications (with the number waiting).

- **Applications** (partner applications from the Partner With Us page): open ones first, oldest first. Each shows the business, contact, website, the applicant's message, business details, uploaded documents (download links work for 5 minutes; reload for fresh ones) and the agreement version they accepted and the name they signed with. Actions: **Mark under review**, **Approve** (choose the commission; it is filled with the default for the business type) or **Reject** (with a reason the applicant receives by email; they can apply again).
- **Vendors**: search by name, contact, city or phone; filter by type and status. **Add vendor** for a partner onboarded over the phone. A vendor page has:
  - **Vendor details**: name, type, status (Pending, Active, Suspended), commission (applies to new bookings only), contact, city, address, GSTIN, PAN, and internal notes only staff see.
  - **Partner accounts**: who can sign in to this vendor's dashboard (owner or staff).
  - **Payout details**: bank account or UPI, kept up to date by the vendor from their dashboard.
  - **Documents**: **Verify**, **Reject** (with a note the vendor sees) or **Back to pending**.
  - Links to the vendor's application and to their ledger and payouts.

#### Reviews

Reviews from customers who completed a booking. Filter by status (Waiting, Published, Rejected), subject (hotel, package, store, service), rating, or search words, guest name or booking ID.

Open a review to see the stars, text, photos, the booking and who wrote it (the public only sees a first name and initial, such as "Priya S."). Actions:

- **Publish** (or **Unpublish** later).
- **Reject** with a short reason the customer sees on their booking.
- **Public reply** shown under the review once published; save it empty to remove the reply.

Only published reviews count towards ratings on hotel, package and store pages. Whether new reviews wait for approval is set in Settings → Reviews & rewards.

### Content

#### CMS (Content)

Sub-menu: Services, Home sections, Testimonials, FAQs, Navigation. Changes go live straight away.

- **Services**: the 14 services: name, short and long text, icon, accent colour, highlights, photos, visibility, order and search-engine text, in English and Hindi. For the six business services (hotel photography, OTA handling, calling centre, Instagram reels marketing, lead generation, travel agent & data) there are also **Plans and pricing** (pricing cards with features and a "Popular" mark; "Choose this plan" preselects the plan in the enquiry form) and a **Portfolio** (photos and reel or listing links).
- **Home sections**: the fixed blocks on the home page (hero, pillars, about, and so on): reorder, hide, retitle. Their content is edited as structured text that is checked when you save; a bad section is skipped on the home page rather than breaking it.
- **Testimonials** and **FAQs**.
- **Navigation**: the header and footer menus.

Offer banners are under Offers & Coupons. Business profile and feature flags are under Settings.

#### Notifications

Sub-menu: Templates, Delivery log.

- **Templates**: the messages customers, partners and staff receive, one template per event, channel (email, SMS, WhatsApp) and language (English, Hindi). Edit the subject and message; tap a **placeholder** to insert booking details such as the guest name or amount; see a **Preview** with sample details. Switch a template off instead of deleting it. Event, channel and language cannot be changed after creation; use **Add channel or language** for another version.
- **Delivery log**: the latest 200 messages and whether each was sent, failed or skipped (skipped means the channel's provider is not set up, or the customer has no email or phone).

SMS and WhatsApp also need the provider's own approved template id for each event; the developer sets those up with the providers. Until then those channels show as skipped, and email still works.

### System

#### Settings

Only super admins and admins can save Settings; managers see the page read-only. Each form saves only its own section.

- **Business profile**: name, phone, WhatsApp, email, address and GSTIN shown on the site.
- **Payments & checkout**: advance percentage for part payment, convenience fee, pay at hotel on or off, how long unpaid bookings hold their rooms (15 minutes by default), and whether customers can cancel themselves.
- **Invoice**: legal name, address, GSTIN, state and state code, invoice prefix, SAC codes and terms printed on GST invoices.
- **Cabs**: advance and minimum advance, GST rate and SAC, distance estimates, booking window, night hours, pickup OTP and cancellation refunds.
- **Local rides**: pay the driver on or off, booking window, longest ride, night hours, pickup OTP and cancellation refunds.
- **Delivery**: delivery OTP, cash on delivery and its limit, payment hold, delivery GST and SAC codes, medicine quote validity, until when customers may cancel, and the medicine notice.
- **Packages & leads**: three forms. **Tour packages** (online advance, seat hold, booking cut-off, group limit, cancellation policy). **Leads CRM** (who gets new enquiries, spam limits, first follow-up, quote validity and default GST, lead sources, lost reasons). **Flights, trains and buses** (group limit, classes per mode, the notice above the form).
- **Partners & settlements**: **Partner onboarding** (business types offered, required documents and default commission per type, largest upload, agreement text and version; change the version whenever you change the text). **Vendor settlements** (GST on commission, TCS and TDS, settlement cycle in days, payout method "Manual"). Rates apply to new bookings only.
- **Reviews & rewards**: **Reviews** (whether new reviews need approval, review window, photos). **P&S Rewards** (on or off, earn rate, point value, redemption limits, code validity, expiry, review bonus, referral bonuses).
- **Security** (Phase 11): see section 6.
- **Feature flags**: on/off switches, saved the moment you flip them:
  - **booking.hotels**: online hotel booking ("Reserve now" on hotel pages). Off means customers book on WhatsApp.
  - **booking.cabs**: online cab booking.
  - **booking.rides**: online ride booking.
  - **booking.food**, **booking.essentials**, **booking.medicine**: ordering in each shop and medicine quotes.
  - **booking.packages**: online booking for packages set to "Book online". Enquiries always work.
  - **site.maintenance_mode**: when on, every public page (home, services, hotels, cabs, rides, shops, packages, checkout and so on) shows a "We're making a few improvements" page instead. The admin area, customer accounts (My Trips), sign-in, and the partner, driver and rider screens keep working. Staff can still look at the site through **Staff preview** on the maintenance page (see the task in section 5).
  - **i18n.hindi**: stored for the Hindi site; Hindi is currently always available.

Ask your CA to confirm the GST rates, SAC / HSN codes, TCS and TDS in these forms; they are starting points.

---

## 4. Partner, driver and rider screens

### Partner dashboard (/vendor)

Partners sign in with their own account and open **/vendor**. If they belong to more than one business, a switcher at the top picks one.

- **Home**: today's summary, their stores with a pause or resume switch, and their business at a glance.
- **Orders** (stores only): live orders that refresh every few seconds: accept, reject (with refund), preparing, ready, assign a rider (their own or a platform rider), copy the rider link, deliver with the customer's OTP.
- **Menu & stock** (stores only): mark items sold out or back, update stock and prices.
- **Ratings** and **Riders** (stores only).
- **Earnings**: balance not yet settled, who owes whom, next cut-off, their commission, the statement (every completed booking, adjustment and payout) with a CSV download, and past settlements.
- **Business**: contact, GST / PAN, bank or UPI for payouts, and documents. New documents wait for your team to verify them. Name, type and commission are managed by staff.

### Driver links (cabs and rides)

Drivers do not need an account. When you assign a driver, the trip gets a secret link:

- Cab trips: a /driver/trip/… link, valid until two days after the trip.
- Rides: a /driver/ride/… link, valid until a day after pickup.

Copy it from the dispatch board or ride page and send it on WhatsApp. On the link the driver sees pickup and drop with call and map buttons and the cash to collect, and taps **Start** → **Arrived** → **Picked up** (needs the customer's 4-digit OTP when the pickup OTP is on) → **Complete**, or **No-show**. Reassigning the trip stops the old link.

The /driver page for signed-in drivers is a placeholder for now; use the links.

### Delivery rider links

Riders also work from a link (/delivery/order/…, valid for a day), sent when they are assigned. It shows pickup and drop with call and map buttons and the cash to collect, then **Picked up** and **Delivered** (with the customer's OTP when the delivery OTP is on). Changing the rider stops the old link.

---

## 5. Common tasks, step by step

### Turn on online hotel booking

1. Make sure the developer has set up Razorpay (keys and webhook) and the service key; see DEPLOYMENT.md.
2. Check each hotel is **Published**, has room types with rate plans, and its calendar is open for the coming dates.
3. Check **Settings → Payments & checkout** (advance, convenience fee, hold time, pay at hotel) and **Settings → Invoice**.
4. Go to **Settings → Feature flags** and switch on **booking.hotels**.
5. Open a hotel on the public site in a private window: "Reserve now" now appears. Do a test booking with a small amount or in Razorpay test mode first.

The same pattern works for cabs, rides, food, essentials, medicine and packages with their own flags.

### Refund a booking

You need refund access (super admin or admin).

1. Open **Bookings & Orders** and find the booking (search by booking code or guest).
2. To cancel and refund: **Cancel booking**, check the suggested refund (from the cancellation policy), adjust it if needed, write a reason, and confirm.
3. To refund without cancelling (goodwill or overcharge): **Refund**, enter the amount (up to what was paid minus earlier refunds) and a reason.
4. Online payments go back to the customer's original payment method through Razorpay. For cash or UPI payments, the refund is recorded and you return the money yourself.
5. If you see "The booking was cancelled, but the refund failed", press **Refund** again later. Failed refunds also show on the dashboard and under **Payments → Refunds**.

### Create a booking for a caller and send a payment link

1. Go to **Leads CRM → New lead** and enter the caller's name, phone, email and what they want.
2. On the lead page, log the call.
3. Under **Quotes → New quote**, add the lines (for example the hotel stay, the cab, a service fee), each with quantity, price before GST and GST %. Choose full payment or an advance.
4. Press **Send**. The customer gets the quote page with a **Pay** button by email (and SMS / WhatsApp once those are set up).
5. Use **Copy payment link** to send it on WhatsApp too.
6. When they pay, the booking confirms with an invoice and the lead becomes Won. If they pay you in cash or by bank transfer instead, an admin uses **Record payment** on the quote.

For an existing booking with a balance due, an admin can open the booking and use **Send payment link** instead.

### Approve a partner

1. Open **Vendors & Partners → Applications**.
2. Open the application, read the details and download each document to check it.
3. Optionally press **Mark under review** while you check.
4. Press **Approve**, confirm or change the commission, and confirm. The vendor is created, the applicant becomes its owner with the vendor role, the documents are copied as verified, and the applicant is told they can open /vendor.
5. Or press **Reject** with a clear, polite reason; the applicant is emailed and may apply again.
6. On the new vendor's page, link it to its hotel or store (Hotels → Details → Partner, or the store form) so bookings are settled to it.

### Pay a vendor

You need refund access (super admin or admin).

1. Open **Payments & Refunds → Vendor settlements**. The overview lists vendors with an unsettled balance.
2. Open the vendor's ledger and check the rows. Add a **Manual adjustment** if something needs correcting.
3. Press **Create payout** and pick the cut-off date (the end of the last full cycle is suggested). Only one payout per vendor can wait at a time.
4. Pay the amount outside the app by bank transfer or UPI to the payout details shown (or collect it, when the vendor owes money).
5. Open the payout under **Payouts** and **mark it paid** with the method and the UTR / reference. The vendor is emailed and sees it on their dashboard.
6. If you made a payout by mistake, **cancel** it while it is still waiting; its rows become unsettled again.

### Publish a review

1. Open **Reviews**. Waiting reviews are listed with a count at the top.
2. Open a review and read the text and photos.
3. Press **Publish**, or **Reject** with a short reason (for example "mentions phone numbers").
4. Optionally write a **Public reply** and press **Post reply**.
5. The review and reply appear on the hotel, package or store page within a few minutes, and the customer gets an email (and the review bonus points, if set).

### Run a coupon sale

1. **Offers & Coupons → Coupons → New coupon**.
2. Enter a code (for example HOLI15) and description, choose **Percentage**, enter 15 and a maximum discount.
3. Set **Starts** and **Ends**, a minimum order, and limits (total uses, uses per guest) if you want them.
4. Tick the services it applies to (or leave all unticked for every service).
5. Tick **Suggest at checkout** if every customer should see it, and **Active**. Save.
6. To advertise it, **Offers & Coupons → Banners → New**: add an image and text, put the code on the banner, and set the same start and end times.
7. Watch **Reports → Coupon usage** during the sale. Switch the coupon off when it ends (it also stops on its own at the end time).

### Put the site in maintenance mode

You need Settings access (super admin or admin).

1. Go to **Settings → Feature flags** and switch on **site.maintenance_mode**.
2. Open the site in a private window: visitors now see the maintenance page with "Try again" and "Go to my account". Customers who are signed in can still open My Trips; partners, drivers and riders keep working from their screens and links.
3. To check the real site while it is closed, press **Staff preview** at the bottom of the maintenance page and sign in with your staff account. You see the normal site with a yellow "Maintenance mode is on" bar; **Leave preview** returns you to what visitors see.
4. When you are done, switch **site.maintenance_mode** off again. The site reopens straight away.

If you only want to stop new orders but keep the pages up, switch off the booking flags instead (**booking.hotels**, **booking.cabs** and so on); customers are then pointed to WhatsApp and enquiries. To pause a single store, use its pause switch in Food & Essentials → Stores.

---

## 6. Phase 11 additions

These arrive with Phase 11 (being finished now). The screens named below are where they live.

### Privacy requests

Customers can now look after their own data from their account:

- **Download my data**: a file with everything tied to their account (profile, bookings, addresses, travellers, wishlist, prescriptions, reviews, points, referrals and enquiries). Each download is recorded as a completed privacy request.
- **Delete my account**: the customer asks for their account to be deleted, with an optional reason. They can cancel the request while it is waiting.

Staff handle deletion requests in **Admin → Customers → Privacy requests** (needs the Customers change permission):

1. Open the request. It shows who asked, when, the reason, and whether they still have bookings awaiting payment or confirmed and not yet completed.
2. If they have open bookings, finish or cancel those first (or reject the request and tell the customer why).
3. **Complete** deletes the account. Their profile, addresses, travellers, wishlist, points and reviews are removed; their bookings and invoices are kept without their name attached, for tax records.
4. **Reject** needs a note explaining why.

A customer's page also lists their past privacy requests.

### Two-step sign-in for staff

Staff can protect their account with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy and similar):

1. Each person sets it up from **Account → Security** (/account/security): scan the QR code with the app and enter the 6-digit code it shows.
2. Once set up, they are asked for a fresh 6-digit code after signing in, before opening /admin or any other protected area. The authenticator can be removed again from the same page.
3. An admin can make it compulsory for everyone in the admin area: **Settings → Security → require two-step sign-in for staff**. Staff without an authenticator are then sent to set one up before they can open /admin.

Customers and partners can turn it on for themselves; it is never forced on them.

### Rate limits and Turnstile

To stop spam and password guessing, the site limits how often one visitor can repeat certain actions in a time window: sign-in and sign-up, enquiries, coupon checks, partner applications, reviews, file uploads and data downloads. A visitor who goes over sees "too many attempts, try again later".

**Settings → Security** lets an admin change each limit (number of tries and the window in seconds). The defaults are sensible; raise a limit only if real customers are being blocked, for example a call centre submitting many enquiries from one office connection.

**Turnstile** is Cloudflare's free "are you human" check on public forms (sign-up, email sign-in links, password reset, enquiries and partner applications). It only runs once the developer has added the Cloudflare keys, and can be switched off in **Settings → Security**.

---

## 7. Good habits and where to get help

- **Archive, don't delete.** Hotels, packages, coupons and templates that have been used cannot be deleted; switch them off or archive them.
- **Check the audit log** when something changed unexpectedly: it shows who changed what and when.
- **Test in a private window** after changing prices, flags or content: you see what a customer sees.
- **Record only money P&S received** as payments; vendors' own collections are worked out from the booking.
- **Ask your CA** before changing GST, SAC / HSN, TCS or TDS settings.
- **Technical setup** (Razorpay, email, SMS, WhatsApp, Turnstile, giving roles) is in DEPLOYMENT.md; ask the developer.

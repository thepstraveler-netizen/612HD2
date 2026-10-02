-- Phase 8: tour packages, flight / train / bus enquiries, the leads CRM and
-- quotes paid through Razorpay Payment Links.
--
-- Model
--   * A package is a tour (Vrindavan-Mathura-Govardhan, Braj 84 Kos, …) with
--     a day-wise itinerary, inclusions / exclusions, per-traveller pricing
--     tiers by group size and departure dates (fixed group departures with
--     seats, or "any date" private tours). Every package takes enquiries; a
--     package set to `book` can also be booked online with an advance.
--   * A package booking is a `bookings` row (service package) plus one
--     `package_bookings` row, exactly like cab trips: price lines, coupons,
--     payments, refunds, invoices and My Trips are shared. Seats are counted
--     from live bookings, so an unpaid hold stops counting when it expires.
--   * Every enquiry form on the site (packages, flights, trains, buses,
--     service pages) writes one `leads` row. Agents work leads through
--     New → Contacted → Quoted → Won / Lost with notes, call logs and
--     follow-up reminders (`lead_activities`).
--   * A quote is a set of price lines an agent builds for a lead. Sending it
--     creates an unpaid booking (service package or travel) and a Razorpay
--     Payment Link; when the link is paid the booking confirms through the
--     normal payment path and the lead is marked Won.
--   * Nothing here is written through the API directly except the package
--     catalog (packages.write, under RLS); leads and quotes change only
--     through the service-role functions below after a permission check.

-- ---------------------------------------------------------------- types

create type public.package_booking_mode as enum ('enquiry', 'book');
create type public.lead_kind as enum ('package', 'flight', 'train', 'bus', 'hotel', 'cab', 'service', 'general');
create type public.lead_status as enum ('new', 'contacted', 'quoted', 'won', 'lost');
create type public.lead_activity_kind as enum (
  'note', 'call', 'whatsapp', 'email', 'sms', 'status', 'assignment', 'quote', 'follow_up', 'system'
);
create type public.quote_status as enum ('draft', 'sent', 'paid', 'expired', 'cancelled');

alter table public.booking_items drop constraint if exists booking_items_kind_check;
alter table public.booking_items
  add constraint booking_items_kind_check
  check (kind in ('room', 'extra_guest', 'addon', 'fee', 'fare', 'allowance', 'surcharge', 'item', 'delivery', 'package', 'service'));

-- A jsonb array of localized strings (inclusions, highlights, …).
create or replace function public.is_localized_list(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value is not null
     and jsonb_typeof(value) = 'array'
     and not exists (select 1 from jsonb_array_elements(value) e where not public.is_localized(e));
$$;

-- ---------------------------------------------------------------- packages

create table public.packages (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title            jsonb not null check (public.is_localized(title)),
  summary          jsonb not null check (public.is_localized(summary)),
  description      jsonb check (description is null or public.is_localized(description)),
  -- Free-form grouping for filters ("braj", "pilgrimage", "heritage", …).
  category         text not null default 'pilgrimage' check (category ~ '^[a-z0-9-]+$'),
  destinations     text[] not null default '{}',
  start_city       text check (char_length(start_city) <= 80),
  duration_days    smallint not null check (duration_days between 1 and 60),
  duration_nights  smallint not null check (duration_nights between 0 and 60),
  image_id         uuid references public.media (id) on delete set null,
  gallery_ids      uuid[] not null default '{}',
  highlights       jsonb not null default '[]'::jsonb check (public.is_localized_list(highlights)),
  inclusions       jsonb not null default '[]'::jsonb check (public.is_localized_list(inclusions)),
  exclusions       jsonb not null default '[]'::jsonb check (public.is_localized_list(exclusions)),
  terms            jsonb check (terms is null or public.is_localized(terms)),
  booking_mode     public.package_booking_mode not null default 'enquiry',
  -- Fixed group departures (dates with seats) or a private tour on any date.
  fixed_departures boolean not null default true,
  min_pax          smallint not null default 1 check (min_pax between 1 and 100),
  max_pax          smallint not null default 20 check (max_pax between 1 and 100),
  -- Advance taken online; null = the packages.defaults setting.
  advance_percent  smallint check (advance_percent is null or advance_percent between 1 and 100),
  -- GST on tour operator services (5% without ITC by default).
  tax_bps          integer not null default 500 check (tax_bps between 0 and 2800),
  sac              text not null default '998555',
  rating           numeric(2, 1) check (rating is null or rating between 0 and 5),
  is_featured      boolean not null default false,
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  check (max_pax >= min_pax),
  check (duration_nights <= duration_days)
);
create index packages_listing_idx on public.packages (is_featured desc, sort_order) where is_active and deleted_at is null;

create table public.package_itinerary_days (
  id           uuid primary key default gen_random_uuid(),
  package_id   uuid not null references public.packages (id) on delete cascade,
  day_number   smallint not null check (day_number between 1 and 60),
  title        jsonb not null check (public.is_localized(title)),
  description  jsonb check (description is null or public.is_localized(description)),
  meals        text[] not null default '{}' check (meals <@ array['breakfast', 'lunch', 'dinner']),
  overnight    text check (char_length(overnight) <= 120),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (package_id, day_number)
);

-- Price per traveller by group size: the tier whose range holds the whole
-- group (adults + children) applies; children pay the child price if set.
create table public.package_pricing_tiers (
  id                 uuid primary key default gen_random_uuid(),
  package_id         uuid not null references public.packages (id) on delete cascade,
  min_pax            smallint not null check (min_pax between 1 and 100),
  max_pax            smallint not null check (max_pax between 1 and 100),
  adult_price_paise  integer not null check (adult_price_paise > 0),
  child_price_paise  integer check (child_price_paise is null or child_price_paise >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (max_pax >= min_pax),
  unique (package_id, min_pax)
);

create table public.package_departures (
  id                  uuid primary key default gen_random_uuid(),
  package_id          uuid not null references public.packages (id) on delete cascade,
  start_date          date not null,
  -- Null = no seat limit (on request).
  seats_total         smallint check (seats_total is null or seats_total between 1 and 1000),
  -- Added per traveller on this date (festival / peak season).
  supplement_paise    integer not null default 0 check (supplement_paise >= 0),
  note                jsonb check (note is null or public.is_localized(note)),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (package_id, start_date)
);
create index package_departures_date_idx on public.package_departures (package_id, start_date) where is_active;

create table public.package_bookings (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null unique references public.bookings (id) on delete cascade,
  package_id    uuid not null references public.packages (id) on delete restrict,
  departure_id  uuid references public.package_departures (id) on delete set null,
  start_date    date not null,
  end_date      date not null,
  adults        smallint not null check (adults between 1 and 100),
  children      smallint not null default 0 check (children between 0 and 100),
  -- [{ "name": "…", "age": 34 }]
  travellers    jsonb not null default '[]'::jsonb check (jsonb_typeof(travellers) = 'array'),
  pickup_point  text check (char_length(pickup_point) <= 200),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_date >= start_date)
);
create index package_bookings_departure_idx on public.package_bookings (departure_id);

-- ---------------------------------------------------------------- leads

create table public.leads (
  id                 uuid primary key default gen_random_uuid(),
  -- Shown as LD-00042.
  number             bigint generated by default as identity unique,
  user_id            uuid references auth.users (id) on delete set null,
  kind               public.lead_kind not null,
  -- The service page the enquiry came from (kind service).
  service_slug       text check (service_slug ~ '^[a-z0-9-]+$'),
  package_id         uuid references public.packages (id) on delete set null,
  name               text not null check (char_length(name) between 2 and 120),
  phone              text not null check (phone ~ '^\+?[0-9]{10,15}$'),
  email              extensions.citext,
  -- What they asked for: travel { from, to, depart_on, return_on, adults, children, class },
  -- package { start_date, adults, children }, …
  details            jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  message            text check (char_length(message) <= 2000),
  status             public.lead_status not null default 'new',
  lost_reason        text check (char_length(lost_reason) <= 300),
  assigned_to        uuid references auth.users (id) on delete set null,
  assigned_at        timestamptz,
  -- website, whatsapp, instagram, calling, walk_in, referral, … (admin-editable list).
  source             text not null default 'website' check (source ~ '^[a-z0-9_-]{2,40}$'),
  -- { source, medium, campaign, term, content }
  utm                jsonb not null default '{}'::jsonb check (jsonb_typeof(utm) = 'object'),
  referrer           text check (char_length(referrer) <= 500),
  landing_path       text check (char_length(landing_path) <= 500),
  next_follow_up_at  timestamptz,
  last_contacted_at  timestamptz,
  -- Latest quote total, for the pipeline value.
  value_paise        integer check (value_paise is null or value_paise >= 0),
  booking_id         uuid references public.bookings (id) on delete set null,
  locale             text not null default 'en' check (locale in ('en', 'hi')),
  closed_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (status <> 'lost' or lost_reason is not null)
);
create index leads_status_idx on public.leads (status, created_at desc);
create index leads_assignee_idx on public.leads (assigned_to, status);
create index leads_follow_up_idx on public.leads (next_follow_up_at) where status in ('new', 'contacted', 'quoted');
create index leads_phone_idx on public.leads (phone, created_at desc);

create table public.lead_activities (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references public.leads (id) on delete cascade,
  kind           public.lead_activity_kind not null,
  body           text check (char_length(body) <= 4000),
  call_outcome   text check (call_outcome in ('connected', 'no_answer', 'busy', 'wrong_number', 'callback')),
  call_seconds   integer check (call_seconds is null or call_seconds between 0 and 86400),
  meta           jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object'),
  actor          uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index lead_activities_lead_idx on public.lead_activities (lead_id, created_at desc);

create table public.quotes (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid not null references public.leads (id) on delete cascade,
  -- 1, 2, 3 … per lead.
  number            smallint not null check (number >= 1),
  status            public.quote_status not null default 'draft',
  title             text not null check (char_length(title) between 2 and 160),
  -- Server-priced lines: [{ key, description, quantity, unit_price_paise, amount_paise, tax_rate_bps, tax_paise, sac }]
  lines             jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) between 1 and 30),
  subtotal_paise    integer not null check (subtotal_paise >= 0),
  tax_paise         integer not null check (tax_paise >= 0),
  total_paise       integer not null check (total_paise > 0),
  -- Collected through the payment link (the full total or an advance).
  pay_now_paise     integer not null check (pay_now_paise > 0),
  valid_until       timestamptz not null,
  -- Shown to the customer.
  notes             text check (char_length(notes) <= 2000),
  terms             text check (char_length(terms) <= 4000),
  -- No-login quote page /quote/<token>; never readable through the API.
  token             text unique check (token ~ '^[0-9a-f]{48}$'),
  booking_id        uuid unique references public.bookings (id) on delete set null,
  payment_link_url  text,
  created_by        uuid references auth.users (id) on delete set null,
  sent_at           timestamptz,
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (lead_id, number),
  check (total_paise = subtotal_paise + tax_paise),
  check (pay_now_paise <= total_paise),
  check (status = 'draft' or status = 'cancelled' or token is not null)
);
create index quotes_lead_idx on public.quotes (lead_id, number desc);

-- ---------------------------------------------------------------- triggers, RLS, audit

do $$
declare t text;
begin
  foreach t in array array['packages', 'package_itinerary_days', 'package_pricing_tiers', 'package_departures',
                           'package_bookings', 'leads', 'quotes']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
    perform public.enable_audit('public.' || t);
  end loop;
  foreach t in array array['packages', 'package_itinerary_days', 'package_pricing_tiers', 'package_departures',
                           'package_bookings', 'leads', 'lead_activities', 'quotes']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;

-- Catalog: live packages are public; package staff see and manage everything.
create policy "live packages are public" on public.packages
  for select to anon, authenticated
  using ((is_active and deleted_at is null) or public.has_permission('packages.read'));
create policy "package managers manage packages" on public.packages
  for all to authenticated
  using (public.has_permission('packages.write'))
  with check (public.has_permission('packages.write'));

create or replace function public.package_is_public(p_package_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.packages where id = p_package_id and is_active and deleted_at is null);
$$;

do $$
declare t text;
begin
  foreach t in array array['package_itinerary_days', 'package_pricing_tiers', 'package_departures']
  loop
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (public.package_is_public(package_id) or public.has_permission(''packages.read''))',
      t || ' of live packages are public', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_permission(''packages.write'')) with check (public.has_permission(''packages.write''))',
      'package managers manage ' || t, t);
  end loop;
end
$$;

-- Package editors upload photos to the media bucket and register them.
create policy "package editors upload media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.has_permission('packages.write'));
create policy "package editors register media" on public.media
  for insert to authenticated
  with check (public.has_permission('packages.write'));

-- Package bookings follow their booking, plus package staff.
create policy "package bookings follow the booking" on public.package_bookings
  for select to authenticated
  using (public.has_permission('packages.read') or public.can_read_booking(booking_id));

-- The CRM is staff-only and read-only through the API.
create policy "lead staff read leads" on public.leads
  for select to authenticated using (public.has_permission('leads.read'));
create policy "lead staff read lead activities" on public.lead_activities
  for select to authenticated using (public.has_permission('leads.read'));
create policy "lead staff read quotes" on public.quotes
  for select to authenticated using (public.has_permission('leads.read'));

-- The quote page token stays server-side.
revoke select on public.quotes from anon, authenticated;
grant select (
  id, lead_id, number, status, title, lines, subtotal_paise, tax_paise, total_paise, pay_now_paise,
  valid_until, notes, terms, booking_id, payment_link_url, created_by, sent_at, paid_at, created_at, updated_at
) on public.quotes to authenticated;

-- ---------------------------------------------------------------- functions

-- Whether a user holds a permission through any of their roles (for assignment checks).
create or replace function public.user_has_permission(p_user_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = p_user_id and p.key = p_key
  );
$$;

/*
 * Seats left on each active future departure of a package (null = no
 * limit). Counts confirmed bookings and unpaid holds that have not expired.
 * Only counts are exposed, so it is callable by anyone.
 */
create or replace function public.package_departure_seats(p_package_id uuid)
returns table (departure_id uuid, seats_left integer)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id,
         case when d.seats_total is null then null
              else greatest(0, d.seats_total - coalesce((
                select sum(pb.adults + pb.children)::integer
                  from public.package_bookings pb
                  join public.bookings b on b.id = pb.booking_id
                 where pb.departure_id = d.id
                   and (b.status in ('confirmed', 'completed')
                        or (b.status in ('draft', 'pending_payment') and b.expires_at > now()))
              ), 0)) end
    from public.package_departures d
    join public.packages p on p.id = d.package_id
   where d.package_id = p_package_id and d.is_active and d.start_date >= current_date
     and p.is_active and p.deleted_at is null;
$$;

/*
 * Creates a package booking with its price lines, travellers, a coupon
 * reservation and the package_bookings row, in one transaction. The server
 * has priced it from the catalog; seats are re-checked here under a lock
 * on the departure.
 *   p_booking: bookings columns (code, user_id, contact_*, totals, payment_mode,
 *              coupon_id/code, price_breakdown, snapshot, locale, expires_at,
 *              check_in = start date, check_out = end date, adults, children)
 *   p_package: { package_id, departure_id, start_date, end_date, adults, children, travellers, pickup_point }
 */
create or replace function public.create_package_booking(p_booking jsonb, p_items jsonb, p_package jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_package public.packages;
  v_departure public.package_departures;
  v_pax integer := (p_package ->> 'adults')::integer + coalesce((p_package ->> 'children')::integer, 0);
  v_taken integer;
begin
  perform public.set_actor(nullif(p_booking ->> 'user_id', '')::uuid);

  select * into v_package from public.packages where id = (p_package ->> 'package_id')::uuid;
  if v_package.id is null or not v_package.is_active or v_package.deleted_at is not null
     or v_package.booking_mode <> 'book' then
    raise exception 'package_unavailable' using errcode = 'P0001';
  end if;
  if (p_package ->> 'start_date')::date < current_date then
    raise exception 'departure_closed' using errcode = 'P0001';
  end if;

  if v_package.fixed_departures then
    select * into v_departure from public.package_departures
     where id = nullif(p_package ->> 'departure_id', '')::uuid and package_id = v_package.id
     for update;
    if v_departure.id is null or not v_departure.is_active
       or v_departure.start_date <> (p_package ->> 'start_date')::date then
      raise exception 'departure_closed' using errcode = 'P0001';
    end if;
    if v_departure.seats_total is not null then
      select coalesce(sum(pb.adults + pb.children), 0) into v_taken
        from public.package_bookings pb
        join public.bookings b on b.id = pb.booking_id
       where pb.departure_id = v_departure.id
         and (b.status in ('confirmed', 'completed')
              or (b.status in ('draft', 'pending_payment') and b.expires_at > now()));
      if v_taken + v_pax > v_departure.seats_total then
        raise exception 'sold_out' using errcode = 'P0001';
      end if;
    end if;
  end if;

  insert into public.bookings (
    code, user_id, service, status, check_in, check_out, adults, children,
    contact_name, contact_email, contact_phone, special_requests, gst_details,
    subtotal_paise, discount_paise, tax_paise, total_paise, payable_now_paise, payment_mode,
    coupon_id, coupon_code, price_breakdown, snapshot, locale, expires_at
  ) values (
    p_booking ->> 'code', (p_booking ->> 'user_id')::uuid, 'package', 'pending_payment',
    (p_booking ->> 'check_in')::date, (p_booking ->> 'check_out')::date,
    (p_booking ->> 'adults')::smallint, coalesce((p_booking ->> 'children')::smallint, 0),
    p_booking ->> 'contact_name', nullif(p_booking ->> 'contact_email', ''), p_booking ->> 'contact_phone',
    nullif(p_booking ->> 'special_requests', ''), nullif(p_booking -> 'gst_details', 'null'::jsonb),
    (p_booking ->> 'subtotal_paise')::integer, (p_booking ->> 'discount_paise')::integer,
    (p_booking ->> 'tax_paise')::integer, (p_booking ->> 'total_paise')::integer,
    (p_booking ->> 'payable_now_paise')::integer, (p_booking ->> 'payment_mode')::public.payment_mode,
    nullif(p_booking ->> 'coupon_id', '')::uuid, nullif(p_booking ->> 'coupon_code', ''),
    p_booking -> 'price_breakdown', coalesce(p_booking -> 'snapshot', '{}'::jsonb),
    coalesce(p_booking ->> 'locale', 'en'), (p_booking ->> 'expires_at')::timestamptz
  )
  returning * into v_booking;

  if v_booking.payment_mode = 'pay_at_hotel' then
    raise exception 'payment_mode' using errcode = 'P0001';
  end if;

  insert into public.booking_items (booking_id, kind, line_key, description, service_date,
    quantity, amount_paise, discount_paise, tax_rate_bps, tax_paise, sac, sort_order)
  select v_booking.id, i ->> 'kind', i ->> 'line_key', i ->> 'description', nullif(i ->> 'service_date', '')::date,
    coalesce((i ->> 'quantity')::integer, 1), (i ->> 'amount_paise')::integer, (i ->> 'discount_paise')::integer,
    (i ->> 'tax_rate_bps')::integer, (i ->> 'tax_paise')::integer, nullif(i ->> 'sac', ''), ord::integer
  from jsonb_array_elements(p_items) with ordinality as x(i, ord);

  if (select coalesce(sum(amount_paise), 0) from public.booking_items where booking_id = v_booking.id) <> v_booking.subtotal_paise
     or (select coalesce(sum(discount_paise), 0) from public.booking_items where booking_id = v_booking.id) <> v_booking.discount_paise
     or (select coalesce(sum(tax_paise), 0) from public.booking_items where booking_id = v_booking.id) <> v_booking.tax_paise then
    raise exception 'totals_mismatch' using errcode = 'P0001';
  end if;

  insert into public.booking_guests (booking_id, full_name, is_primary, sort_order)
    values (v_booking.id, v_booking.contact_name, true, 1);
  insert into public.booking_guests (booking_id, full_name, is_primary, sort_order)
  select v_booking.id, t ->> 'name', false, ord::integer + 1
    from jsonb_array_elements(coalesce(p_package -> 'travellers', '[]'::jsonb)) with ordinality as x(t, ord)
   where char_length(coalesce(t ->> 'name', '')) >= 2 and t ->> 'name' <> v_booking.contact_name;

  perform public.reserve_booking_coupon(v_booking.id);

  insert into public.package_bookings (booking_id, package_id, departure_id, start_date, end_date,
    adults, children, travellers, pickup_point)
  values (v_booking.id, v_package.id, v_departure.id, (p_package ->> 'start_date')::date,
    (p_package ->> 'end_date')::date, (p_package ->> 'adults')::smallint,
    coalesce((p_package ->> 'children')::smallint, 0), coalesce(p_package -> 'travellers', '[]'::jsonb),
    nullif(p_package ->> 'pickup_point', ''));

  return jsonb_build_object('id', v_booking.id, 'code', v_booking.code, 'status', 'pending_payment');
end;
$$;

-- ---------------------------------------------------------------- lead functions

/*
 * Writes a lead from any enquiry form. Throttled per phone number
 * (leads.defaults.max_per_phone_per_hour), then auto-assigned to the agent
 * with the fewest open leads when leads.defaults.auto_assign is
 * 'least_loaded'. Returns { id, number, assigned_to }.
 */
create or replace function public.create_lead(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings jsonb := coalesce((select value from public.settings where key = 'leads.defaults'), '{}'::jsonb);
  v_limit integer := coalesce((v_settings ->> 'max_per_phone_per_hour')::integer, 5);
  v_follow_hours integer := coalesce((v_settings ->> 'first_follow_up_hours')::integer, 2);
  v_lead public.leads;
  v_agent uuid;
begin
  perform public.set_actor(nullif(p ->> 'user_id', '')::uuid);
  if (select count(*) from public.leads
       where phone = p ->> 'phone' and created_at > now() - interval '1 hour') >= v_limit then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.leads (user_id, kind, service_slug, package_id, name, phone, email, details, message,
    source, utm, referrer, landing_path, locale, next_follow_up_at)
  values (
    nullif(p ->> 'user_id', '')::uuid, (p ->> 'kind')::public.lead_kind, nullif(p ->> 'service_slug', ''),
    nullif(p ->> 'package_id', '')::uuid, p ->> 'name', p ->> 'phone', nullif(p ->> 'email', ''),
    coalesce(p -> 'details', '{}'::jsonb), nullif(p ->> 'message', ''),
    coalesce(nullif(p ->> 'source', ''), 'website'), coalesce(p -> 'utm', '{}'::jsonb),
    nullif(p ->> 'referrer', ''), nullif(p ->> 'landing_path', ''), coalesce(p ->> 'locale', 'en'),
    now() + make_interval(hours => v_follow_hours)
  )
  returning * into v_lead;

  insert into public.lead_activities (lead_id, kind, body, meta, actor)
  values (v_lead.id, 'system', 'Enquiry received', jsonb_build_object('source', v_lead.source),
    nullif(p ->> 'created_by', '')::uuid);

  if coalesce(v_settings ->> 'auto_assign', 'least_loaded') = 'least_loaded' then
    select ur.user_id into v_agent
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      join public.profiles pr on pr.id = ur.user_id
     where r.key = 'agent' and not pr.is_blocked and pr.deleted_at is null
     order by (select count(*) from public.leads l
                where l.assigned_to = ur.user_id and l.status in ('new', 'contacted', 'quoted')),
              ur.created_at
     limit 1;
    if v_agent is not null then
      update public.leads set assigned_to = v_agent, assigned_at = now() where id = v_lead.id;
      insert into public.lead_activities (lead_id, kind, body, meta)
      values (v_lead.id, 'assignment', 'Auto-assigned', jsonb_build_object('to', v_agent));
    end if;
  end if;

  return jsonb_build_object('id', v_lead.id, 'number', v_lead.number, 'assigned_to', v_agent);
end;
$$;

-- Assigns a lead to a staff member who can work leads, or unassigns it (null).
create or replace function public.assign_lead(p_lead_id uuid, p_assignee uuid, p_actor uuid)
returns public.leads
language plpgsql
security definer
set search_path = ''
as $$
declare v_lead public.leads;
begin
  perform public.set_actor(p_actor);
  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_assignee is not null and not public.user_has_permission(p_assignee, 'leads.write') then
    raise exception 'assignee_invalid' using errcode = 'P0001';
  end if;
  if v_lead.assigned_to is not distinct from p_assignee then return v_lead; end if;
  update public.leads set assigned_to = p_assignee, assigned_at = case when p_assignee is null then null else now() end
   where id = p_lead_id returning * into v_lead;
  insert into public.lead_activities (lead_id, kind, body, meta, actor)
  values (p_lead_id, 'assignment', case when p_assignee is null then 'Unassigned' else 'Assigned' end,
    jsonb_build_object('to', p_assignee), p_actor);
  return v_lead;
end;
$$;

/*
 * Moves a lead by hand. Quoted is reached only by sending a quote, Won also
 * when a quote is paid; Lost needs a reason; a lost lead can be reopened.
 * Mirrors lib/leads/status.ts.
 */
create or replace function public.set_lead_status(p_lead_id uuid, p_status public.lead_status, p_actor uuid, p_reason text default null)
returns public.leads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_from public.lead_status;
  v_ok boolean;
begin
  perform public.set_actor(p_actor);
  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_from := v_lead.status;
  v_ok := case v_lead.status
    when 'new' then p_status in ('contacted', 'won', 'lost')
    when 'contacted' then p_status in ('won', 'lost')
    when 'quoted' then p_status in ('contacted', 'won', 'lost')
    when 'lost' then p_status in ('contacted')
    else false
  end;
  if not v_ok then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  if p_status = 'lost' and coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  update public.leads
     set status = p_status,
         lost_reason = case when p_status = 'lost' then trim(p_reason) end,
         closed_at = case when p_status in ('won', 'lost') then now() end,
         next_follow_up_at = case when p_status in ('won', 'lost') then null else next_follow_up_at end
   where id = p_lead_id
   returning * into v_lead;
  insert into public.lead_activities (lead_id, kind, body, meta, actor)
  values (p_lead_id, 'status', nullif(trim(coalesce(p_reason, '')), ''),
    jsonb_build_object('from', v_from, 'to', p_status), p_actor);
  return v_lead;
end;
$$;

/*
 * Logs a note, call, WhatsApp, email or SMS on a lead and optionally sets
 * the next follow-up (p_follow_up; pass p_clear_follow_up to clear it).
 * A contact on a new lead moves it to Contacted.
 */
create or replace function public.log_lead_activity(
  p_lead_id uuid,
  p_kind public.lead_activity_kind,
  p_body text,
  p_actor uuid,
  p_call_outcome text default null,
  p_call_seconds integer default null,
  p_follow_up timestamptz default null,
  p_clear_follow_up boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_id uuid;
  v_contact boolean := p_kind in ('call', 'whatsapp', 'email', 'sms');
begin
  perform public.set_actor(p_actor);
  if p_kind not in ('note', 'call', 'whatsapp', 'email', 'sms', 'follow_up') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  insert into public.lead_activities (lead_id, kind, body, call_outcome, call_seconds, meta, actor)
  values (p_lead_id, p_kind, nullif(trim(coalesce(p_body, '')), ''),
    case when p_kind = 'call' then p_call_outcome end, case when p_kind = 'call' then p_call_seconds end,
    case when p_follow_up is not null then jsonb_build_object('follow_up', p_follow_up) else '{}'::jsonb end,
    p_actor)
  returning id into v_id;
  update public.leads
     set last_contacted_at = case when v_contact then now() else last_contacted_at end,
         status = case when v_contact and status = 'new' then 'contacted'::public.lead_status else status end,
         next_follow_up_at = case
           when p_clear_follow_up then null
           when p_follow_up is not null then p_follow_up
           else next_follow_up_at end
   where id = p_lead_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- quote functions

/*
 * Saves a draft quote (insert when p ->> 'id' is null). The server has
 * priced the lines; totals are re-checked against them here.
 *   p: { id, lead_id, title, lines, subtotal_paise, tax_paise, total_paise, pay_now_paise, valid_until, notes, terms }
 */
create or replace function public.save_quote(p jsonb, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_lead public.leads;
  v_quote public.quotes;
begin
  perform public.set_actor(p_actor);
  select * into v_lead from public.leads where id = (p ->> 'lead_id')::uuid for update;
  if v_lead.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_lead.status in ('won', 'lost') then raise exception 'lead_closed' using errcode = 'P0001'; end if;
  if (select coalesce(sum((l ->> 'amount_paise')::integer), 0) from jsonb_array_elements(p -> 'lines') l)
       <> (p ->> 'subtotal_paise')::integer
     or (select coalesce(sum((l ->> 'tax_paise')::integer), 0) from jsonb_array_elements(p -> 'lines') l)
       <> (p ->> 'tax_paise')::integer then
    raise exception 'totals_mismatch' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.quotes (lead_id, number, title, lines, subtotal_paise, tax_paise, total_paise,
      pay_now_paise, valid_until, notes, terms, created_by)
    values (v_lead.id, coalesce((select max(number) from public.quotes where lead_id = v_lead.id), 0) + 1,
      p ->> 'title', p -> 'lines', (p ->> 'subtotal_paise')::integer, (p ->> 'tax_paise')::integer,
      (p ->> 'total_paise')::integer, (p ->> 'pay_now_paise')::integer, (p ->> 'valid_until')::timestamptz,
      nullif(p ->> 'notes', ''), nullif(p ->> 'terms', ''), p_actor)
    returning id into v_id;
  else
    select * into v_quote from public.quotes where id = v_id and lead_id = v_lead.id for update;
    if v_quote.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
    if v_quote.status <> 'draft' then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
    update public.quotes
       set title = p ->> 'title', lines = p -> 'lines', subtotal_paise = (p ->> 'subtotal_paise')::integer,
           tax_paise = (p ->> 'tax_paise')::integer, total_paise = (p ->> 'total_paise')::integer,
           pay_now_paise = (p ->> 'pay_now_paise')::integer, valid_until = (p ->> 'valid_until')::timestamptz,
           notes = nullif(p ->> 'notes', ''), terms = nullif(p ->> 'terms', '')
     where id = v_id;
  end if;
  return v_id;
end;
$$;

/*
 * Sends a draft quote: writes the unpaid booking the customer will pay
 * (service package for package leads, travel otherwise) with the quote's
 * lines, issues the quote page token and marks the lead Quoted. Any other
 * sent, unpaid quote on the lead is withdrawn (its booking cancelled), so a
 * customer only ever holds one payable quote. The caller then opens the
 * Razorpay Payment Link for the booking.
 *   p_booking: { code, contact_email, special_requests, price_breakdown, snapshot, payment_mode }
 */
create or replace function public.send_quote(p_quote_id uuid, p_booking jsonb, p_token text, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_lead public.leads;
  v_booking public.bookings;
  v_old record;
begin
  perform public.set_actor(p_actor);
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if v_quote.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_quote.status <> 'draft' then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  if v_quote.valid_until <= now() then raise exception 'quote_invalid' using errcode = 'P0001'; end if;
  select * into v_lead from public.leads where id = v_quote.lead_id for update;
  if v_lead.status in ('won', 'lost') then raise exception 'lead_closed' using errcode = 'P0001'; end if;

  for v_old in
    select q.id, q.booking_id from public.quotes q
     where q.lead_id = v_lead.id and q.status = 'sent' and q.id <> v_quote.id
  loop
    update public.quotes set status = 'cancelled' where id = v_old.id;
    if v_old.booking_id is not null then
      perform public.cancel_booking(v_old.booking_id, p_actor, 'Replaced by a newer quote')
        from public.bookings where id = v_old.booking_id and status in ('draft', 'pending_payment');
    end if;
  end loop;

  insert into public.bookings (
    code, user_id, service, status, adults, children,
    contact_name, contact_email, contact_phone, special_requests,
    subtotal_paise, discount_paise, tax_paise, total_paise, payable_now_paise, payment_mode,
    price_breakdown, snapshot, locale, expires_at, check_in
  ) values (
    p_booking ->> 'code', v_lead.user_id,
    case when v_lead.kind = 'package' then 'package'::public.booking_service else 'travel'::public.booking_service end,
    'pending_payment',
    greatest(1, coalesce((v_lead.details ->> 'adults')::smallint, 1)),
    greatest(0, coalesce((v_lead.details ->> 'children')::smallint, 0)),
    v_lead.name, coalesce(nullif(p_booking ->> 'contact_email', ''), v_lead.email::text), v_lead.phone,
    nullif(p_booking ->> 'special_requests', ''),
    v_quote.subtotal_paise, 0, v_quote.tax_paise, v_quote.total_paise, v_quote.pay_now_paise,
    case when v_quote.pay_now_paise = v_quote.total_paise then 'full'::public.payment_mode else 'part'::public.payment_mode end,
    coalesce(p_booking -> 'price_breakdown', jsonb_build_object('lines', v_quote.lines)),
    coalesce(p_booking -> 'snapshot', '{}'::jsonb), v_lead.locale, v_quote.valid_until,
    coalesce(nullif(v_lead.details ->> 'depart_on', ''), nullif(v_lead.details ->> 'start_date', ''))::date
  )
  returning * into v_booking;

  insert into public.booking_items (booking_id, kind, line_key, description, quantity,
    amount_paise, discount_paise, tax_rate_bps, tax_paise, sac, sort_order)
  select v_booking.id, 'service', coalesce(l ->> 'key', 'line:' || ord), l ->> 'description',
    coalesce((l ->> 'quantity')::integer, 1), (l ->> 'amount_paise')::integer, 0,
    (l ->> 'tax_rate_bps')::integer, (l ->> 'tax_paise')::integer, nullif(l ->> 'sac', ''), ord::integer
  from jsonb_array_elements(v_quote.lines) with ordinality as x(l, ord);

  if (select coalesce(sum(amount_paise), 0) from public.booking_items where booking_id = v_booking.id) <> v_booking.subtotal_paise
     or (select coalesce(sum(tax_paise), 0) from public.booking_items where booking_id = v_booking.id) <> v_booking.tax_paise then
    raise exception 'totals_mismatch' using errcode = 'P0001';
  end if;

  insert into public.booking_guests (booking_id, full_name, is_primary, sort_order)
    values (v_booking.id, v_booking.contact_name, true, 1);

  update public.quotes
     set status = 'sent', token = p_token, booking_id = v_booking.id, sent_at = now()
   where id = v_quote.id;
  update public.leads
     set status = case when status in ('new', 'contacted', 'quoted') then 'quoted'::public.lead_status else status end,
         value_paise = v_quote.total_paise
   where id = v_lead.id;
  insert into public.lead_activities (lead_id, kind, body, meta, actor)
  values (v_lead.id, 'quote', 'Quote #' || v_quote.number || ' sent',
    jsonb_build_object('quote_id', v_quote.id, 'total_paise', v_quote.total_paise, 'booking', v_booking.code), p_actor);

  return jsonb_build_object('id', v_booking.id, 'code', v_booking.code, 'status', 'pending_payment');
end;
$$;

-- Remembers the payment link on the quote (after create_payment_link_payment).
create or replace function public.attach_quote_link(p_quote_id uuid, p_url text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.quotes set payment_link_url = p_url where id = p_quote_id and status = 'sent';
$$;

-- Withdraws a draft or sent, unpaid quote; a sent quote's booking is cancelled.
create or replace function public.cancel_quote(p_quote_id uuid, p_actor uuid)
returns public.quotes
language plpgsql
security definer
set search_path = ''
as $$
declare v_quote public.quotes;
begin
  perform public.set_actor(p_actor);
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if v_quote.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_quote.status not in ('draft', 'sent') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  update public.quotes set status = 'cancelled' where id = p_quote_id returning * into v_quote;
  if v_quote.booking_id is not null
     and exists (select 1 from public.bookings where id = v_quote.booking_id and status in ('draft', 'pending_payment')) then
    perform public.cancel_booking(v_quote.booking_id, p_actor, 'Quote withdrawn');
  end if;
  insert into public.lead_activities (lead_id, kind, body, meta, actor)
  values (v_quote.lead_id, 'quote', 'Quote #' || v_quote.number || ' withdrawn',
    jsonb_build_object('quote_id', v_quote.id), p_actor);
  return v_quote;
end;
$$;

/*
 * Records money a customer paid for a sent quote outside Razorpay (cash,
 * UPI to the office, bank transfer) and confirms its booking.
 */
create or replace function public.record_quote_offline_payment(
  p_quote_id uuid, p_amount integer, p_method text, p_reference text, p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_booking public.bookings;
  v_id uuid;
begin
  perform public.set_actor(p_actor);
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if v_quote.id is null or v_quote.booking_id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_quote.status <> 'sent' then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  select * into v_booking from public.bookings where id = v_quote.booking_id for update;
  if v_booking.status not in ('draft', 'pending_payment', 'expired') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if p_amount <= 0 or p_amount > v_booking.total_paise then raise exception 'overpaid' using errcode = 'P0001'; end if;
  insert into public.payments (booking_id, provider, amount_paise, status, method, reference, recorded_by, captured_at)
  values (v_booking.id, 'offline', p_amount, 'captured', p_method, p_reference, p_actor, now())
  returning id into v_id;
  update public.bookings
     set paid_paise = paid_paise + p_amount, status = 'confirmed', confirmed_at = now(), expires_at = null
   where id = v_booking.id;
  perform public.issue_invoice(v_booking.id);
  return v_id;
end;
$$;

/*
 * Keeps a quote and its lead in step with the quote's booking: paid →
 * quote paid, lead Won; expired → quote expired; cancelled by staff from
 * Bookings → quote cancelled.
 */
create or replace function public.sync_quote_with_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_quote public.quotes;
begin
  if new.service not in ('package', 'travel') or new.status is not distinct from old.status then return null; end if;
  select * into v_quote from public.quotes where booking_id = new.id;
  if v_quote.id is null then return null; end if;
  if new.status = 'confirmed' and v_quote.status in ('sent', 'expired', 'cancelled') then
    update public.quotes set status = 'paid', paid_at = now() where id = v_quote.id;
    update public.leads
       set status = 'won', booking_id = new.id, closed_at = now(), next_follow_up_at = null, lost_reason = null
     where id = v_quote.lead_id;
    insert into public.lead_activities (lead_id, kind, body, meta)
    values (v_quote.lead_id, 'quote', 'Quote #' || v_quote.number || ' paid',
      jsonb_build_object('quote_id', v_quote.id, 'booking', new.code, 'paid_paise', new.paid_paise));
  elsif new.status = 'expired' and v_quote.status = 'sent' then
    update public.quotes set status = 'expired' where id = v_quote.id;
    insert into public.lead_activities (lead_id, kind, body, meta)
    values (v_quote.lead_id, 'quote', 'Quote #' || v_quote.number || ' expired', jsonb_build_object('quote_id', v_quote.id));
  elsif new.status in ('cancelled', 'failed') and v_quote.status = 'sent' then
    update public.quotes set status = 'cancelled' where id = v_quote.id;
  end if;
  return null;
end;
$$;

create trigger bookings_sync_quote after update of status on public.bookings
  for each row execute function public.sync_quote_with_booking();

do $$
declare f text;
begin
  foreach f in array array[
    'public.user_has_permission(uuid, text)',
    'public.create_package_booking(jsonb, jsonb, jsonb)',
    'public.create_lead(jsonb)',
    'public.assign_lead(uuid, uuid, uuid)',
    'public.set_lead_status(uuid, public.lead_status, uuid, text)',
    'public.log_lead_activity(uuid, public.lead_activity_kind, text, uuid, text, integer, timestamptz, boolean)',
    'public.save_quote(jsonb, uuid)',
    'public.send_quote(uuid, jsonb, text, uuid)',
    'public.attach_quote_link(uuid, text)',
    'public.cancel_quote(uuid, uuid)',
    'public.record_quote_offline_payment(uuid, integer, text, text, uuid)',
    'public.sync_quote_with_booking()'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;

-- Seat counts are public (used by the package pages).
revoke execute on function public.package_departure_seats(uuid) from public;
grant execute on function public.package_departure_seats(uuid) to anon, authenticated, service_role;

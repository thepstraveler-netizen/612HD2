-- Phase 5: cabs. Catalog (places, vehicle categories and models, fare rules,
-- fixed-fare routes, local packages, add-ons, surcharges), fleet (drivers,
-- vehicles, documents) and trips with their status history.
--
-- Booking model
--   * A cab booking is a `bookings` row (service 'cab') with price lines in
--     `booking_items`, exactly like a hotel booking, plus one `trips` row
--     holding the ride itself. Payment, refunds, invoices and expiry reuse
--     the Phase 4 functions unchanged.
--   * Cabs are request-and-dispatch: there is no per-vehicle inventory to
--     lock. A paid booking becomes an "unassigned" trip on the dispatch
--     board, where staff assign a driver and vehicle (D-045).
--   * Trips are written only by the SECURITY DEFINER functions below, called
--     by trusted server code with the service role. Customers read their own
--     trip (including the pickup OTP they give the driver); the driver link
--     token is never readable through the API.

-- ---------------------------------------------------------------- types

create type public.cab_trip_type as enum ('one_way', 'round_trip', 'local', 'transfer', 'sightseeing');
create type public.cab_body_type as enum ('hatchback', 'sedan', 'compact_suv', 'suv', 'muv', 'tempo_traveller', 'bus');
create type public.fuel_type as enum ('petrol', 'diesel', 'cng', 'electric');
create type public.cab_place_kind as enum ('city', 'station', 'airport', 'temple', 'landmark');
create type public.trip_status as enum (
  'awaiting_payment', 'unassigned', 'assigned', 'en_route', 'arrived', 'picked_up', 'completed', 'cancelled', 'no_show'
);

-- Cab bookings add their own price line kinds.
alter table public.booking_items drop constraint if exists booking_items_kind_check;
alter table public.booking_items
  add constraint booking_items_kind_check
  check (kind in ('room', 'extra_guest', 'addon', 'fee', 'fare', 'allowance', 'surcharge'));

-- ---------------------------------------------------------------- catalog

-- Pickup and drop points offered in the cab search. Coordinates give the
-- fallback distance when no route row exists.
create table public.cab_places (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name         jsonb not null check (public.is_localized(name)),
  kind         public.cab_place_kind not null default 'city',
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  is_popular   boolean not null default false,
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.cab_categories (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique check (key ~ '^[a-z0-9-]+$'),
  name         jsonb not null check (public.is_localized(name)),
  description  jsonb check (description is null or public.is_localized(description)),
  body_type    public.cab_body_type not null,
  seats        smallint not null check (seats between 1 and 60),
  luggage      smallint not null default 2 check (luggage between 0 and 40),
  is_ac        boolean not null default true,
  image_id     uuid references public.media (id) on delete set null,
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.cab_models (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.cab_categories (id) on delete cascade,
  name         text not null check (char_length(name) between 2 and 80),
  fuel         public.fuel_type not null,
  -- The model shown as "Swift Dzire or similar" on the result card.
  is_featured  boolean not null default false,
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (category_id, name)
);
create index cab_models_category_idx on public.cab_models (category_id, sort_order);

-- Per-km pricing for outstation trips without a fixed route fare:
--   fare = max(min_km, km) × rate_per_km (one way)
--   fare = max(min_km_per_day × days, 2 × km) × rate_per_km (round trip)
-- plus driver allowance per day and a night charge for night pickups.
create table public.cab_fare_rules (
  id                              uuid primary key default gen_random_uuid(),
  category_id                     uuid not null references public.cab_categories (id) on delete cascade,
  trip_type                       public.cab_trip_type not null check (trip_type in ('one_way', 'round_trip')),
  rate_per_km_paise               integer not null check (rate_per_km_paise > 0),
  min_km                          integer not null default 0 check (min_km >= 0),
  min_km_per_day                  integer not null default 0 check (min_km_per_day >= 0),
  driver_allowance_per_day_paise  integer not null default 0 check (driver_allowance_per_day_paise >= 0),
  night_charge_paise              integer not null default 0 check (night_charge_paise >= 0),
  extra_km_paise                  integer not null check (extra_km_paise >= 0),
  tolls_included                  boolean not null default false,
  waiting_free_minutes            integer not null default 45 check (waiting_free_minutes >= 0),
  waiting_per_hour_paise          integer not null default 0 check (waiting_per_hour_paise >= 0),
  is_active                       boolean not null default true,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  unique (category_id, trip_type)
);

-- Routes with known distance and time. Transfers and sightseeing tours are
-- always fixed-fare; outstation routes may carry fixed fares that override
-- the per-km rule.
create table public.cab_routes (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9-]+$'),
  trip_type         public.cab_trip_type not null check (trip_type <> 'local'),
  from_place_id     uuid not null references public.cab_places (id) on delete restrict,
  to_place_id       uuid not null references public.cab_places (id) on delete restrict,
  -- Shown for tours ("Braj darshan day tour"); routes fall back to "From → To".
  name              jsonb check (name is null or public.is_localized(name)),
  description       jsonb check (description is null or public.is_localized(description)),
  -- Ordered stop names for tours, e.g. ["Mathura", "Gokul", "Govardhan"].
  stops             jsonb not null default '[]'::jsonb check (jsonb_typeof(stops) = 'array'),
  distance_km       numeric(7, 1) not null check (distance_km > 0),
  duration_minutes  integer not null check (duration_minutes > 0),
  is_popular        boolean not null default false,
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index cab_routes_lookup_idx on public.cab_routes (from_place_id, to_place_id, trip_type) where is_active;

create table public.cab_route_fares (
  route_id        uuid not null references public.cab_routes (id) on delete cascade,
  category_id     uuid not null references public.cab_categories (id) on delete cascade,
  fare_paise      integer not null check (fare_paise > 0),
  extra_km_paise  integer not null default 0 check (extra_km_paise >= 0),
  tolls_included  boolean not null default false,
  updated_at      timestamptz not null default now(),
  primary key (route_id, category_id)
);

-- Hourly hire inside a city: 4 hr / 40 km, 8 hr / 80 km, 12 hr / 120 km.
create table public.cab_local_packages (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key ~ '^[a-z0-9-]+$'),
  name        jsonb not null check (public.is_localized(name)),
  hours       smallint not null check (hours between 1 and 24),
  km          smallint not null check (km between 1 and 1000),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.cab_local_fares (
  package_id         uuid not null references public.cab_local_packages (id) on delete cascade,
  category_id        uuid not null references public.cab_categories (id) on delete cascade,
  fare_paise         integer not null check (fare_paise > 0),
  extra_km_paise     integer not null default 0 check (extra_km_paise >= 0),
  extra_hour_paise   integer not null default 0 check (extra_hour_paise >= 0),
  updated_at         timestamptz not null default now(),
  primary key (package_id, category_id)
);

create table public.cab_addons (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique check (key ~ '^[a-z0-9-]+$'),
  name          jsonb not null check (public.is_localized(name)),
  description   jsonb check (description is null or public.is_localized(description)),
  price_paise   integer not null check (price_paise >= 0),
  -- Empty = offered on every trip type / category.
  trip_types    public.cab_trip_type[] not null default '{}',
  category_ids  uuid[] not null default '{}',
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Peak pricing: a multiplier on the base fare (not on allowances or
-- add-ons) for pickups in a date window and/or on given weekdays. When
-- several match, the highest multiplier wins.
create table public.cab_surcharges (
  id              uuid primary key default gen_random_uuid(),
  name            jsonb not null check (public.is_localized(name)),
  multiplier_bps  integer not null check (multiplier_bps between 10000 and 30000),
  starts_on       date,
  ends_on         date,
  -- ISO weekdays, 1 = Monday … 7 = Sunday. Empty = every day.
  weekdays        smallint[] not null default '{}',
  trip_types      public.cab_trip_type[] not null default '{}',
  category_ids    uuid[] not null default '{}',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
);

-- ---------------------------------------------------------------- fleet

create table public.drivers (
  id              uuid primary key default gen_random_uuid(),
  -- Optional login (driver role); the trip link works without one.
  user_id         uuid unique references auth.users (id) on delete set null,
  vendor_id       uuid references public.vendors (id) on delete set null,
  full_name       text not null check (char_length(full_name) between 2 and 120),
  phone           text not null check (phone ~ '^\+?[0-9]{10,15}$'),
  alt_phone       text check (alt_phone is null or alt_phone ~ '^\+?[0-9]{10,15}$'),
  licence_no      text,
  licence_expiry  date,
  photo_id        uuid references public.media (id) on delete set null,
  languages       text[] not null default '{}',
  rating          numeric(2, 1) check (rating is null or rating between 1 and 5),
  is_active       boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index drivers_active_idx on public.drivers (is_active) where deleted_at is null;

create table public.vehicles (
  id                 uuid primary key default gen_random_uuid(),
  category_id        uuid not null references public.cab_categories (id) on delete restrict,
  model_id           uuid references public.cab_models (id) on delete set null,
  registration_no    text not null check (registration_no ~ '^[A-Z0-9 -]{6,15}$'),
  colour             text,
  year               smallint check (year between 1990 and 2100),
  fuel               public.fuel_type not null,
  vendor_id          uuid references public.vendors (id) on delete set null,
  default_driver_id  uuid references public.drivers (id) on delete set null,
  rc_expiry          date,
  insurance_expiry   date,
  permit_expiry      date,
  puc_expiry         date,
  fitness_expiry     date,
  is_active          boolean not null default true,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create index vehicles_category_idx on public.vehicles (category_id) where deleted_at is null;
-- A removed vehicle frees its number for re-registration.
create unique index vehicles_registration_key on public.vehicles (registration_no) where deleted_at is null;

-- Scans of licences, RCs, insurance etc. in the private `documents` bucket.
create table public.fleet_documents (
  id           uuid primary key default gen_random_uuid(),
  owner_type   text not null check (owner_type in ('driver', 'vehicle')),
  owner_id     uuid not null,
  kind         text not null check (kind in ('licence', 'rc', 'insurance', 'permit', 'puc', 'fitness', 'id_proof', 'other')),
  file_path    text not null,
  expires_on   date,
  uploaded_by  uuid,
  created_at   timestamptz not null default now()
);
create index fleet_documents_owner_idx on public.fleet_documents (owner_type, owner_id);

-- ---------------------------------------------------------------- trips

create table public.trips (
  id                       uuid primary key default gen_random_uuid(),
  booking_id               uuid not null unique references public.bookings (id) on delete cascade,
  trip_type                public.cab_trip_type not null,
  category_id              uuid not null references public.cab_categories (id) on delete restrict,
  route_id                 uuid references public.cab_routes (id) on delete set null,
  package_id               uuid references public.cab_local_packages (id) on delete set null,
  pickup_place_id          uuid not null references public.cab_places (id) on delete restrict,
  drop_place_id            uuid references public.cab_places (id) on delete restrict,
  pickup_address           text not null check (char_length(pickup_address) between 3 and 300),
  drop_address             text check (drop_address is null or char_length(drop_address) <= 300),
  stops                    jsonb not null default '[]'::jsonb check (jsonb_typeof(stops) = 'array'),
  pickup_at                timestamptz not null,
  return_at                timestamptz,
  passengers               smallint not null check (passengers >= 1),
  distance_km              numeric(7, 1),
  status                   public.trip_status not null default 'awaiting_payment',
  driver_id                uuid references public.drivers (id) on delete set null,
  vehicle_id               uuid references public.vehicles (id) on delete set null,
  -- Copied at assignment so the customer sees them without reading the fleet tables.
  driver_name              text,
  driver_phone             text,
  vehicle_label            text,
  vehicle_registration     text,
  assigned_at              timestamptz,
  started_at               timestamptz,
  picked_up_at             timestamptz,
  completed_at             timestamptz,
  -- The customer reads this to the driver at pickup.
  pickup_otp               text check (pickup_otp is null or pickup_otp ~ '^[0-9]{4}$'),
  -- Secret in the driver's trip link (/driver/trip/<token>); never exposed to the API.
  driver_token             text unique,
  driver_token_expires_at  timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (return_at is null or return_at > pickup_at)
);
create index trips_status_idx on public.trips (status, pickup_at);
create index trips_driver_idx on public.trips (driver_id, pickup_at);

create table public.trip_events (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  status      public.trip_status not null,
  note        text check (note is null or char_length(note) <= 500),
  actor       uuid,
  source      text not null check (source in ('admin', 'driver', 'system', 'customer')),
  created_at  timestamptz not null default now()
);
create index trip_events_trip_idx on public.trip_events (trip_id, created_at);

-- ---------------------------------------------------------------- triggers, RLS, audit

do $$
declare t text;
begin
  foreach t in array array['cab_places', 'cab_categories', 'cab_models', 'cab_fare_rules', 'cab_routes', 'cab_route_fares',
                           'cab_local_packages', 'cab_local_fares', 'cab_addons', 'cab_surcharges', 'drivers', 'vehicles', 'trips']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
  foreach t in array array['cab_places', 'cab_categories', 'cab_models', 'cab_fare_rules', 'cab_routes', 'cab_route_fares',
                           'cab_local_packages', 'cab_local_fares', 'cab_addons', 'cab_surcharges', 'drivers', 'vehicles',
                           'fleet_documents', 'trips', 'trip_events']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['cab_places', 'cab_categories', 'cab_models', 'cab_fare_rules', 'cab_routes',
                           'cab_local_packages', 'cab_addons', 'cab_surcharges', 'drivers', 'vehicles', 'fleet_documents', 'trips']
  loop
    perform public.enable_audit('public.' || t);
  end loop;
end
$$;
select public.enable_audit('public.cab_route_fares', array['route_id', 'category_id']);
select public.enable_audit('public.cab_local_fares', array['package_id', 'category_id']);

-- Catalog: active rows are public; cab staff see and manage everything.
do $$
declare t text;
begin
  foreach t in array array['cab_places', 'cab_categories', 'cab_models', 'cab_fare_rules', 'cab_routes',
                           'cab_local_packages', 'cab_addons', 'cab_surcharges']
  loop
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (is_active or public.has_permission(''cabs.read''))',
      'active ' || t || ' are public', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_permission(''cabs.write'')) with check (public.has_permission(''cabs.write''))',
      'cab managers manage ' || t, t);
  end loop;
  foreach t in array array['cab_route_fares', 'cab_local_fares']
  loop
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || ' are public', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_permission(''cabs.write'')) with check (public.has_permission(''cabs.write''))',
      'cab managers manage ' || t, t);
  end loop;
end
$$;

-- Cab editors upload category photos to the media bucket and register them.
create policy "cab editors upload media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.has_permission('cabs.write'));
create policy "cab editors register media" on public.media
  for insert to authenticated
  with check (public.has_permission('cabs.write'));

-- Fleet: cab staff; a driver with a login reads their own record.
create policy "cab staff and the driver read drivers" on public.drivers
  for select to authenticated
  using (public.has_permission('cabs.read') or user_id = (select auth.uid()));
create policy "cab managers manage drivers" on public.drivers
  for all to authenticated
  using (public.has_permission('cabs.write'))
  with check (public.has_permission('cabs.write'));
create policy "cab staff read vehicles" on public.vehicles
  for select to authenticated using (public.has_permission('cabs.read'));
create policy "cab managers manage vehicles" on public.vehicles
  for all to authenticated
  using (public.has_permission('cabs.write'))
  with check (public.has_permission('cabs.write'));
create policy "cab staff read fleet documents" on public.fleet_documents
  for select to authenticated using (public.has_permission('cabs.read'));
create policy "cab managers manage fleet documents" on public.fleet_documents
  for all to authenticated
  using (public.has_permission('cabs.write'))
  with check (public.has_permission('cabs.write'));

-- Trips follow their booking (owner, booking staff, vendor), plus cab staff
-- and the assigned driver's login. Nobody writes through the API.
create or replace function public.can_read_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trips t
    left join public.drivers d on d.id = t.driver_id
    where t.id = p_trip_id
      and (
        public.has_permission('cabs.read')
        or public.can_read_booking(t.booking_id)
        or (d.user_id is not null and d.user_id = (select auth.uid()))
      )
  );
$$;

create policy "trips follow the booking" on public.trips
  for select to authenticated using (public.can_read_trip(id));
create policy "trip events follow the trip" on public.trip_events
  for select to authenticated using (public.can_read_trip(trip_id));

-- The driver link token stays server-side.
revoke select on public.trips from anon, authenticated;
grant select (
  id, booking_id, trip_type, category_id, route_id, package_id, pickup_place_id, drop_place_id,
  pickup_address, drop_address, stops, pickup_at, return_at, passengers, distance_km, status,
  driver_id, vehicle_id, driver_name, driver_phone, vehicle_label, vehicle_registration,
  assigned_at, started_at, picked_up_at, completed_at, pickup_otp, created_at, updated_at
) on public.trips to authenticated;

-- ---------------------------------------------------------------- functions

/*
 * Reserves a coupon for a booking under a row lock, checking the active
 * flag, total and per-user limits and first-booking rule. Shared by the
 * cab booking (hotels keep their inline copy from Phase 4).
 */
create or replace function public.reserve_booking_coupon(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_coupon public.coupons;
  v_used integer;
  v_user_used integer;
  v_prior integer;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.coupon_id is null then return; end if;
  select * into v_coupon from public.coupons where id = v_booking.coupon_id for update;
  if v_coupon.id is null or not v_coupon.is_active then raise exception 'coupon_invalid' using errcode = 'P0001'; end if;
  select count(*) into v_used from public.coupon_redemptions where coupon_id = v_coupon.id and status <> 'released';
  if v_coupon.usage_limit is not null and v_used >= v_coupon.usage_limit then
    raise exception 'coupon_exhausted' using errcode = 'P0001';
  end if;
  select count(*) into v_user_used from public.coupon_redemptions
    where coupon_id = v_coupon.id and user_id = v_booking.user_id and status <> 'released';
  if v_user_used >= v_coupon.per_user_limit then raise exception 'coupon_used' using errcode = 'P0001'; end if;
  if v_coupon.first_booking_only then
    select count(*) into v_prior from public.bookings
      where user_id = v_booking.user_id and id <> v_booking.id
        and status in ('confirmed', 'completed', 'partially_refunded');
    if v_prior > 0 then raise exception 'coupon_first_booking' using errcode = 'P0001'; end if;
  end if;
  insert into public.coupon_redemptions (coupon_id, booking_id, user_id, discount_paise)
    values (v_coupon.id, v_booking.id, v_booking.user_id, v_booking.discount_paise);
end;
$$;

/*
 * Creates a cab booking with its price lines, the primary passenger, a
 * coupon reservation and the trip, in one transaction. The server has
 * already priced it from the catalog; totals are re-checked here.
 *   p_booking: bookings columns (code, user_id, contact_*, totals, payment_mode,
 *              coupon_id/code, price_breakdown, snapshot, locale, expires_at,
 *              check_in = pickup date, check_out = return date or null, adults = passengers)
 *   p_trip:    trips columns (trip_type, category_id, route_id, package_id,
 *              pickup/drop place and address, stops, pickup_at, return_at, passengers, distance_km)
 */
create or replace function public.create_cab_booking(p_booking jsonb, p_items jsonb, p_trip jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  perform public.set_actor(nullif(p_booking ->> 'user_id', '')::uuid);

  if not exists (select 1 from public.cab_categories where id = (p_trip ->> 'category_id')::uuid and is_active) then
    raise exception 'cab_unavailable' using errcode = 'P0001';
  end if;

  insert into public.bookings (
    code, user_id, service, status, check_in, check_out, adults,
    contact_name, contact_email, contact_phone, special_requests, gst_details,
    subtotal_paise, discount_paise, tax_paise, total_paise, payable_now_paise, payment_mode,
    coupon_id, coupon_code, price_breakdown, snapshot, locale, expires_at
  ) values (
    p_booking ->> 'code', (p_booking ->> 'user_id')::uuid, 'cab', 'pending_payment',
    (p_booking ->> 'check_in')::date, nullif(p_booking ->> 'check_out', '')::date,
    (p_booking ->> 'adults')::smallint,
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

  perform public.reserve_booking_coupon(v_booking.id);

  insert into public.trips (
    booking_id, trip_type, category_id, route_id, package_id, pickup_place_id, drop_place_id,
    pickup_address, drop_address, stops, pickup_at, return_at, passengers, distance_km, pickup_otp
  ) values (
    v_booking.id, (p_trip ->> 'trip_type')::public.cab_trip_type, (p_trip ->> 'category_id')::uuid,
    nullif(p_trip ->> 'route_id', '')::uuid, nullif(p_trip ->> 'package_id', '')::uuid,
    (p_trip ->> 'pickup_place_id')::uuid, nullif(p_trip ->> 'drop_place_id', '')::uuid,
    p_trip ->> 'pickup_address', nullif(p_trip ->> 'drop_address', ''),
    coalesce(p_trip -> 'stops', '[]'::jsonb), (p_trip ->> 'pickup_at')::timestamptz,
    nullif(p_trip ->> 'return_at', '')::timestamptz, (p_trip ->> 'passengers')::smallint,
    nullif(p_trip ->> 'distance_km', '')::numeric,
    lpad((floor(random() * 10000))::integer::text, 4, '0')
  );

  return jsonb_build_object('id', v_booking.id, 'code', v_booking.code, 'status', 'pending_payment');
end;
$$;

-- Keeps the trip in step with its booking: paid → on the dispatch board;
-- cancelled, failed, expired or refunded → cancelled.
create or replace function public.sync_trip_with_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_next public.trip_status;
begin
  if new.service <> 'cab' or new.status is not distinct from old.status then return null; end if;
  v_next := case
    when new.status = 'confirmed' then 'unassigned'
    when new.status in ('cancelled', 'failed', 'expired') then 'cancelled'
    when new.status = 'refunded' and old.status in ('cancelled', 'failed') then 'cancelled'
    else null
  end;
  if v_next = 'unassigned' then
    update public.trips set status = 'unassigned' where booking_id = new.id and status = 'awaiting_payment';
  elsif v_next = 'cancelled' then
    update public.trips set status = 'cancelled' where booking_id = new.id and status not in ('completed', 'cancelled');
  else
    return null;
  end if;
  if found then
    insert into public.trip_events (trip_id, status, actor, source, note)
    select id, v_next, nullif(current_setting('app.actor_id', true), '')::uuid, 'system', 'Booking ' || new.status
      from public.trips where booking_id = new.id;
  end if;
  return null;
end;
$$;

create trigger bookings_sync_trip after update of status on public.bookings
  for each row execute function public.sync_trip_with_booking();
-- A trigger function, never an API call.
revoke execute on function public.sync_trip_with_booking() from public, anon, authenticated;

/*
 * Assigns (or reassigns) a driver and vehicle. The vehicle may be of a
 * higher category than booked (an upgrade); it must be active, as must the
 * driver. Every assignment issues a fresh driver link, so a replaced driver's link stops working.
 */
create or replace function public.assign_trip(p_trip_id uuid, p_driver_id uuid, p_vehicle_id uuid, p_actor uuid)
returns public.trips
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_label text;
begin
  perform public.set_actor(p_actor);
  select * into v_trip from public.trips where id = p_trip_id for update;
  if v_trip.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_trip.status not in ('unassigned', 'assigned', 'en_route') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  select * into v_driver from public.drivers where id = p_driver_id and is_active and deleted_at is null;
  if v_driver.id is null then raise exception 'driver_unavailable' using errcode = 'P0001'; end if;
  select * into v_vehicle from public.vehicles where id = p_vehicle_id and is_active and deleted_at is null;
  if v_vehicle.id is null then raise exception 'vehicle_unavailable' using errcode = 'P0001'; end if;
  select coalesce(m.name, c.name ->> 'en') into v_label
    from public.cab_categories c left join public.cab_models m on m.id = v_vehicle.model_id
   where c.id = v_vehicle.category_id;

  update public.trips
     set driver_id = v_driver.id,
         vehicle_id = v_vehicle.id,
         driver_name = v_driver.full_name,
         driver_phone = v_driver.phone,
         vehicle_label = v_label,
         vehicle_registration = v_vehicle.registration_no,
         status = case when status = 'unassigned' then 'assigned'::public.trip_status else status end,
         assigned_at = now(),
         driver_token = encode(extensions.gen_random_bytes(24), 'hex'),
         driver_token_expires_at = greatest(coalesce(return_at, pickup_at), pickup_at) + interval '2 days'
   where id = p_trip_id
   returning * into v_trip;

  insert into public.trip_events (trip_id, status, actor, source, note)
    values (p_trip_id, v_trip.status, p_actor, 'admin', 'Assigned ' || v_driver.full_name || ' · ' || v_vehicle.registration_no);
  return v_trip;
end;
$$;

/*
 * Moves a trip along: assigned → en_route → arrived → picked_up → completed,
 * or arrived → no_show. Pickup needs the customer's OTP when the setting
 * `cabs.defaults.require_pickup_otp` is on (staff may skip it). Completing
 * the trip completes the booking.
 */
create or replace function public.set_trip_status(
  p_trip_id uuid, p_status public.trip_status, p_actor uuid, p_source text, p_note text default null, p_otp text default null
)
returns public.trips
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_allowed public.trip_status[];
  v_require_otp boolean;
begin
  perform public.set_actor(p_actor);
  select * into v_trip from public.trips where id = p_trip_id for update;
  if v_trip.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_source not in ('admin', 'driver', 'system') then raise exception 'invalid_source' using errcode = 'P0001'; end if;

  v_allowed := case v_trip.status
    when 'assigned' then array['en_route', 'arrived', 'picked_up']::public.trip_status[]
    when 'en_route' then array['arrived', 'picked_up']::public.trip_status[]
    when 'arrived' then array['picked_up', 'no_show']::public.trip_status[]
    when 'picked_up' then array['completed']::public.trip_status[]
    else array[]::public.trip_status[]
  end;
  if not (p_status = any (v_allowed)) then raise exception 'invalid_transition' using errcode = 'P0001'; end if;

  if p_status = 'picked_up' and p_source = 'driver' then
    select coalesce((value ->> 'require_pickup_otp')::boolean, true) into v_require_otp
      from public.settings where key = 'cabs.defaults';
    if coalesce(v_require_otp, true) and (p_otp is null or p_otp <> v_trip.pickup_otp) then
      raise exception 'otp_mismatch' using errcode = 'P0001';
    end if;
  end if;

  update public.trips
     set status = p_status,
         started_at = case when p_status = 'en_route' then now() else started_at end,
         picked_up_at = case when p_status = 'picked_up' then now() else picked_up_at end,
         completed_at = case when p_status = 'completed' then now() else completed_at end
   where id = p_trip_id
   returning * into v_trip;

  insert into public.trip_events (trip_id, status, actor, source, note)
    values (p_trip_id, p_status, p_actor, p_source, p_note);

  if p_status = 'completed' then
    update public.bookings set status = 'completed', completed_at = now()
     where id = v_trip.booking_id and status = 'confirmed';
  end if;
  return v_trip;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.reserve_booking_coupon(uuid)',
    'public.create_cab_booking(jsonb, jsonb, jsonb)',
    'public.assign_trip(uuid, uuid, uuid, uuid)',
    'public.set_trip_status(uuid, public.trip_status, uuid, text, text, text)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;

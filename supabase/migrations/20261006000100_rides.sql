-- Phase 6: local rides — bike, rickshaw / e-rickshaw and car pick & drop
-- inside Vrindavan, Mathura, Govardhan and Barsana.
--
-- Model
--   * Zones are circles (centre + radius) so no GIS extension is needed; a
--     pickup belongs to the nearest zone whose circle contains it. Fares are
--     tables per zone × vehicle type × mode (point to point, hourly).
--   * Pickup and drop are a landmark from `ride_points` or the customer's
--     current location, plus a typed address for the driver.
--   * A ride booking is a `bookings` row (service 'ride') plus one
--     `ride_requests` row, dispatched like cab trips. It can be paid online
--     or to the driver (payment_mode 'pay_at_hotel' = pay on service).
--   * Drivers are shared with cabs; vehicles gain an optional ride vehicle
--     type (a vehicle is a cab category or a ride type, never both).

-- ---------------------------------------------------------------- types

create type public.ride_mode as enum ('point_to_point', 'hourly');
create type public.ride_status as enum (
  'awaiting_payment', 'requested', 'assigned', 'en_route', 'arrived', 'picked_up', 'completed', 'cancelled', 'no_show'
);

-- ---------------------------------------------------------------- catalog

create table public.ride_vehicle_types (
  id               uuid primary key default gen_random_uuid(),
  key              text not null unique check (key ~ '^[a-z0-9-]+$'),
  -- Links the type to its service page (bike, rickshaw, car).
  service_slug     text not null references public.services (slug) on update cascade,
  name             jsonb not null check (public.is_localized(name)),
  description      jsonb check (description is null or public.is_localized(description)),
  icon             text not null default 'bike' check (icon ~ '^[a-z0-9-]+$'),
  seats            smallint not null check (seats between 1 and 12),
  -- Instant: confirmed at once and dispatched. Request: staff confirm first and may decline.
  instant_book     boolean not null default true,
  -- GST on the fare; non-AC contract carriage is often exempt (D-055).
  tax_bps          integer not null default 0 check (tax_bps between 0 and 2800),
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.ride_zones (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        jsonb not null check (public.is_localized(name)),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  radius_km   numeric(5, 1) not null check (radius_km > 0 and radius_km <= 100),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Landmarks offered as pickup and drop: temples, ghats, stations, markets.
create table public.ride_points (
  id          uuid primary key default gen_random_uuid(),
  zone_id     uuid not null references public.ride_zones (id) on delete cascade,
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        jsonb not null check (public.is_localized(name)),
  kind        text not null default 'landmark' check (kind in ('temple', 'ghat', 'station', 'market', 'hotel', 'landmark')),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  is_popular  boolean not null default false,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index ride_points_zone_idx on public.ride_points (zone_id, sort_order);

-- Point to point: max(min_fare, base + max(0, km − included_km) × per_km).
-- Hourly: hourly_rate × max(min_hours, hours), km_per_hour included, then extra km.
-- Waiting beyond the free minutes is charged by the driver at per_min_waiting.
create table public.ride_fare_rules (
  id                    uuid primary key default gen_random_uuid(),
  zone_id               uuid not null references public.ride_zones (id) on delete cascade,
  vehicle_type_id       uuid not null references public.ride_vehicle_types (id) on delete cascade,
  mode                  public.ride_mode not null,
  base_paise            integer not null default 0 check (base_paise >= 0),
  included_km           numeric(5, 1) not null default 0 check (included_km >= 0),
  per_km_paise          integer not null default 0 check (per_km_paise >= 0),
  min_fare_paise        integer not null default 0 check (min_fare_paise >= 0),
  hourly_rate_paise     integer not null default 0 check (hourly_rate_paise >= 0),
  min_hours             smallint not null default 1 check (min_hours between 1 and 24),
  km_per_hour           smallint not null default 10 check (km_per_hour >= 0),
  free_waiting_minutes  smallint not null default 5 check (free_waiting_minutes >= 0),
  per_min_waiting_paise integer not null default 0 check (per_min_waiting_paise >= 0),
  -- 10000 = no night surcharge; 12500 = +25% in the night window.
  night_bps             integer not null default 10000 check (night_bps between 10000 and 20000),
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (zone_id, vehicle_type_id, mode),
  check (mode <> 'hourly' or hourly_rate_paise > 0),
  check (mode <> 'point_to_point' or base_paise > 0 or per_km_paise > 0 or min_fare_paise > 0)
);

-- ---------------------------------------------------------------- fleet

alter table public.vehicles alter column category_id drop not null;
alter table public.vehicles add column ride_vehicle_type_id uuid references public.ride_vehicle_types (id) on delete restrict;
alter table public.vehicles add constraint vehicles_kind_check
  check ((category_id is null) <> (ride_vehicle_type_id is null));
-- Hand-pulled rickshaws often have no registration; a ride vehicle may skip it.
alter table public.vehicles alter column registration_no drop not null;
alter table public.vehicles add constraint vehicles_registration_required
  check (category_id is null or registration_no is not null);

-- ---------------------------------------------------------------- requests

create table public.ride_requests (
  id                       uuid primary key default gen_random_uuid(),
  booking_id               uuid not null unique references public.bookings (id) on delete cascade,
  vehicle_type_id          uuid not null references public.ride_vehicle_types (id) on delete restrict,
  zone_id                  uuid not null references public.ride_zones (id) on delete restrict,
  mode                     public.ride_mode not null,
  pickup_point_id          uuid references public.ride_points (id) on delete set null,
  pickup_lat               double precision not null,
  pickup_lng               double precision not null,
  pickup_address           text not null check (char_length(pickup_address) between 3 and 300),
  drop_point_id            uuid references public.ride_points (id) on delete set null,
  drop_lat                 double precision,
  drop_lng                 double precision,
  drop_address             text check (drop_address is null or char_length(drop_address) <= 300),
  hours                    smallint check (hours is null or hours between 1 and 24),
  pickup_at                timestamptz not null,
  passengers               smallint not null check (passengers >= 1),
  distance_km              numeric(6, 1),
  status                   public.ride_status not null default 'awaiting_payment',
  driver_id                uuid references public.drivers (id) on delete set null,
  vehicle_id               uuid references public.vehicles (id) on delete set null,
  driver_name              text,
  driver_phone             text,
  vehicle_label            text,
  vehicle_registration     text,
  assigned_at              timestamptz,
  started_at               timestamptz,
  picked_up_at             timestamptz,
  completed_at             timestamptz,
  pickup_otp               text check (pickup_otp is null or pickup_otp ~ '^[0-9]{4}$'),
  driver_token             text unique,
  driver_token_expires_at  timestamptz,
  rating                   smallint check (rating is null or rating between 1 and 5),
  rating_comment           text check (rating_comment is null or char_length(rating_comment) <= 500),
  rated_at                 timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check ((mode = 'hourly') = (hours is not null)),
  check (mode = 'hourly' or (drop_lat is not null and drop_lng is not null))
);
create index ride_requests_status_idx on public.ride_requests (status, pickup_at);
create index ride_requests_driver_idx on public.ride_requests (driver_id, pickup_at);

create table public.ride_events (
  id          uuid primary key default gen_random_uuid(),
  ride_id     uuid not null references public.ride_requests (id) on delete cascade,
  status      public.ride_status not null,
  note        text check (note is null or char_length(note) <= 500),
  actor       uuid,
  source      text not null check (source in ('admin', 'driver', 'system', 'customer')),
  created_at  timestamptz not null default now()
);
create index ride_events_ride_idx on public.ride_events (ride_id, created_at);

-- ---------------------------------------------------------------- triggers, RLS, audit

do $$
declare t text;
begin
  foreach t in array array['ride_vehicle_types', 'ride_zones', 'ride_points', 'ride_fare_rules', 'ride_requests']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
  foreach t in array array['ride_vehicle_types', 'ride_zones', 'ride_points', 'ride_fare_rules', 'ride_requests', 'ride_events']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['ride_vehicle_types', 'ride_zones', 'ride_points', 'ride_fare_rules', 'ride_requests']
  loop
    perform public.enable_audit('public.' || t);
  end loop;
  foreach t in array array['ride_vehicle_types', 'ride_zones', 'ride_points', 'ride_fare_rules']
  loop
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (is_active or public.has_permission(''rides.read''))',
      'active ' || t || ' are public', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_permission(''rides.write'')) with check (public.has_permission(''rides.write''))',
      'ride managers manage ' || t, t);
  end loop;
end
$$;

-- Ride staff see the fleet too (drivers and vehicles are shared with cabs).
create policy "ride staff read drivers" on public.drivers
  for select to authenticated using (public.has_permission('rides.read'));
create policy "ride managers manage drivers" on public.drivers
  for all to authenticated
  using (public.has_permission('rides.write'))
  with check (public.has_permission('rides.write'));
create policy "ride staff read vehicles" on public.vehicles
  for select to authenticated using (public.has_permission('rides.read'));
create policy "ride managers manage ride vehicles" on public.vehicles
  for all to authenticated
  using (public.has_permission('rides.write') and ride_vehicle_type_id is not null)
  with check (public.has_permission('rides.write') and ride_vehicle_type_id is not null);

create or replace function public.can_read_ride(p_ride_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ride_requests r
    left join public.drivers d on d.id = r.driver_id
    where r.id = p_ride_id
      and (
        public.has_permission('rides.read')
        or public.can_read_booking(r.booking_id)
        or (d.user_id is not null and d.user_id = (select auth.uid()))
      )
  );
$$;
revoke execute on function public.can_read_ride(uuid) from public, anon;

create policy "rides follow the booking" on public.ride_requests
  for select to authenticated using (public.can_read_ride(id));
create policy "ride events follow the ride" on public.ride_events
  for select to authenticated using (public.can_read_ride(ride_id));

-- The driver link token stays server-side.
revoke select on public.ride_requests from anon, authenticated;
grant select (
  id, booking_id, vehicle_type_id, zone_id, mode, pickup_point_id, pickup_lat, pickup_lng, pickup_address,
  drop_point_id, drop_lat, drop_lng, drop_address, hours, pickup_at, passengers, distance_km, status,
  driver_id, vehicle_id, driver_name, driver_phone, vehicle_label, vehicle_registration,
  assigned_at, started_at, picked_up_at, completed_at, pickup_otp, rating, rating_comment, rated_at,
  created_at, updated_at
) on public.ride_requests to authenticated;

-- ---------------------------------------------------------------- functions

/*
 * Creates a ride booking with its lines, coupon reservation and the ride
 * request in one transaction. Pay-to-driver rides are confirmed at once
 * (and go to the board); online ones wait for payment like cabs.
 *   p_booking: bookings columns (as create_cab_booking; payment_mode full or pay_at_hotel)
 *   p_ride:    ride_requests columns
 */
create or replace function public.create_ride_booking(p_booking jsonb, p_items jsonb, p_ride jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_pay_later boolean;
begin
  perform public.set_actor(nullif(p_booking ->> 'user_id', '')::uuid);

  if not exists (select 1 from public.ride_vehicle_types where id = (p_ride ->> 'vehicle_type_id')::uuid and is_active)
     or not exists (select 1 from public.ride_zones where id = (p_ride ->> 'zone_id')::uuid and is_active) then
    raise exception 'ride_unavailable' using errcode = 'P0001';
  end if;
  if p_booking ->> 'payment_mode' not in ('full', 'pay_at_hotel') then
    raise exception 'payment_mode' using errcode = 'P0001';
  end if;
  v_pay_later := p_booking ->> 'payment_mode' = 'pay_at_hotel';

  insert into public.bookings (
    code, user_id, service, status, check_in, adults,
    contact_name, contact_email, contact_phone, special_requests,
    subtotal_paise, discount_paise, tax_paise, total_paise, payable_now_paise, payment_mode,
    coupon_id, coupon_code, price_breakdown, snapshot, locale, expires_at
  ) values (
    p_booking ->> 'code', (p_booking ->> 'user_id')::uuid, 'ride', 'pending_payment',
    (p_booking ->> 'check_in')::date, (p_booking ->> 'adults')::smallint,
    p_booking ->> 'contact_name', nullif(p_booking ->> 'contact_email', ''), p_booking ->> 'contact_phone',
    nullif(p_booking ->> 'special_requests', ''),
    (p_booking ->> 'subtotal_paise')::integer, (p_booking ->> 'discount_paise')::integer,
    (p_booking ->> 'tax_paise')::integer, (p_booking ->> 'total_paise')::integer,
    case when v_pay_later then 0 else (p_booking ->> 'payable_now_paise')::integer end,
    (p_booking ->> 'payment_mode')::public.payment_mode,
    nullif(p_booking ->> 'coupon_id', '')::uuid, nullif(p_booking ->> 'coupon_code', ''),
    p_booking -> 'price_breakdown', coalesce(p_booking -> 'snapshot', '{}'::jsonb),
    coalesce(p_booking ->> 'locale', 'en'),
    case when v_pay_later then null else (p_booking ->> 'expires_at')::timestamptz end
  )
  returning * into v_booking;

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

  insert into public.ride_requests (
    booking_id, vehicle_type_id, zone_id, mode, pickup_point_id, pickup_lat, pickup_lng, pickup_address,
    drop_point_id, drop_lat, drop_lng, drop_address, hours, pickup_at, passengers, distance_km, pickup_otp
  ) values (
    v_booking.id, (p_ride ->> 'vehicle_type_id')::uuid, (p_ride ->> 'zone_id')::uuid,
    (p_ride ->> 'mode')::public.ride_mode, nullif(p_ride ->> 'pickup_point_id', '')::uuid,
    (p_ride ->> 'pickup_lat')::double precision, (p_ride ->> 'pickup_lng')::double precision, p_ride ->> 'pickup_address',
    nullif(p_ride ->> 'drop_point_id', '')::uuid, nullif(p_ride ->> 'drop_lat', '')::double precision,
    nullif(p_ride ->> 'drop_lng', '')::double precision, nullif(p_ride ->> 'drop_address', ''),
    nullif(p_ride ->> 'hours', '')::smallint, (p_ride ->> 'pickup_at')::timestamptz,
    (p_ride ->> 'passengers')::smallint, nullif(p_ride ->> 'distance_km', '')::numeric,
    lpad((floor(random() * 10000))::integer::text, 4, '0')
  );

  -- Pay the driver: confirmed now, on the board at once (the sync trigger moves the ride).
  if v_pay_later then
    update public.bookings set status = 'confirmed', confirmed_at = now() where id = v_booking.id;
    update public.coupon_redemptions set status = 'redeemed' where booking_id = v_booking.id;
  end if;

  return jsonb_build_object('id', v_booking.id, 'code', v_booking.code,
    'status', case when v_pay_later then 'confirmed' else 'pending_payment' end);
end;
$$;

-- Keeps the ride in step with its booking, like trips for cabs.
create or replace function public.sync_ride_with_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_next public.ride_status;
begin
  if new.service <> 'ride' or new.status is not distinct from old.status then return null; end if;
  v_next := case
    when new.status = 'confirmed' then 'requested'
    when new.status in ('cancelled', 'failed', 'expired') then 'cancelled'
    when new.status = 'refunded' and old.status in ('cancelled', 'failed') then 'cancelled'
    else null
  end;
  if v_next = 'requested' then
    update public.ride_requests set status = 'requested' where booking_id = new.id and status = 'awaiting_payment';
  elsif v_next = 'cancelled' then
    update public.ride_requests set status = 'cancelled' where booking_id = new.id and status not in ('completed', 'cancelled');
  else
    return null;
  end if;
  if found then
    insert into public.ride_events (ride_id, status, actor, source, note)
    select id, v_next, nullif(current_setting('app.actor_id', true), '')::uuid, 'system', 'Booking ' || new.status
      from public.ride_requests where booking_id = new.id;
  end if;
  return null;
end;
$$;

create trigger bookings_sync_ride after update of status on public.bookings
  for each row execute function public.sync_ride_with_booking();
revoke execute on function public.sync_ride_with_booking() from public, anon, authenticated;

/*
 * Assigns (or reassigns) a driver, with an optional vehicle of a ride type.
 * Every assignment issues a fresh driver link (valid a day past pickup).
 */
create or replace function public.assign_ride(p_ride_id uuid, p_driver_id uuid, p_vehicle_id uuid, p_actor uuid)
returns public.ride_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ride public.ride_requests;
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_label text;
begin
  perform public.set_actor(p_actor);
  select * into v_ride from public.ride_requests where id = p_ride_id for update;
  if v_ride.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_ride.status not in ('requested', 'assigned', 'en_route') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  select * into v_driver from public.drivers where id = p_driver_id and is_active and deleted_at is null;
  if v_driver.id is null then raise exception 'driver_unavailable' using errcode = 'P0001'; end if;
  if p_vehicle_id is not null then
    select * into v_vehicle from public.vehicles
     where id = p_vehicle_id and is_active and deleted_at is null and ride_vehicle_type_id is not null;
    if v_vehicle.id is null then raise exception 'vehicle_unavailable' using errcode = 'P0001'; end if;
    select name ->> 'en' into v_label from public.ride_vehicle_types where id = v_vehicle.ride_vehicle_type_id;
  else
    select name ->> 'en' into v_label from public.ride_vehicle_types where id = v_ride.vehicle_type_id;
  end if;

  update public.ride_requests
     set driver_id = v_driver.id,
         vehicle_id = v_vehicle.id,
         driver_name = v_driver.full_name,
         driver_phone = v_driver.phone,
         vehicle_label = v_label,
         vehicle_registration = v_vehicle.registration_no,
         status = case when status = 'requested' then 'assigned'::public.ride_status else status end,
         assigned_at = now(),
         driver_token = encode(extensions.gen_random_bytes(24), 'hex'),
         driver_token_expires_at = pickup_at + interval '1 day'
   where id = p_ride_id
   returning * into v_ride;

  insert into public.ride_events (ride_id, status, actor, source, note)
    values (p_ride_id, v_ride.status, p_actor, 'admin', 'Assigned ' || v_driver.full_name);
  return v_ride;
end;
$$;

/*
 * Moves a ride along: assigned → en_route → arrived → picked_up → completed,
 * or arrived → no_show. A driver needs the customer's OTP at pickup when
 * `rides.defaults.require_pickup_otp` is on. Completing the ride completes
 * the booking.
 */
create or replace function public.set_ride_status(
  p_ride_id uuid, p_status public.ride_status, p_actor uuid, p_source text, p_note text default null, p_otp text default null
)
returns public.ride_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ride public.ride_requests;
  v_allowed public.ride_status[];
  v_require_otp boolean;
begin
  perform public.set_actor(p_actor);
  select * into v_ride from public.ride_requests where id = p_ride_id for update;
  if v_ride.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_source not in ('admin', 'driver', 'system') then raise exception 'invalid_source' using errcode = 'P0001'; end if;

  v_allowed := case v_ride.status
    when 'assigned' then array['en_route', 'arrived', 'picked_up']::public.ride_status[]
    when 'en_route' then array['arrived', 'picked_up']::public.ride_status[]
    when 'arrived' then array['picked_up', 'no_show']::public.ride_status[]
    when 'picked_up' then array['completed']::public.ride_status[]
    else array[]::public.ride_status[]
  end;
  if not (p_status = any (v_allowed)) then raise exception 'invalid_transition' using errcode = 'P0001'; end if;

  if p_status = 'picked_up' and p_source = 'driver' then
    select coalesce((value ->> 'require_pickup_otp')::boolean, true) into v_require_otp
      from public.settings where key = 'rides.defaults';
    if coalesce(v_require_otp, true) and (p_otp is null or p_otp <> v_ride.pickup_otp) then
      raise exception 'otp_mismatch' using errcode = 'P0001';
    end if;
  end if;

  update public.ride_requests
     set status = p_status,
         started_at = case when p_status = 'en_route' then now() else started_at end,
         picked_up_at = case when p_status = 'picked_up' then now() else picked_up_at end,
         completed_at = case when p_status = 'completed' then now() else completed_at end
   where id = p_ride_id
   returning * into v_ride;

  insert into public.ride_events (ride_id, status, actor, source, note)
    values (p_ride_id, p_status, p_actor, p_source, p_note);

  if p_status = 'completed' then
    update public.bookings set status = 'completed', completed_at = now()
     where id = v_ride.booking_id and status = 'confirmed';
  end if;
  return v_ride;
end;
$$;

-- The customer rates a completed ride once (1–5, optional comment).
create or replace function public.rate_ride(p_ride_id uuid, p_user uuid, p_rating smallint, p_comment text)
returns public.ride_requests
language plpgsql
security definer
set search_path = ''
as $$
declare v_ride public.ride_requests;
begin
  perform public.set_actor(p_user);
  select r.* into v_ride from public.ride_requests r join public.bookings b on b.id = r.booking_id
   where r.id = p_ride_id and b.user_id = p_user for update of r;
  if v_ride.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_ride.status <> 'completed' or v_ride.rated_at is not null then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  update public.ride_requests
     set rating = p_rating, rating_comment = nullif(trim(p_comment), ''), rated_at = now()
   where id = p_ride_id
   returning * into v_ride;
  insert into public.ride_events (ride_id, status, actor, source, note)
    values (p_ride_id, 'completed', p_user, 'customer', 'Rated ' || p_rating || '/5');
  return v_ride;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.create_ride_booking(jsonb, jsonb, jsonb)',
    'public.assign_ride(uuid, uuid, uuid, uuid)',
    'public.set_ride_status(uuid, public.ride_status, uuid, text, text, text)',
    'public.rate_ride(uuid, uuid, smallint, text)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;

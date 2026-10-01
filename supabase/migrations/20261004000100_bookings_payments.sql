-- Phase 4: bookings, payments, coupons, refunds, invoices and notifications.
--
-- Trust model
--   * Customers never write these tables directly (no insert/update policies
--     for anon/authenticated). The Next.js server recomputes every price,
--     checks the caller, then calls the SECURITY DEFINER functions below with
--     the service-role key. Those functions are the only writers, run in one
--     transaction each, and are not executable by anon/authenticated.
--   * Staff actions pass `p_actor`; the functions put it in `app.actor_id` so
--     the audit trigger records who did it even though the service role wrote.
--   * Razorpay's webhook is the source of truth for payments; the browser
--     callback only speeds things up. Both go through `record_payment`, which
--     is idempotent on the provider payment id; webhook deliveries are also
--     de-duplicated on the event id in `payment_events`.
--
-- Inventory model
--   * `hotel_inventory.held_units` counts units held by unpaid bookings;
--     `sold_units` counts confirmed ones. Availability = units - sold - held.
--   * Each hold is an `inventory_locks` row with a TTL. `reserve_hotel_inventory`
--     takes row locks on every night (in date order, so concurrent bookings
--     queue instead of deadlocking) and re-derives `held_units` from live
--     locks, so an expired hold frees its room at once even before the
--     cleanup job runs. Double booking is impossible because the check and
--     the hold happen under the same row lock.
-- Money is integer paise everywhere.

-- ---------------------------------------------------------------- types

create type public.booking_status as enum (
  'draft', 'pending_payment', 'confirmed', 'completed', 'cancelled',
  'refunded', 'partially_refunded', 'failed', 'expired'
);
create type public.booking_service as enum ('hotel', 'cab', 'ride', 'food', 'medicine', 'package', 'travel');
create type public.payment_mode as enum ('full', 'part', 'pay_at_hotel');
create type public.payment_provider as enum ('razorpay', 'offline');
create type public.payment_status as enum ('created', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded');
create type public.refund_status as enum ('pending', 'processed', 'failed');
create type public.lock_status as enum ('held', 'converted', 'released');
create type public.coupon_discount as enum ('percent', 'flat');
create type public.notification_channel as enum ('email', 'sms', 'whatsapp');
create type public.notification_status as enum ('sent', 'failed', 'skipped');

alter table public.hotel_inventory
  add column if not exists held_units smallint not null default 0 check (held_units >= 0);

-- ---------------------------------------------------------------- coupons

create table public.coupons (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique check (code ~ '^[A-Z0-9_-]{3,24}$'),
  description         jsonb check (description is null or public.is_localized(description)),
  discount_type       public.coupon_discount not null,
  -- percent: basis points (1000 = 10%); flat: paise.
  value               integer not null check (value > 0),
  max_discount_paise  integer check (max_discount_paise > 0),
  min_order_paise     integer not null default 0 check (min_order_paise >= 0),
  -- Empty = every service / every hotel.
  services            public.booking_service[] not null default '{}',
  hotel_ids           uuid[] not null default '{}',
  starts_at           timestamptz,
  ends_at             timestamptz,
  usage_limit         integer check (usage_limit > 0),
  per_user_limit      integer not null default 1 check (per_user_limit > 0),
  first_booking_only  boolean not null default false,
  -- Public coupons are suggested on the review-booking page.
  is_public           boolean not null default false,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (discount_type <> 'percent' or value <= 10000),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

-- ---------------------------------------------------------------- bookings

create table public.bookings (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique check (code ~ '^[A-Z0-9]{6,16}$'),
  user_id              uuid references auth.users (id) on delete set null,
  service              public.booking_service not null,
  status               public.booking_status not null default 'draft',
  -- Hotel stays (other services add their own columns in later phases).
  hotel_id             uuid references public.hotels (id) on delete restrict,
  -- Copied from the hotel at booking time so vendor access survives reassignment.
  vendor_id            uuid references public.vendors (id) on delete set null,
  check_in             date,
  check_out            date,
  rooms                smallint check (rooms >= 1),
  adults               smallint check (adults >= 1),
  children             smallint not null default 0 check (children >= 0),
  contact_name         text not null check (char_length(contact_name) between 2 and 120),
  contact_email        extensions.citext,
  contact_phone        text not null check (contact_phone ~ '^\+?[0-9]{10,15}$'),
  special_requests     text check (char_length(special_requests) <= 1000),
  -- Optional business GST details for the invoice: { gstin, company, address }.
  gst_details          jsonb check (gst_details is null or jsonb_typeof(gst_details) = 'object'),
  subtotal_paise       integer not null check (subtotal_paise >= 0),
  discount_paise       integer not null default 0 check (discount_paise >= 0),
  tax_paise            integer not null check (tax_paise >= 0),
  total_paise          integer not null check (total_paise >= 0),
  payable_now_paise    integer not null check (payable_now_paise >= 0),
  paid_paise           integer not null default 0 check (paid_paise >= 0),
  refunded_paise       integer not null default 0 check (refunded_paise >= 0),
  payment_mode         public.payment_mode not null,
  coupon_id            uuid references public.coupons (id) on delete set null,
  coupon_code          text,
  -- Server-computed price lines and the hotel/room/plan/policy snapshot the
  -- customer agreed to; later catalog edits never change a booking.
  price_breakdown      jsonb not null check (jsonb_typeof(price_breakdown) = 'object'),
  snapshot             jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  locale               text not null default 'en' check (locale in ('en', 'hi')),
  -- Unpaid bookings stop holding rooms after this.
  expires_at           timestamptz,
  confirmed_at         timestamptz,
  completed_at         timestamptz,
  cancelled_at         timestamptz,
  cancelled_by         uuid,
  cancel_reason        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (total_paise = subtotal_paise - discount_paise + tax_paise),
  check (discount_paise <= subtotal_paise),
  check (payable_now_paise <= total_paise),
  check (refunded_paise <= paid_paise),
  check (service <> 'hotel' or (hotel_id is not null and check_in is not null and check_out > check_in and rooms is not null and adults is not null))
);
create index bookings_user_idx on public.bookings (user_id, created_at desc);
create index bookings_status_idx on public.bookings (status, created_at desc);
create index bookings_hotel_idx on public.bookings (hotel_id, check_in);
create index bookings_vendor_idx on public.bookings (vendor_id);
create index bookings_expiry_idx on public.bookings (expires_at) where status in ('draft', 'pending_payment');

create table public.booking_items (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references public.bookings (id) on delete cascade,
  kind            text not null check (kind in ('room', 'extra_guest', 'addon', 'fee')),
  -- Stable key of the line (e.g. "room:<plan>:<date>:<n>", "addon:breakfast").
  line_key        text not null,
  description     text not null,
  service_date    date,
  room_id         uuid references public.hotel_rooms (id) on delete set null,
  rate_plan_id    uuid references public.hotel_rate_plans (id) on delete set null,
  quantity        integer not null default 1 check (quantity >= 1),
  amount_paise    integer not null check (amount_paise >= 0),
  discount_paise  integer not null default 0 check (discount_paise >= 0 and discount_paise <= amount_paise),
  tax_rate_bps    integer not null check (tax_rate_bps between 0 and 10000),
  tax_paise       integer not null check (tax_paise >= 0),
  sac             text,
  sort_order      integer not null default 0,
  unique (booking_id, line_key)
);
create index booking_items_booking_idx on public.booking_items (booking_id, sort_order);

create table public.booking_guests (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  full_name   text not null check (char_length(full_name) between 2 and 120),
  is_child    boolean not null default false,
  is_primary  boolean not null default false,
  sort_order  integer not null default 0
);
create index booking_guests_booking_idx on public.booking_guests (booking_id, sort_order);

create table public.inventory_locks (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  room_id     uuid not null references public.hotel_rooms (id) on delete cascade,
  date        date not null,
  units       smallint not null check (units >= 1),
  status      public.lock_status not null default 'held',
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (booking_id, room_id, date)
);
create index inventory_locks_live_idx on public.inventory_locks (room_id, date) where status = 'held';
create index inventory_locks_expiry_idx on public.inventory_locks (expires_at) where status = 'held';

create table public.coupon_redemptions (
  id              uuid primary key default gen_random_uuid(),
  coupon_id       uuid not null references public.coupons (id) on delete cascade,
  booking_id      uuid not null unique references public.bookings (id) on delete cascade,
  user_id         uuid,
  discount_paise  integer not null check (discount_paise >= 0),
  -- reserved while the booking is unpaid; released if it never confirms.
  status          text not null default 'reserved' check (status in ('reserved', 'redeemed', 'released')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id, status);
create index coupon_redemptions_user_idx on public.coupon_redemptions (user_id, coupon_id);

-- ---------------------------------------------------------------- payments

create table public.payments (
  id                    uuid primary key default gen_random_uuid(),
  booking_id            uuid not null references public.bookings (id) on delete restrict,
  provider              public.payment_provider not null,
  provider_order_id     text,
  provider_payment_id   text,
  payment_link_id       text unique,
  payment_link_url      text,
  amount_paise          integer not null check (amount_paise > 0),
  status                public.payment_status not null default 'created',
  method                text,
  reference             text,
  error_code            text,
  error_description     text,
  raw                   jsonb,
  recorded_by           uuid,
  captured_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create unique index payments_order_idx on public.payments (provider, provider_order_id) where provider_order_id is not null;
create index payments_booking_idx on public.payments (booking_id, created_at);

create table public.payment_events (
  id               uuid primary key default gen_random_uuid(),
  provider         public.payment_provider not null default 'razorpay',
  event_id         text not null,
  event_type       text not null,
  payload          jsonb not null,
  booking_id       uuid references public.bookings (id) on delete set null,
  processed_at     timestamptz,
  result           text,
  error            text,
  received_at      timestamptz not null default now(),
  unique (provider, event_id)
);
create index payment_events_received_idx on public.payment_events (received_at desc);

create table public.refunds (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references public.bookings (id) on delete restrict,
  payment_id          uuid not null references public.payments (id) on delete restrict,
  provider_refund_id  text unique,
  amount_paise        integer not null check (amount_paise > 0),
  status              public.refund_status not null default 'pending',
  reason              text,
  initiated_by        uuid,
  raw                 jsonb,
  processed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index refunds_booking_idx on public.refunds (booking_id);

-- ---------------------------------------------------------------- invoices

create table public.invoice_counters (
  financial_year  text primary key check (financial_year ~ '^[0-9]{2}-[0-9]{2}$'),
  last_number     integer not null default 0
);

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null unique references public.bookings (id) on delete restrict,
  number          text not null unique,
  financial_year  text not null,
  issued_at       timestamptz not null default now(),
  -- Seller (business settings) and buyer details frozen at issue time.
  seller          jsonb not null,
  buyer           jsonb not null,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------- notifications

create table public.notification_templates (
  id          uuid primary key default gen_random_uuid(),
  key         text not null check (key ~ '^[a-z0-9_.]+$'),
  channel     public.notification_channel not null,
  locale      text not null default 'en' check (locale in ('en', 'hi')),
  -- {{placeholders}} are filled from the booking; subject is email-only.
  subject     text,
  body        text not null check (char_length(body) between 1 and 5000),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (key, channel, locale)
);

create table public.notification_logs (
  id                   uuid primary key default gen_random_uuid(),
  template_key         text not null,
  channel              public.notification_channel not null,
  recipient            text,
  booking_id           uuid references public.bookings (id) on delete set null,
  user_id              uuid,
  status               public.notification_status not null,
  provider             text,
  provider_message_id  text,
  error                text,
  created_at           timestamptz not null default now()
);
create index notification_logs_booking_idx on public.notification_logs (booking_id, created_at);
create index notification_logs_created_idx on public.notification_logs (created_at desc);

-- ---------------------------------------------------------------- triggers

do $$
declare t text;
begin
  foreach t in array array['coupons', 'bookings', 'inventory_locks', 'coupon_redemptions', 'payments', 'refunds', 'notification_templates']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
  foreach t in array array['coupons', 'bookings', 'booking_items', 'booking_guests', 'inventory_locks', 'coupon_redemptions',
                           'payments', 'payment_events', 'refunds', 'invoice_counters', 'invoices', 'notification_templates', 'notification_logs']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;

-- The audit trigger also accepts an actor named by trusted server code
-- (`app.actor_id`), for staff actions that write through the service role.
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old       jsonb;
  v_new       jsonb;
  v_row       jsonb;
  v_record_id text;
  v_changed   text[];
  v_headers   jsonb;
  v_ip        inet;
  v_claims    jsonb;
  v_actor     uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);

  select string_agg(v_row ->> col, ':')
    into v_record_id
    from unnest(case when tg_nargs > 0 then tg_argv else array['id'] end) as col;

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key)
      into v_changed
      from jsonb_each(v_new) as n
     where n.value is distinct from (v_old -> n.key);
    if v_changed is null or v_changed = array['updated_at'] then
      return null;
    end if;
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    v_claims  := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    v_ip := nullif(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', ''), ',', 1)), '')::inet;
  exception when others then
    v_ip := null;
  end;

  begin
    v_actor := coalesce(nullif(v_claims ->> 'sub', '')::uuid, nullif(current_setting('app.actor_id', true), '')::uuid);
  exception when others then
    v_actor := null;
  end;

  insert into public.audit_logs
    (actor_id, actor_role, action, table_name, record_id, old_data, new_data, changed_fields, ip, user_agent)
  values (
    v_actor,
    coalesce(v_claims ->> 'role', session_user::text),
    tg_op,
    tg_table_name,
    v_record_id,
    v_old,
    v_new,
    v_changed,
    v_ip,
    left(v_headers ->> 'user-agent', 512)
  );

  return null;
end;
$$;

select public.enable_audit('public.coupons');
select public.enable_audit('public.bookings');
select public.enable_audit('public.payments');
select public.enable_audit('public.refunds');
select public.enable_audit('public.invoices');
select public.enable_audit('public.notification_templates');

-- ---------------------------------------------------------------- RLS

create or replace function public.can_read_booking(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bookings b
    where b.id = p_booking_id
      and (
        b.user_id = (select auth.uid())
        or public.has_permission('bookings.read')
        or public.is_vendor_member(b.vendor_id)
      )
  );
$$;

create policy "customers, staff and the hotel read bookings" on public.bookings
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_permission('bookings.read')
    or public.is_vendor_member(vendor_id)
  );
create policy "booking items follow the booking" on public.booking_items
  for select to authenticated using (public.can_read_booking(booking_id));
create policy "booking guests follow the booking" on public.booking_guests
  for select to authenticated using (public.can_read_booking(booking_id));

create policy "customers and payment staff read payments" on public.payments
  for select to authenticated
  using (
    public.has_permission('payments.read')
    or exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = (select auth.uid()))
  );
create policy "customers and payment staff read refunds" on public.refunds
  for select to authenticated
  using (
    public.has_permission('payments.read')
    or exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = (select auth.uid()))
  );
create policy "payment staff read webhook events" on public.payment_events
  for select to authenticated using (public.has_permission('payments.read'));

create policy "invoices follow the booking" on public.invoices
  for select to authenticated
  using (public.has_permission('payments.read') or public.can_read_booking(booking_id));

create policy "staff read inventory locks" on public.inventory_locks
  for select to authenticated using (public.has_permission('bookings.read') or public.has_permission('hotels.read'));

-- Public coupons are visible during their window; the rest only to staff.
create policy "public coupons are visible" on public.coupons
  for select to anon, authenticated
  using (
    (is_public and is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
    or public.has_permission('offers.read')
  );
create policy "offer managers manage coupons" on public.coupons
  for all to authenticated
  using (public.has_permission('offers.write'))
  with check (public.has_permission('offers.write'));
create policy "customers and offer staff read redemptions" on public.coupon_redemptions
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('offers.read'));

create policy "notification staff read templates" on public.notification_templates
  for select to authenticated using (public.has_permission('notifications.read'));
create policy "notification managers manage templates" on public.notification_templates
  for all to authenticated
  using (public.has_permission('notifications.write'))
  with check (public.has_permission('notifications.write'));
create policy "notification staff read logs" on public.notification_logs
  for select to authenticated
  using (public.has_permission('notifications.read') or public.can_read_booking(booking_id));

-- No insert/update/delete policies: only the functions below (service role) write.

-- ---------------------------------------------------------------- functions

-- Re-derives held_units for the given room-nights from live (unexpired) holds.
create or replace function public.refresh_held_units(p_room_id uuid, p_dates date[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.hotel_inventory i
     set held_units = coalesce((
           select sum(l.units)::smallint from public.inventory_locks l
            where l.room_id = i.room_id and l.date = i.date
              and l.status = 'held' and l.expires_at > now()
         ), 0)
   where i.room_id = p_room_id and i.date = any (p_dates);
$$;

/*
 * Holds `p_units` of a room for every night in [p_check_in, p_check_out)
 * for a booking until `p_expires_at`. Raises 'sold_out' / 'closed' when
 * any night cannot take the units. Rows are locked in date order.
 */
create or replace function public.reserve_hotel_inventory(
  p_booking_id uuid, p_room_id uuid, p_check_in date, p_check_out date, p_units integer, p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dates date[];
  v_total smallint;
  r record;
begin
  select total_units into v_total from public.hotel_rooms where id = p_room_id and is_active;
  if v_total is null then raise exception 'room_inactive' using errcode = 'P0001'; end if;

  select array_agg(d::date order by d) into v_dates
    from generate_series(p_check_in, p_check_out - 1, interval '1 day') as d;

  insert into public.hotel_inventory (room_id, date)
    select p_room_id, d from unnest(v_dates) as d
  on conflict do nothing;

  perform 1 from public.hotel_inventory
    where room_id = p_room_id and date = any (v_dates)
    order by date
    for update;

  perform public.refresh_held_units(p_room_id, v_dates);

  for r in
    select i.date, i.is_closed, coalesce(i.units, v_total) - i.sold_units - i.held_units as free
      from public.hotel_inventory i
     where i.room_id = p_room_id and i.date = any (v_dates)
     order by i.date
  loop
    if r.is_closed then raise exception 'closed' using errcode = 'P0001'; end if;
    if r.free < p_units then raise exception 'sold_out' using errcode = 'P0001'; end if;
  end loop;

  insert into public.inventory_locks (booking_id, room_id, date, units, expires_at)
    select p_booking_id, p_room_id, d, p_units, p_expires_at from unnest(v_dates) as d;

  update public.hotel_inventory
     set held_units = held_units + p_units
   where room_id = p_room_id and date = any (v_dates);
end;
$$;

/*
 * Turns a booking's holds into sold units. Works on expired holds too (a
 * late payment) as long as the room is still free; returns false when it
 * is not, so the caller can refund.
 */
create or replace function public.confirm_booking_inventory(p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid;
  v_dates date[];
  v_total smallint;
  r record;
begin
  for v_room in select distinct room_id from public.inventory_locks where booking_id = p_booking_id and status = 'held' loop
    select array_agg(date order by date) into v_dates
      from public.inventory_locks where booking_id = p_booking_id and room_id = v_room and status = 'held';
    select total_units into v_total from public.hotel_rooms where id = v_room;

    perform 1 from public.hotel_inventory where room_id = v_room and date = any (v_dates) order by date for update;
    perform public.refresh_held_units(v_room, v_dates);

    -- Free units for this booking = everything not sold and not held by someone else.
    for r in
      select i.date,
             coalesce(i.units, v_total) - i.sold_units - (i.held_units - (
               case when l.expires_at > now() then l.units else 0 end
             )) as free,
             l.units as wanted
        from public.hotel_inventory i
        join public.inventory_locks l on l.room_id = i.room_id and l.date = i.date
       where l.booking_id = p_booking_id and l.room_id = v_room and l.status = 'held'
    loop
      if r.free < r.wanted then return false; end if;
    end loop;
  end loop;

  for v_room in select distinct room_id from public.inventory_locks where booking_id = p_booking_id and status = 'held' loop
    update public.hotel_inventory i
       set sold_units = i.sold_units + l.units
      from public.inventory_locks l
     where l.booking_id = p_booking_id and l.room_id = v_room and l.status = 'held'
       and i.room_id = l.room_id and i.date = l.date;
    update public.inventory_locks set status = 'converted' where booking_id = p_booking_id and room_id = v_room and status = 'held';
    select array_agg(date) into v_dates from public.inventory_locks where booking_id = p_booking_id and room_id = v_room;
    perform public.refresh_held_units(v_room, v_dates);
  end loop;
  return true;
end;
$$;

-- Releases a booking's holds and gives back sold units for nights not yet passed.
create or replace function public.release_booking_inventory(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid;
  v_dates date[];
begin
  for v_room in select distinct room_id from public.inventory_locks where booking_id = p_booking_id and status <> 'released' loop
    select array_agg(date order by date) into v_dates
      from public.inventory_locks where booking_id = p_booking_id and room_id = v_room and status <> 'released';
    perform 1 from public.hotel_inventory where room_id = v_room and date = any (v_dates) order by date for update;
    update public.hotel_inventory i
       set sold_units = greatest(0, i.sold_units - l.units)
      from public.inventory_locks l
     where l.booking_id = p_booking_id and l.room_id = v_room and l.status = 'converted'
       and i.room_id = l.room_id and i.date = l.date;
    update public.inventory_locks set status = 'released'
     where booking_id = p_booking_id and room_id = v_room and status <> 'released';
    perform public.refresh_held_units(v_room, v_dates);
  end loop;
end;
$$;

create or replace function public.set_actor(p_actor uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select set_config('app.actor_id', coalesce(p_actor::text, ''), true);
$$;

/*
 * Creates a hotel booking with its lines, guests, coupon reservation and
 * inventory holds in one transaction. The caller (server code) has already
 * recomputed the price; this function re-checks inventory and coupon limits
 * under locks. Pay-at-hotel bookings confirm immediately.
 */
create or replace function public.create_hotel_booking(p_booking jsonb, p_items jsonb, p_guests jsonb)
returns jsonb
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
  v_confirmed boolean;
begin
  perform public.set_actor(nullif(p_booking ->> 'user_id', '')::uuid);

  insert into public.bookings (
    code, user_id, service, status, hotel_id, vendor_id, check_in, check_out, rooms, adults, children,
    contact_name, contact_email, contact_phone, special_requests, gst_details,
    subtotal_paise, discount_paise, tax_paise, total_paise, payable_now_paise, payment_mode,
    coupon_id, coupon_code, price_breakdown, snapshot, locale, expires_at
  )
  select
    p_booking ->> 'code', (p_booking ->> 'user_id')::uuid, 'hotel', 'pending_payment',
    h.id, h.vendor_id, (p_booking ->> 'check_in')::date, (p_booking ->> 'check_out')::date,
    (p_booking ->> 'rooms')::smallint, (p_booking ->> 'adults')::smallint, (p_booking ->> 'children')::smallint,
    p_booking ->> 'contact_name', nullif(p_booking ->> 'contact_email', ''), p_booking ->> 'contact_phone',
    nullif(p_booking ->> 'special_requests', ''), nullif(p_booking -> 'gst_details', 'null'::jsonb),
    (p_booking ->> 'subtotal_paise')::integer, (p_booking ->> 'discount_paise')::integer,
    (p_booking ->> 'tax_paise')::integer, (p_booking ->> 'total_paise')::integer,
    (p_booking ->> 'payable_now_paise')::integer, (p_booking ->> 'payment_mode')::public.payment_mode,
    nullif(p_booking ->> 'coupon_id', '')::uuid, nullif(p_booking ->> 'coupon_code', ''),
    p_booking -> 'price_breakdown', coalesce(p_booking -> 'snapshot', '{}'::jsonb),
    coalesce(p_booking ->> 'locale', 'en'), (p_booking ->> 'expires_at')::timestamptz
  from public.hotels h
  where h.id = (p_booking ->> 'hotel_id')::uuid and h.status = 'published' and h.deleted_at is null
  returning * into v_booking;

  if v_booking.id is null then raise exception 'hotel_unavailable' using errcode = 'P0001'; end if;

  insert into public.booking_items (booking_id, kind, line_key, description, service_date, room_id, rate_plan_id,
    quantity, amount_paise, discount_paise, tax_rate_bps, tax_paise, sac, sort_order)
  select v_booking.id, i ->> 'kind', i ->> 'line_key', i ->> 'description', nullif(i ->> 'service_date', '')::date,
    nullif(i ->> 'room_id', '')::uuid, nullif(i ->> 'rate_plan_id', '')::uuid,
    coalesce((i ->> 'quantity')::integer, 1), (i ->> 'amount_paise')::integer, (i ->> 'discount_paise')::integer,
    (i ->> 'tax_rate_bps')::integer, (i ->> 'tax_paise')::integer, nullif(i ->> 'sac', ''), ord::integer
  from jsonb_array_elements(p_items) with ordinality as x(i, ord);

  -- The lines must add up to the booking totals.
  if (select coalesce(sum(amount_paise), 0) from public.booking_items where booking_id = v_booking.id) <> v_booking.subtotal_paise
     or (select coalesce(sum(discount_paise), 0) from public.booking_items where booking_id = v_booking.id) <> v_booking.discount_paise
     or (select coalesce(sum(tax_paise), 0) from public.booking_items where booking_id = v_booking.id) <> v_booking.tax_paise then
    raise exception 'totals_mismatch' using errcode = 'P0001';
  end if;

  insert into public.booking_guests (booking_id, full_name, is_child, is_primary, sort_order)
  select v_booking.id, g ->> 'full_name', coalesce((g ->> 'is_child')::boolean, false),
    coalesce((g ->> 'is_primary')::boolean, false), ord::integer
  from jsonb_array_elements(coalesce(p_guests, '[]'::jsonb)) with ordinality as x(g, ord);

  if v_booking.coupon_id is not null then
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
  end if;

  perform public.reserve_hotel_inventory(
    v_booking.id, (p_booking ->> 'room_id')::uuid, v_booking.check_in, v_booking.check_out,
    v_booking.rooms, v_booking.expires_at
  );

  if v_booking.payment_mode = 'pay_at_hotel' then
    v_confirmed := public.confirm_booking_inventory(v_booking.id);
    if not v_confirmed then raise exception 'sold_out' using errcode = 'P0001'; end if;
    update public.bookings set status = 'confirmed', confirmed_at = now(), expires_at = null where id = v_booking.id;
    update public.coupon_redemptions set status = 'redeemed' where booking_id = v_booking.id;
    perform public.issue_invoice(v_booking.id);
  end if;

  return jsonb_build_object('id', v_booking.id, 'code', v_booking.code,
    'status', case when v_booking.payment_mode = 'pay_at_hotel' then 'confirmed' else 'pending_payment' end);
end;
$$;

/* Next invoice number for the Indian financial year (April–March), e.g. PST/26-27/00042. */
create or replace function public.issue_invoice(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing text;
  v_ist timestamp := now() at time zone 'Asia/Kolkata';
  v_start integer := extract(year from v_ist)::integer - case when extract(month from v_ist) < 4 then 1 else 0 end;
  v_fy text := lpad((v_start % 100)::text, 2, '0') || '-' || lpad(((v_start + 1) % 100)::text, 2, '0');
  v_next integer;
  v_prefix text;
  v_number text;
  v_profile jsonb;
  v_invoice jsonb;
  v_booking public.bookings;
begin
  select number into v_existing from public.invoices where booking_id = p_booking_id;
  if v_existing is not null then return v_existing; end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  select value into v_profile from public.settings where key = 'business.profile';
  select value into v_invoice from public.settings where key = 'business.invoice';
  v_prefix := coalesce(nullif(v_invoice ->> 'prefix', ''), 'PST');

  insert into public.invoice_counters (financial_year, last_number) values (v_fy, 1)
  on conflict (financial_year) do update set last_number = public.invoice_counters.last_number + 1
  returning last_number into v_next;

  v_number := v_prefix || '/' || v_fy || '/' || lpad(v_next::text, 5, '0');
  insert into public.invoices (booking_id, number, financial_year, seller, buyer)
  values (
    p_booking_id, v_number, v_fy,
    coalesce(v_profile, '{}'::jsonb) || coalesce(v_invoice, '{}'::jsonb),
    jsonb_build_object('name', v_booking.contact_name, 'email', v_booking.contact_email,
      'phone', v_booking.contact_phone, 'gst', v_booking.gst_details)
  );
  return v_number;
end;
$$;

-- Records the Razorpay order created for a booking's online payment.
create or replace function public.attach_payment_order(p_booking_id uuid, p_order_id text, p_amount integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.payments (booking_id, provider, provider_order_id, amount_paise)
  values (p_booking_id, 'razorpay', p_order_id, p_amount)
  returning id into v_id;
  return v_id;
end;
$$;

/*
 * Applies a payment outcome. Idempotent: replays of the same captured
 * payment change nothing. Matches by order id or payment link id; the
 * captured amount must equal what we asked for.
 *   p: { order_id?, payment_link_id?, payment_id, status: captured|authorized|failed,
 *        amount_paise, method?, error_code?, error_description?, raw? }
 * Returns { result: confirmed | recorded | duplicate | no_inventory | not_payable | unknown_order | amount_mismatch, booking_id }.
 * no_inventory and not_payable mean money was taken for a stay we cannot give: the caller refunds it.
 */
create or replace function public.record_payment(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_booking public.bookings;
  v_status public.payment_status := (p ->> 'status')::public.payment_status;
  v_amount integer := (p ->> 'amount_paise')::integer;
  v_ok boolean;
begin
  select * into v_payment from public.payments
   where (p ->> 'order_id' is not null and provider = 'razorpay' and provider_order_id = p ->> 'order_id')
      or (p ->> 'payment_link_id' is not null and payment_link_id = p ->> 'payment_link_id')
   order by created_at
   limit 1
   for update;
  if v_payment.id is null then return jsonb_build_object('result', 'unknown_order'); end if;

  select * into v_booking from public.bookings where id = v_payment.booking_id for update;

  if v_payment.status = 'captured' then
    return jsonb_build_object('result', 'duplicate', 'booking_id', v_booking.id, 'status', v_booking.status);
  end if;

  if v_status = 'captured' and v_amount <> v_payment.amount_paise then
    update public.payments set error_code = 'amount_mismatch', raw = p -> 'raw' where id = v_payment.id;
    return jsonb_build_object('result', 'amount_mismatch', 'booking_id', v_booking.id);
  end if;

  update public.payments
     set status = v_status,
         provider_payment_id = coalesce(p ->> 'payment_id', provider_payment_id),
         method = coalesce(p ->> 'method', method),
         error_code = case when v_status = 'failed' then p ->> 'error_code' end,
         error_description = case when v_status = 'failed' then p ->> 'error_description' end,
         raw = coalesce(p -> 'raw', raw),
         captured_at = case when v_status = 'captured' then now() else captured_at end
   where id = v_payment.id;

  if v_status <> 'captured' then
    return jsonb_build_object('result', 'recorded', 'booking_id', v_booking.id, 'status', v_booking.status);
  end if;

  update public.bookings set paid_paise = paid_paise + v_amount where id = v_booking.id;

  -- Money arrived for a booking that was cancelled meanwhile: the caller refunds it.
  if v_booking.status in ('cancelled', 'refunded', 'partially_refunded') then
    return jsonb_build_object('result', 'not_payable', 'booking_id', v_booking.id, 'payment_id', v_payment.id);
  end if;

  -- Balance payments on an already confirmed booking just add to paid.
  if v_booking.status not in ('draft', 'pending_payment', 'expired', 'failed') then
    return jsonb_build_object('result', 'recorded', 'booking_id', v_booking.id, 'status', v_booking.status);
  end if;

  v_ok := public.confirm_booking_inventory(v_booking.id);
  if not v_ok then
    update public.bookings set status = 'failed', expires_at = null where id = v_booking.id;
    update public.coupon_redemptions set status = 'released' where booking_id = v_booking.id;
    return jsonb_build_object('result', 'no_inventory', 'booking_id', v_booking.id, 'payment_id', v_payment.id);
  end if;

  update public.bookings set status = 'confirmed', confirmed_at = now(), expires_at = null where id = v_booking.id;
  update public.coupon_redemptions set status = 'redeemed' where booking_id = v_booking.id;
  perform public.issue_invoice(v_booking.id);
  return jsonb_build_object('result', 'confirmed', 'booking_id', v_booking.id, 'status', 'confirmed');
end;
$$;

/*
 * Cancels a booking (customer or staff) and gives the rooms back. Money is
 * refunded separately through record_refund once Razorpay accepts it.
 */
create or replace function public.cancel_booking(p_booking_id uuid, p_actor uuid, p_reason text, p_to public.booking_status default 'cancelled')
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare v_booking public.bookings;
begin
  perform public.set_actor(p_actor);
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_to not in ('cancelled', 'failed', 'expired') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  if v_booking.status not in ('draft', 'pending_payment', 'confirmed') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if p_to <> 'cancelled' and v_booking.status = 'confirmed' then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  perform public.release_booking_inventory(p_booking_id);
  update public.coupon_redemptions set status = 'released' where booking_id = p_booking_id;
  update public.bookings
     set status = p_to, cancelled_at = case when p_to = 'cancelled' then now() end,
         cancelled_by = case when p_to = 'cancelled' then p_actor end,
         cancel_reason = p_reason, expires_at = null
   where id = p_booking_id
   returning * into v_booking;
  return v_booking;
end;
$$;

/*
 * Records a refund Razorpay accepted (or a manual one) and moves the
 * booking to refunded / partially_refunded. Idempotent on the provider refund id.
 */
create or replace function public.record_refund(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_payment public.payments;
  v_refund_id uuid;
  v_amount integer := (p ->> 'amount_paise')::integer;
  v_refunded integer;
begin
  perform public.set_actor(nullif(p ->> 'actor', '')::uuid);
  if p ->> 'provider_refund_id' is not null then
    select id into v_refund_id from public.refunds where provider_refund_id = p ->> 'provider_refund_id';
    if v_refund_id is not null then
      update public.refunds
         set status = coalesce((p ->> 'status')::public.refund_status, status),
             processed_at = case when p ->> 'status' = 'processed' then coalesce(processed_at, now()) else processed_at end
       where id = v_refund_id;
      return jsonb_build_object('result', 'duplicate', 'refund_id', v_refund_id);
    end if;
  end if;

  select * into v_payment from public.payments where id = (p ->> 'payment_id')::uuid for update;
  select * into v_booking from public.bookings where id = v_payment.booking_id for update;
  if v_booking.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_amount > v_booking.paid_paise - v_booking.refunded_paise then
    raise exception 'refund_exceeds_paid' using errcode = 'P0001';
  end if;

  insert into public.refunds (booking_id, payment_id, provider_refund_id, amount_paise, status, reason, initiated_by, raw, processed_at)
  values (v_booking.id, v_payment.id, p ->> 'provider_refund_id', v_amount,
          coalesce((p ->> 'status')::public.refund_status, 'pending'), p ->> 'reason',
          nullif(p ->> 'actor', '')::uuid, p -> 'raw',
          case when p ->> 'status' = 'processed' then now() end)
  returning id into v_refund_id;

  v_refunded := v_booking.refunded_paise + v_amount;
  update public.payments
     set status = case when (select coalesce(sum(amount_paise), 0) from public.refunds where payment_id = v_payment.id) >= amount_paise
                       then 'refunded'::public.payment_status else 'partially_refunded'::public.payment_status end
   where id = v_payment.id;
  update public.bookings
     set refunded_paise = v_refunded,
         status = case
           when status in ('cancelled', 'confirmed', 'completed', 'partially_refunded', 'refunded', 'failed') then
             case when v_refunded >= paid_paise then 'refunded'::public.booking_status
                  else 'partially_refunded'::public.booking_status end
           else status end
   where id = v_booking.id;
  return jsonb_build_object('result', 'recorded', 'refund_id', v_refund_id);
end;
$$;

-- Staff record cash/UPI collected at the hotel or office.
create or replace function public.record_offline_payment(p_booking_id uuid, p_amount integer, p_method text, p_reference text, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_id uuid;
begin
  perform public.set_actor(p_actor);
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_booking.status not in ('confirmed', 'completed') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  if v_booking.paid_paise + p_amount > v_booking.total_paise then raise exception 'overpaid' using errcode = 'P0001'; end if;
  insert into public.payments (booking_id, provider, amount_paise, status, method, reference, recorded_by, captured_at)
  values (p_booking_id, 'offline', p_amount, 'captured', p_method, p_reference, p_actor, now())
  returning id into v_id;
  update public.bookings set paid_paise = paid_paise + p_amount where id = p_booking_id;
  return v_id;
end;
$$;

create or replace function public.complete_booking(p_booking_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.set_actor(p_actor);
  update public.bookings set status = 'completed', completed_at = now()
   where id = p_booking_id and status = 'confirmed';
  if not found then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
end;
$$;

-- Expires unpaid bookings whose hold ran out. Run by pg_cron and opportunistically.
create or replace function public.expire_stale_bookings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select id from public.bookings
     where status in ('draft', 'pending_payment') and expires_at < now()
     order by expires_at
     limit 500
     for update skip locked
  loop
    perform public.release_booking_inventory(v_id);
    update public.coupon_redemptions set status = 'released' where booking_id = v_id;
    update public.bookings set status = 'expired' where id = v_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Only trusted server code (service role) may run the booking functions.
do $$
declare f text;
begin
  foreach f in array array[
    'public.refresh_held_units(uuid, date[])',
    'public.reserve_hotel_inventory(uuid, uuid, date, date, integer, timestamptz)',
    'public.confirm_booking_inventory(uuid)',
    'public.release_booking_inventory(uuid)',
    'public.set_actor(uuid)',
    'public.create_hotel_booking(jsonb, jsonb, jsonb)',
    'public.issue_invoice(uuid)',
    'public.attach_payment_order(uuid, text, integer)',
    'public.record_payment(jsonb)',
    'public.cancel_booking(uuid, uuid, text, public.booking_status)',
    'public.record_refund(jsonb)',
    'public.record_offline_payment(uuid, integer, text, text, uuid)',
    'public.complete_booking(uuid, uuid)',
    'public.expire_stale_bookings()'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;

-- Clean up expired holds every 5 minutes where pg_cron exists (Supabase); local test DBs skip it.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('expire-stale-bookings', '*/5 * * * *', 'select public.expire_stale_bookings()');
  end if;
end
$$;

-- ---------------------------------------------------------------- settings & content

update public.settings
   set value = jsonb_build_object(
         'advance_percent', 25,
         'convenience_fee_paise', 0,
         'pay_at_hotel_enabled', true,
         'hold_minutes', 15,
         'customer_cancellation_enabled', true
       ) || value,
       description = 'Checkout: advance %, convenience fee, pay at hotel, room hold minutes, self-service cancellation'
 where key = 'payments.defaults';

insert into public.settings (key, value, is_public, description) values
  ('business.invoice',
   '{"legal_name": "The P & S Traveler Group", "state": "Uttar Pradesh", "state_code": "09", "prefix": "PST", "sac_accommodation": "996311", "sac_services": "998552", "terms": "This is a computer-generated invoice."}',
   false, 'Invoice details: legal name, state, number prefix, SAC codes, footer terms')
on conflict (key) do nothing;

insert into public.notification_templates (key, channel, locale, subject, body) values
  ('booking.confirmed', 'email', 'en', 'Booking confirmed · {{code}}',
   E'Namaste {{name}},\n\nYour stay at {{hotel}} is confirmed.\nBooking ID: {{code}}\nCheck-in: {{check_in}}\nCheck-out: {{check_out}}\nRooms: {{rooms}} · Guests: {{guests}}\nTotal: {{total}} · Paid: {{paid}}\n\nView your trip and invoice: {{trip_url}}\n\nThe P & S Traveler Group'),
  ('booking.confirmed', 'email', 'hi', 'बुकिंग कन्फ़र्म · {{code}}',
   E'नमस्ते {{name}},\n\n{{hotel}} में आपका ठहरना कन्फ़र्म हो गया है।\nबुकिंग आईडी: {{code}}\nचेक-इन: {{check_in}}\nचेक-आउट: {{check_out}}\nकमरे: {{rooms}} · मेहमान: {{guests}}\nकुल: {{total}} · भुगतान: {{paid}}\n\nअपनी यात्रा और इनवॉइस देखें: {{trip_url}}\n\nद पी एंड एस ट्रैवलर ग्रुप'),
  ('booking.confirmed', 'sms', 'en', null,
   'P&S Traveler: booking {{code}} at {{hotel}} confirmed for {{check_in}}. Details: {{trip_url}}'),
  ('booking.confirmed', 'whatsapp', 'en', null,
   E'Namaste {{name}} 🙏 Your booking *{{code}}* at *{{hotel}}* is confirmed.\nCheck-in {{check_in}} · Check-out {{check_out}}\n{{trip_url}}'),
  ('booking.cancelled', 'email', 'en', 'Booking cancelled · {{code}}',
   E'Namaste {{name}},\n\nYour booking {{code}} at {{hotel}} has been cancelled.\nRefund: {{refund}} (it reaches your account in 5–7 working days).\n\nThe P & S Traveler Group'),
  ('booking.cancelled', 'email', 'hi', 'बुकिंग रद्द · {{code}}',
   E'नमस्ते {{name}},\n\n{{hotel}} में आपकी बुकिंग {{code}} रद्द कर दी गई है।\nरिफ़ंड: {{refund}} (5–7 कार्य दिवसों में आपके खाते में आ जाएगा)।\n\nद पी एंड एस ट्रैवलर ग्रुप'),
  ('booking.cancelled', 'sms', 'en', null,
   'P&S Traveler: booking {{code}} cancelled. Refund {{refund}} in 5-7 working days.'),
  ('payment.link', 'email', 'en', 'Payment for booking {{code}}',
   E'Namaste {{name}},\n\nPlease pay {{amount}} for booking {{code}} at {{hotel}} using this secure link:\n{{link}}\n\nThe P & S Traveler Group'),
  ('payment.link', 'sms', 'en', null,
   'P&S Traveler: pay {{amount}} for booking {{code}}: {{link}}')
on conflict (key, channel, locale) do nothing;
-- Phase 3: vendors (minimal, extended in phase 9) and the hotel catalog:
-- properties, rooms, rate plans, per-date inventory and rates, seasonal
-- pricing rules, photos and amenities.
--
-- Availability model (see lib/availability):
--   * A room type sells `hotel_rooms.total_units` per night by default.
--   * `hotel_inventory` rows override a date: units, stop-sell (is_closed),
--     min stay on arrival, and `sold_units` (maintained by booking in phase 4).
--   * Nightly price = `hotel_rates` override for that plan+date, else the
--     highest-priority matching `hotel_pricing_rules` row applied to the
--     plan's base price, else the base price.
-- Money is integer paise.

-- ---------------------------------------------------------------- vendors

create type public.vendor_kind as enum ('hotel', 'restaurant', 'store', 'transport', 'pharmacy', 'agency', 'other');
create type public.vendor_status as enum ('pending', 'active', 'suspended');

create table public.vendors (
  id              uuid primary key default gen_random_uuid(),
  kind            public.vendor_kind not null,
  name            text not null check (char_length(name) between 2 and 160),
  slug            text not null unique check (slug ~ '^[a-z0-9-]+$'),
  contact_name    text,
  phone           text,
  email           extensions.citext,
  gstin           text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  -- Commission on gross booking value, in basis points (1000 = 10%).
  commission_bps  integer not null default 1000 check (commission_bps between 0 and 10000),
  status          public.vendor_status not null default 'pending',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create table public.vendor_members (
  vendor_id   uuid not null references public.vendors (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner', 'staff')),
  created_at  timestamptz not null default now(),
  primary key (vendor_id, user_id)
);
create index vendor_members_user_idx on public.vendor_members (user_id);

create or replace function public.is_vendor_member(p_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_vendor_id is not null and exists (
    select 1 from public.vendor_members m
    where m.vendor_id = p_vendor_id and m.user_id = (select auth.uid())
  );
$$;

create trigger vendors_set_updated_at before update on public.vendors
  for each row execute function public.set_updated_at();

alter table public.vendors enable row level security;
alter table public.vendor_members enable row level security;

create policy "vendor staff and members read vendors" on public.vendors
  for select to authenticated
  using (public.has_permission('vendors.read') or public.has_permission('hotels.read') or public.is_vendor_member(id));
create policy "vendor managers manage vendors" on public.vendors
  for all to authenticated
  using (public.has_permission('vendors.write'))
  with check (public.has_permission('vendors.write'));

create policy "members read own membership" on public.vendor_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('vendors.read'));
create policy "vendor managers manage members" on public.vendor_members
  for all to authenticated
  using (public.has_permission('vendors.write'))
  with check (public.has_permission('vendors.write'));

select public.enable_audit('public.vendors');
select public.enable_audit('public.vendor_members', array['vendor_id', 'user_id']);

-- ---------------------------------------------------------------- hotels

create type public.hotel_property_type as enum (
  'hotel', 'guest_house', 'dharamshala', 'ashram', 'homestay', 'resort', 'apartment', 'hostel'
);
create type public.meal_plan as enum ('room_only', 'breakfast', 'half_board', 'full_board');
create type public.price_adjustment as enum ('percent', 'flat', 'fixed');

create table public.hotels (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique check (slug ~ '^[a-z0-9-]+$'),
  vendor_id             uuid references public.vendors (id) on delete set null,
  city_id               uuid not null references public.cities (id),
  area_id               uuid references public.areas (id) on delete set null,
  name                  jsonb not null check (public.is_localized(name)),
  summary               jsonb check (summary is null or public.is_localized(summary)),
  description           jsonb not null default '{"en": ""}'::jsonb,
  property_type         public.hotel_property_type not null default 'hotel',
  star_rating           smallint not null default 0 check (star_rating between 0 and 5),
  address               text,
  lat                   double precision check (lat between -90 and 90),
  lng                   double precision check (lng between -180 and 180),
  check_in_time         time not null default '12:00',
  check_out_time        time not null default '11:00',
  highlights            jsonb not null default '[]'::jsonb check (jsonb_typeof(highlights) = 'array'),
  -- House rules: couple/bachelor rules, ID proofs, pets, free-text rules.
  policies              jsonb not null default '{}'::jsonb check (jsonb_typeof(policies) = 'object'),
  food_dining           jsonb,
  is_couple_friendly    boolean not null default false,
  is_featured           boolean not null default false,
  is_sponsored          boolean not null default false,
  -- Payment options offered at checkout (phase 4).
  pay_at_hotel_enabled  boolean not null default false,
  part_payment_percent  smallint check (part_payment_percent between 1 and 99),
  -- Admin-priced add-ons on the review-booking page (phase 4).
  early_checkin_paise   integer check (early_checkin_paise >= 0),
  late_checkout_paise   integer check (late_checkout_paise >= 0),
  breakfast_addon_paise integer check (breakfast_addon_paise >= 0),
  commission_bps        integer check (commission_bps between 0 and 10000),
  -- Cached rating (maintained from verified reviews in phase 10).
  rating_avg            numeric(2, 1) check (rating_avg between 0 and 5),
  rating_count          integer not null default 0 check (rating_count >= 0),
  status                public.publish_status not null default 'draft',
  seo                   jsonb not null default '{}'::jsonb check (jsonb_typeof(seo) = 'object'),
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);
create index hotels_city_status_idx on public.hotels (city_id, status) where deleted_at is null;
create index hotels_vendor_idx on public.hotels (vendor_id);
create index hotels_name_trgm_idx on public.hotels using gin ((name ->> 'en') extensions.gin_trgm_ops);

create table public.hotel_rooms (
  id               uuid primary key default gen_random_uuid(),
  hotel_id         uuid not null references public.hotels (id) on delete cascade,
  name             jsonb not null check (public.is_localized(name)),
  description      jsonb,
  bed_type         text,
  size_sqft        integer check (size_sqft > 0),
  -- Adults included in the plan price; extra adults/children are charged per plan.
  base_occupancy   smallint not null default 2 check (base_occupancy >= 1),
  max_adults       smallint not null default 2 check (max_adults >= 1),
  max_children     smallint not null default 1 check (max_children >= 0),
  max_occupancy    smallint not null default 3 check (max_occupancy >= 1),
  total_units      smallint not null default 1 check (total_units >= 0),
  amenity_ids      uuid[] not null default '{}',
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (base_occupancy <= max_adults and max_adults <= max_occupancy)
);
create index hotel_rooms_hotel_idx on public.hotel_rooms (hotel_id, sort_order);

create table public.hotel_rate_plans (
  id                  uuid primary key default gen_random_uuid(),
  room_id             uuid not null references public.hotel_rooms (id) on delete cascade,
  name                jsonb not null check (public.is_localized(name)),
  meal_plan           public.meal_plan not null default 'room_only',
  inclusions          jsonb not null default '[]'::jsonb check (jsonb_typeof(inclusions) = 'array'),
  is_refundable       boolean not null default true,
  -- [{ "hours_before": 48, "refund_percent": 100 }, ...] most generous first.
  cancellation_rules  jsonb not null default '[]'::jsonb check (jsonb_typeof(cancellation_rules) = 'array'),
  base_price_paise    integer not null check (base_price_paise >= 0),
  extra_adult_paise   integer not null default 0 check (extra_adult_paise >= 0),
  extra_child_paise   integer not null default 0 check (extra_child_paise >= 0),
  currency            text not null default 'INR' check (currency = 'INR'),
  min_stay            smallint not null default 1 check (min_stay >= 1),
  max_stay            smallint check (max_stay >= 1),
  sort_order          integer not null default 0,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (max_stay is null or max_stay >= min_stay)
);
create index hotel_rate_plans_room_idx on public.hotel_rate_plans (room_id, sort_order);

create table public.hotel_inventory (
  room_id     uuid not null references public.hotel_rooms (id) on delete cascade,
  date        date not null,
  -- null = use hotel_rooms.total_units for this date.
  units       smallint check (units >= 0),
  sold_units  smallint not null default 0 check (sold_units >= 0),
  is_closed   boolean not null default false,
  min_stay    smallint check (min_stay >= 1),
  updated_at  timestamptz not null default now(),
  primary key (room_id, date)
);

create table public.hotel_rates (
  rate_plan_id  uuid not null references public.hotel_rate_plans (id) on delete cascade,
  date          date not null,
  price_paise   integer not null check (price_paise >= 0),
  updated_at    timestamptz not null default now(),
  primary key (rate_plan_id, date)
);

-- Seasonal / weekday pricing: Holi, Janmashtami, Kartik, weekends.
create table public.hotel_pricing_rules (
  id            uuid primary key default gen_random_uuid(),
  hotel_id      uuid not null references public.hotels (id) on delete cascade,
  -- Narrow the rule to one room or one plan; null = whole hotel.
  room_id       uuid references public.hotel_rooms (id) on delete cascade,
  rate_plan_id  uuid references public.hotel_rate_plans (id) on delete cascade,
  name          text not null check (char_length(name) between 2 and 80),
  start_date    date not null,
  end_date      date not null,
  -- ISO weekdays 1 (Mon) .. 7 (Sun); empty = every day.
  weekdays      smallint[] not null default '{}',
  adjustment    public.price_adjustment not null,
  -- percent: basis points (+2500 = +25%); flat: paise delta; fixed: paise price.
  value         integer not null,
  priority      integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_date >= start_date),
  check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
);
create index hotel_pricing_rules_hotel_idx on public.hotel_pricing_rules (hotel_id, start_date, end_date);

create table public.hotel_media (
  hotel_id    uuid not null references public.hotels (id) on delete cascade,
  media_id    uuid not null references public.media (id) on delete cascade,
  room_id     uuid references public.hotel_rooms (id) on delete cascade,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  primary key (hotel_id, media_id)
);

create table public.hotel_amenities (
  hotel_id    uuid not null references public.hotels (id) on delete cascade,
  amenity_id  uuid not null references public.amenities (id) on delete cascade,
  primary key (hotel_id, amenity_id)
);
create index hotel_amenities_amenity_idx on public.hotel_amenities (amenity_id);

do $$
declare t text;
begin
  foreach t in array array['hotels', 'hotel_rooms', 'hotel_rate_plans', 'hotel_inventory', 'hotel_rates', 'hotel_pricing_rules']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
  foreach t in array array['hotels', 'hotel_rooms', 'hotel_rate_plans', 'hotel_inventory', 'hotel_rates', 'hotel_pricing_rules', 'hotel_media', 'hotel_amenities']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------- RLS

-- One place decides whether a hotel's catalog rows are visible to a caller.
create or replace function public.can_read_hotel(p_hotel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.hotels h
    where h.id = p_hotel_id
      and (
        (h.status = 'published' and h.deleted_at is null)
        or public.has_permission('hotels.read')
        or public.is_vendor_member(h.vendor_id)
      )
  );
$$;

create or replace function public.room_hotel_id(p_room_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select hotel_id from public.hotel_rooms where id = p_room_id;
$$;

create or replace function public.plan_hotel_id(p_plan_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.hotel_id from public.hotel_rate_plans p join public.hotel_rooms r on r.id = p.room_id where p.id = p_plan_id;
$$;

create policy "published hotels are public" on public.hotels
  for select to anon, authenticated
  using (
    (status = 'published' and deleted_at is null)
    or public.has_permission('hotels.read')
    or public.is_vendor_member(vendor_id)
  );
create policy "hotel managers manage hotels" on public.hotels
  for all to authenticated
  using (public.has_permission('hotels.write'))
  with check (public.has_permission('hotels.write'));

create policy "rooms follow hotel visibility" on public.hotel_rooms
  for select to anon, authenticated using (public.can_read_hotel(hotel_id));
create policy "hotel managers manage rooms" on public.hotel_rooms
  for all to authenticated
  using (public.has_permission('hotels.write'))
  with check (public.has_permission('hotels.write'));

create policy "plans follow hotel visibility" on public.hotel_rate_plans
  for select to anon, authenticated using (public.can_read_hotel(public.room_hotel_id(room_id)));
create policy "hotel managers manage plans" on public.hotel_rate_plans
  for all to authenticated
  using (public.has_permission('hotels.write'))
  with check (public.has_permission('hotels.write'));

create policy "inventory follows hotel visibility" on public.hotel_inventory
  for select to anon, authenticated using (public.can_read_hotel(public.room_hotel_id(room_id)));
create policy "hotel managers manage inventory" on public.hotel_inventory
  for all to authenticated
  using (public.has_permission('hotels.write'))
  with check (public.has_permission('hotels.write'));

create policy "rates follow hotel visibility" on public.hotel_rates
  for select to anon, authenticated using (public.can_read_hotel(public.plan_hotel_id(rate_plan_id)));
create policy "hotel managers manage rates" on public.hotel_rates
  for all to authenticated
  using (public.has_permission('hotels.write'))
  with check (public.has_permission('hotels.write'));

create policy "pricing rules follow hotel visibility" on public.hotel_pricing_rules
  for select to anon, authenticated using (public.can_read_hotel(hotel_id));
create policy "hotel managers manage pricing rules" on public.hotel_pricing_rules
  for all to authenticated
  using (public.has_permission('hotels.write'))
  with check (public.has_permission('hotels.write'));

create policy "hotel media follows hotel visibility" on public.hotel_media
  for select to anon, authenticated using (public.can_read_hotel(hotel_id));
create policy "hotel managers manage hotel media" on public.hotel_media
  for all to authenticated
  using (public.has_permission('hotels.write'))
  with check (public.has_permission('hotels.write'));

create policy "hotel amenities follow hotel visibility" on public.hotel_amenities
  for select to anon, authenticated using (public.can_read_hotel(hotel_id));
create policy "hotel managers manage hotel amenities" on public.hotel_amenities
  for all to authenticated
  using (public.has_permission('hotels.write'))
  with check (public.has_permission('hotels.write'));

-- Hotel editors upload photos to the media bucket and register them.
create policy "hotel editors upload media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.has_permission('hotels.write'));
create policy "hotel editors register media" on public.media
  for insert to authenticated
  with check (public.has_permission('hotels.write'));

select public.enable_audit('public.hotels');
select public.enable_audit('public.hotel_rooms');
select public.enable_audit('public.hotel_rate_plans');
select public.enable_audit('public.hotel_inventory', array['room_id', 'date']);
select public.enable_audit('public.hotel_rates', array['rate_plan_id', 'date']);
select public.enable_audit('public.hotel_pricing_rules');
select public.enable_audit('public.hotel_media', array['hotel_id', 'media_id']);
select public.enable_audit('public.hotel_amenities', array['hotel_id', 'amenity_id']);

-- Home page gets a "featured hotels" slot (row inserted in a later migration:
-- a new enum value cannot be used in the transaction that adds it).
alter type public.cms_section_type add value if not exists 'featured_hotels';

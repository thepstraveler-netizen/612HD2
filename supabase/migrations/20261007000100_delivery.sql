-- Phase 7: 24×7 food delivery, essentials delivery and medicine delivery
-- assistance.
--
-- Model
--   * A store is a restaurant, a grocery/essentials shop or a partner
--     pharmacy, owned by a vendor. One catalog serves all three: categories,
--     items (with optional stock), variants and add-on groups.
--   * Delivery is by zone (Vrindavan, Mathura, …): a store lists the zones it
--     serves, the customer picks a zone with the address, and the zone sets
--     the delivery fee and the free-delivery threshold.
--   * An order is a `bookings` row (service food / essentials / medicine)
--     plus one `orders` row with its items, exactly like cab trips: price
--     lines, coupons, payments, refunds, invoices and My Trips are shared.
--     It is paid online or in cash on delivery (payment_mode 'pay_at_hotel').
--   * Medicine: the customer uploads a prescription (private bucket), staff
--     or the partner pharmacy review it and send a quote, the customer
--     accepts and the quote becomes an order. Nothing is sold without review.

-- ---------------------------------------------------------------- types

create type public.store_kind as enum ('restaurant', 'grocery', 'pharmacy');
create type public.order_status as enum (
  'awaiting_payment', 'placed', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'
);
create type public.prescription_status as enum ('submitted', 'reviewing', 'quoted', 'ordered', 'rejected', 'expired');

alter table public.booking_items drop constraint if exists booking_items_kind_check;
alter table public.booking_items
  add constraint booking_items_kind_check
  check (kind in ('room', 'extra_guest', 'addon', 'fee', 'fare', 'allowance', 'surcharge', 'item', 'delivery'));

-- ---------------------------------------------------------------- zones and stores

create table public.delivery_zones (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name              jsonb not null check (public.is_localized(name)),
  fee_paise         integer not null default 0 check (fee_paise >= 0),
  -- Orders at or above this (items after discount) deliver free; null = never free.
  free_above_paise  integer check (free_above_paise is null or free_above_paise >= 0),
  eta_minutes       smallint not null default 40 check (eta_minutes between 5 and 600),
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.stores (
  id                   uuid primary key default gen_random_uuid(),
  vendor_id            uuid not null references public.vendors (id) on delete restrict,
  kind                 public.store_kind not null,
  slug                 text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name                 jsonb not null check (public.is_localized(name)),
  description          jsonb check (description is null or public.is_localized(description)),
  cuisines             text[] not null default '{}',
  image_id             uuid references public.media (id) on delete set null,
  address              text,
  phone                text check (phone is null or phone ~ '^\+?[0-9]{10,15}$'),
  lat                  double precision check (lat is null or lat between -90 and 90),
  lng                  double precision check (lng is null or lng between -180 and 180),
  pure_veg             boolean not null default false,
  is_24x7              boolean not null default false,
  -- Weekly hours (India time) when not 24×7: [{ "day": 1-7 (Mon=1), "open": "HH:MM", "close": "HH:MM" }].
  hours                jsonb not null default '[]'::jsonb check (jsonb_typeof(hours) = 'array'),
  -- The store (or staff) can pause orders at any time.
  accepting_orders     boolean not null default true,
  prep_minutes         smallint not null default 20 check (prep_minutes between 0 and 240),
  min_order_paise      integer not null default 0 check (min_order_paise >= 0),
  packaging_fee_paise  integer not null default 0 check (packaging_fee_paise >= 0),
  -- GST on items unless an item sets its own (restaurants: 5%).
  tax_bps              integer not null default 500 check (tax_bps between 0 and 2800),
  -- Required for pharmacies (D-062).
  drug_licence_no      text,
  rating               numeric(2, 1) check (rating is null or rating between 0 and 5),
  is_featured          boolean not null default false,
  is_active            boolean not null default true,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  check (kind <> 'pharmacy' or nullif(trim(drug_licence_no), '') is not null)
);
create index stores_kind_idx on public.stores (kind, sort_order) where deleted_at is null;
create index stores_vendor_idx on public.stores (vendor_id);

create table public.store_zones (
  store_id  uuid not null references public.stores (id) on delete cascade,
  zone_id   uuid not null references public.delivery_zones (id) on delete cascade,
  primary key (store_id, zone_id)
);
create index store_zones_zone_idx on public.store_zones (zone_id);

-- ---------------------------------------------------------------- catalog

create table public.store_categories (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores (id) on delete cascade,
  name        jsonb not null check (public.is_localized(name)),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index store_categories_store_idx on public.store_categories (store_id, sort_order);

create table public.store_items (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores (id) on delete cascade,
  category_id     uuid references public.store_categories (id) on delete set null,
  name            jsonb not null check (public.is_localized(name)),
  description     jsonb check (description is null or public.is_localized(description)),
  image_id        uuid references public.media (id) on delete set null,
  -- veg / egg / non_veg for food; na for products where it doesn't apply.
  diet            text not null default 'veg' check (diet in ('veg', 'egg', 'non_veg', 'na')),
  is_jain         boolean not null default false,
  is_sattvik      boolean not null default false,
  price_paise     integer not null check (price_paise > 0),
  -- Printed MRP for products (shown struck through when above the price).
  mrp_paise       integer check (mrp_paise is null or mrp_paise >= price_paise),
  tax_bps         integer check (tax_bps is null or tax_bps between 0 and 2800),
  hsn             text check (hsn is null or hsn ~ '^[0-9]{4,8}$'),
  unit            text check (unit is null or char_length(unit) <= 40),
  track_stock     boolean not null default false,
  stock           integer check (stock is null or stock >= 0),
  is_available    boolean not null default true,
  is_bestseller   boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (not track_stock or stock is not null),
  check (not (is_jain and diet in ('egg', 'non_veg'))),
  check (not (is_sattvik and diet in ('egg', 'non_veg')))
);
create index store_items_store_idx on public.store_items (store_id, category_id, sort_order);

create table public.item_variants (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.store_items (id) on delete cascade,
  name          jsonb not null check (public.is_localized(name)),
  price_paise   integer not null check (price_paise > 0),
  stock         integer check (stock is null or stock >= 0),
  is_available  boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index item_variants_item_idx on public.item_variants (item_id, sort_order);

create table public.item_addon_groups (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.store_items (id) on delete cascade,
  name        jsonb not null check (public.is_localized(name)),
  min_select  smallint not null default 0 check (min_select between 0 and 10),
  max_select  smallint not null default 1 check (max_select between 1 and 10),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (min_select <= max_select)
);
create index item_addon_groups_item_idx on public.item_addon_groups (item_id, sort_order);

create table public.item_addons (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.item_addon_groups (id) on delete cascade,
  name          jsonb not null check (public.is_localized(name)),
  price_paise   integer not null default 0 check (price_paise >= 0),
  is_available  boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index item_addons_group_idx on public.item_addons (group_id, sort_order);

-- ---------------------------------------------------------------- customers and riders

create table public.addresses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  label         text not null default 'Home' check (char_length(label) between 1 and 40),
  contact_name  text not null check (char_length(contact_name) between 2 and 120),
  phone         text not null check (phone ~ '^\+?[0-9]{10,15}$'),
  line1         text not null check (char_length(line1) between 3 and 200),
  line2         text check (line2 is null or char_length(line2) <= 200),
  landmark      text check (landmark is null or char_length(landmark) <= 120),
  zone_id       uuid references public.delivery_zones (id) on delete set null,
  pincode       text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  lat           double precision check (lat is null or lat between -90 and 90),
  lng           double precision check (lng is null or lng between -180 and 180),
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);

create table public.delivery_partners (
  id          uuid primary key default gen_random_uuid(),
  -- A store's own rider; null = a platform rider who can serve any store.
  vendor_id   uuid references public.vendors (id) on delete set null,
  user_id     uuid references auth.users (id) on delete set null,
  full_name   text not null check (char_length(full_name) between 2 and 120),
  phone       text not null check (phone ~ '^\+?[0-9]{10,15}$'),
  vehicle     text check (vehicle is null or char_length(vehicle) <= 60),
  is_active   boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ---------------------------------------------------------------- orders

create table public.orders (
  id                        uuid primary key default gen_random_uuid(),
  booking_id                uuid not null unique references public.bookings (id) on delete cascade,
  store_id                  uuid not null references public.stores (id) on delete restrict,
  vendor_id                 uuid not null references public.vendors (id) on delete restrict,
  kind                      public.store_kind not null,
  zone_id                   uuid not null references public.delivery_zones (id) on delete restrict,
  -- { contact_name, phone, line1, line2, landmark, pincode, lat, lng } at order time.
  address                   jsonb not null check (jsonb_typeof(address) = 'object'),
  status                    public.order_status not null default 'awaiting_payment',
  prescription_id           uuid,
  partner_id                uuid references public.delivery_partners (id) on delete set null,
  partner_name              text,
  partner_phone             text,
  eta_at                    timestamptz,
  placed_at                 timestamptz,
  accepted_at               timestamptz,
  ready_at                  timestamptz,
  picked_up_at              timestamptz,
  delivered_at              timestamptz,
  delivery_otp              text check (delivery_otp is null or delivery_otp ~ '^[0-9]{4}$'),
  partner_token             text unique,
  partner_token_expires_at  timestamptz,
  rating                    smallint check (rating is null or rating between 1 and 5),
  rating_comment            text check (rating_comment is null or char_length(rating_comment) <= 500),
  rated_at                  timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_store_idx on public.orders (store_id, created_at desc);
create index orders_vendor_idx on public.orders (vendor_id, created_at desc);

create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders (id) on delete cascade,
  item_id           uuid references public.store_items (id) on delete set null,
  variant_id        uuid references public.item_variants (id) on delete set null,
  name              text not null,
  variant_name      text,
  -- [{ "name": "Extra butter", "price_paise": 2000 }]
  addons            jsonb not null default '[]'::jsonb check (jsonb_typeof(addons) = 'array'),
  diet              text,
  quantity          integer not null check (quantity between 1 and 99),
  unit_price_paise  integer not null check (unit_price_paise >= 0),
  line_total_paise  integer not null check (line_total_paise >= 0),
  sort_order        integer not null default 0
);
create index order_items_order_idx on public.order_items (order_id, sort_order);

create table public.order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  status      public.order_status not null,
  note        text check (note is null or char_length(note) <= 500),
  actor       uuid,
  source      text not null check (source in ('admin', 'vendor', 'partner', 'system', 'customer')),
  created_at  timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

-- ---------------------------------------------------------------- medicine

create table public.prescriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  patient_name  text not null check (char_length(patient_name) between 2 and 120),
  patient_age   smallint check (patient_age is null or patient_age between 0 and 120),
  phone         text not null check (phone ~ '^\+?[0-9]{10,15}$'),
  zone_id       uuid not null references public.delivery_zones (id) on delete restrict,
  address       jsonb not null check (jsonb_typeof(address) = 'object'),
  -- Paths in the private `prescriptions` bucket, under "<user id>/…".
  files         text[] not null check (cardinality(files) between 1 and 5),
  notes         text check (notes is null or char_length(notes) <= 1000),
  status        public.prescription_status not null default 'submitted',
  store_id      uuid references public.stores (id) on delete set null,
  reviewed_by   uuid references auth.users (id) on delete set null,
  review_note   text check (review_note is null or char_length(review_note) <= 1000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index prescriptions_status_idx on public.prescriptions (status, created_at desc);
create index prescriptions_user_idx on public.prescriptions (user_id, created_at desc);

alter table public.orders
  add constraint orders_prescription_fk foreign key (prescription_id) references public.prescriptions (id) on delete set null;

create table public.medicine_quotes (
  id                  uuid primary key default gen_random_uuid(),
  prescription_id     uuid not null references public.prescriptions (id) on delete cascade,
  store_id            uuid not null references public.stores (id) on delete restrict,
  -- [{ "name", "pack", "qty", "unit_price_paise", "tax_bps", "hsn" }]
  lines               jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) between 1 and 50),
  delivery_fee_paise  integer not null default 0 check (delivery_fee_paise >= 0),
  note                text check (note is null or char_length(note) <= 1000),
  valid_until         timestamptz not null,
  status              text not null default 'sent' check (status in ('sent', 'accepted', 'declined', 'expired', 'withdrawn')),
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index medicine_quotes_prescription_idx on public.medicine_quotes (prescription_id, created_at desc);
-- Only one live quote per prescription.
create unique index medicine_quotes_one_sent on public.medicine_quotes (prescription_id) where status = 'sent';

-- ---------------------------------------------------------------- triggers, RLS, audit

do $$
declare t text;
begin
  foreach t in array array['delivery_zones', 'stores', 'store_categories', 'store_items', 'item_variants',
    'item_addon_groups', 'item_addons', 'addresses', 'delivery_partners', 'orders', 'prescriptions', 'medicine_quotes']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
  foreach t in array array['delivery_zones', 'stores', 'store_zones', 'store_categories', 'store_items', 'item_variants',
    'item_addon_groups', 'item_addons', 'addresses', 'delivery_partners', 'orders', 'order_items', 'order_events',
    'prescriptions', 'medicine_quotes']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['delivery_zones', 'stores', 'store_categories', 'store_items', 'item_variants',
    'item_addon_groups', 'item_addons', 'delivery_partners', 'orders', 'prescriptions', 'medicine_quotes']
  loop
    perform public.enable_audit('public.' || t);
  end loop;
end
$$;

-- Store staff permission: food.* covers restaurants and essentials, medicine.* pharmacies.
create or replace function public.can_manage_store(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.stores s
    where s.id = p_store_id
      and (
        (s.kind = 'pharmacy' and public.has_permission('medicine.write'))
        or (s.kind <> 'pharmacy' and public.has_permission('food.write'))
        or public.is_vendor_member(s.vendor_id)
      )
  );
$$;
revoke execute on function public.can_manage_store(uuid) from public, anon;

create or replace function public.item_store_id(p_item_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select store_id from public.store_items where id = p_item_id $$;
revoke execute on function public.item_store_id(uuid) from public, anon;

-- Food and medicine editors upload store and item photos to the media bucket and register them.
create policy "delivery editors upload media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (public.has_permission('food.write') or public.has_permission('medicine.write')));
create policy "delivery editors register media" on public.media
  for insert to authenticated
  with check (public.has_permission('food.write') or public.has_permission('medicine.write'));

-- Zones: public when active; managed by food or medicine staff.
create policy "active zones are public" on public.delivery_zones
  for select to anon, authenticated using (is_active or public.has_permission('food.read'));
create policy "delivery staff manage zones" on public.delivery_zones
  for all to authenticated using (public.has_permission('food.write')) with check (public.has_permission('food.write'));

-- Stores: public when live; the store's vendor reads its own; staff manage.
create policy "live stores are public" on public.stores
  for select to anon, authenticated
  using ((is_active and deleted_at is null) or public.has_permission('food.read') or public.has_permission('medicine.read')
    or public.is_vendor_member(vendor_id));
create policy "staff manage stores" on public.stores
  for all to authenticated
  using ((kind = 'pharmacy' and public.has_permission('medicine.write')) or (kind <> 'pharmacy' and public.has_permission('food.write')))
  with check ((kind = 'pharmacy' and public.has_permission('medicine.write')) or (kind <> 'pharmacy' and public.has_permission('food.write')));

create policy "store zones are public" on public.store_zones
  for select to anon, authenticated using (true);
create policy "staff manage store zones" on public.store_zones
  for all to authenticated using (public.can_manage_store(store_id)) with check (public.can_manage_store(store_id));

-- Catalog: public reads; the store's vendor and staff manage it.
create policy "store categories are public" on public.store_categories
  for select to anon, authenticated using (true);
create policy "store managers manage categories" on public.store_categories
  for all to authenticated using (public.can_manage_store(store_id)) with check (public.can_manage_store(store_id));
create policy "store items are public" on public.store_items
  for select to anon, authenticated using (true);
create policy "store managers manage items" on public.store_items
  for all to authenticated using (public.can_manage_store(store_id)) with check (public.can_manage_store(store_id));
create policy "variants are public" on public.item_variants
  for select to anon, authenticated using (true);
create policy "store managers manage variants" on public.item_variants
  for all to authenticated
  using (public.can_manage_store(public.item_store_id(item_id)))
  with check (public.can_manage_store(public.item_store_id(item_id)));
create policy "addon groups are public" on public.item_addon_groups
  for select to anon, authenticated using (true);
create policy "store managers manage addon groups" on public.item_addon_groups
  for all to authenticated
  using (public.can_manage_store(public.item_store_id(item_id)))
  with check (public.can_manage_store(public.item_store_id(item_id)));
create policy "addons are public" on public.item_addons
  for select to anon, authenticated using (true);
create policy "store managers manage addons" on public.item_addons
  for all to authenticated
  using (public.can_manage_store(public.item_store_id((select g.item_id from public.item_addon_groups g where g.id = group_id))))
  with check (public.can_manage_store(public.item_store_id((select g.item_id from public.item_addon_groups g where g.id = group_id))));

-- Address book: the owner only; staff read for support.
create policy "owners manage addresses" on public.addresses
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "staff read addresses" on public.addresses
  for select to authenticated using (public.has_permission('customers.read'));

-- Riders: staff manage; a store's vendor reads its own and platform riders.
create policy "staff manage riders" on public.delivery_partners
  for all to authenticated using (public.has_permission('food.write')) with check (public.has_permission('food.write'));
create policy "staff and stores read riders" on public.delivery_partners
  for select to authenticated
  using (public.has_permission('food.read') or public.has_permission('medicine.read')
    or (vendor_id is not null and public.is_vendor_member(vendor_id))
    or user_id = (select auth.uid()));

-- Orders follow the booking (customer, booking staff, the store's vendor), plus delivery staff and the rider.
create or replace function public.can_read_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    left join public.delivery_partners p on p.id = o.partner_id
    where o.id = p_order_id
      and (
        public.can_read_booking(o.booking_id)
        or public.is_vendor_member(o.vendor_id)
        or (o.kind = 'pharmacy' and public.has_permission('medicine.read'))
        or (o.kind <> 'pharmacy' and public.has_permission('food.read'))
        or (p.user_id is not null and p.user_id = (select auth.uid()))
      )
  );
$$;
revoke execute on function public.can_read_order(uuid) from public, anon;

create policy "orders follow the booking" on public.orders
  for select to authenticated using (public.can_read_order(id));
create policy "order items follow the order" on public.order_items
  for select to authenticated using (public.can_read_order(order_id));
create policy "order events follow the order" on public.order_events
  for select to authenticated using (public.can_read_order(order_id));

-- The rider link token stays server-side, and the delivery OTP is the
-- customer's alone (a store could otherwise mark its own deliveries).
revoke select on public.orders from anon, authenticated;
grant select (
  id, booking_id, store_id, vendor_id, kind, zone_id, address, status, prescription_id, partner_id, partner_name,
  partner_phone, eta_at, placed_at, accepted_at, ready_at, picked_up_at, delivered_at,
  rating, rating_comment, rated_at, created_at, updated_at
) on public.orders to authenticated;

-- The delivery OTP, for the customer who placed the order only.
create or replace function public.my_order_otp(p_order_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select o.delivery_otp from public.orders o join public.bookings b on b.id = o.booking_id
   where o.id = p_order_id and b.user_id = (select auth.uid());
$$;
revoke execute on function public.my_order_otp(uuid) from public, anon;
grant execute on function public.my_order_otp(uuid) to authenticated;

-- Prescriptions: the customer reads their own; medicine staff and the assigned pharmacy review.
create policy "patients read own prescriptions" on public.prescriptions
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('medicine.read')
    or (store_id is not null and public.can_manage_store(store_id)));
create policy "medicine staff manage prescriptions" on public.prescriptions
  for update to authenticated using (public.has_permission('medicine.write')) with check (public.has_permission('medicine.write'));
create policy "quotes follow the prescription" on public.medicine_quotes
  for select to authenticated
  using (exists (select 1 from public.prescriptions p where p.id = prescription_id
    and (p.user_id = (select auth.uid()) or public.has_permission('medicine.read') or public.can_manage_store(store_id))));
create policy "medicine staff and pharmacies manage quotes" on public.medicine_quotes
  for all to authenticated
  using (public.has_permission('medicine.write') or public.can_manage_store(store_id))
  with check (public.has_permission('medicine.write') or public.can_manage_store(store_id));

-- ---------------------------------------------------------------- functions

/*
 * Creates an order: the booking with its price lines, a coupon hold, the
 * order with its items, and stock taken from tracked items. Cash on delivery
 * is confirmed at once (the store sees it straight away); online orders wait
 * for payment. Totals are re-checked here; the server priced the cart.
 *   p_booking:     bookings columns (code, user_id, contact_*, totals, payment_mode full | pay_at_hotel,
 *                  coupon, price_breakdown, snapshot, locale, expires_at)
 *   p_items:       booking lines
 *   p_order:       { store_id, zone_id, address, prescription_id?, quote_id? }
 *   p_order_items: [{ item_id?, variant_id?, name, variant_name?, addons, diet?, quantity, unit_price_paise, line_total_paise }]
 */
create or replace function public.create_order(p_booking jsonb, p_items jsonb, p_order jsonb, p_order_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store public.stores;
  v_booking public.bookings;
  v_order_id uuid;
  v_cod boolean;
  v_service public.booking_service;
  v_line jsonb;
  v_quote public.medicine_quotes;
  v_rows integer;
begin
  perform public.set_actor(nullif(p_booking ->> 'user_id', '')::uuid);

  select * into v_store from public.stores
   where id = (p_order ->> 'store_id')::uuid and is_active and deleted_at is null;
  if v_store.id is null or not v_store.accepting_orders then
    raise exception 'store_closed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.store_zones z join public.delivery_zones d on d.id = z.zone_id
                  where z.store_id = v_store.id and z.zone_id = (p_order ->> 'zone_id')::uuid and d.is_active) then
    raise exception 'zone_not_served' using errcode = 'P0001';
  end if;
  if p_booking ->> 'payment_mode' not in ('full', 'pay_at_hotel') then
    raise exception 'payment_mode' using errcode = 'P0001';
  end if;
  v_cod := p_booking ->> 'payment_mode' = 'pay_at_hotel';
  v_service := case v_store.kind when 'restaurant' then 'food' when 'grocery' then 'essentials' else 'medicine' end;

  -- A medicine order comes only from an accepted, still-valid quote.
  if v_store.kind = 'pharmacy' then
    select * into v_quote from public.medicine_quotes
     where id = nullif(p_order ->> 'quote_id', '')::uuid and status = 'sent' and valid_until > now() for update;
    if v_quote.id is null or v_quote.store_id <> v_store.id
       or v_quote.prescription_id <> nullif(p_order ->> 'prescription_id', '')::uuid then
      raise exception 'quote_invalid' using errcode = 'P0001';
    end if;
  end if;

  insert into public.bookings (
    code, user_id, service, status, vendor_id, check_in, adults,
    contact_name, contact_email, contact_phone, special_requests,
    subtotal_paise, discount_paise, tax_paise, total_paise, payable_now_paise, payment_mode,
    coupon_id, coupon_code, price_breakdown, snapshot, locale, expires_at
  ) values (
    p_booking ->> 'code', (p_booking ->> 'user_id')::uuid, v_service, 'pending_payment', v_store.vendor_id,
    (now() at time zone 'Asia/Kolkata')::date, 1,
    p_booking ->> 'contact_name', nullif(p_booking ->> 'contact_email', ''), p_booking ->> 'contact_phone',
    nullif(p_booking ->> 'special_requests', ''),
    (p_booking ->> 'subtotal_paise')::integer, (p_booking ->> 'discount_paise')::integer,
    (p_booking ->> 'tax_paise')::integer, (p_booking ->> 'total_paise')::integer,
    case when v_cod then 0 else (p_booking ->> 'payable_now_paise')::integer end,
    (p_booking ->> 'payment_mode')::public.payment_mode,
    nullif(p_booking ->> 'coupon_id', '')::uuid, nullif(p_booking ->> 'coupon_code', ''),
    p_booking -> 'price_breakdown', coalesce(p_booking -> 'snapshot', '{}'::jsonb),
    coalesce(p_booking ->> 'locale', 'en'),
    case when v_cod then null else (p_booking ->> 'expires_at')::timestamptz end
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

  insert into public.orders (booking_id, store_id, vendor_id, kind, zone_id, address, prescription_id, delivery_otp)
  values (
    v_booking.id, v_store.id, v_store.vendor_id, v_store.kind, (p_order ->> 'zone_id')::uuid, p_order -> 'address',
    nullif(p_order ->> 'prescription_id', '')::uuid, lpad((floor(random() * 10000))::integer::text, 4, '0')
  )
  returning id into v_order_id;

  insert into public.order_items (order_id, item_id, variant_id, name, variant_name, addons, diet,
    quantity, unit_price_paise, line_total_paise, sort_order)
  select v_order_id, nullif(i ->> 'item_id', '')::uuid, nullif(i ->> 'variant_id', '')::uuid, i ->> 'name',
    nullif(i ->> 'variant_name', ''), coalesce(i -> 'addons', '[]'::jsonb), nullif(i ->> 'diet', ''),
    (i ->> 'quantity')::integer, (i ->> 'unit_price_paise')::integer, (i ->> 'line_total_paise')::integer, ord::integer
  from jsonb_array_elements(p_order_items) with ordinality as x(i, ord);

  -- Items must belong to this store; tracked stock is taken now and returned on cancel.
  if exists (select 1 from public.order_items oi join public.store_items si on si.id = oi.item_id
              where oi.order_id = v_order_id and si.store_id <> v_store.id) then
    raise exception 'item_unavailable' using errcode = 'P0001';
  end if;
  for v_line in select jsonb_build_object('item_id', item_id, 'variant_id', variant_id, 'qty', quantity)
                  from public.order_items where order_id = v_order_id and item_id is not null
  loop
    if (v_line ->> 'variant_id') is not null then
      update public.item_variants set stock = stock - (v_line ->> 'qty')::integer
       where id = (v_line ->> 'variant_id')::uuid and stock is not null and stock >= (v_line ->> 'qty')::integer;
      if not found and exists (select 1 from public.item_variants where id = (v_line ->> 'variant_id')::uuid and stock is not null) then
        raise exception 'out_of_stock' using errcode = 'P0001';
      end if;
    end if;
    update public.store_items set stock = stock - (v_line ->> 'qty')::integer
     where id = (v_line ->> 'item_id')::uuid and track_stock and stock >= (v_line ->> 'qty')::integer;
    get diagnostics v_rows = row_count;
    if v_rows = 0 and exists (select 1 from public.store_items where id = (v_line ->> 'item_id')::uuid and track_stock) then
      raise exception 'out_of_stock' using errcode = 'P0001';
    end if;
  end loop;

  if v_quote.id is not null then
    update public.medicine_quotes set status = 'accepted' where id = v_quote.id;
    update public.prescriptions set status = 'ordered' where id = v_quote.prescription_id;
  end if;

  -- Cash on delivery: confirmed now (the sync trigger places the order).
  if v_cod then
    update public.bookings set status = 'confirmed', confirmed_at = now() where id = v_booking.id;
    update public.coupon_redemptions set status = 'redeemed' where booking_id = v_booking.id;
  end if;

  return jsonb_build_object('id', v_booking.id, 'code', v_booking.code, 'order_id', v_order_id,
    'status', case when v_cod then 'confirmed' else 'pending_payment' end);
end;
$$;

-- Returns tracked stock for an order that will not be delivered.
create or replace function public.restock_order(p_order_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.store_items si set stock = si.stock + q.qty
    from (select item_id, sum(quantity)::integer as qty from public.order_items where order_id = p_order_id and item_id is not null group by item_id) q
   where si.id = q.item_id and si.track_stock;
  update public.item_variants v set stock = v.stock + q.qty
    from (select variant_id, sum(quantity)::integer as qty from public.order_items where order_id = p_order_id and variant_id is not null group by variant_id) q
   where v.id = q.variant_id and v.stock is not null;
$$;

-- Keeps the order in step with its booking, like trips and rides.
create or replace function public.sync_order_with_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_order public.orders;
begin
  if new.service not in ('food', 'essentials', 'medicine') or new.status is not distinct from old.status then
    return null;
  end if;
  select * into v_order from public.orders where booking_id = new.id for update;
  if v_order.id is null then return null; end if;

  if new.status = 'confirmed' and v_order.status = 'awaiting_payment' then
    update public.orders set status = 'placed', placed_at = now() where id = v_order.id;
    insert into public.order_events (order_id, status, actor, source, note)
      values (v_order.id, 'placed', nullif(current_setting('app.actor_id', true), '')::uuid, 'system', 'Order placed');
  elsif new.status in ('cancelled', 'failed', 'expired', 'refunded') and v_order.status not in ('delivered', 'cancelled', 'rejected') then
    perform public.restock_order(v_order.id);
    update public.orders set status = 'cancelled' where id = v_order.id;
    insert into public.order_events (order_id, status, actor, source, note)
      values (v_order.id, 'cancelled', nullif(current_setting('app.actor_id', true), '')::uuid, 'system', 'Booking ' || new.status);
  end if;
  return null;
end;
$$;

create trigger bookings_sync_order after update of status on public.bookings
  for each row execute function public.sync_order_with_booking();

/*
 * Moves an order along. The store accepts or rejects, prepares and marks it
 * ready; the rider (or the store, delivering itself) takes it out and
 * delivers it with the customer's OTP when `delivery.defaults.require_delivery_otp`
 * is on. Delivering completes the booking. Rejecting returns the stock; the
 * server then cancels the booking and refunds any payment.
 */
create or replace function public.set_order_status(
  p_order_id uuid, p_status public.order_status, p_actor uuid, p_source text, p_note text default null, p_otp text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_allowed public.order_status[];
  v_require_otp boolean;
  v_prep smallint;
  v_eta smallint;
begin
  perform public.set_actor(p_actor);
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_source not in ('admin', 'vendor', 'partner', 'system') then raise exception 'invalid_source' using errcode = 'P0001'; end if;

  v_allowed := case v_order.status
    when 'placed' then array['accepted', 'rejected']::public.order_status[]
    when 'accepted' then array['preparing', 'ready', 'out_for_delivery']::public.order_status[]
    when 'preparing' then array['ready', 'out_for_delivery']::public.order_status[]
    when 'ready' then array['out_for_delivery']::public.order_status[]
    when 'out_for_delivery' then array['delivered']::public.order_status[]
    else array[]::public.order_status[]
  end;
  if not (p_status = any (v_allowed)) then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  if p_source = 'partner' and p_status not in ('out_for_delivery', 'delivered') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  if p_status = 'delivered' and p_source in ('partner', 'vendor') then
    select coalesce((value ->> 'require_delivery_otp')::boolean, true) into v_require_otp
      from public.settings where key = 'delivery.defaults';
    if coalesce(v_require_otp, true) and (p_otp is null or p_otp <> v_order.delivery_otp) then
      raise exception 'otp_mismatch' using errcode = 'P0001';
    end if;
  end if;

  if p_status = 'accepted' then
    select s.prep_minutes, z.eta_minutes into v_prep, v_eta
      from public.stores s, public.delivery_zones z where s.id = v_order.store_id and z.id = v_order.zone_id;
  end if;

  update public.orders
     set status = p_status,
         accepted_at = case when p_status = 'accepted' then now() else accepted_at end,
         eta_at = case when p_status = 'accepted' then now() + make_interval(mins => coalesce(v_prep, 20) + coalesce(v_eta, 30)) else eta_at end,
         ready_at = case when p_status = 'ready' then now() else ready_at end,
         picked_up_at = case when p_status = 'out_for_delivery' then now() else picked_up_at end,
         delivered_at = case when p_status = 'delivered' then now() else delivered_at end
   where id = p_order_id
   returning * into v_order;

  insert into public.order_events (order_id, status, actor, source, note)
    values (p_order_id, p_status, p_actor, p_source, p_note);

  if p_status = 'rejected' then
    perform public.restock_order(p_order_id);
  elsif p_status = 'delivered' then
    update public.bookings set status = 'completed', completed_at = now()
     where id = v_order.booking_id and status = 'confirmed';
  end if;
  return v_order;
end;
$$;

-- Assigns (or reassigns) a rider and issues a fresh rider link, valid for a day.
create or replace function public.assign_delivery_partner(p_order_id uuid, p_partner_id uuid, p_actor uuid, p_source text default 'admin')
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_partner public.delivery_partners;
begin
  perform public.set_actor(p_actor);
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_source not in ('admin', 'vendor') then raise exception 'invalid_source' using errcode = 'P0001'; end if;
  if v_order.status not in ('placed', 'accepted', 'preparing', 'ready', 'out_for_delivery') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  select * into v_partner from public.delivery_partners
   where id = p_partner_id and is_active and deleted_at is null
     and (vendor_id is null or vendor_id = v_order.vendor_id);
  if v_partner.id is null then raise exception 'partner_unavailable' using errcode = 'P0001'; end if;

  update public.orders
     set partner_id = v_partner.id,
         partner_name = v_partner.full_name,
         partner_phone = v_partner.phone,
         partner_token = encode(extensions.gen_random_bytes(24), 'hex'),
         partner_token_expires_at = now() + interval '1 day'
   where id = p_order_id
   returning * into v_order;

  insert into public.order_events (order_id, status, actor, source, note)
    values (p_order_id, v_order.status, p_actor, p_source, 'Rider ' || v_partner.full_name);
  return v_order;
end;
$$;

-- The customer rates a delivered order once.
create or replace function public.rate_order(p_order_id uuid, p_user uuid, p_rating smallint, p_comment text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare v_order public.orders;
begin
  perform public.set_actor(p_user);
  select o.* into v_order from public.orders o join public.bookings b on b.id = o.booking_id
   where o.id = p_order_id and b.user_id = p_user for update of o;
  if v_order.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_order.status <> 'delivered' or v_order.rated_at is not null then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  update public.orders
     set rating = p_rating, rating_comment = nullif(trim(p_comment), ''), rated_at = now()
   where id = p_order_id
   returning * into v_order;
  insert into public.order_events (order_id, status, actor, source, note)
    values (p_order_id, 'delivered', p_user, 'customer', 'Rated ' || p_rating || '/5');
  return v_order;
end;
$$;

-- A customer's prescription upload (files already in their folder of the private bucket).
create or replace function public.submit_prescription(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (p ->> 'user_id')::uuid;
  v_id uuid;
begin
  perform public.set_actor(v_user);
  if exists (select 1 from unnest(array(select jsonb_array_elements_text(p -> 'files'))) f
              where split_part(f, '/', 1) <> v_user::text) then
    raise exception 'invalid_file' using errcode = 'P0001';
  end if;
  insert into public.prescriptions (user_id, patient_name, patient_age, phone, zone_id, address, files, notes)
  values (v_user, p ->> 'patient_name', nullif(p ->> 'patient_age', '')::smallint, p ->> 'phone',
    (p ->> 'zone_id')::uuid, p -> 'address', array(select jsonb_array_elements_text(p -> 'files')), nullif(p ->> 'notes', ''))
  returning id into v_id;
  return v_id;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.create_order(jsonb, jsonb, jsonb, jsonb)',
    'public.restock_order(uuid)',
    'public.sync_order_with_booking()',
    'public.set_order_status(uuid, public.order_status, uuid, text, text, text)',
    'public.assign_delivery_partner(uuid, uuid, uuid, text)',
    'public.rate_order(uuid, uuid, smallint, text)',
    'public.submit_prescription(jsonb)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;

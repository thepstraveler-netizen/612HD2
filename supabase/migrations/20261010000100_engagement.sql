-- Phase 10: verified reviews, wishlist, saved travellers, P&S Rewards
-- (loyalty points), referrals and customer notes.
--
-- Model
--   * A review belongs to one booking the reviewer made (one review per
--     booking). It is eligible once the booking is completed, or for a hotel
--     stay / package once its end date has passed while confirmed. The
--     subject is the hotel, package or store of the booking, else the service
--     itself (cab, ride, travel). Reviews wait for moderation unless the
--     `reviews.defaults` setting publishes them at once. Published reviews
--     keep the cached ratings on hotels, packages and stores in step.
--   * P&S Rewards: points live in `loyalty_ledger` (+ earned, − spent).
--     Completed bookings earn a share of what was paid (rate frozen on the
--     first row; refunds take points back). Points are spent by turning them
--     into a one-time personal coupon, so checkout and the coupon engine need
--     no changes. Unused reward codes give their points back when they lapse;
--     earned points expire after `expiry_days` (oldest first).
--   * Referrals: every customer gets a code. A new customer who claims a code
--     before their first completed booking links to the referrer; when that
--     first booking completes, both get points.
--   * Wishlist, saved travellers and staff notes on customers are plain
--     tables under RLS. Everything else is written only through the
--     service-role functions below.

-- ---------------------------------------------------------------- types

create type public.review_subject as enum ('hotel', 'package', 'store', 'service');
create type public.review_status as enum ('pending', 'published', 'rejected');
create type public.wishlist_subject as enum ('hotel', 'package', 'store');
create type public.loyalty_kind as enum ('earn', 'reverse', 'redeem', 'restore', 'referral', 'review', 'adjust', 'expire');
create type public.referral_status as enum ('pending', 'rewarded', 'void');

-- ---------------------------------------------------------------- reviews

create table public.reviews (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null unique references public.bookings (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  subject_type   public.review_subject not null,
  hotel_id       uuid references public.hotels (id) on delete cascade,
  package_id     uuid references public.packages (id) on delete cascade,
  store_id       uuid references public.stores (id) on delete cascade,
  service        public.booking_service not null,
  rating         smallint not null check (rating between 1 and 5),
  title          text check (title is null or char_length(title) <= 120),
  body           text check (body is null or char_length(body) <= 2000),
  -- Shown publicly ("Priya S."); copied from the profile when written.
  author_name    text not null check (char_length(author_name) between 1 and 60),
  locale         text not null default 'en' check (locale in ('en', 'hi')),
  status         public.review_status not null default 'pending',
  moderation_note text check (moderation_note is null or char_length(moderation_note) <= 500),
  moderated_by   uuid references auth.users (id) on delete set null,
  moderated_at   timestamptz,
  -- The business's public answer, written by staff.
  reply          text check (reply is null or char_length(reply) <= 1000),
  replied_by     uuid references auth.users (id) on delete set null,
  replied_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((subject_type = 'hotel') = (hotel_id is not null)),
  check ((subject_type = 'package') = (package_id is not null)),
  check ((subject_type = 'store') = (store_id is not null)),
  check (status <> 'rejected' or moderation_note is not null)
);
create index reviews_hotel_idx on public.reviews (hotel_id, created_at desc) where status = 'published';
create index reviews_package_idx on public.reviews (package_id, created_at desc) where status = 'published';
create index reviews_store_idx on public.reviews (store_id, created_at desc) where status = 'published';
create index reviews_service_idx on public.reviews (service, created_at desc) where status = 'published';
create index reviews_status_idx on public.reviews (status, created_at desc);
create index reviews_user_idx on public.reviews (user_id, created_at desc);

-- Photos in the public `media` bucket under reviews/<user id>/; shown once the review is published.
create table public.review_media (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references public.reviews (id) on delete cascade,
  file_path   text not null unique check (file_path ~ '^reviews/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);
create index review_media_review_idx on public.review_media (review_id, sort_order);

alter table public.packages add column rating_count integer not null default 0 check (rating_count >= 0);
alter table public.stores add column rating_count integer not null default 0 check (rating_count >= 0);

-- ---------------------------------------------------------------- wishlist & travellers

create table public.wishlists (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_type  public.wishlist_subject not null,
  subject_id    uuid not null,
  created_at    timestamptz not null default now(),
  unique (user_id, subject_type, subject_id)
);
create index wishlists_user_idx on public.wishlists (user_id, created_at desc);

create table public.travellers (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  full_name      text not null check (char_length(full_name) between 2 and 120),
  relation       text check (relation is null or char_length(relation) <= 40),
  date_of_birth  date check (date_of_birth is null or date_of_birth > date '1900-01-01'),
  gender         text check (gender is null or gender in ('female', 'male', 'other')),
  phone          text check (phone is null or phone ~ '^\+?[0-9]{10,15}$'),
  is_default     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index travellers_user_idx on public.travellers (user_id, created_at);

-- ---------------------------------------------------------------- rewards & referrals

alter table public.profiles
  add column referral_code text unique check (referral_code is null or referral_code ~ '^[A-Z0-9]{6,12}$');

-- A coupon for one customer only (reward codes); null = anyone.
alter table public.coupons add column user_id uuid references auth.users (id) on delete cascade;
create index coupons_user_idx on public.coupons (user_id) where user_id is not null;
-- Reward codes are never listed publicly, even if someone ticks "public" on one.
drop policy "public coupons are visible" on public.coupons;
create policy "public coupons are visible" on public.coupons
  for select to anon, authenticated
  using (
    (is_public and is_active and user_id is null
      and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
    or public.has_permission('offers.read')
  );

create table public.referrals (
  id           uuid primary key default gen_random_uuid(),
  referrer_id  uuid not null references auth.users (id) on delete cascade,
  referee_id   uuid not null unique references auth.users (id) on delete cascade,
  code         text not null,
  status       public.referral_status not null default 'pending',
  booking_id   uuid references public.bookings (id) on delete set null,
  rewarded_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (referrer_id <> referee_id)
);
create index referrals_referrer_idx on public.referrals (referrer_id, created_at desc);

create table public.loyalty_ledger (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  kind         public.loyalty_kind not null,
  points       integer not null check (points <> 0),
  booking_id   uuid references public.bookings (id) on delete set null,
  referral_id  uuid references public.referrals (id) on delete set null,
  review_id    uuid references public.reviews (id) on delete set null,
  coupon_id    uuid references public.coupons (id) on delete set null,
  -- Earning rows: the amount and rate the points were worked out from.
  base_paise   integer check (base_paise is null or base_paise >= 0),
  rate_bps     integer check (rate_bps is null or rate_bps between 0 and 10000),
  note         text check (note is null or char_length(note) <= 300),
  expires_at   timestamptz,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  check ((kind in ('earn', 'restore', 'referral', 'review')) = (points > 0) or kind = 'adjust'),
  check (kind not in ('redeem', 'reverse', 'expire') or points < 0)
);
create index loyalty_ledger_user_idx on public.loyalty_ledger (user_id, created_at desc);
create index loyalty_ledger_booking_idx on public.loyalty_ledger (booking_id) where booking_id is not null;
create unique index loyalty_ledger_review_idx on public.loyalty_ledger (review_id) where kind = 'review';
create unique index loyalty_ledger_restore_idx on public.loyalty_ledger (coupon_id) where kind = 'restore';

-- ---------------------------------------------------------------- customer notes

create table public.customer_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index customer_notes_user_idx on public.customer_notes (user_id, created_at desc);

-- ---------------------------------------------------------------- triggers, RLS, audit

do $$
declare t text;
begin
  foreach t in array array['reviews', 'travellers', 'referrals', 'customer_notes'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_set_updated_at', t);
  end loop;
  foreach t in array array['reviews', 'review_media', 'wishlists', 'travellers', 'referrals', 'loyalty_ledger',
                           'customer_notes'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;

-- Published reviews are public; authors see their own; moderators see all. Writes go through functions.
create policy "published, own or moderated reviews" on public.reviews
  for select to anon, authenticated
  using (status = 'published' or user_id = (select auth.uid()) or public.has_permission('reviews.read'));
-- Who wrote it and for which booking stays server-side.
revoke select on public.reviews from anon, authenticated;
grant select (
  id, subject_type, hotel_id, package_id, store_id, service, rating, title, body, author_name, locale, status,
  reply, replied_at, created_at, updated_at
) on public.reviews to anon, authenticated;

create or replace function public.can_read_review(p_review_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.reviews r where r.id = p_review_id
                  and (r.status = 'published' or r.user_id = (select auth.uid()) or public.has_permission('reviews.read')));
$$;

create policy "review photos follow the review" on public.review_media
  for select to anon, authenticated using (public.can_read_review(review_id));

create policy "own wishlist" on public.wishlists
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own travellers" on public.travellers
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "staff read travellers" on public.travellers
  for select to authenticated using (public.has_permission('customers.read'));

create policy "own or staff points" on public.loyalty_ledger
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('customers.read'));

create policy "own or staff referrals" on public.referrals
  for select to authenticated
  using (referrer_id = (select auth.uid()) or referee_id = (select auth.uid()) or public.has_permission('customers.read'));

create policy "staff read customer notes" on public.customer_notes
  for select to authenticated using (public.has_permission('customers.read'));
create policy "staff write customer notes" on public.customer_notes
  for all to authenticated
  using (public.has_permission('customers.write'))
  with check (public.has_permission('customers.write'));

select public.enable_audit('public.reviews');
select public.enable_audit('public.review_media');
select public.enable_audit('public.wishlists');
select public.enable_audit('public.travellers');
select public.enable_audit('public.referrals');
select public.enable_audit('public.loyalty_ledger');
select public.enable_audit('public.customer_notes');

-- Customers may not set their own referral code.
create or replace function public.profiles_guard_referral_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.referral_code is distinct from old.referral_code then
    raise exception 'referral_code is managed by the platform';
  end if;
  return new;
end;
$$;
create trigger profiles_guard_referral_code before update on public.profiles
  for each row execute function public.profiles_guard_referral_code();

-- A personal coupon only works for its owner, whichever booking flow reserves it.
create or replace function public.coupon_redemptions_check_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.coupons where id = new.coupon_id;
  if v_owner is not null and new.user_id is distinct from v_owner then
    raise exception 'coupon_invalid' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger coupon_redemptions_check_owner before insert on public.coupon_redemptions
  for each row execute function public.coupon_redemptions_check_owner();

-- ---------------------------------------------------------------- reviews: functions

/*
 * Whether a booking can be reviewed by its owner now, and what about. Returns
 * null when it cannot (not theirs, not finished, too old, already reviewed).
 */
create or replace function public.review_target(p_booking_id uuid, p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_b public.bookings;
  v_settings jsonb := coalesce((select value from public.settings where key = 'reviews.defaults'), '{}'::jsonb);
  v_window integer := coalesce((v_settings ->> 'window_days')::integer, 180);
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_end date;
  v_package uuid;
  v_store uuid;
begin
  select * into v_b from public.bookings where id = p_booking_id;
  if not found or v_b.user_id is distinct from p_user then return null; end if;
  if exists (select 1 from public.reviews where booking_id = p_booking_id) then return null; end if;

  select package_id, end_date into v_package, v_end from public.package_bookings where booking_id = p_booking_id;
  select store_id into v_store from public.orders where booking_id = p_booking_id;
  if v_b.service = 'hotel' then v_end := v_b.check_out; end if;

  if not (v_b.status = 'completed'
          or (v_b.status = 'confirmed' and v_end is not null and v_end <= v_today)) then
    return null;
  end if;
  if coalesce((v_b.completed_at at time zone 'Asia/Kolkata')::date, v_end) < v_today - v_window then
    return null;
  end if;

  return jsonb_build_object(
    'subject_type', case when v_b.hotel_id is not null then 'hotel'
                         when v_package is not null then 'package'
                         when v_store is not null then 'store'
                         else 'service' end,
    'hotel_id', v_b.hotel_id, 'package_id', v_package, 'store_id', v_store, 'service', v_b.service
  );
end;
$$;

/*
 * Writes a review for one of the user's bookings. p: { user_id, booking_id,
 * rating, title, body, photos: [path], locale }. Raises not_eligible.
 */
create or replace function public.submit_review(p jsonb)
returns public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (p ->> 'user_id')::uuid;
  v_target jsonb;
  v_settings jsonb := coalesce((select value from public.settings where key = 'reviews.defaults'), '{}'::jsonb);
  v_name text;
  v_review public.reviews;
  v_path text;
  v_i integer := 0;
begin
  perform public.set_actor(v_user);
  v_target := public.review_target((p ->> 'booking_id')::uuid, v_user);
  if v_target is null then raise exception 'not_eligible' using errcode = 'P0001'; end if;

  select coalesce(nullif(trim(full_name), ''), b.contact_name) into v_name
    from public.bookings b left join public.profiles pr on pr.id = b.user_id
   where b.id = (p ->> 'booking_id')::uuid;
  -- "Priya Sharma" → "Priya S."
  v_name := regexp_replace(trim(coalesce(v_name, '')), '\s+', ' ', 'g');
  v_name := trim(split_part(v_name, ' ', 1)
            || case when split_part(v_name, ' ', 2) <> ''
                    then ' ' || upper(left(split_part(v_name, ' ', 2), 1)) || '.' else '' end);
  v_name := left(coalesce(nullif(v_name, ''), 'Guest'), 60);

  insert into public.reviews (booking_id, user_id, subject_type, hotel_id, package_id, store_id, service, rating, title,
    body, author_name, locale, status)
  values ((p ->> 'booking_id')::uuid, v_user, (v_target ->> 'subject_type')::public.review_subject,
    (v_target ->> 'hotel_id')::uuid, (v_target ->> 'package_id')::uuid, (v_target ->> 'store_id')::uuid,
    (v_target ->> 'service')::public.booking_service, (p ->> 'rating')::smallint,
    nullif(trim(p ->> 'title'), ''), nullif(trim(p ->> 'body'), ''), v_name, coalesce(p ->> 'locale', 'en'),
    case when coalesce((v_settings ->> 'auto_publish')::boolean, false) then 'published' else 'pending' end
      ::public.review_status)
  returning * into v_review;

  for v_path in select jsonb_array_elements_text(coalesce(p -> 'photos', '[]'::jsonb)) loop
    if v_path !~ ('^reviews/' || v_user::text || '/') then raise exception 'invalid_photo' using errcode = 'P0001'; end if;
    insert into public.review_media (review_id, file_path, sort_order) values (v_review.id, v_path, v_i);
    v_i := v_i + 1;
  end loop;

  if v_review.status = 'published' then perform public.award_review_points(v_review.id); end if;
  return v_review;
end;
$$;

-- Publishes or rejects a review (a note is required to reject).
create or replace function public.moderate_review(p_id uuid, p_status public.review_status, p_note text, p_actor uuid)
returns public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.reviews;
begin
  perform public.set_actor(p_actor);
  if p_status = 'rejected' and nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  update public.reviews
     set status = p_status, moderation_note = nullif(trim(coalesce(p_note, '')), ''),
         moderated_by = p_actor, moderated_at = now()
   where id = p_id
  returning * into v_review;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_status = 'published' then perform public.award_review_points(p_id); end if;
  return v_review;
end;
$$;

-- Sets or clears the public reply.
create or replace function public.reply_review(p_id uuid, p_reply text, p_actor uuid)
returns public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.reviews;
begin
  perform public.set_actor(p_actor);
  update public.reviews
     set reply = nullif(trim(coalesce(p_reply, '')), ''),
         replied_by = case when nullif(trim(coalesce(p_reply, '')), '') is null then null else p_actor end,
         replied_at = case when nullif(trim(coalesce(p_reply, '')), '') is null then null else now() end
   where id = p_id
  returning * into v_review;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  return v_review;
end;
$$;

-- Keeps the cached rating on hotels, packages and stores in line with their published reviews.
create or replace function public.refresh_review_stats(p_type public.review_subject, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_avg numeric(2, 1);
  v_count integer;
begin
  if p_id is null then return; end if;
  select round(avg(rating), 1), count(*) into v_avg, v_count
    from public.reviews
   where status = 'published'
     and case p_type when 'hotel' then hotel_id when 'package' then package_id when 'store' then store_id end = p_id;
  if p_type = 'hotel' then
    update public.hotels set rating_avg = v_avg, rating_count = v_count where id = p_id;
  elsif p_type = 'package' then
    update public.packages set rating = v_avg, rating_count = v_count where id = p_id;
  elsif p_type = 'store' then
    update public.stores set rating = v_avg, rating_count = v_count where id = p_id;
  end if;
end;
$$;

create or replace function public.reviews_refresh_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_review_stats(old.subject_type, coalesce(old.hotel_id, old.package_id, old.store_id));
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_review_stats(new.subject_type, coalesce(new.hotel_id, new.package_id, new.store_id));
  end if;
  return null;
end;
$$;
create trigger reviews_refresh_stats
  after insert or update of status, rating or delete on public.reviews
  for each row execute function public.reviews_refresh_stats();

-- ---------------------------------------------------------------- rewards: functions

-- A customer's spendable points.
create or replace function public.loyalty_balance(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(points), 0)::integer from public.loyalty_ledger where user_id = p_user;
$$;

create or replace function public.loyalty_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select value from public.settings where key = 'loyalty.defaults'), '{}'::jsonb);
$$;

-- Points granted with the standard expiry.
create or replace function public.grant_points(
  p_user uuid, p_kind public.loyalty_kind, p_points integer, p_note text,
  p_booking uuid default null, p_referral uuid default null, p_review uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := (public.loyalty_settings() ->> 'expiry_days')::integer;
begin
  if p_points is null or p_points <= 0 then return; end if;
  insert into public.loyalty_ledger (user_id, kind, points, booking_id, referral_id, review_id, note, expires_at)
  values (p_user, p_kind, p_points, p_booking, p_referral, p_review, p_note,
    case when coalesce(v_days, 0) > 0 then now() + make_interval(days => v_days) end);
end;
$$;

-- One-time bonus for a review once it is published (settings review_points; 0 = none).
create or replace function public.award_review_points(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s jsonb := public.loyalty_settings();
  v_user uuid;
begin
  if not coalesce((v_s ->> 'enabled')::boolean, false) then return; end if;
  if exists (select 1 from public.loyalty_ledger where review_id = p_review_id and kind = 'review') then return; end if;
  select user_id into v_user from public.reviews where id = p_review_id;
  perform public.grant_points(v_user, 'review', (v_s ->> 'review_points')::integer, 'Review published',
                              p_review => p_review_id);
end;
$$;

/*
 * Brings a booking's earned points in line with what was paid for it (net of
 * refunds), and rewards a pending referral on the customer's first completed
 * booking. The rate is frozen on the first earning row; later refunds add a
 * negative "reverse" row.
 */
create or replace function public.sync_booking_loyalty(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.bookings;
  v_s jsonb := public.loyalty_settings();
  v_rate integer;
  v_point_paise integer := greatest(coalesce((v_s ->> 'point_value_paise')::integer, 100), 1);
  v_base integer;
  v_target integer;
  v_have integer;
  v_ref public.referrals;
  v_services jsonb := v_s -> 'earn_services';
begin
  select * into v_b from public.bookings where id = p_booking_id;
  if not found or v_b.user_id is null or v_b.completed_at is null then return; end if;
  if v_b.status not in ('completed', 'partially_refunded', 'refunded') then return; end if;

  select rate_bps into v_rate from public.loyalty_ledger
   where booking_id = p_booking_id and kind = 'earn' order by created_at limit 1;
  if v_rate is null then
    if not coalesce((v_s ->> 'enabled')::boolean, false) then return; end if;
    if jsonb_typeof(v_services) = 'array' and jsonb_array_length(v_services) > 0
       and not v_services ? v_b.service::text then
      return;
    end if;
    v_rate := coalesce((v_s ->> 'earn_bps')::integer, 0);
  end if;

  -- A completed booking was paid in full, online or to the partner.
  v_base := greatest(v_b.total_paise - v_b.refunded_paise, 0);
  v_target := floor(v_base::numeric * v_rate / 10000 / v_point_paise)::integer;
  select coalesce(sum(points), 0) into v_have from public.loyalty_ledger
   where booking_id = p_booking_id and kind in ('earn', 'reverse');

  if v_target > v_have and not exists (select 1 from public.loyalty_ledger where booking_id = p_booking_id and kind = 'earn') then
    perform public.grant_points(v_b.user_id, 'earn', v_target - v_have, 'Booking ' || v_b.code, p_booking => p_booking_id);
    update public.loyalty_ledger set base_paise = v_base, rate_bps = v_rate
     where booking_id = p_booking_id and kind = 'earn';
  elsif v_target < v_have then
    insert into public.loyalty_ledger (user_id, kind, points, booking_id, base_paise, rate_bps, note)
    values (v_b.user_id, 'reverse', v_target - v_have, p_booking_id, v_base, v_rate, 'Refund on booking ' || v_b.code);
  end if;

  -- Referral: reward both sides on the referee's first completed booking.
  if v_b.status = 'completed' and coalesce((v_s ->> 'enabled')::boolean, false) then
    select * into v_ref from public.referrals where referee_id = v_b.user_id and status = 'pending' for update;
    if v_ref.id is not null then
      update public.referrals set status = 'rewarded', booking_id = p_booking_id, rewarded_at = now() where id = v_ref.id;
      perform public.grant_points(v_ref.referrer_id, 'referral', (v_s ->> 'referrer_points')::integer,
                                  'Friend''s first booking', p_referral => v_ref.id);
      perform public.grant_points(v_ref.referee_id, 'referral', (v_s ->> 'referee_points')::integer,
                                  'Welcome bonus', p_referral => v_ref.id);
    end if;
  end if;
end;
$$;

create or replace function public.bookings_sync_loyalty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.completed_at is not null
     and (new.status is distinct from old.status
          or new.total_paise is distinct from old.total_paise
          or new.refunded_paise is distinct from old.refunded_paise) then
    perform public.sync_booking_loyalty(new.id);
  end if;
  return null;
end;
$$;
create trigger bookings_sync_loyalty
  after update on public.bookings
  for each row execute function public.bookings_sync_loyalty();

/*
 * Turns points into a one-time personal coupon worth points × point value.
 * Raises loyalty_disabled, below_minimum, above_maximum, insufficient_points.
 */
create or replace function public.redeem_points(p_user uuid, p_points integer)
returns public.coupons
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s jsonb := public.loyalty_settings();
  v_point_paise integer := greatest(coalesce((v_s ->> 'point_value_paise')::integer, 100), 1);
  v_code text;
  v_coupon public.coupons;
begin
  perform public.set_actor(p_user);
  if not coalesce((v_s ->> 'enabled')::boolean, false) then raise exception 'loyalty_disabled' using errcode = 'P0001'; end if;
  if p_points < coalesce((v_s ->> 'min_redeem_points')::integer, 1) then
    raise exception 'below_minimum' using errcode = 'P0001';
  end if;
  if (v_s ->> 'max_redeem_points') is not null and p_points > (v_s ->> 'max_redeem_points')::integer then
    raise exception 'above_maximum' using errcode = 'P0001';
  end if;
  -- One redemption at a time per customer.
  perform pg_advisory_xact_lock(hashtext('loyalty:' || p_user::text));
  if public.loyalty_balance(p_user) < p_points then raise exception 'insufficient_points' using errcode = 'P0001'; end if;

  loop
    v_code := 'PSR' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
    exit when not exists (select 1 from public.coupons where code = v_code);
  end loop;
  insert into public.coupons (code, description, discount_type, value, min_order_paise, usage_limit, per_user_limit,
    is_public, is_active, starts_at, ends_at, user_id)
  values (v_code, jsonb_build_object('en', 'P&S Rewards: ' || p_points || ' points', 'hi', 'P&S रिवॉर्ड्स: ' || p_points || ' पॉइंट'),
    'flat', p_points * v_point_paise, p_points * v_point_paise, 1, 1, false, true, now(),
    now() + make_interval(days => greatest(coalesce((v_s ->> 'code_valid_days')::integer, 30), 1)), p_user)
  returning * into v_coupon;
  insert into public.loyalty_ledger (user_id, kind, points, coupon_id, note)
  values (p_user, 'redeem', -p_points, v_coupon.id, 'Reward code ' || v_code);
  return v_coupon;
end;
$$;

-- A staff credit (+) or debit (−) with a reason.
create or replace function public.adjust_points(p_user uuid, p_points integer, p_note text, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.set_actor(p_actor);
  if p_points = 0 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  if nullif(trim(coalesce(p_note, '')), '') is null then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_points < 0 and public.loyalty_balance(p_user) + p_points < 0 then
    raise exception 'insufficient_points' using errcode = 'P0001';
  end if;
  insert into public.loyalty_ledger (user_id, kind, points, note, created_by)
  values (p_user, 'adjust', p_points, trim(p_note), p_actor)
  returning id into v_id;
  return v_id;
end;
$$;

/*
 * Daily: gives back points for reward codes that lapsed unused, then expires
 * earned points past their date that were not spent (oldest first).
 */
create or replace function public.expire_loyalty_points()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_n integer := 0;
  v_expire integer;
begin
  insert into public.loyalty_ledger (user_id, kind, points, coupon_id, note)
  select l.user_id, 'restore', -l.points, l.coupon_id, 'Reward code ' || c.code || ' lapsed unused'
    from public.loyalty_ledger l
    join public.coupons c on c.id = l.coupon_id
   where l.kind = 'redeem' and c.ends_at < now()
     and not exists (select 1 from public.coupon_redemptions cr where cr.coupon_id = c.id and cr.status <> 'released')
     and not exists (select 1 from public.loyalty_ledger x where x.coupon_id = c.id and x.kind = 'restore');
  get diagnostics v_n = row_count;
  update public.coupons c set is_active = false
   where c.user_id is not null and c.ends_at < now() and c.is_active;

  for r in
    select user_id,
           sum(points) filter (where points > 0 and expires_at <= now()) as expired_in,
           coalesce(-sum(points) filter (where points < 0), 0)
             - coalesce(sum(points) filter (where kind = 'restore'), 0) as spent
      from public.loyalty_ledger
     group by user_id
    having sum(points) filter (where points > 0 and expires_at <= now()) > 0
  loop
    v_expire := least(r.expired_in - r.spent, public.loyalty_balance(r.user_id));
    if v_expire > 0 then
      insert into public.loyalty_ledger (user_id, kind, points, note) values (r.user_id, 'expire', -v_expire, 'Points expired');
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------- referrals: functions

-- The customer's referral code, created on first use.
create or replace function public.ensure_referral_code(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  select referral_code into v_code from public.profiles where id = p_user;
  if v_code is not null then return v_code; end if;
  loop
    v_code := upper(substr(translate(md5(gen_random_uuid()::text), '01', ''), 1, 8));
    exit when char_length(v_code) = 8 and not exists (select 1 from public.profiles where referral_code = v_code);
  end loop;
  update public.profiles set referral_code = v_code where id = p_user and referral_code is null;
  select referral_code into v_code from public.profiles where id = p_user;
  return v_code;
end;
$$;

/*
 * Links a new customer to whoever referred them. Only before their first
 * completed booking. Raises referrals_disabled, invalid_code, self_referral,
 * already_referred, not_eligible.
 */
create or replace function public.claim_referral(p_user uuid, p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s jsonb := public.loyalty_settings();
  v_referrer uuid;
  v_id uuid;
begin
  perform public.set_actor(p_user);
  if not coalesce((v_s ->> 'enabled')::boolean, false) or not coalesce((v_s ->> 'referrals_enabled')::boolean, false) then
    raise exception 'referrals_disabled' using errcode = 'P0001';
  end if;
  select id into v_referrer from public.profiles where referral_code = upper(trim(p_code)) and deleted_at is null;
  if v_referrer is null then raise exception 'invalid_code' using errcode = 'P0001'; end if;
  if v_referrer = p_user then raise exception 'self_referral' using errcode = 'P0001'; end if;
  if exists (select 1 from public.referrals where referee_id = p_user) then
    raise exception 'already_referred' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.bookings where user_id = p_user and completed_at is not null) then
    raise exception 'not_eligible' using errcode = 'P0001';
  end if;
  insert into public.referrals (referrer_id, referee_id, code) values (v_referrer, p_user, upper(trim(p_code)))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- grants & schedule

do $$
declare f text;
begin
  foreach f in array array[
    'public.review_target(uuid, uuid)',
    'public.submit_review(jsonb)',
    'public.moderate_review(uuid, public.review_status, text, uuid)',
    'public.reply_review(uuid, text, uuid)',
    'public.refresh_review_stats(public.review_subject, uuid)',
    'public.reviews_refresh_stats()',
    'public.loyalty_balance(uuid)',
    'public.loyalty_settings()',
    'public.grant_points(uuid, public.loyalty_kind, integer, text, uuid, uuid, uuid)',
    'public.award_review_points(uuid)',
    'public.sync_booking_loyalty(uuid)',
    'public.bookings_sync_loyalty()',
    'public.redeem_points(uuid, integer)',
    'public.adjust_points(uuid, integer, text, uuid)',
    'public.expire_loyalty_points()',
    'public.ensure_referral_code(uuid)',
    'public.claim_referral(uuid, text)',
    'public.coupon_redemptions_check_owner()'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('expire-loyalty-points', '30 20 * * *', 'select public.expire_loyalty_points()');
  end if;
end
$$;

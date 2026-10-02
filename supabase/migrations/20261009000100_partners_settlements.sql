-- Phase 9: B2B service pages (plans and portfolio), the Partner With Us
-- onboarding flow and vendor settlements.
--
-- Model
--   * Enquiry services (photography, OTA handling, calling centre, reels
--     marketing, lead generation, travel agent & data) get admin-editable
--     plans (`service_plans`) and portfolio items (`service_portfolio`).
--     Choosing a plan opens the shared enquiry form, so every request still
--     lands in the leads CRM.
--   * A business applies through a signed-in, multi-step form (type →
--     details → documents → agreement). That writes one
--     `partner_applications` row; documents sit in the private `documents`
--     bucket under partners/<user id>/. Approving it creates the vendor, makes
--     the applicant its owner, grants the vendor role and copies the
--     documents into `vendor_documents`.
--   * Settlements: every completed booking that belongs to a vendor (the
--     hotel's or store's vendor, or the vendor of the cab / ride vehicle or
--     driver) gets ledger rows in `vendor_ledger_entries`: gross value, what
--     the platform collected online, what the vendor collected directly (pay
--     at hotel, balance to the driver), commission, GST on commission and TCS
--     / TDS placeholders, and the net the platform owes the vendor (negative
--     = the vendor owes the platform). Later refunds or payments add the
--     difference. A payout (`vendor_payouts`) gathers unsettled rows up to a
--     date; it is paid by hand today (Razorpay Route is designed in, off).
--   * Ledger, payouts and applications are written only through the
--     service-role functions below after a permission check; plans and
--     portfolio are plain CMS tables under RLS.

-- ---------------------------------------------------------------- types

create type public.partner_business_type as enum (
  'hotel', 'travel_agency', 'restaurant', 'transport', 'shop', 'pharmacy', 'service_provider', 'other'
);
create type public.partner_application_status as enum ('submitted', 'under_review', 'approved', 'rejected');
create type public.vendor_document_status as enum ('pending', 'verified', 'rejected');
create type public.ledger_entry_kind as enum ('booking', 'adjustment', 'manual');
create type public.payout_status as enum ('pending', 'paid', 'cancelled');

-- ---------------------------------------------------------------- service plans & portfolio

create table public.service_plans (
  id            uuid primary key default gen_random_uuid(),
  service_id    uuid not null references public.services (id) on delete cascade,
  name          jsonb not null check (public.is_localized(name)),
  summary       jsonb check (summary is null or public.is_localized(summary)),
  -- null = "price on request".
  price_paise   integer check (price_paise is null or price_paise >= 0),
  -- e.g. {"en": "per month"}; shown after the price.
  price_suffix  jsonb check (price_suffix is null or public.is_localized(price_suffix)),
  features      jsonb not null default '[]'::jsonb check (public.is_localized_list(features)),
  is_popular    boolean not null default false,
  sort_order    integer not null default 0,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index service_plans_service_idx on public.service_plans (service_id, sort_order);

create table public.service_portfolio (
  id            uuid primary key default gen_random_uuid(),
  service_id    uuid not null references public.services (id) on delete cascade,
  media_id      uuid references public.media (id) on delete set null,
  title         jsonb not null check (public.is_localized(title)),
  caption       jsonb check (caption is null or public.is_localized(caption)),
  client_name   text check (client_name is null or char_length(client_name) <= 120),
  -- A reel, video or live listing to open (https only).
  link_url      text check (link_url is null or link_url ~ '^https://'),
  sort_order    integer not null default 0,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (media_id is not null or link_url is not null)
);
create index service_portfolio_service_idx on public.service_portfolio (service_id, sort_order);

-- ---------------------------------------------------------------- vendors (extended)

alter table public.vendors
  add column pan                    text check (pan is null or pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  add column address                text check (address is null or char_length(address) <= 500),
  add column city                   text check (city is null or char_length(city) <= 80),
  -- { holder, account_number, ifsc, bank, upi_id } for manual payouts.
  add column bank_details           jsonb check (bank_details is null or jsonb_typeof(bank_details) = 'object'),
  add column agreement_version      text,
  add column agreement_accepted_at  timestamptz,
  add column notes                  text check (notes is null or char_length(notes) <= 2000);

-- ---------------------------------------------------------------- partner applications

create table public.partner_applications (
  id                  uuid primary key default gen_random_uuid(),
  number              bigint generated always as identity unique,
  user_id             uuid not null references auth.users (id) on delete cascade,
  business_type       public.partner_business_type not null,
  business_name       text not null check (char_length(business_name) between 2 and 160),
  contact_name        text not null check (char_length(contact_name) between 2 and 120),
  phone               text not null check (phone ~ '^\+?[0-9]{10,15}$'),
  email               extensions.citext not null,
  city                text not null check (char_length(city) between 2 and 80),
  address             text not null check (char_length(address) between 5 and 500),
  gstin               text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  pan                 text check (pan is null or pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  website             text check (website is null or char_length(website) <= 300),
  -- Type-specific answers: rooms, fleet size, cuisines, licence numbers, …
  details             jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  message             text check (message is null or char_length(message) <= 2000),
  -- [{ kind, path, name, mime_type, size }] in the private documents bucket.
  documents           jsonb not null default '[]'::jsonb check (jsonb_typeof(documents) = 'array'),
  agreement_version   text not null,
  agreement_name      text not null check (char_length(agreement_name) between 2 and 120),
  agreement_accepted_at timestamptz not null default now(),
  status              public.partner_application_status not null default 'submitted',
  review_note         text check (review_note is null or char_length(review_note) <= 1000),
  reviewed_by         uuid references auth.users (id) on delete set null,
  reviewed_at         timestamptz,
  vendor_id           uuid references public.vendors (id) on delete set null,
  locale              text not null default 'en' check (locale in ('en', 'hi')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index partner_applications_status_idx on public.partner_applications (status, created_at desc);
-- One open application per person.
create unique index partner_applications_open_idx on public.partner_applications (user_id)
  where status in ('submitted', 'under_review');

alter table public.vendors
  add column application_id uuid references public.partner_applications (id) on delete set null;

-- ---------------------------------------------------------------- vendor documents

create table public.vendor_documents (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references public.vendors (id) on delete cascade,
  kind          text not null check (kind ~ '^[a-z_]{2,40}$'),
  file_path     text not null unique,
  file_name     text not null check (char_length(file_name) between 1 and 200),
  mime_type     text not null,
  size_bytes    integer not null check (size_bytes > 0),
  expires_on    date,
  status        public.vendor_document_status not null default 'pending',
  note          text check (note is null or char_length(note) <= 500),
  uploaded_by   uuid references auth.users (id) on delete set null,
  verified_by   uuid references auth.users (id) on delete set null,
  verified_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index vendor_documents_vendor_idx on public.vendor_documents (vendor_id, created_at desc);

-- ---------------------------------------------------------------- settlements

create table public.vendor_payouts (
  id            uuid primary key default gen_random_uuid(),
  number        bigint generated always as identity unique,
  vendor_id     uuid not null references public.vendors (id) on delete restrict,
  -- Settles every unsettled ledger row dated on or before this day.
  period_end    date not null,
  entries_count integer not null check (entries_count > 0),
  gross_paise   bigint not null,
  commission_paise bigint not null,
  -- Positive: the platform pays the vendor. Negative: the vendor owes the platform.
  amount_paise  bigint not null,
  status        public.payout_status not null default 'pending',
  -- 'manual' today; 'razorpay_route' when that adapter is switched on.
  provider      text not null default 'manual' check (provider ~ '^[a-z0-9_]+$'),
  method        text check (method is null or method in ('bank_transfer', 'upi', 'cash', 'cheque', 'adjusted', 'other')),
  reference     text check (reference is null or char_length(reference) <= 120),
  notes         text check (notes is null or char_length(notes) <= 1000),
  created_by    uuid references auth.users (id) on delete set null,
  paid_by       uuid references auth.users (id) on delete set null,
  paid_at       timestamptz,
  cancelled_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index vendor_payouts_vendor_idx on public.vendor_payouts (vendor_id, created_at desc);
create index vendor_payouts_status_idx on public.vendor_payouts (status, created_at desc);

create table public.vendor_ledger_entries (
  id                        uuid primary key default gen_random_uuid(),
  vendor_id                 uuid not null references public.vendors (id) on delete restrict,
  booking_id                uuid references public.bookings (id) on delete restrict,
  kind                      public.ledger_entry_kind not null,
  entry_date                date not null default ((now() at time zone 'Asia/Kolkata')::date),
  gross_paise               integer not null default 0,
  platform_collected_paise  integer not null default 0,
  vendor_collected_paise    integer not null default 0,
  commission_paise          integer not null default 0,
  commission_tax_paise      integer not null default 0,
  tcs_paise                 integer not null default 0,
  tds_paise                 integer not null default 0,
  -- Manual credits (+) or debits (−) typed by finance.
  adjustment_paise          integer not null default 0,
  net_paise                 integer not null,
  -- Rates used, frozen when the booking first settles.
  commission_bps            integer not null default 0 check (commission_bps between 0 and 10000),
  commission_tax_bps        integer not null default 0 check (commission_tax_bps between 0 and 10000),
  tcs_bps                   integer not null default 0 check (tcs_bps between 0 and 10000),
  tds_bps                   integer not null default 0 check (tds_bps between 0 and 10000),
  note                      text check (note is null or char_length(note) <= 500),
  payout_id                 uuid references public.vendor_payouts (id) on delete set null,
  created_by                uuid references auth.users (id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (net_paise = platform_collected_paise - commission_paise - commission_tax_paise - tcs_paise - tds_paise + adjustment_paise),
  check (gross_paise = platform_collected_paise + vendor_collected_paise),
  check (kind = 'manual' or booking_id is not null)
);
create index vendor_ledger_vendor_idx on public.vendor_ledger_entries (vendor_id, entry_date desc);
create index vendor_ledger_unsettled_idx on public.vendor_ledger_entries (vendor_id, entry_date) where payout_id is null;
create index vendor_ledger_booking_idx on public.vendor_ledger_entries (booking_id);
create index vendor_ledger_payout_idx on public.vendor_ledger_entries (payout_id);

-- ---------------------------------------------------------------- triggers, RLS, audit

do $$
declare t text;
begin
  foreach t in array array['service_plans', 'service_portfolio', 'partner_applications', 'vendor_documents',
                           'vendor_payouts', 'vendor_ledger_entries']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_set_updated_at', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;

create policy "published plans are public" on public.service_plans
  for select to anon, authenticated using (is_published or public.has_permission('cms.read'));
create policy "cms editors manage plans" on public.service_plans
  for all to authenticated using (public.has_permission('cms.write')) with check (public.has_permission('cms.write'));

create policy "published portfolio is public" on public.service_portfolio
  for select to anon, authenticated using (is_published or public.has_permission('cms.read'));
create policy "cms editors manage portfolio" on public.service_portfolio
  for all to authenticated using (public.has_permission('cms.write')) with check (public.has_permission('cms.write'));

-- Applicants see their own applications; vendor staff see all. Writes go through functions.
create policy "applicants and vendor staff read applications" on public.partner_applications
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('vendors.read'));

create policy "vendor staff and members read documents" on public.vendor_documents
  for select to authenticated
  using (public.has_permission('vendors.read') or public.is_vendor_member(vendor_id));
create policy "vendor managers manage documents" on public.vendor_documents
  for all to authenticated
  using (public.has_permission('vendors.write'))
  with check (public.has_permission('vendors.write'));

create policy "finance and members read payouts" on public.vendor_payouts
  for select to authenticated
  using (public.has_permission('payments.read') or public.is_vendor_member(vendor_id));
create policy "finance and members read ledger" on public.vendor_ledger_entries
  for select to authenticated
  using (public.has_permission('payments.read') or public.is_vendor_member(vendor_id));

select public.enable_audit('public.service_plans');
select public.enable_audit('public.service_portfolio');
select public.enable_audit('public.partner_applications');
select public.enable_audit('public.vendor_documents');
select public.enable_audit('public.vendor_payouts');
select public.enable_audit('public.vendor_ledger_entries');

-- ---------------------------------------------------------------- applications

/*
 * Records an application from a signed-in user. p: { user_id, business_type,
 * business_name, contact_name, phone, email, city, address, gstin, pan,
 * website, details, message, documents, agreement_version, agreement_name,
 * locale }. Raises application_open when the user already has one waiting.
 */
create or replace function public.submit_partner_application(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.partner_applications;
begin
  perform public.set_actor((p ->> 'user_id')::uuid);
  if exists (select 1 from public.partner_applications
              where user_id = (p ->> 'user_id')::uuid and status in ('submitted', 'under_review')) then
    raise exception 'application_open' using errcode = 'P0001';
  end if;
  insert into public.partner_applications (user_id, business_type, business_name, contact_name, phone, email, city,
    address, gstin, pan, website, details, message, documents, agreement_version, agreement_name, locale)
  values (
    (p ->> 'user_id')::uuid, (p ->> 'business_type')::public.partner_business_type, p ->> 'business_name',
    p ->> 'contact_name', p ->> 'phone', p ->> 'email', p ->> 'city', p ->> 'address',
    nullif(p ->> 'gstin', ''), nullif(p ->> 'pan', ''), nullif(p ->> 'website', ''),
    coalesce(p -> 'details', '{}'::jsonb), nullif(p ->> 'message', ''), coalesce(p -> 'documents', '[]'::jsonb),
    p ->> 'agreement_version', p ->> 'agreement_name', coalesce(p ->> 'locale', 'en')
  )
  returning * into v_app;
  return jsonb_build_object('id', v_app.id, 'number', v_app.number);
end;
$$;

-- Moves an application to under_review or rejected (a note is required to reject).
create or replace function public.review_partner_application(
  p_id uuid, p_status public.partner_application_status, p_note text, p_actor uuid
)
returns public.partner_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.partner_applications;
begin
  perform public.set_actor(p_actor);
  select * into v_app from public.partner_applications where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_status not in ('under_review', 'rejected')
     or v_app.status not in ('submitted', 'under_review')
     or (p_status = 'under_review' and v_app.status <> 'submitted') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if p_status = 'rejected' and nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  update public.partner_applications
     set status = p_status, review_note = coalesce(nullif(trim(p_note), ''), review_note),
         reviewed_by = p_actor, reviewed_at = now()
   where id = p_id
  returning * into v_app;
  return v_app;
end;
$$;

-- Vendor kind for a partner business type.
create or replace function public.partner_vendor_kind(p_type public.partner_business_type)
returns public.vendor_kind
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'hotel' then 'hotel'
    when 'travel_agency' then 'agency'
    when 'restaurant' then 'restaurant'
    when 'transport' then 'transport'
    when 'shop' then 'store'
    when 'pharmacy' then 'pharmacy'
    else 'other'
  end::public.vendor_kind;
$$;

/*
 * Approves an application: creates the vendor (active), makes the applicant
 * its owner with the vendor role, copies the documents (verified by the
 * approver) and links everything. p_commission_bps null = the default for
 * the business type from settings `partners.defaults`, else 10%.
 */
create or replace function public.approve_partner_application(p_id uuid, p_commission_bps integer, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.partner_applications;
  v_settings jsonb := coalesce((select value from public.settings where key = 'partners.defaults'), '{}'::jsonb);
  v_bps integer;
  v_base text;
  v_slug text;
  v_n integer := 1;
  v_vendor uuid;
  v_role uuid;
  v_doc jsonb;
begin
  perform public.set_actor(p_actor);
  select * into v_app from public.partner_applications where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_app.status not in ('submitted', 'under_review') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  v_bps := coalesce(p_commission_bps,
                    (v_settings -> 'commission_bps' ->> v_app.business_type::text)::integer,
                    1000);
  if v_bps < 0 or v_bps > 10000 then raise exception 'invalid_commission' using errcode = 'P0001'; end if;

  v_base := trim(both '-' from regexp_replace(lower(v_app.business_name), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then v_base := 'partner'; end if;
  v_base := left(v_base, 60);
  v_slug := v_base;
  while exists (select 1 from public.vendors where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  insert into public.vendors (kind, name, slug, contact_name, phone, email, gstin, pan, address, city,
    commission_bps, status, agreement_version, agreement_accepted_at, application_id)
  values (public.partner_vendor_kind(v_app.business_type), v_app.business_name, v_slug, v_app.contact_name,
    v_app.phone, v_app.email, v_app.gstin, v_app.pan, v_app.address, v_app.city, v_bps, 'active',
    v_app.agreement_version, v_app.agreement_accepted_at, v_app.id)
  returning id into v_vendor;

  insert into public.vendor_members (vendor_id, user_id, role) values (v_vendor, v_app.user_id, 'owner')
  on conflict do nothing;

  select id into v_role from public.roles where key = 'vendor';
  if v_role is not null then
    insert into public.user_roles (user_id, role_id, granted_by) values (v_app.user_id, v_role, p_actor)
    on conflict do nothing;
  end if;

  for v_doc in select * from jsonb_array_elements(v_app.documents) loop
    insert into public.vendor_documents (vendor_id, kind, file_path, file_name, mime_type, size_bytes, status,
      uploaded_by, verified_by, verified_at)
    values (v_vendor, v_doc ->> 'kind', v_doc ->> 'path', coalesce(v_doc ->> 'name', 'document'),
      coalesce(v_doc ->> 'mime_type', 'application/octet-stream'), greatest(coalesce((v_doc ->> 'size')::integer, 1), 1),
      'verified', v_app.user_id, p_actor, now())
    on conflict (file_path) do nothing;
  end loop;

  update public.partner_applications
     set status = 'approved', vendor_id = v_vendor, reviewed_by = p_actor, reviewed_at = now()
   where id = p_id;
  return v_vendor;
end;
$$;

-- ---------------------------------------------------------------- ledger

/*
 * The vendor a booking settles with: the booking's own vendor (hotel, store),
 * else the vendor of the vehicle, else of the driver, on its cab trip or ride.
 */
create or replace function public.booking_settlement_vendor(p_booking_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select b.vendor_id from public.bookings b where b.id = p_booking_id),
    (select coalesce(v.vendor_id, d.vendor_id)
       from public.trips t
       left join public.vehicles v on v.id = t.vehicle_id
       left join public.drivers d on d.id = t.driver_id
      where t.booking_id = p_booking_id),
    (select coalesce(v.vendor_id, d.vendor_id)
       from public.ride_requests r
       left join public.vehicles v on v.id = r.vehicle_id
       left join public.drivers d on d.id = r.driver_id
      where r.booking_id = p_booking_id)
  );
$$;

/*
 * Brings a completed booking's ledger rows in line with the booking. The
 * target is computed from the booking now; the difference from the rows
 * already written is added to the booking's unsettled row, or written as a
 * new row (an adjustment once part of it has been paid out). Rates are
 * frozen from the first row. Does nothing for bookings that never
 * completed or have no vendor.
 */
create or replace function public.sync_vendor_ledger(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.bookings;
  v_vendor uuid;
  v_settings jsonb := coalesce((select value from public.settings where key = 'settlements.defaults'), '{}'::jsonb);
  v_first public.vendor_ledger_entries;
  v_open uuid;
  v_bps integer; v_tax_bps integer; v_tcs_bps integer; v_tds_bps integer;
  t_gross integer; t_platform integer; t_vendor integer; t_comm integer; t_comm_tax integer; t_tcs integer; t_tds integer;
  c record;
  d_gross integer; d_platform integer; d_vendor integer; d_comm integer; d_comm_tax integer; d_tcs integer; d_tds integer;
begin
  select * into v_b from public.bookings where id = p_booking_id;
  if not found or v_b.completed_at is null then return; end if;
  if v_b.status not in ('completed', 'partially_refunded', 'refunded') then return; end if;

  select * into v_first from public.vendor_ledger_entries
   where booking_id = p_booking_id order by created_at, id limit 1;
  v_vendor := coalesce(v_first.vendor_id, public.booking_settlement_vendor(p_booking_id));
  if v_vendor is null then return; end if;

  if v_first.id is not null then
    v_bps := v_first.commission_bps; v_tax_bps := v_first.commission_tax_bps;
    v_tcs_bps := v_first.tcs_bps; v_tds_bps := v_first.tds_bps;
  else
    select commission_bps into v_bps from public.vendors where id = v_vendor;
    v_tax_bps := coalesce((v_settings ->> 'commission_tax_bps')::integer, 1800);
    v_tcs_bps := coalesce((v_settings ->> 'tcs_bps')::integer, 0);
    v_tds_bps := coalesce((v_settings ->> 'tds_bps')::integer, 0);
  end if;

  t_gross := greatest(v_b.total_paise - v_b.refunded_paise, 0);
  t_platform := least(greatest(v_b.paid_paise - v_b.refunded_paise, 0), t_gross);
  t_vendor := t_gross - t_platform;
  t_comm := round(t_gross * v_bps / 10000.0);
  t_comm_tax := round(t_comm * v_tax_bps / 10000.0);
  t_tcs := round(t_gross * v_tcs_bps / 10000.0);
  t_tds := round(t_gross * v_tds_bps / 10000.0);

  select coalesce(sum(gross_paise), 0)::integer as gross, coalesce(sum(platform_collected_paise), 0)::integer as platform,
         coalesce(sum(vendor_collected_paise), 0)::integer as vendor, coalesce(sum(commission_paise), 0)::integer as comm,
         coalesce(sum(commission_tax_paise), 0)::integer as comm_tax, coalesce(sum(tcs_paise), 0)::integer as tcs,
         coalesce(sum(tds_paise), 0)::integer as tds
    into c
    from public.vendor_ledger_entries where booking_id = p_booking_id and kind <> 'manual';

  d_gross := t_gross - c.gross; d_platform := t_platform - c.platform; d_vendor := t_vendor - c.vendor;
  d_comm := t_comm - c.comm; d_comm_tax := t_comm_tax - c.comm_tax; d_tcs := t_tcs - c.tcs; d_tds := t_tds - c.tds;
  if v_first.id is not null and d_gross = 0 and d_platform = 0 and d_vendor = 0 and d_comm = 0
     and d_comm_tax = 0 and d_tcs = 0 and d_tds = 0 then
    return;
  end if;

  select id into v_open from public.vendor_ledger_entries
   where booking_id = p_booking_id and kind <> 'manual' and payout_id is null
   order by created_at desc, id limit 1 for update;

  if v_open is not null then
    update public.vendor_ledger_entries
       set gross_paise = gross_paise + d_gross,
           platform_collected_paise = platform_collected_paise + d_platform,
           vendor_collected_paise = vendor_collected_paise + d_vendor,
           commission_paise = commission_paise + d_comm,
           commission_tax_paise = commission_tax_paise + d_comm_tax,
           tcs_paise = tcs_paise + d_tcs,
           tds_paise = tds_paise + d_tds,
           net_paise = net_paise + d_platform - d_comm - d_comm_tax - d_tcs - d_tds
     where id = v_open;
  else
    insert into public.vendor_ledger_entries (vendor_id, booking_id, kind, entry_date, gross_paise,
      platform_collected_paise, vendor_collected_paise, commission_paise, commission_tax_paise, tcs_paise, tds_paise,
      net_paise, commission_bps, commission_tax_bps, tcs_bps, tds_bps, note)
    values (v_vendor, p_booking_id,
      case when v_first.id is null then 'booking' else 'adjustment' end::public.ledger_entry_kind,
      case when v_first.id is null then (v_b.completed_at at time zone 'Asia/Kolkata')::date
           else (now() at time zone 'Asia/Kolkata')::date end,
      d_gross, d_platform, d_vendor, d_comm, d_comm_tax, d_tcs, d_tds,
      d_platform - d_comm - d_comm_tax - d_tcs - d_tds,
      v_bps, v_tax_bps, v_tcs_bps, v_tds_bps,
      case when v_first.id is null then null else 'Booking changed after payout' end);
  end if;
end;
$$;

create or replace function public.bookings_sync_vendor_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.completed_at is not null
     and (new.status is distinct from old.status
          or new.paid_paise is distinct from old.paid_paise
          or new.refunded_paise is distinct from old.refunded_paise
          or new.total_paise is distinct from old.total_paise) then
    perform public.sync_vendor_ledger(new.id);
  end if;
  return null;
end;
$$;

create trigger bookings_sync_vendor_ledger
  after update on public.bookings
  for each row execute function public.bookings_sync_vendor_ledger();

-- A manual credit (+) or debit (−) on a vendor's ledger, e.g. a damage charge or a goodwill credit.
create or replace function public.add_vendor_adjustment(p_vendor_id uuid, p_amount integer, p_note text, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.set_actor(p_actor);
  if not exists (select 1 from public.vendors where id = p_vendor_id and deleted_at is null) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_amount = 0 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  if nullif(trim(coalesce(p_note, '')), '') is null then raise exception 'reason_required' using errcode = 'P0001'; end if;
  insert into public.vendor_ledger_entries (vendor_id, kind, adjustment_paise, net_paise, note, created_by)
  values (p_vendor_id, 'manual', p_amount, p_amount, trim(p_note), p_actor)
  returning id into v_id;
  return v_id;
end;
$$;

/*
 * Gathers a vendor's unsettled ledger rows dated on or before p_period_end
 * into one pending payout. Raises nothing_to_settle when there are none and
 * payout_pending when the vendor already has one waiting.
 */
create or replace function public.create_vendor_payout(p_vendor_id uuid, p_period_end date, p_actor uuid)
returns public.vendor_payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payout public.vendor_payouts;
  v_settings jsonb := coalesce((select value from public.settings where key = 'settlements.defaults'), '{}'::jsonb);
  c record;
begin
  perform public.set_actor(p_actor);
  perform 1 from public.vendors where id = p_vendor_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if exists (select 1 from public.vendor_payouts where vendor_id = p_vendor_id and status = 'pending') then
    raise exception 'payout_pending' using errcode = 'P0001';
  end if;
  select count(*)::integer as n, coalesce(sum(net_paise), 0) as net, coalesce(sum(gross_paise), 0) as gross,
         coalesce(sum(commission_paise), 0) as comm
    into c
    from public.vendor_ledger_entries
   where vendor_id = p_vendor_id and payout_id is null and entry_date <= p_period_end;
  if c.n = 0 then raise exception 'nothing_to_settle' using errcode = 'P0001'; end if;

  insert into public.vendor_payouts (vendor_id, period_end, entries_count, gross_paise, commission_paise, amount_paise,
    provider, created_by)
  values (p_vendor_id, p_period_end, c.n, c.gross, c.comm, c.net,
    coalesce(nullif(v_settings ->> 'provider', ''), 'manual'), p_actor)
  returning * into v_payout;

  update public.vendor_ledger_entries set payout_id = v_payout.id
   where vendor_id = p_vendor_id and payout_id is null and entry_date <= p_period_end;
  return v_payout;
end;
$$;

create or replace function public.mark_vendor_payout_paid(p_id uuid, p_method text, p_reference text, p_notes text, p_actor uuid)
returns public.vendor_payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payout public.vendor_payouts;
begin
  perform public.set_actor(p_actor);
  update public.vendor_payouts
     set status = 'paid', method = p_method, reference = nullif(trim(coalesce(p_reference, '')), ''),
         notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes), paid_by = p_actor, paid_at = now()
   where id = p_id and status = 'pending'
  returning * into v_payout;
  if not found then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  return v_payout;
end;
$$;

-- Cancels a pending payout; its rows go back to unsettled.
create or replace function public.cancel_vendor_payout(p_id uuid, p_actor uuid)
returns public.vendor_payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payout public.vendor_payouts;
begin
  perform public.set_actor(p_actor);
  update public.vendor_payouts set status = 'cancelled', cancelled_at = now()
   where id = p_id and status = 'pending'
  returning * into v_payout;
  if not found then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  update public.vendor_ledger_entries set payout_id = null where payout_id = p_id;
  return v_payout;
end;
$$;

-- ---------------------------------------------------------------- vendor self-service

/*
 * A vendor member updates their business's contact, tax and payout details
 * from the portal. p: { contact_name, phone, email, address, city, gstin,
 * pan, bank_details }. Status, commission and name stay with staff.
 */
create or replace function public.update_vendor_profile(p_vendor_id uuid, p jsonb, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.set_actor(p_actor);
  if not exists (select 1 from public.vendor_members where vendor_id = p_vendor_id and user_id = p_actor) then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  update public.vendors
     set contact_name = p ->> 'contact_name', phone = p ->> 'phone', email = p ->> 'email',
         address = p ->> 'address', city = p ->> 'city', gstin = nullif(p ->> 'gstin', ''),
         pan = nullif(p ->> 'pan', ''), bank_details = p -> 'bank_details'
   where id = p_vendor_id and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
end;
$$;

-- A vendor member adds a document (pending until staff verify it). p: { kind, path, name, mime_type, size, expires_on }.
create or replace function public.add_vendor_document(p_vendor_id uuid, p jsonb, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.set_actor(p_actor);
  if not exists (select 1 from public.vendor_members where vendor_id = p_vendor_id and user_id = p_actor) then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  insert into public.vendor_documents (vendor_id, kind, file_path, file_name, mime_type, size_bytes, expires_on, uploaded_by)
  values (p_vendor_id, p ->> 'kind', p ->> 'path', p ->> 'name', p ->> 'mime_type', (p ->> 'size')::integer,
    nullif(p ->> 'expires_on', '')::date, p_actor)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- grants

do $$
declare f text;
begin
  foreach f in array array[
    'public.submit_partner_application(jsonb)',
    'public.review_partner_application(uuid, public.partner_application_status, text, uuid)',
    'public.approve_partner_application(uuid, integer, uuid)',
    'public.booking_settlement_vendor(uuid)',
    'public.sync_vendor_ledger(uuid)',
    'public.bookings_sync_vendor_ledger()',
    'public.add_vendor_adjustment(uuid, integer, text, uuid)',
    'public.create_vendor_payout(uuid, date, uuid)',
    'public.mark_vendor_payout_paid(uuid, text, text, text, uuid)',
    'public.cancel_vendor_payout(uuid, uuid)',
    'public.update_vendor_profile(uuid, jsonb, uuid)',
    'public.add_vendor_document(uuid, jsonb, uuid)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;

-- Bookings that completed before this phase settle now.
select public.sync_vendor_ledger(id) from public.bookings where completed_at is not null;

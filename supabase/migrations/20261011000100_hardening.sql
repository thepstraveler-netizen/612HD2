-- Phase 11: hardening.
--   * rate_limit_hits + hit_rate_limit(): a fixed-window limiter the app calls
--     with the service role on auth, enquiry, coupon, partner, review and
--     upload endpoints (D-093). Upstash can replace it via the adapter.
--   * privacy_requests: DPDP data export log and account-deletion requests
--     that staff complete from Admin → Customers (D-095).
--   * security.defaults: limits, Turnstile and admin 2FA switches (admin-editable).
-- Additive only (the hosted connector cannot run destructive statements).

-- ---------------------------------------------------------------- rate limits

create table public.rate_limit_hits (
  bucket       text not null check (char_length(bucket) between 3 and 200),
  window_start timestamptz not null,
  hits         integer not null default 1 check (hits > 0),
  primary key (bucket, window_start)
);
create index rate_limit_hits_window_idx on public.rate_limit_hits (window_start);

-- RLS on with no policies: only the service role (which bypasses RLS) reads or
-- writes it. Not audited: it changes on every request and holds no business data.
alter table public.rate_limit_hits enable row level security;

/*
 * Counts one hit for `p_bucket` (e.g. "enquiry:ip:1.2.3.4") in the current
 * fixed window and says whether it is still within `p_limit`. retry_after is
 * the seconds left in the window when blocked, else 0.
 */
create or replace function public.hit_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, hits integer, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid_limit' using errcode = 'P0001';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limit_hits as r (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  allowed := v_hits <= p_limit;
  hits := v_hits;
  retry_after := case when allowed then 0
                      else greatest(1, ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - now())))::integer)
                 end;
  return next;
end;
$$;

create or replace function public.purge_rate_limits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from public.rate_limit_hits where window_start < now() - interval '1 day';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------- privacy requests

create type public.privacy_request_kind as enum ('export', 'delete');
create type public.privacy_request_status as enum ('pending', 'completed', 'cancelled', 'rejected');

create table public.privacy_requests (
  id            uuid primary key default gen_random_uuid(),
  -- Null once the account is deleted; email keeps the record of who asked.
  user_id       uuid references auth.users (id) on delete set null,
  email         extensions.citext,
  kind          public.privacy_request_kind not null,
  status        public.privacy_request_status not null default 'pending',
  reason        text check (char_length(reason) <= 1000),
  note          text check (char_length(note) <= 1000),
  processed_by  uuid references auth.users (id) on delete set null,
  processed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index privacy_requests_user_idx on public.privacy_requests (user_id, created_at desc);
create index privacy_requests_pending_idx on public.privacy_requests (created_at) where status = 'pending';
-- One open deletion request per account.
create unique index privacy_requests_one_pending_delete
  on public.privacy_requests (user_id) where kind = 'delete' and status = 'pending';

create trigger privacy_requests_set_updated_at before update on public.privacy_requests
  for each row execute function public.set_updated_at();

alter table public.privacy_requests enable row level security;
create policy "own or staff privacy requests" on public.privacy_requests
  for select using (user_id = (select auth.uid()) or public.has_permission('customers.read'));
select public.enable_audit('public.privacy_requests');

/*
 * Bookings that stop an account being deleted right away: anything still
 * awaiting payment or confirmed and not yet completed.
 */
create or replace function public.account_deletion_blockers(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.bookings
   where user_id = p_user
     and status in ('pending_payment', 'confirmed');
$$;

create or replace function public.request_account_deletion(p_user uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_email extensions.citext;
begin
  perform public.set_actor(p_user);
  select email into v_email from public.profiles where id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if exists (select 1 from public.privacy_requests
              where user_id = p_user and kind = 'delete' and status = 'pending') then
    raise exception 'already_requested' using errcode = 'P0001';
  end if;
  insert into public.privacy_requests (user_id, email, kind, reason)
  values (p_user, v_email, 'delete', nullif(trim(coalesce(p_reason, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.cancel_account_deletion(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.set_actor(p_user);
  update public.privacy_requests
     set status = 'cancelled', processed_at = now(), processed_by = p_user
   where user_id = p_user and kind = 'delete' and status = 'pending';
  return found;
end;
$$;

-- Each export the customer downloads is logged as a completed request.
create or replace function public.log_data_export(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.set_actor(p_user);
  insert into public.privacy_requests (user_id, email, kind, status, processed_at, processed_by)
  select p_user, email, 'export', 'completed', now(), p_user from public.profiles where id = p_user
  returning id into v_id;
  if v_id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  return v_id;
end;
$$;

/*
 * Staff close a deletion request. 'completed' is recorded by the app only
 * after it has deleted the auth user (which cascades the profile, addresses,
 * travellers, wishlist, points and reviews, and keeps bookings with user_id
 * null for tax records); 'rejected' needs a note.
 */
create or replace function public.resolve_privacy_request(
  p_actor uuid, p_id uuid, p_status public.privacy_request_status, p_note text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.set_actor(p_actor);
  if p_status not in ('completed', 'rejected') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if p_status = 'rejected' and nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  update public.privacy_requests
     set status = p_status, note = nullif(trim(coalesce(p_note, '')), ''),
         processed_at = now(), processed_by = p_actor
   where id = p_id and status = 'pending';
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------- settings

insert into public.settings (key, value, is_public, description) values
  ('security.defaults',
   '{"require_admin_mfa": false, "turnstile_enabled": true,
     "rate_limits": {
       "auth":    {"limit": 10, "window_seconds": 600},
       "enquiry": {"limit": 5,  "window_seconds": 600},
       "coupon":  {"limit": 30, "window_seconds": 600},
       "partner": {"limit": 3,  "window_seconds": 3600},
       "review":  {"limit": 10, "window_seconds": 3600},
       "upload":  {"limit": 30, "window_seconds": 600},
       "export":  {"limit": 5,  "window_seconds": 3600}
     }}',
   false,
   'Security: require two-step sign-in for staff, check Cloudflare Turnstile on public forms (when keys are set), and requests allowed per visitor in each window for sign-in, enquiry, coupon, partner, review, upload and data-export endpoints')
on conflict (key) do nothing;

-- ---------------------------------------------------------------- grants & schedule

do $$
declare f text;
begin
  foreach f in array array[
    'public.hit_rate_limit(text, integer, integer)',
    'public.purge_rate_limits()',
    'public.account_deletion_blockers(uuid)',
    'public.request_account_deletion(uuid, text)',
    'public.cancel_account_deletion(uuid)',
    'public.log_data_export(uuid)',
    'public.resolve_privacy_request(uuid, uuid, public.privacy_request_status, text)'
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
    perform cron.schedule('purge-rate-limits', '17 * * * *', 'select public.purge_rate_limits()');
  end if;
end
$$;

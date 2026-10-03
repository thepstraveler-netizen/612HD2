-- Phase 11 security review fixes (D-098). Additive only: policies are
-- changed with ALTER POLICY and grants are re-issued column by column.

-- ---------------------------------------------------------------- medicine quotes are staff-priced

-- Pharmacies keep read access through "pharmacies read their quotes"-style
-- select policies; only medicine staff may create or change a quote, so a
-- store can no longer raise prices on a quote the customer is about to pay.
alter policy "medicine staff and pharmacies manage quotes" on public.medicine_quotes
  using (public.has_permission('medicine.write'))
  with check (public.has_permission('medicine.write'));

-- ---------------------------------------------------------------- pickup OTPs stay with the customer

-- A driver whose login is linked could read pickup_otp on their own trip and
-- start it without meeting the customer. The column leaves the API grant;
-- the customer (and staff) read it through the functions below.
revoke select on public.trips from anon, authenticated;
grant select (
  id, booking_id, trip_type, category_id, route_id, package_id, pickup_place_id, drop_place_id,
  pickup_address, drop_address, stops, pickup_at, return_at, passengers, distance_km, status,
  driver_id, vehicle_id, driver_name, driver_phone, vehicle_label, vehicle_registration,
  assigned_at, started_at, picked_up_at, completed_at, created_at, updated_at
) on public.trips to authenticated;

revoke select on public.ride_requests from anon, authenticated;
grant select (
  id, booking_id, vehicle_type_id, zone_id, mode, pickup_point_id, pickup_lat, pickup_lng, pickup_address,
  drop_point_id, drop_lat, drop_lng, drop_address, hours, pickup_at, passengers, distance_km, status,
  driver_id, vehicle_id, driver_name, driver_phone, vehicle_label, vehicle_registration,
  assigned_at, started_at, picked_up_at, completed_at, rating, rating_comment, rated_at,
  created_at, updated_at
) on public.ride_requests to authenticated;

-- The pickup OTP for the customer who booked the trip, or cab staff.
create or replace function public.trip_otp(p_trip_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select t.pickup_otp from public.trips t join public.bookings b on b.id = t.booking_id
   where t.id = p_trip_id
     and (b.user_id = (select auth.uid()) or public.has_permission('cabs.read'));
$$;

create or replace function public.ride_otp(p_ride_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.pickup_otp from public.ride_requests r join public.bookings b on b.id = r.booking_id
   where r.id = p_ride_id
     and (b.user_id = (select auth.uid()) or public.has_permission('rides.read'));
$$;

revoke execute on function public.trip_otp(uuid) from public, anon;
revoke execute on function public.ride_otp(uuid) from public, anon;
grant execute on function public.trip_otp(uuid) to authenticated;
grant execute on function public.ride_otp(uuid) to authenticated;

-- ---------------------------------------------------------------- staff accounts can't be blocked by lower roles

/*
 * Same guard as before, plus: blocking or unblocking a staff account (any role
 * marked is_staff) needs users.manage_roles, so a manager cannot lock out an
 * admin or the super admin.
 */
create or replace function public.profiles_guard_staff_block()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_blocked is distinct from old.is_blocked
     and (select auth.uid()) is not null
     and exists (
       select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
        where ur.user_id = new.id and r.is_staff)
     and not public.has_permission('users.manage_roles') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'profiles_guard_staff_block') then
    create trigger profiles_guard_staff_block before update of is_blocked on public.profiles
      for each row execute function public.profiles_guard_staff_block();
  end if;
end
$$;

-- ---------------------------------------------------------------- hotel commission is not public

-- Visitors read published hotels through a table-level grant, which exposed
-- commission_bps. Anonymous visitors now get every column except it.
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'hotels' and column_name <> 'commission_bps';
  execute 'revoke select on public.hotels from anon';
  execute format('grant select (%s) on public.hotels to anon', v_cols);
end
$$;

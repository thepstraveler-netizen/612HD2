-- No double-booked drivers or vehicles (D-108). assign_trip and assign_ride
-- now refuse a driver or vehicle that already has an active cab trip or
-- local ride whose time window overlaps the one being assigned.
--
-- A job's window runs from its pickup to its estimated end, padded by a
-- buffer on both sides. Estimates come from the admin-editable setting
-- `dispatch.overlap` (no hard-coded durations):
--   cab trip    → return time if set, else distance ÷ average speed, else default hours
--   hourly ride → the booked hours
--   other ride  → distance ÷ average speed, else default hours
-- The driver (and vehicle) row is locked while checking, so two staff
-- assigning the same driver at once can't both succeed.

insert into public.settings (key, value, is_public, description) values
  ('dispatch.overlap',
   '{"buffer_minutes": 30, "average_speed_kmph": 40, "trip_default_hours": 4, "ride_default_hours": 1}',
   false,
   'Driver scheduling: minutes kept free before and after each job, average road speed used to estimate a job''s length from its distance, and the length assumed for cab trips and local rides without one')
on conflict (key) do nothing;

-- Estimated [start, end) of a job, without the buffer.
create or replace function public.job_window(
  p_pickup timestamptz, p_return timestamptz, p_distance_km numeric, p_hours integer, p_is_ride boolean)
returns tstzrange
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select coalesce((value ->> 'average_speed_kmph')::numeric, 40) as speed,
           coalesce((value ->> 'trip_default_hours')::numeric, 4) as trip_hours,
           coalesce((value ->> 'ride_default_hours')::numeric, 1) as ride_hours
      from (select (select value from public.settings where key = 'dispatch.overlap') as value) v
  )
  select tstzrange(
    p_pickup,
    greatest(
      p_pickup + interval '15 minutes',
      coalesce(
        case when p_is_ride then null else p_return end,
        case when p_hours is not null then p_pickup + make_interval(hours => p_hours) end,
        case when p_distance_km > 0 and s.speed > 0
             then p_pickup + make_interval(secs => (p_distance_km / s.speed * 3600)::double precision) end,
        p_pickup + make_interval(secs => ((case when p_is_ride then s.ride_hours else s.trip_hours end) * 3600)::double precision)
      )),
    '[)')
  from s;
$$;

/*
 * The booking code of an active trip or ride that `p_driver` (or
 * `p_vehicle`) already has within `p_window` plus the buffer, else null.
 * `p_kind` says which one clashed: 'driver' or 'vehicle'.
 */
create or replace function public.dispatch_conflict(
  p_driver uuid, p_vehicle uuid, p_window tstzrange, p_skip_trip uuid, p_skip_ride uuid,
  out p_kind text, out p_code text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_buffer interval;
  v_window tstzrange;
begin
  select make_interval(mins => coalesce((value ->> 'buffer_minutes')::integer, 30))
    into v_buffer from public.settings where key = 'dispatch.overlap';
  v_buffer := coalesce(v_buffer, interval '30 minutes');
  v_window := tstzrange(lower(p_window) - v_buffer, upper(p_window) + v_buffer, '[)');

  select case when t.driver_id = p_driver then 'driver' else 'vehicle' end, b.code
    into p_kind, p_code
    from public.trips t join public.bookings b on b.id = t.booking_id
   where t.status in ('assigned', 'en_route', 'arrived', 'picked_up')
     and t.id is distinct from p_skip_trip
     and (t.driver_id = p_driver or (p_vehicle is not null and t.vehicle_id = p_vehicle))
     and public.job_window(t.pickup_at, t.return_at, t.distance_km, null, false) && v_window
   order by t.pickup_at
   limit 1;
  if p_code is not null then return; end if;

  select case when r.driver_id = p_driver then 'driver' else 'vehicle' end, b.code
    into p_kind, p_code
    from public.ride_requests r join public.bookings b on b.id = r.booking_id
   where r.status in ('assigned', 'en_route', 'arrived', 'picked_up')
     and r.id is distinct from p_skip_ride
     and (r.driver_id = p_driver or (p_vehicle is not null and r.vehicle_id = p_vehicle))
     and public.job_window(r.pickup_at, null, r.distance_km,
                           case when r.mode = 'hourly' then r.hours end, true) && v_window
   order by r.pickup_at
   limit 1;
end;
$$;

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
  v_kind text;
  v_code text;
begin
  perform public.set_actor(p_actor);
  select * into v_trip from public.trips where id = p_trip_id for update;
  if v_trip.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_trip.status not in ('unassigned', 'assigned', 'en_route') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  select * into v_driver from public.drivers where id = p_driver_id and is_active and deleted_at is null for update;
  if v_driver.id is null then raise exception 'driver_unavailable' using errcode = 'P0001'; end if;
  select * into v_vehicle from public.vehicles where id = p_vehicle_id and is_active and deleted_at is null for update;
  if v_vehicle.id is null then raise exception 'vehicle_unavailable' using errcode = 'P0001'; end if;

  select c.p_kind, c.p_code into v_kind, v_code
    from public.dispatch_conflict(
      v_driver.id, v_vehicle.id,
      public.job_window(v_trip.pickup_at, v_trip.return_at, v_trip.distance_km, null, false),
      v_trip.id, null) c;
  if v_code is not null then
    raise exception '%_busy:%', v_kind, v_code using errcode = 'P0001';
  end if;

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
  v_kind text;
  v_code text;
begin
  perform public.set_actor(p_actor);
  select * into v_ride from public.ride_requests where id = p_ride_id for update;
  if v_ride.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_ride.status not in ('requested', 'assigned', 'en_route') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  select * into v_driver from public.drivers where id = p_driver_id and is_active and deleted_at is null for update;
  if v_driver.id is null then raise exception 'driver_unavailable' using errcode = 'P0001'; end if;
  if p_vehicle_id is not null then
    select * into v_vehicle from public.vehicles
     where id = p_vehicle_id and is_active and deleted_at is null and ride_vehicle_type_id is not null
     for update;
    if v_vehicle.id is null then raise exception 'vehicle_unavailable' using errcode = 'P0001'; end if;
    select name ->> 'en' into v_label from public.ride_vehicle_types where id = v_vehicle.ride_vehicle_type_id;
  else
    select name ->> 'en' into v_label from public.ride_vehicle_types where id = v_ride.vehicle_type_id;
  end if;

  select c.p_kind, c.p_code into v_kind, v_code
    from public.dispatch_conflict(
      v_driver.id, v_vehicle.id,
      public.job_window(v_ride.pickup_at, null, v_ride.distance_km,
                        case when v_ride.mode = 'hourly' then v_ride.hours end, true),
      null, v_ride.id) c;
  if v_code is not null then
    raise exception '%_busy:%', v_kind, v_code using errcode = 'P0001';
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

do $$
declare f text;
begin
  foreach f in array array[
    'public.job_window(timestamptz, timestamptz, numeric, integer, boolean)',
    'public.dispatch_conflict(uuid, uuid, tstzrange, uuid, uuid)',
    'public.assign_trip(uuid, uuid, uuid, uuid)',
    'public.assign_ride(uuid, uuid, uuid, uuid)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;

-- Hotel CSV import (D-106). Takes the rows lib/hotels/csv-import.ts parsed
-- (money already in paise) and creates or updates hotels, rooms and rate
-- plans in one transaction: any bad row rolls the whole file back.
--
-- SECURITY INVOKER: it runs as the signed-in staff member, so the existing
-- "hotel managers manage ..." RLS policies and the audit triggers apply as
-- they do for edits made in the admin forms. Nothing is ever deleted.
-- Rooms and plans are matched on their English name, ignoring case.

create or replace function public.import_hotels(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r jsonb;
  v_line integer;
  v_city uuid;
  v_hotel uuid;
  v_deleted timestamptz;
  v_room uuid;
  v_plan uuid;
  v_name text;
  v_hotels_new uuid[] := '{}';
  v_hotels_upd uuid[] := '{}';
  v_rooms_new uuid[] := '{}';
  v_rooms_upd uuid[] := '{}';
  v_plans_new integer := 0;
  v_plans_upd integer := 0;
  v_n integer;
begin
  if not public.has_permission('hotels.write') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'empty_import' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'too_many_rows' using errcode = 'P0001';
  end if;

  for r in select value from jsonb_array_elements(p_rows)
  loop
    v_line := (r ->> 'line')::integer;
    v_name := trim(r ->> 'hotel_name');

    select id into v_city from public.cities where slug = r ->> 'city';
    if v_city is null then
      raise exception 'unknown_city:%:%', v_line, r ->> 'city' using errcode = 'P0001';
    end if;

    -- ------------------------------------------------------------ hotel
    select id, deleted_at into v_hotel, v_deleted from public.hotels where slug = r ->> 'hotel_slug';
    if v_hotel is null then
      insert into public.hotels (slug, name, city_id, property_type, star_rating, status)
      values (r ->> 'hotel_slug', jsonb_build_object('en', v_name), v_city,
              (r ->> 'property_type')::public.hotel_property_type, (r ->> 'stars')::smallint,
              (r ->> 'status')::public.publish_status)
      returning id into v_hotel;
      v_hotels_new := v_hotels_new || v_hotel;
    elsif v_deleted is not null then
      raise exception 'deleted_hotel:%:%', v_line, r ->> 'hotel_slug' using errcode = 'P0001';
    elsif not (v_hotel = any (v_hotels_new) or v_hotel = any (v_hotels_upd)) then
      -- First row for an existing hotel: update only what changed (the Hindi name stays).
      update public.hotels
         set name = name || jsonb_build_object('en', v_name),
             city_id = v_city,
             property_type = (r ->> 'property_type')::public.hotel_property_type,
             star_rating = (r ->> 'stars')::smallint,
             status = (r ->> 'status')::public.publish_status
       where id = v_hotel
         and (name ->> 'en' is distinct from v_name
              or city_id is distinct from v_city
              or property_type is distinct from (r ->> 'property_type')::public.hotel_property_type
              or star_rating is distinct from (r ->> 'stars')::smallint
              or status is distinct from (r ->> 'status')::public.publish_status);
      get diagnostics v_n = row_count;
      if v_n > 0 then v_hotels_upd := v_hotels_upd || v_hotel; end if;
    end if;

    continue when nullif(trim(coalesce(r ->> 'room', '')), '') is null;

    -- ------------------------------------------------------------ room
    v_room := null;
    select id into v_room from public.hotel_rooms
     where hotel_id = v_hotel and lower(name ->> 'en') = lower(trim(r ->> 'room'))
     order by sort_order, created_at
     limit 1;
    if v_room is null then
      insert into public.hotel_rooms (hotel_id, name, total_units, sort_order)
      values (v_hotel, jsonb_build_object('en', trim(r ->> 'room')), (r ->> 'units')::smallint,
              (select coalesce(max(sort_order) + 1, 0) from public.hotel_rooms where hotel_id = v_hotel))
      returning id into v_room;
      v_rooms_new := v_rooms_new || v_room;
    elsif not (v_room = any (v_rooms_new)) then
      update public.hotel_rooms set total_units = (r ->> 'units')::smallint
       where id = v_room and total_units is distinct from (r ->> 'units')::smallint;
      get diagnostics v_n = row_count;
      if v_n > 0 and not (v_room = any (v_rooms_upd)) then v_rooms_upd := v_rooms_upd || v_room; end if;
    end if;

    -- ------------------------------------------------------------ rate plan
    v_plan := null;
    select id into v_plan from public.hotel_rate_plans
     where room_id = v_room and lower(name ->> 'en') = lower(trim(r ->> 'rate_plan'))
     order by sort_order, created_at
     limit 1;
    if v_plan is null then
      insert into public.hotel_rate_plans (room_id, name, meal_plan, base_price_paise, extra_adult_paise,
                                           extra_child_paise, is_refundable, sort_order)
      values (v_room, jsonb_build_object('en', trim(r ->> 'rate_plan')),
              (r ->> 'meal_plan')::public.meal_plan, (r ->> 'base_price_paise')::integer,
              coalesce((r ->> 'extra_adult_paise')::integer, 0), coalesce((r ->> 'extra_child_paise')::integer, 0),
              coalesce((r ->> 'refundable')::boolean, true),
              (select coalesce(max(sort_order) + 1, 0) from public.hotel_rate_plans where room_id = v_room));
      v_plans_new := v_plans_new + 1;
    else
      update public.hotel_rate_plans
         set meal_plan = (r ->> 'meal_plan')::public.meal_plan,
             base_price_paise = (r ->> 'base_price_paise')::integer,
             extra_adult_paise = coalesce((r ->> 'extra_adult_paise')::integer, 0),
             extra_child_paise = coalesce((r ->> 'extra_child_paise')::integer, 0),
             is_refundable = coalesce((r ->> 'refundable')::boolean, true)
       where id = v_plan
         and (meal_plan is distinct from (r ->> 'meal_plan')::public.meal_plan
              or base_price_paise is distinct from (r ->> 'base_price_paise')::integer
              or extra_adult_paise is distinct from coalesce((r ->> 'extra_adult_paise')::integer, 0)
              or extra_child_paise is distinct from coalesce((r ->> 'extra_child_paise')::integer, 0)
              or is_refundable is distinct from coalesce((r ->> 'refundable')::boolean, true));
      get diagnostics v_n = row_count;
      v_plans_upd := v_plans_upd + v_n;
    end if;
  end loop;

  return jsonb_build_object(
    'hotels_created', cardinality(v_hotels_new),
    'hotels_updated', cardinality(v_hotels_upd),
    'rooms_created', cardinality(v_rooms_new),
    'rooms_updated', cardinality(v_rooms_upd),
    'plans_created', v_plans_new,
    'plans_updated', v_plans_upd);
end;
$$;

revoke execute on function public.import_hotels(jsonb) from public, anon;
grant execute on function public.import_hotels(jsonb) to authenticated;

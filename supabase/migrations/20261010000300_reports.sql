-- Phase 10: admin insights. Read-only aggregate functions for the admin
-- dashboard, Admin → Reports and Admin → Customers.
--
-- Model
--   * Everything is aggregated here, in the database; the Next.js server
--     calls these with the service role after checking the viewer's
--     permission (dashboard.read, reports.read / payments.read,
--     customers.read) and only formats the result.
--   * Dates are India dates: a booking belongs to the day it was created on
--     in Asia/Kolkata. Ranges are inclusive [p_from, p_to].
--   * A booking is "sold" while it is confirmed, completed or partially
--     refunded. Revenue = what was collected (paid − refunded) on sold
--     bookings; booked value (GMV) = total − refunded on sold bookings.
--     Conversion = bookings that ever confirmed ÷ every booking created
--     (including drafts that expired and failed payments).
--   * Occupancy uses stay dates: room-nights sold (hotel_inventory.sold_units)
--     against room-nights on sale (the day's units, else the room's
--     total_units, closed days excluded), and room revenue from the room
--     lines of sold bookings dated in the range.
--   * Money is integer paise (bigint in aggregates).

-- ---------------------------------------------------------------- helpers

create or replace function public.report_india_date(p_at timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_at at time zone 'Asia/Kolkata')::date;
$$;

create or replace function public.report_is_sold(p_status public.booking_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('confirmed', 'completed', 'partially_refunded');
$$;

-- ---------------------------------------------------------------- dashboard

/*
 * KPIs, by service, daily series and top lists for bookings created in
 * [p_from, p_to] (India dates).
 */
create or replace function public.report_dashboard(p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with b as (
    select bk.*,
           public.report_india_date(bk.created_at) as day,
           public.report_is_sold(bk.status) as sold
      from public.bookings bk
     where bk.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
       and bk.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
  ),
  kpi as (
    select
      count(*) filter (where sold) as bookings,
      count(*) as created,
      count(*) filter (where confirmed_at is not null) as converted,
      coalesce(sum(paid_paise - refunded_paise) filter (where sold), 0)::bigint as revenue_paise,
      coalesce(sum(total_paise - refunded_paise) filter (where sold), 0)::bigint as gmv_paise,
      coalesce(sum(discount_paise) filter (where sold), 0)::bigint as discount_paise,
      count(*) filter (where cancelled_at is not null) as cancelled,
      count(distinct user_id) filter (where sold) as customers
    from b
  ),
  by_service as (
    select service,
           count(*) filter (where sold) as bookings,
           coalesce(sum(paid_paise - refunded_paise) filter (where sold), 0)::bigint as revenue_paise,
           coalesce(sum(total_paise - refunded_paise) filter (where sold), 0)::bigint as gmv_paise
      from b
     group by service
  ),
  days as (
    select d::date as day from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
  ),
  series as (
    select days.day,
           count(b.id) filter (where b.sold) as bookings,
           count(b.id) as created,
           coalesce(sum(b.paid_paise - b.refunded_paise) filter (where b.sold), 0)::bigint as revenue_paise
      from days
      left join b on b.day = days.day
     group by days.day
  ),
  top_hotels as (
    select h.id, h.name,
           count(*) as bookings,
           coalesce(sum(b.total_paise - b.refunded_paise), 0)::bigint as gmv_paise,
           coalesce(sum(b.paid_paise - b.refunded_paise), 0)::bigint as revenue_paise
      from b
      join public.hotels h on h.id = b.hotel_id
     where b.sold and b.service = 'hotel'
     group by h.id, h.name
     order by gmv_paise desc, bookings desc
     limit 5
  ),
  top_routes as (
    select t.pickup_place_id, t.drop_place_id, t.trip_type,
           pf.name as from_name, pt.name as to_name,
           count(*) as bookings,
           coalesce(sum(b.total_paise - b.refunded_paise), 0)::bigint as gmv_paise
      from b
      join public.trips t on t.booking_id = b.id
      join public.cab_places pf on pf.id = t.pickup_place_id
      left join public.cab_places pt on pt.id = t.drop_place_id
     where b.sold
     group by t.pickup_place_id, t.drop_place_id, t.trip_type, pf.name, pt.name
     order by bookings desc, gmv_paise desc
     limit 5
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'bookings', kpi.bookings,
    'created', kpi.created,
    'converted', kpi.converted,
    'revenue_paise', kpi.revenue_paise,
    'gmv_paise', kpi.gmv_paise,
    'discount_paise', kpi.discount_paise,
    'cancelled', kpi.cancelled,
    'customers', kpi.customers,
    'conversion_bps', case when kpi.created > 0 then round(kpi.converted * 10000.0 / kpi.created)::integer else 0 end,
    'aov_paise', case when kpi.bookings > 0 then round(kpi.gmv_paise::numeric / kpi.bookings)::bigint else 0 end,
    'new_customers', (
      select count(*) from public.profiles p
       where p.deleted_at is null
         and p.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
         and p.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
    ),
    'by_service', coalesce((
      select jsonb_agg(jsonb_build_object('service', service, 'bookings', bookings,
                                          'revenue_paise', revenue_paise, 'gmv_paise', gmv_paise)
                       order by gmv_paise desc, service)
        from by_service), '[]'::jsonb),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'bookings', bookings, 'created', created,
                                          'revenue_paise', revenue_paise) order by day)
        from series), '[]'::jsonb),
    'top_hotels', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'bookings', bookings,
                                          'gmv_paise', gmv_paise, 'revenue_paise', revenue_paise)
                       order by gmv_paise desc, bookings desc)
        from top_hotels), '[]'::jsonb),
    'top_routes', coalesce((
      select jsonb_agg(jsonb_build_object('from_name', from_name, 'to_name', to_name, 'trip_type', trip_type,
                                          'bookings', bookings, 'gmv_paise', gmv_paise)
                       order by bookings desc, gmv_paise desc)
        from top_routes), '[]'::jsonb)
  )
  from kpi;
$$;

/*
 * Work waiting for staff, at this moment (not tied to a date range). The
 * server shows each count only to viewers who may open the screen it links to.
 */
create or replace function public.report_pending_actions(p_low_stock integer default 5)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'unassigned_trips', (select count(*) from public.trips where status = 'unassigned'),
    'requested_rides', (select count(*) from public.ride_requests where status = 'requested'),
    'new_leads', (select count(*) from public.leads where status = 'new'),
    'overdue_follow_ups', (
      select count(*) from public.leads
       where status in ('new', 'contacted', 'quoted') and next_follow_up_at < now()
    ),
    'pending_applications', (
      select count(*) from public.partner_applications where status in ('submitted', 'under_review')
    ),
    'pending_reviews', (select count(*) from public.reviews where status = 'pending'),
    'pending_payouts', (select count(*) from public.vendor_payouts where status = 'pending'),
    'open_refunds', (select count(*) from public.refunds where status in ('pending', 'failed')),
    'low_stock_food', (
      select count(*) from public.store_items i join public.stores s on s.id = i.store_id
       where i.track_stock and i.stock <= p_low_stock and s.deleted_at is null and s.kind <> 'pharmacy'
    ),
    'low_stock_medicine', (
      select count(*) from public.store_items i join public.stores s on s.id = i.store_id
       where i.track_stock and i.stock <= p_low_stock and s.deleted_at is null and s.kind = 'pharmacy'
    )
  );
$$;

-- ---------------------------------------------------------------- reports

-- Sales per India day and service for bookings created in the range.
create or replace function public.report_sales(p_from date, p_to date)
returns table (
  day date,
  service public.booking_service,
  created bigint,
  bookings bigint,
  subtotal_paise bigint,
  discount_paise bigint,
  tax_paise bigint,
  total_paise bigint,
  paid_paise bigint,
  refunded_paise bigint,
  revenue_paise bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select public.report_india_date(b.created_at) as day,
         b.service,
         count(*) as created,
         count(*) filter (where public.report_is_sold(b.status)) as bookings,
         coalesce(sum(b.subtotal_paise) filter (where public.report_is_sold(b.status)), 0)::bigint,
         coalesce(sum(b.discount_paise) filter (where public.report_is_sold(b.status)), 0)::bigint,
         coalesce(sum(b.tax_paise) filter (where public.report_is_sold(b.status)), 0)::bigint,
         coalesce(sum(b.total_paise) filter (where public.report_is_sold(b.status)), 0)::bigint,
         coalesce(sum(b.paid_paise) filter (where public.report_is_sold(b.status)), 0)::bigint,
         coalesce(sum(b.refunded_paise) filter (where public.report_is_sold(b.status)), 0)::bigint,
         coalesce(sum(b.paid_paise - b.refunded_paise) filter (where public.report_is_sold(b.status)), 0)::bigint
    from public.bookings b
   where b.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
     and b.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
   group by 1, 2
   order by 1, 2;
$$;

-- Hotel occupancy over stay dates in the range.
create or replace function public.report_occupancy(p_from date, p_to date)
returns table (
  hotel_id uuid,
  hotel_name jsonb,
  rooms bigint,
  available_nights bigint,
  sold_nights bigint,
  occupancy_bps integer,
  room_revenue_paise bigint,
  adr_paise bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with nights as (
    select r.hotel_id,
           coalesce(sum(case when coalesce(i.is_closed, false) then 0 else coalesce(i.units, r.total_units) end), 0)::bigint as available,
           coalesce(sum(i.sold_units), 0)::bigint as sold
      from public.hotel_rooms r
      cross join generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
      left join public.hotel_inventory i on i.room_id = r.id and i.date = d::date
     where r.is_active
     group by r.hotel_id
  ),
  revenue as (
    select b.hotel_id, coalesce(sum(it.amount_paise - it.discount_paise), 0)::bigint as paise
      from public.booking_items it
      join public.bookings b on b.id = it.booking_id
     where it.kind = 'room' and it.service_date between p_from and p_to
       and b.service = 'hotel' and public.report_is_sold(b.status)
     group by b.hotel_id
  )
  select h.id, h.name,
         (select count(*) from public.hotel_rooms r where r.hotel_id = h.id and r.is_active),
         coalesce(n.available, 0),
         coalesce(n.sold, 0),
         case when coalesce(n.available, 0) > 0 then round(n.sold * 10000.0 / n.available)::integer else 0 end,
         coalesce(rv.paise, 0),
         case when coalesce(n.sold, 0) > 0 then round(coalesce(rv.paise, 0)::numeric / n.sold)::bigint else 0 end
    from public.hotels h
    left join nights n on n.hotel_id = h.id
    left join revenue rv on rv.hotel_id = h.id
   where h.deleted_at is null and (n.hotel_id is not null or rv.hotel_id is not null)
   order by coalesce(n.sold, 0) desc, h.name ->> 'en';
$$;

/*
 * Per vendor: bookings created in the range that settle with the vendor
 * (booking_settlement_vendor), their value and cancellations, published
 * review average, and the commission / net from ledger rows dated in range.
 */
create or replace function public.report_vendor_performance(p_from date, p_to date)
returns table (
  vendor_id uuid,
  vendor_name text,
  vendor_kind public.vendor_kind,
  bookings bigint,
  cancelled bigint,
  gmv_paise bigint,
  commission_paise bigint,
  net_paise bigint,
  rating_avg numeric,
  rating_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with b as (
    select bk.id, bk.status, bk.cancelled_at, bk.total_paise, bk.refunded_paise,
           public.booking_settlement_vendor(bk.id) as vendor_id
      from public.bookings bk
     where bk.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
       and bk.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
  ),
  sales as (
    select b.vendor_id,
           count(*) filter (where public.report_is_sold(b.status)) as bookings,
           count(*) filter (where b.cancelled_at is not null) as cancelled,
           coalesce(sum(b.total_paise - b.refunded_paise) filter (where public.report_is_sold(b.status)), 0)::bigint as gmv
      from b where b.vendor_id is not null
     group by b.vendor_id
  ),
  ledger as (
    select e.vendor_id, coalesce(sum(e.commission_paise), 0)::bigint as commission,
           coalesce(sum(e.net_paise), 0)::bigint as net
      from public.vendor_ledger_entries e
     where e.entry_date between p_from and p_to
     group by e.vendor_id
  ),
  ratings as (
    select b.vendor_id, round(avg(r.rating), 1) as avg_rating, count(*) as n
      from public.reviews r join b on b.id = r.booking_id
     where r.status = 'published' and b.vendor_id is not null
     group by b.vendor_id
  )
  select v.id, v.name, v.kind,
         coalesce(s.bookings, 0), coalesce(s.cancelled, 0), coalesce(s.gmv, 0),
         coalesce(l.commission, 0), coalesce(l.net, 0),
         r.avg_rating, coalesce(r.n, 0)
    from public.vendors v
    left join sales s on s.vendor_id = v.id
    left join ledger l on l.vendor_id = v.id
    left join ratings r on r.vendor_id = v.id
   where s.vendor_id is not null or l.vendor_id is not null
   order by coalesce(s.gmv, 0) desc, v.name;
$$;

/*
 * Per assignee (null = unassigned): leads created in the range and how far
 * they got, the value of won leads (the booking's total when linked, else the
 * lead's quoted value) and calls logged in the range.
 */
create or replace function public.report_agent_performance(p_from date, p_to date)
returns table (
  agent_id uuid,
  agent_name text,
  agent_email text,
  leads bigint,
  contacted bigint,
  quoted bigint,
  won bigint,
  lost bigint,
  open bigint,
  won_value_paise bigint,
  calls bigint,
  win_rate_bps integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with l as (
    select ld.*, bk.total_paise as booking_total, bk.refunded_paise as booking_refunded
      from public.leads ld
      left join public.bookings bk on bk.id = ld.booking_id
     where ld.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
       and ld.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
  ),
  per as (
    select l.assigned_to,
           count(*) as leads,
           count(*) filter (where l.status <> 'new' or l.last_contacted_at is not null) as contacted,
           count(*) filter (where l.status in ('quoted', 'won')
                              or exists (select 1 from public.quotes q
                                          where q.lead_id = l.id and q.status in ('sent', 'paid'))) as quoted,
           count(*) filter (where l.status = 'won') as won,
           count(*) filter (where l.status = 'lost') as lost,
           count(*) filter (where l.status in ('new', 'contacted', 'quoted')) as open,
           coalesce(sum(coalesce(l.booking_total - l.booking_refunded, l.value_paise, 0))
                    filter (where l.status = 'won'), 0)::bigint as won_value
      from l
     group by l.assigned_to
  ),
  calls as (
    select a.actor, count(*) as n
      from public.lead_activities a
     where a.kind = 'call'
       and a.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
       and a.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
     group by a.actor
  )
  select per.assigned_to, p.full_name, p.email::text,
         per.leads, per.contacted, per.quoted, per.won, per.lost, per.open, per.won_value,
         coalesce(c.n, 0),
         case when per.won + per.lost > 0 then round(per.won * 10000.0 / (per.won + per.lost))::integer else 0 end
    from per
    left join public.profiles p on p.id = per.assigned_to
    left join calls c on c.actor = per.assigned_to
   order by per.assigned_to is null, per.won_value desc, per.leads desc;
$$;

/*
 * Coupon redemptions on bookings created in the range. Personal P&S Rewards
 * codes are totalled in one row (kind 'reward', no coupon id).
 */
create or replace function public.report_coupon_usage(p_from date, p_to date)
returns table (
  coupon_id uuid,
  code text,
  kind text,
  redemptions bigint,
  released bigint,
  customers bigint,
  discount_paise bigint,
  gmv_paise bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select case when c.user_id is null then c.id end,
         case when c.user_id is null then c.code else 'PSR' end,
         case when c.user_id is null then 'coupon' else 'reward' end,
         count(*) filter (where cr.status = 'redeemed'),
         count(*) filter (where cr.status = 'released'),
         count(distinct cr.user_id) filter (where cr.status = 'redeemed'),
         coalesce(sum(cr.discount_paise) filter (where cr.status = 'redeemed'), 0)::bigint,
         coalesce(sum(b.total_paise - b.refunded_paise) filter (where cr.status = 'redeemed'), 0)::bigint
    from public.coupon_redemptions cr
    join public.coupons c on c.id = cr.coupon_id
    join public.bookings b on b.id = cr.booking_id
   where b.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
     and b.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
   group by 1, 2, 3
   order by 7 desc, 4 desc, 2;
$$;

/*
 * Bookings cancelled in the range (India date of cancelled_at), by service,
 * who cancelled (customer = the booking's owner, staff = anyone else,
 * system = no actor, e.g. an unpaid hold) and reason.
 */
create or replace function public.report_cancellations(p_from date, p_to date)
returns table (
  service public.booking_service,
  cancelled_by text,
  reason text,
  cancellations bigint,
  total_paise bigint,
  paid_paise bigint,
  refunded_paise bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.service,
         case when b.cancelled_by is null then 'system'
              when b.cancelled_by = b.user_id then 'customer'
              else 'staff' end,
         coalesce(nullif(left(trim(b.cancel_reason), 200), ''), ''),
         count(*),
         coalesce(sum(b.total_paise), 0)::bigint,
         coalesce(sum(b.paid_paise), 0)::bigint,
         coalesce(sum(b.refunded_paise), 0)::bigint
    from public.bookings b
   where b.cancelled_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
     and b.cancelled_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
   group by 1, 2, 3
   order by 4 desc, 1, 2, 3;
$$;

-- ---------------------------------------------------------------- customers

/*
 * Admin → Customers list: search by name, email or phone, filter on blocked
 * and on having bookings, newest first, one page at a time. bookings counts
 * bookings that ever confirmed; spend is what they paid minus refunds.
 */
create or replace function public.admin_customers(
  p_search text default null,
  p_blocked boolean default null,
  p_has_bookings boolean default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  email text,
  full_name text,
  phone text,
  is_blocked boolean,
  created_at timestamptz,
  bookings bigint,
  spend_paise bigint,
  last_booking_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select nullif(lower(trim(coalesce(p_search, ''))), '') as text,
           nullif(regexp_replace(coalesce(p_search, ''), '[^0-9]', '', 'g'), '') as digits
  ),
  stats as (
    select bk.user_id,
           count(*) filter (where bk.confirmed_at is not null) as bookings,
           coalesce(sum(bk.paid_paise - bk.refunded_paise), 0)::bigint as spend,
           max(bk.created_at) filter (where bk.confirmed_at is not null) as last_at
      from public.bookings bk
     where bk.user_id is not null
     group by bk.user_id
  ),
  matched as (
    select p.id, p.email::text as email, p.full_name, p.phone, p.is_blocked, p.created_at,
           coalesce(s.bookings, 0) as bookings, coalesce(s.spend, 0) as spend_paise, s.last_at
      from public.profiles p
      cross join q
      left join stats s on s.user_id = p.id
     where p.deleted_at is null
       and (q.text is null
            or strpos(lower(coalesce(p.full_name, '')), q.text) > 0
            or strpos(lower(coalesce(p.email::text, '')), q.text) > 0
            or (q.digits is not null and length(q.digits) >= 4 and strpos(coalesce(p.phone, ''), q.digits) > 0))
       and (p_blocked is null or p.is_blocked = p_blocked)
       and (p_has_bookings is null or (coalesce(s.bookings, 0) > 0) = p_has_bookings)
  )
  select m.id, m.email, m.full_name, m.phone, m.is_blocked, m.created_at, m.bookings, m.spend_paise, m.last_at,
         count(*) over ()
    from matched m
   order by m.created_at desc, m.id
   limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- One customer's totals for the detail page.
create or replace function public.admin_customer_summary(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'bookings', count(*) filter (where confirmed_at is not null),
    'completed', count(*) filter (where status = 'completed'),
    'cancelled', count(*) filter (where cancelled_at is not null),
    'spend_paise', coalesce(sum(paid_paise - refunded_paise), 0)::bigint,
    'last_booking_at', max(created_at) filter (where confirmed_at is not null),
    'points', public.loyalty_balance(p_user)
  )
  from public.bookings where user_id = p_user;
$$;

-- ---------------------------------------------------------------- grants

do $$
declare f text;
begin
  foreach f in array array[
    'public.report_india_date(timestamptz)',
    'public.report_is_sold(public.booking_status)',
    'public.report_dashboard(date, date)',
    'public.report_pending_actions(integer)',
    'public.report_sales(date, date)',
    'public.report_occupancy(date, date)',
    'public.report_vendor_performance(date, date)',
    'public.report_agent_performance(date, date)',
    'public.report_coupon_usage(date, date)',
    'public.report_cancellations(date, date)',
    'public.admin_customers(text, boolean, boolean, integer, integer)',
    'public.admin_customer_summary(uuid)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;

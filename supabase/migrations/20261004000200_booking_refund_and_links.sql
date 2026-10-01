-- Phase 4 follow-ups from the admin screens.
--   * A goodwill refund on a stay that is still on (confirmed / completed)
--     keeps its status, so staff can still complete it, take the balance or
--     cancel it later. Only cancelled or failed bookings move to
--     refunded / partially_refunded.
--   * Payment links are recorded through a function that names the staff
--     member, so the audit log shows who sent the link.

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
           when status in ('cancelled', 'partially_refunded', 'refunded', 'failed') then
             case when v_refunded >= paid_paise then 'refunded'::public.booking_status
                  else 'partially_refunded'::public.booking_status end
           else status end
   where id = v_booking.id;
  return jsonb_build_object('result', 'recorded', 'refund_id', v_refund_id);
end;
$$;

create or replace function public.create_payment_link_payment(
  p_booking_id uuid, p_link_id text, p_url text, p_amount integer, p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform public.set_actor(p_actor);
  insert into public.payments (booking_id, provider, payment_link_id, payment_link_url, amount_paise, status, recorded_by)
  values (p_booking_id, 'razorpay', p_link_id, p_url, p_amount, 'created', p_actor)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.create_payment_link_payment(uuid, text, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.create_payment_link_payment(uuid, text, text, integer, uuid) to service_role;

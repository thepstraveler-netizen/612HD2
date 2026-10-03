-- Phase 11: a refund that Razorpay later reports as failed no longer stays
-- counted (D-104). Before, refund.failed only changed the refund row, so the
-- booking kept showing the money as refunded and staff couldn't retry it.
-- Failed refunds are left out of the payment and booking totals, and a
-- refund that fails after being counted gives its amount back.

create or replace function public.record_refund(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_payment public.payments;
  v_existing public.refunds;
  v_refund_id uuid;
  v_amount integer := (p ->> 'amount_paise')::integer;
  v_status public.refund_status := coalesce((p ->> 'status')::public.refund_status, 'pending');
  v_refunded integer;
begin
  perform public.set_actor(nullif(p ->> 'actor', '')::uuid);
  if p ->> 'provider_refund_id' is not null then
    select * into v_existing from public.refunds where provider_refund_id = p ->> 'provider_refund_id' for update;
    if v_existing.id is not null then
      -- A failed refund stays failed; redeliveries of older events don't revive it.
      if v_existing.status <> 'failed' and p ->> 'status' is not null then
        update public.refunds
           set status = v_status,
               processed_at = case when v_status = 'processed' then coalesce(processed_at, now()) else processed_at end
         where id = v_existing.id;
        if v_status = 'failed' then
          select * into v_booking from public.bookings where id = v_existing.booking_id for update;
          perform public.refund_totals_changed(v_existing.payment_id, v_booking.id,
                                               greatest(v_booking.refunded_paise - v_existing.amount_paise, 0));
        end if;
      end if;
      return jsonb_build_object('result', 'duplicate', 'refund_id', v_existing.id);
    end if;
  end if;

  select * into v_payment from public.payments where id = (p ->> 'payment_id')::uuid for update;
  select * into v_booking from public.bookings where id = v_payment.booking_id for update;
  if v_booking.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_status <> 'failed' and v_amount > v_booking.paid_paise - v_booking.refunded_paise then
    raise exception 'refund_exceeds_paid' using errcode = 'P0001';
  end if;

  insert into public.refunds (booking_id, payment_id, provider_refund_id, amount_paise, status, reason, initiated_by, raw, processed_at)
  values (v_booking.id, v_payment.id, p ->> 'provider_refund_id', v_amount, v_status, p ->> 'reason',
          nullif(p ->> 'actor', '')::uuid, p -> 'raw',
          case when v_status = 'processed' then now() end)
  returning id into v_refund_id;

  if v_status <> 'failed' then
    v_refunded := v_booking.refunded_paise + v_amount;
    perform public.refund_totals_changed(v_payment.id, v_booking.id, v_refunded);
  end if;
  return jsonb_build_object('result', 'recorded', 'refund_id', v_refund_id);
end;
$$;

/*
 * Sets the booking's refunded total and re-derives the payment and booking
 * status from refunds that have not failed. A booking whose refunds all failed
 * goes back to cancelled (refunds only follow a cancellation or failure).
 */
create or replace function public.refund_totals_changed(p_payment_id uuid, p_booking_id uuid, p_refunded integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_refunded integer;
begin
  select coalesce(sum(amount_paise), 0)::integer into v_payment_refunded
    from public.refunds where payment_id = p_payment_id and status <> 'failed';
  update public.payments
     set status = case
           when v_payment_refunded >= amount_paise then 'refunded'::public.payment_status
           when v_payment_refunded > 0 then 'partially_refunded'::public.payment_status
           when status in ('refunded', 'partially_refunded') then 'captured'::public.payment_status
           else status end
   where id = p_payment_id;
  update public.bookings
     set refunded_paise = p_refunded,
         status = case
           when status in ('cancelled', 'partially_refunded', 'refunded', 'failed') then
             case when p_refunded >= paid_paise and p_refunded > 0 then 'refunded'::public.booking_status
                  when p_refunded > 0 then 'partially_refunded'::public.booking_status
                  when status = 'failed' then 'failed'::public.booking_status
                  else 'cancelled'::public.booking_status end
           else status end
   where id = p_booking_id;
end;
$$;

revoke execute on function public.refund_totals_changed(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.refund_totals_changed(uuid, uuid, integer) to service_role;

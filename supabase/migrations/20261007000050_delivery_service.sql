-- Phase 7: essentials orders get their own booking service. Kept in its own
-- migration because a new enum value can't be used in the transaction that
-- adds it.
alter type public.booking_service add value if not exists 'essentials';

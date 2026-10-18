-- D-112: header link to the public page that lists every review.
-- Data only and idempotent; placed just before "Partner With Us".
update public.navigation_links set sort_order = 11 where menu = 'header' and href = '/partner';

insert into public.navigation_links (menu, label, href, sort_order)
select 'header', '{"en": "Reviews", "hi": "समीक्षाएँ"}'::jsonb, '/reviews', 10
where not exists (select 1 from public.navigation_links where menu = 'header' and href = '/reviews');

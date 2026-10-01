-- Phase 2: localized text helper and the multi-city geography tables.
--
-- Admin-editable copy is stored as jsonb `{"en": "...", "hi": "..."}`.
-- English is required; Hindi falls back to English when missing. Adding a
-- locale later needs no schema change.

create or replace function public.is_localized(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value is not null
     and jsonb_typeof(value) = 'object'
     and coalesce(length(trim(value ->> 'en')), 0) > 0
     and (value -> 'hi' is null or jsonb_typeof(value -> 'hi') in ('string', 'null'));
$$;

-- Cities and areas are data, not code, so expanding from Vrindavan to
-- Mathura, Agra and beyond needs no deploy.
create table public.cities (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        jsonb not null check (public.is_localized(name)),
  state       text not null default 'Uttar Pradesh',
  lat         double precision,
  lng         double precision,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.areas (
  id          uuid primary key default gen_random_uuid(),
  city_id     uuid not null references public.cities (id) on delete cascade,
  slug        text not null check (slug ~ '^[a-z0-9-]+$'),
  name        jsonb not null check (public.is_localized(name)),
  kind        text not null default 'area' check (kind in ('area', 'landmark', 'station', 'airport', 'temple')),
  lat         double precision,
  lng         double precision,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (city_id, slug)
);
create index areas_city_idx on public.areas (city_id, sort_order);

create trigger cities_set_updated_at before update on public.cities
  for each row execute function public.set_updated_at();
create trigger areas_set_updated_at before update on public.areas
  for each row execute function public.set_updated_at();

alter table public.cities enable row level security;
alter table public.areas enable row level security;

create policy "active cities are public" on public.cities
  for select to anon, authenticated using (is_active or public.has_permission('settings.read'));
create policy "settings writers manage cities" on public.cities
  for all to authenticated
  using (public.has_permission('settings.write'))
  with check (public.has_permission('settings.write'));

create policy "active areas are public" on public.areas
  for select to anon, authenticated using (is_active or public.has_permission('settings.read'));
create policy "settings writers manage areas" on public.areas
  for all to authenticated
  using (public.has_permission('settings.write'))
  with check (public.has_permission('settings.write'));

select public.enable_audit('public.cities');
select public.enable_audit('public.areas');

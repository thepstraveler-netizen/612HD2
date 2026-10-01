-- Phase 2: the 14 services and shared catalog taxonomies.

create type public.service_kind as enum ('bookable', 'enquiry');

create type public.service_accent as enum (
  'blue', 'teal', 'purple', 'pink', 'green', 'amber', 'red', 'orange', 'magenta', 'indigo'
);

create table public.services (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9-]+$'),
  kind              public.service_kind not null,
  accent            public.service_accent not null default 'blue',
  -- lucide icon name; the app maps it to a component (unknown names fall back).
  icon              text not null default 'sparkles',
  name              jsonb not null check (public.is_localized(name)),
  summary           jsonb not null check (public.is_localized(summary)),
  description       jsonb not null default '{"en": ""}'::jsonb,
  highlights        jsonb not null default '[]'::jsonb check (jsonb_typeof(highlights) = 'array'),
  cta_label         jsonb,
  hero_media_id     uuid references public.media (id) on delete set null,
  -- Per-service settings for later phases (e.g. advance %, enquiry routing).
  config            jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  seo               jsonb not null default '{}'::jsonb check (jsonb_typeof(seo) = 'object'),
  sort_order        integer not null default 0,
  is_published      boolean not null default true,
  show_in_nav       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index services_published_sort_idx on public.services (sort_order) where is_published and deleted_at is null;

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid references public.services (id) on delete cascade,
  parent_id   uuid references public.categories (id) on delete cascade,
  slug        text not null check (slug ~ '^[a-z0-9-]+$'),
  name        jsonb not null check (public.is_localized(name)),
  icon        text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique nulls not distinct (service_id, slug)
);

create table public.amenities (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        jsonb not null check (public.is_localized(name)),
  icon        text,
  grouping    text not null default 'general',
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        jsonb not null check (public.is_localized(name)),
  color       text check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger services_set_updated_at before update on public.services
  for each row execute function public.set_updated_at();
create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger amenities_set_updated_at before update on public.amenities
  for each row execute function public.set_updated_at();
create trigger tags_set_updated_at before update on public.tags
  for each row execute function public.set_updated_at();

alter table public.services enable row level security;
alter table public.categories enable row level security;
alter table public.amenities enable row level security;
alter table public.tags enable row level security;

create policy "published services are public" on public.services
  for select to anon, authenticated
  using ((is_published and deleted_at is null) or public.has_permission('cms.read'));
create policy "cms editors manage services" on public.services
  for all to authenticated
  using (public.has_permission('cms.write'))
  with check (public.has_permission('cms.write'));

create policy "active categories are public" on public.categories
  for select to anon, authenticated using (is_active or public.has_permission('cms.read'));
create policy "cms editors manage categories" on public.categories
  for all to authenticated
  using (public.has_permission('cms.write'))
  with check (public.has_permission('cms.write'));

create policy "active amenities are public" on public.amenities
  for select to anon, authenticated using (is_active or public.has_permission('cms.read'));
create policy "cms editors manage amenities" on public.amenities
  for all to authenticated
  using (public.has_permission('cms.write'))
  with check (public.has_permission('cms.write'));

create policy "tags are public" on public.tags
  for select to anon, authenticated using (true);
create policy "cms editors manage tags" on public.tags
  for all to authenticated
  using (public.has_permission('cms.write'))
  with check (public.has_permission('cms.write'));

select public.enable_audit('public.services');
select public.enable_audit('public.categories');
select public.enable_audit('public.amenities');
select public.enable_audit('public.tags');

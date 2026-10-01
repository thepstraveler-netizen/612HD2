-- Phase 2: CMS. Home sections, banners, testimonials, FAQs, navigation,
-- static pages, settings and feature flags. Everything the public site shows
-- comes from these tables.

create type public.cms_section_type as enum (
  'hero', 'pillars', 'about', 'services', 'offers', 'testimonials', 'why_collaborate', 'partner_cta', 'faqs'
);

create type public.offer_tab as enum ('all', 'hotels', 'cabs', 'food', 'packages');

create type public.publish_status as enum ('draft', 'published', 'archived');

create table public.cms_sections (
  id          uuid primary key default gen_random_uuid(),
  page        text not null default 'home' check (page ~ '^[a-z0-9-]+$'),
  key         text not null check (key ~ '^[a-z0-9_-]+$'),
  type        public.cms_section_type not null,
  title       jsonb check (title is null or public.is_localized(title)),
  subtitle    jsonb check (subtitle is null or public.is_localized(subtitle)),
  -- Type-specific content, validated by the app's zod schema for that type.
  content     jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  sort_order  integer not null default 0,
  is_visible  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (page, key)
);
create index cms_sections_page_idx on public.cms_sections (page, sort_order);

create table public.offers_banners (
  id           uuid primary key default gen_random_uuid(),
  tab          public.offer_tab not null default 'all',
  title        jsonb not null check (public.is_localized(title)),
  subtitle     jsonb check (subtitle is null or public.is_localized(subtitle)),
  coupon_code  text check (coupon_code ~ '^[A-Z0-9_-]{3,24}$'),
  cta_label    jsonb check (cta_label is null or public.is_localized(cta_label)),
  href         text check (href ~ '^/'),
  media_id     uuid references public.media (id) on delete set null,
  accent       public.service_accent not null default 'blue',
  starts_at    timestamptz,
  ends_at      timestamptz,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index offers_banners_active_idx on public.offers_banners (tab, sort_order) where is_active;

create table public.testimonials (
  id            uuid primary key default gen_random_uuid(),
  author_name   text not null check (char_length(author_name) between 2 and 80),
  author_place  text,
  quote         jsonb not null check (public.is_localized(quote)),
  rating        smallint not null default 5 check (rating between 1 and 5),
  service_id    uuid references public.services (id) on delete set null,
  media_id      uuid references public.media (id) on delete set null,
  sort_order    integer not null default 0,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.faqs (
  id            uuid primary key default gen_random_uuid(),
  service_id    uuid references public.services (id) on delete cascade,
  question      jsonb not null check (public.is_localized(question)),
  answer        jsonb not null check (public.is_localized(answer)),
  sort_order    integer not null default 0,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index faqs_service_idx on public.faqs (service_id, sort_order);

create table public.navigation_links (
  id          uuid primary key default gen_random_uuid(),
  menu        text not null check (menu in ('header', 'footer_company', 'footer_legal')),
  label       jsonb not null check (public.is_localized(label)),
  href        text not null check (href ~ '^(/|https://)'),
  sort_order  integer not null default 0,
  is_visible  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index navigation_links_menu_idx on public.navigation_links (menu, sort_order);

create table public.cms_pages (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title       jsonb not null check (public.is_localized(title)),
  -- Rich text per locale (Tiptap JSON or sanitized HTML from the editor).
  body        jsonb not null default '{"en": ""}'::jsonb,
  seo         jsonb not null default '{}'::jsonb,
  status      public.publish_status not null default 'draft',
  published_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.settings (
  key         text primary key check (key ~ '^[a-z0-9_.]+$'),
  value       jsonb not null,
  is_public   boolean not null default false,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.feature_flags (
  key         text primary key check (key ~ '^[a-z0-9_.]+$'),
  enabled     boolean not null default false,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['cms_sections', 'offers_banners', 'testimonials', 'faqs', 'navigation_links', 'cms_pages', 'settings', 'feature_flags']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;

-- Public reads: only what is visible/published/current.
create policy "visible sections are public" on public.cms_sections
  for select to anon, authenticated using (is_visible or public.has_permission('cms.read'));
create policy "current banners are public" on public.offers_banners
  for select to anon, authenticated
  using (
    (is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
    or public.has_permission('offers.read')
  );
create policy "published testimonials are public" on public.testimonials
  for select to anon, authenticated using (is_published or public.has_permission('cms.read'));
create policy "published faqs are public" on public.faqs
  for select to anon, authenticated using (is_published or public.has_permission('cms.read'));
create policy "visible links are public" on public.navigation_links
  for select to anon, authenticated using (is_visible or public.has_permission('cms.read'));
create policy "published pages are public" on public.cms_pages
  for select to anon, authenticated using (status = 'published' or public.has_permission('cms.read'));
create policy "public settings are public" on public.settings
  for select to anon, authenticated using (is_public or public.has_permission('settings.read'));
create policy "flags are readable" on public.feature_flags
  for select to anon, authenticated using (true);

-- Writes.
create policy "cms editors manage sections" on public.cms_sections
  for all to authenticated using (public.has_permission('cms.write')) with check (public.has_permission('cms.write'));
-- Banners belong to the Offers & Coupons module (prompt 5.2 #11).
create policy "offer managers manage banners" on public.offers_banners
  for all to authenticated using (public.has_permission('offers.write')) with check (public.has_permission('offers.write'));
create policy "cms editors manage testimonials" on public.testimonials
  for all to authenticated using (public.has_permission('cms.write')) with check (public.has_permission('cms.write'));
create policy "cms editors manage faqs" on public.faqs
  for all to authenticated using (public.has_permission('cms.write')) with check (public.has_permission('cms.write'));
create policy "cms editors manage links" on public.navigation_links
  for all to authenticated using (public.has_permission('cms.write')) with check (public.has_permission('cms.write'));
create policy "cms editors manage pages" on public.cms_pages
  for all to authenticated using (public.has_permission('cms.write')) with check (public.has_permission('cms.write'));
create policy "settings writers manage settings" on public.settings
  for all to authenticated using (public.has_permission('settings.write')) with check (public.has_permission('settings.write'));
create policy "settings writers manage flags" on public.feature_flags
  for all to authenticated using (public.has_permission('settings.write')) with check (public.has_permission('settings.write'));

select public.enable_audit('public.cms_sections');
select public.enable_audit('public.offers_banners');
select public.enable_audit('public.testimonials');
select public.enable_audit('public.faqs');
select public.enable_audit('public.navigation_links');
select public.enable_audit('public.cms_pages');
select public.enable_audit('public.settings', array['key']);
select public.enable_audit('public.feature_flags', array['key']);

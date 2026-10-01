-- Phase 1: profiles, auto-created for every auth.users row with the
-- default `customer` role.

create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            extensions.citext,
  full_name        text check (char_length(full_name) <= 120),
  phone            text check (phone ~ '^\+?[0-9]{8,15}$'),
  avatar_url       text,
  preferred_locale text not null default 'en' check (preferred_locale in ('en', 'hi')),
  is_blocked       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index profiles_email_idx on public.profiles (email);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Users may edit their own profile, but not the fields staff control.
create or replace function public.profiles_guard_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'profiles.id is immutable';
  end if;
  -- Writes from triggers/service role (no JWT) are trusted.
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.email is distinct from old.email then
    raise exception 'email is managed by Supabase Auth';
  end if;
  if (new.is_blocked is distinct from old.is_blocked or new.deleted_at is distinct from old.deleted_at)
     and not public.has_permission('customers.write') then
    raise exception 'insufficient privilege to change account status';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_columns before update on public.profiles
  for each row execute function public.profiles_guard_columns();

alter table public.profiles enable row level security;

create policy "users read own profile; staff read customers" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.has_permission('customers.read'));

create policy "users update own profile; staff update customers" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.has_permission('customers.write'))
  with check (id = (select auth.uid()) or public.has_permission('customers.write'));

-- No insert/delete policies: rows are created by the trigger below and are
-- soft-deleted via deleted_at.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role_id)
  select new.id, r.id from public.roles r where r.key = 'customer'
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

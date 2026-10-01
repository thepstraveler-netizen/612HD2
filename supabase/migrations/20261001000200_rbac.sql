-- Phase 1: role-based access control.
--
-- roles / permissions / role_permissions hold the matrix; user_roles assigns
-- roles to users. has_permission() is the single check every RLS policy uses,
-- mirrored server-side by requirePermission() in lib/auth/guards.ts.

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key ~ '^[a-z_]+$'),
  name        text not null,
  description text,
  is_staff    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key ~ '^[a-z_]+\.[a-z_]+$'),
  module      text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.role_permissions (
  role_id       uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (role_id, permission_id)
);
create index role_permissions_permission_id_idx on public.role_permissions (permission_id);

create table public.user_roles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role_id    uuid not null references public.roles (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);
create index user_roles_role_id_idx on public.user_roles (role_id);

create trigger roles_set_updated_at before update on public.roles
  for each row execute function public.set_updated_at();
create trigger permissions_set_updated_at before update on public.permissions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Check functions. SECURITY DEFINER so policies on the RBAC tables themselves
-- can call them without recursing through RLS. `(select auth.uid())` lets the
-- planner evaluate it once per statement instead of once per row.
-- ---------------------------------------------------------------------------

create or replace function public.has_role(role_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.key = role_key
  );
$$;

create or replace function public.has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = (select auth.uid())
      and p.key = permission_key
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.is_staff
  );
$$;

create or replace function public.current_user_roles()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select r.key
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid());
$$;

create or replace function public.current_user_permissions()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct p.key
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.permissions p on p.id = rp.permission_id
  where ur.user_id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;

-- The matrix is not secret: signed-in users may read it (the admin UI needs it).
create policy "roles readable by signed-in users" on public.roles
  for select to authenticated using (true);
create policy "permissions readable by signed-in users" on public.permissions
  for select to authenticated using (true);
create policy "role_permissions readable by signed-in users" on public.role_permissions
  for select to authenticated using (true);

-- Changing what a role can do is the most sensitive action in the system.
create policy "roles writable by super admins" on public.roles
  for all to authenticated
  using (public.has_role('super_admin'))
  with check (public.has_role('super_admin'));
create policy "permissions writable by super admins" on public.permissions
  for all to authenticated
  using (public.has_role('super_admin'))
  with check (public.has_role('super_admin'));
create policy "role_permissions writable by super admins" on public.role_permissions
  for all to authenticated
  using (public.has_role('super_admin'))
  with check (public.has_role('super_admin'));

create policy "users read own roles; staff managers read all" on public.user_roles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_permission('users.manage_roles')
    or public.has_permission('customers.read')
  );

-- Granting/revoking roles needs users.manage_roles, and only a super admin may
-- grant or revoke the super_admin role itself (no privilege escalation).
create policy "role managers grant roles" on public.user_roles
  for insert to authenticated
  with check (
    public.has_permission('users.manage_roles')
    and (
      public.has_role('super_admin')
      or role_id <> (select id from public.roles where key = 'super_admin')
    )
  );
create policy "role managers revoke roles" on public.user_roles
  for delete to authenticated
  using (
    public.has_permission('users.manage_roles')
    and (
      public.has_role('super_admin')
      or role_id <> (select id from public.roles where key = 'super_admin')
    )
  );

-- Admin → Settings → Staff and roles (D-107). Granting and revoking already
-- go through RLS on user_roles ("role managers grant/revoke roles": needs
-- users.manage_roles, and only a super admin touches super_admin). This adds
-- what the screen needs to be safe:
--   * an audit trail for role changes (user_roles had none);
--   * the last super admin can never lose the role, so the site can't be
--     left without anyone able to manage it.

select public.enable_audit('public.user_roles', array['user_id', 'role_id']);

create or replace function public.user_roles_keep_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_super uuid;
begin
  select id into v_super from public.roles where key = 'super_admin';
  if old.role_id = v_super
     and not exists (
       select 1 from public.user_roles
        where role_id = v_super and user_id <> old.user_id) then
    raise exception 'last_super_admin' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

revoke execute on function public.user_roles_keep_super_admin() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'user_roles_keep_super_admin') then
    create trigger user_roles_keep_super_admin before delete on public.user_roles
      for each row execute function public.user_roles_keep_super_admin();
  end if;
end
$$;

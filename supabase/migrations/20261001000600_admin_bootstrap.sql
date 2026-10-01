-- Phase 1: bootstrap helper for the first super admin.
-- Callable only with the service-role key (scripts/create-super-admin.ts).

create or replace function public.grant_role_by_email(p_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_role uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then
    raise exception 'No auth user with email %', p_email;
  end if;

  select id into v_role from public.roles where key = p_role;
  if v_role is null then
    raise exception 'Unknown role %', p_role;
  end if;

  insert into public.user_roles (user_id, role_id)
  values (v_user, v_role)
  on conflict do nothing;

  return v_user;
end;
$$;

revoke execute on function public.grant_role_by_email(text, text) from public, anon, authenticated;
grant execute on function public.grant_role_by_email(text, text) to service_role;

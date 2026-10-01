-- Phase 1: append-only audit log fed by row triggers.
--
-- Every audited table gets an AFTER trigger that records who changed what,
-- with before/after JSON. Later phases call public.enable_audit('<table>')
-- for each new table so no admin mutation goes unrecorded.

create table public.audit_logs (
  id             bigint generated always as identity primary key,
  occurred_at    timestamptz not null default now(),
  actor_id       uuid,          -- no FK: logs must survive user deletion
  actor_role     text,          -- JWT role (authenticated / service_role) or db user
  action         text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name     text not null,
  record_id      text,
  old_data       jsonb,
  new_data       jsonb,
  changed_fields text[],
  ip             inet,
  user_agent     text
);

create index audit_logs_occurred_at_idx on public.audit_logs (occurred_at desc);
create index audit_logs_table_record_idx on public.audit_logs (table_name, record_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id, occurred_at desc);

alter table public.audit_logs enable row level security;

create policy "audit readers read audit logs" on public.audit_logs
  for select to authenticated using (public.has_permission('audit.read'));

-- Append-only from the API's point of view: only the trigger writes.
revoke insert, update, delete, truncate on public.audit_logs from anon, authenticated;

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old       jsonb;
  v_new       jsonb;
  v_row       jsonb;
  v_record_id text;
  v_changed   text[];
  v_headers   jsonb;
  v_ip        inet;
  v_claims    jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);

  -- Trigger args name the key columns (default: id), joined for composite keys.
  select string_agg(v_row ->> col, ':')
    into v_record_id
    from unnest(case when tg_nargs > 0 then tg_argv else array['id'] end) as col;

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key)
      into v_changed
      from jsonb_each(v_new) as n
     where n.value is distinct from (v_old -> n.key);
    -- Skip no-op updates and pure updated_at touches.
    if v_changed is null or v_changed = array['updated_at'] then
      return null;
    end if;
  end if;

  -- PostgREST exposes request headers/claims as settings; absent for direct SQL.
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    v_claims  := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    v_ip := nullif(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', ''), ',', 1)), '')::inet;
  exception when others then
    v_ip := null;
  end;

  insert into public.audit_logs
    (actor_id, actor_role, action, table_name, record_id, old_data, new_data, changed_fields, ip, user_agent)
  values (
    nullif(v_claims ->> 'sub', '')::uuid,
    coalesce(v_claims ->> 'role', session_user::text),
    tg_op,
    tg_table_name,
    v_record_id,
    v_old,
    v_new,
    v_changed,
    v_ip,
    left(v_headers ->> 'user-agent', 512)
  );

  return null;
end;
$$;

-- Attach (or re-attach) the audit trigger to a table.
create or replace function public.enable_audit(target regclass, key_columns text[] default array['id'])
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    'create or replace trigger audit_row after insert or update or delete on %s for each row execute function public.audit_trigger(%s)',
    target,
    (select string_agg(quote_literal(c), ', ') from unnest(key_columns) as c)
  );
end;
$$;

revoke execute on function public.enable_audit(regclass, text[]) from public, anon, authenticated;

select public.enable_audit('public.roles');
select public.enable_audit('public.permissions');
select public.enable_audit('public.role_permissions', array['role_id', 'permission_id']);
select public.enable_audit('public.user_roles', array['user_id', 'role_id']);
select public.enable_audit('public.profiles');

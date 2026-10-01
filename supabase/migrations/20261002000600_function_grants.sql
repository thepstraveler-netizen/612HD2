-- Phase 2: tighten EXECUTE on SECURITY DEFINER functions (Supabase advisor
-- lints 0028/0029).
--
-- Trigger functions are never called through the API; triggers still fire
-- without the caller holding EXECUTE. has_permission/has_role/is_staff stay
-- executable because RLS policies call them as anon/authenticated, and they
-- only reveal the caller's own access. current_user_* need a signed-in user.

revoke execute on function public.audit_trigger() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;

revoke execute on function public.current_user_roles() from public, anon;
revoke execute on function public.current_user_permissions() from public, anon;
grant execute on function public.current_user_roles() to authenticated;
grant execute on function public.current_user_permissions() to authenticated;

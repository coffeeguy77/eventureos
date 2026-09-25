-- Internal functions: never callable through the API
revoke all on function public.next_org_number(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.assign_org_number() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

-- Access helpers: RLS policies call these as the signed-in user, so
-- authenticated keeps EXECUTE; they only reveal the caller's own access.
revoke all on function public.is_super_admin() from public, anon;
revoke all on function public.has_org_role(uuid, public.org_role[]) from public, anon;
revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.is_org_staff(uuid) from public, anon;
revoke all on function public.is_org_manager(uuid) from public, anon;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.has_org_role(uuid, public.org_role[]) to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_staff(uuid) to authenticated;
grant execute on function public.is_org_manager(uuid) to authenticated;

revoke all on function public.global_search(uuid, text, integer) from public, anon;
grant execute on function public.global_search(uuid, text, integer) to authenticated;

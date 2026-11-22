-- Test companies cannot accidentally publish an apparently genuine vacancy.
create function private.inherit_test_listing_context() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 new.is_test:=new.is_test or coalesce((select o.is_test from public.organisations o where o.id=new.organisation_id),false);
 return new;
end;$$;
revoke all on function private.inherit_test_listing_context() from public,anon,authenticated;
create trigger inherit_test_listing_context before insert or update of organisation_id,is_test on public.jobs for each row execute function private.inherit_test_listing_context();

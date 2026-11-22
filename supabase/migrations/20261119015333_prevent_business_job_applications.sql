begin;
-- Enforce the personal-account boundary for API and direct Data API submissions.
-- Definer privileges allow only the trigger to inspect private account membership;
-- no identity, document text or billing information is returned to the caller.
create function private.prevent_business_application() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.business_accounts where user_id=new.candidate_id)
 or exists(select 1 from public.organisation_members where user_id=new.candidate_id) then
  raise exception 'Use a separate personal account to apply for jobs. Business accounts are for managing hiring.' using errcode='42501';
 end if;
 return new;
end;$$;
revoke all on function private.prevent_business_application() from public,anon,authenticated;
create trigger application_personal_account before insert on public.applications for each row execute function private.prevent_business_application();
commit;

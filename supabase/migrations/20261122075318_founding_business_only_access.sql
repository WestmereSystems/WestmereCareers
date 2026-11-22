begin;
-- Business signup admits a hiring workflow; it must not create a personal applicant account.
create function private.applicant_access_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select private.launch_account_allowed() and (private.launch_open() or private.my_staff_role() is not null
 or exists(select 1 from auth.users where id=auth.uid() and created_at<(select existing_before from private.launch_settings where singleton))
 or exists(select 1 from private.launch_access a join auth.users u on u.id=auth.uid() and a.email=lower(u.email)
  where a.kind in('existing','candidate') and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())));
$$;
revoke all on function private.applicant_access_allowed() from public,anon;
grant execute on function private.applicant_access_allowed() to authenticated;
create or replace function private.my_launch_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('allowed',private.launch_account_allowed(),'applicantAllowed',private.applicant_access_allowed(),
 'kind',coalesce((select b.kind from public.business_accounts b where b.user_id=auth.uid()),
 (select s.kind from private.launch_business_signup s join auth.users u on lower(u.email)=s.email where u.id=auth.uid() and s.expires_at>now())),
 'expiresAt',null,'marketplaceOpen',private.launch_open(),'selfRegistration',true);
$$;
create function private.guard_founding_candidate_write() returns trigger language plpgsql security definer set search_path='' as $$
declare v_user uuid;begin
 if tg_table_name='candidate_cvs' then v_user:=new.user_id;else v_user:=auth.uid();end if;
 -- Service-written CV metadata is checked against the actual owning identity too.
 if not private.launch_open() and v_user is not null and not exists(
  select 1 from auth.users u where u.id=v_user and (u.created_at<(select existing_before from private.launch_settings where singleton)
   or exists(select 1 from private.staff_members s where s.user_id=u.id and s.enabled)
   or exists(select 1 from private.launch_access a where a.email=lower(u.email) and a.kind in('existing','candidate') and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())))) then
  if tg_table_name='profiles' then
   if coalesce(new.cv_text,'')<>'' or new.active_cv_id is not null then
    raise exception 'Applicant accounts and CV storage open at public launch; complete business onboarding to continue' using errcode='42501';
   end if;
  else
   raise exception 'Applicant accounts and CV storage open at public launch; complete business onboarding to continue' using errcode='42501';
  end if;
 end if;
 return new;
end;$$;
revoke all on function private.guard_founding_candidate_write() from public,anon,authenticated;
create trigger founding_candidate_cv before insert or update on public.candidate_cvs for each row execute function private.guard_founding_candidate_write();
create trigger founding_candidate_profile before insert or update on public.profiles for each row execute function private.guard_founding_candidate_write();
create policy founding_candidate_searches on public.saved_searches as restrictive for all to authenticated using(private.applicant_access_allowed()) with check(private.applicant_access_allowed());
create policy founding_candidate_saved_jobs on public.saved_jobs as restrictive for all to authenticated using(private.applicant_access_allowed()) with check(private.applicant_access_allowed());
commit;

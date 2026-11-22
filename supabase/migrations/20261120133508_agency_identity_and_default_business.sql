begin;
alter table public.business_accounts add column default_organisation_id uuid references public.organisations(id) on delete set null;
create function private.set_default_business(p_org uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_active_hiring_team(p_org) then raise exception 'Choose an active verified business you manage' using errcode='42501';end if;
 update public.business_accounts set default_organisation_id=p_org where user_id=auth.uid();
 if not found then raise exception 'Complete business onboarding first' using errcode='42501';end if;
end;$$;
revoke all on function private.set_default_business(uuid) from public,anon;
grant execute on function private.set_default_business(uuid) to authenticated;
create function public.set_default_business(p_org uuid) returns void language sql security invoker set search_path='' as $$select private.set_default_business(p_org);$$;
revoke all on function public.set_default_business(uuid) from public,anon;
grant execute on function public.set_default_business(uuid) to authenticated;

-- Classification belongs to an independently reviewed organisation. Existing
-- verified employer records retain their reviewed identity, never a URL intent.
alter table public.organisations add column kind text not null default 'employer' check(kind in ('employer','agency'));
alter table public.organisations add column agency_specialisms text[] not null default '{}';
alter table public.organisations add column agency_regions text[] not null default '{}';
alter table public.organisations add column agency_pilot_enabled boolean not null default false;
alter table public.employer_verification_requests add column requested_kind text not null default 'employer' check(requested_kind in ('employer','agency'));
alter table public.employer_verification_requests add column agency_specialisms text[] not null default '{}';
alter table public.employer_verification_requests add column agency_regions text[] not null default '{}';
create table private.business_type_corrections(
 id uuid primary key default gen_random_uuid(),organisation_id uuid references public.organisations(id),user_id uuid not null references auth.users(id),
 previous_kind text not null,requested_kind text not null check(requested_kind in ('employer','agency')),evidence text not null,
 specialisms text[] not null default '{}',regions text[] not null default '{}',
 status text not null default 'pending' check(status in ('pending','needs_information','rejected','awaiting_billing','completed','cancelled')),
 reviewer_id uuid references auth.users(id),feedback text not null default '',reviewed_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default clock_timestamp()
);
create index business_type_corrections_owner on private.business_type_corrections(user_id,created_at desc);
create unique index business_type_correction_pending on private.business_type_corrections(organisation_id) where status in ('pending','needs_information','awaiting_billing');
alter table private.business_type_corrections enable row level security;
revoke all on private.business_type_corrections from public,anon,authenticated;
grant all on private.business_type_corrections to service_role;

create function private.guard_business_type() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.kind<>old.kind and current_setting('role',true) in ('authenticated','service_role') and
 (exists(select 1 from public.organisation_members m join public.organisations o on o.id=m.organisation_id where m.user_id=new.user_id and m.role='owner' and o.is_verified and o.removed_at is null)
 or exists(select 1 from public.organisation_billing_accounts where billing_user_id=new.user_id and is_primary)) then
  raise exception 'Approved business type and billing changes require independent review' using errcode='42501';
 end if;
 return new;
end;$$;
revoke all on function private.guard_business_type() from public,anon,authenticated;
create trigger guard_business_type before update on public.business_accounts for each row execute function private.guard_business_type();

create function private.submit_typed_business_verification(p_details jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_kind text:=p_details->>'kind';
begin
 if v_kind not in ('employer','agency') or auth.uid() is null then raise exception 'Choose a business type' using errcode='22023';end if;
 if v_kind='agency' and (jsonb_array_length(coalesce(p_details->'specialisms','[]'))<1 or jsonb_array_length(coalesce(p_details->'regions','[]'))<1) then raise exception 'Agency specialisms and service regions are required' using errcode='22023';end if;
 v_id:=private.submit_business_verification((p_details->>'requestId')::uuid,p_details->>'businessName',p_details->>'abn',p_details->>'website',p_details->>'contactRole',p_details->>'evidence',p_details->>'linkedin',p_details->>'hrEmail',p_details->>'hrPhone',p_details->>'contactSource',(p_details->>'contactPermission')::boolean);
 update public.employer_verification_requests set requested_kind=v_kind,
 agency_specialisms=array(select jsonb_array_elements_text(coalesce(p_details->'specialisms','[]'))),
 agency_regions=array(select jsonb_array_elements_text(coalesce(p_details->'regions','[]'))) where id=v_id;
 return v_id;
end;$$;
revoke all on function private.submit_typed_business_verification(jsonb) from public,anon;
grant execute on function private.submit_typed_business_verification(jsonb) to authenticated;
create function public.submit_typed_business_verification(p_details jsonb) returns uuid language sql security invoker set search_path='' as $$select private.submit_typed_business_verification(p_details);$$;
revoke all on function public.submit_typed_business_verification(jsonb) from public,anon;
grant execute on function public.submit_typed_business_verification(jsonb) to authenticated;

create function private.apply_reviewed_business_type() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='approved' and old.status is distinct from new.status and new.organisation_id is not null then
  if private.my_staff_role() is null or auth.uid()=new.applicant_id then raise exception 'Independent classification review required' using errcode='42501';end if;
  update public.organisations set kind=new.requested_kind,agency_specialisms=new.agency_specialisms,agency_regions=new.agency_regions where id=new.organisation_id;
 end if;
 return new;
end;$$;
revoke all on function private.apply_reviewed_business_type() from public,anon,authenticated;
create trigger apply_reviewed_business_type after update of status on public.employer_verification_requests for each row execute function private.apply_reviewed_business_type();
commit;

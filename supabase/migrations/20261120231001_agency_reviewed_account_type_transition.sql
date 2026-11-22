begin;
alter table private.business_type_corrections alter column user_id drop not null;
alter table private.business_type_corrections drop constraint business_type_corrections_user_id_fkey;
alter table private.business_type_corrections add foreign key(user_id) references auth.users(id) on delete set null;
alter table private.business_type_corrections drop constraint business_type_corrections_reviewer_id_fkey;
alter table private.business_type_corrections add foreign key(reviewer_id) references auth.users(id) on delete set null;
alter table private.business_type_corrections add column billing_quote jsonb;
alter table private.business_type_corrections add column quote_hash text;
alter table private.business_type_corrections add column quote_expires_at timestamptz;
alter table private.business_type_corrections add column accepted_at timestamptz;
alter table private.business_type_corrections add column completed_at timestamptz;
create or replace function private.guard_business_type() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind<>old.kind and
 (exists(select 1 from public.organisation_members m join public.organisations o on o.id=m.organisation_id where m.user_id=new.user_id and m.role='owner' and o.is_verified and o.removed_at is null)
 or exists(select 1 from public.organisation_billing_accounts where billing_user_id=new.user_id and is_primary)) and not exists(
 select 1 from private.business_type_corrections r where r.user_id=new.user_id and r.requested_kind=new.kind and r.status='completed' and r.reviewer_id is not null and r.completed_at=transaction_timestamp()) then
  raise exception 'Approved business type and billing changes require independent review' using errcode='42501';
 end if;return new;
end;$$;
create function private.complete_business_type_correction(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r private.business_type_corrections%rowtype;b public.organisation_billing_accounts%rowtype;
begin
 select * into r from private.business_type_corrections where id=p_id for update;
 if r.status='completed' then return;end if;
 if r.status<>'awaiting_billing' or r.reviewer_id is null then raise exception 'An approved correction is required' using errcode='42501';end if;
 select * into b from public.organisation_billing_accounts where billing_user_id=r.user_id and is_primary for update;
 if exists(select 1 from private.business_plan_organisations where billing_user_id=r.user_id and organisation_id<>r.organisation_id) then raise exception 'Review coverage first: a type correction cannot change other covered businesses.' using errcode='23514';end if;
 if b.organisation_id is not null and exists(select 1 from public.business_subscriptions where organisation_id=b.organisation_id and status not in ('canceled','incomplete_expired')) and (r.accepted_at is null or r.billing_quote is null) then raise exception 'Accept the reviewed billing transition first' using errcode='42501';end if;
 update private.business_type_corrections set status='completed',completed_at=transaction_timestamp(),updated_at=clock_timestamp() where id=r.id;
 update public.organisations set kind=r.requested_kind,agency_specialisms=r.specialisms,agency_regions=r.regions,agency_pilot_enabled=false where id=r.organisation_id;
 update public.business_accounts set kind=r.requested_kind where user_id=r.user_id;
 update public.organisation_billing_accounts set audience=r.requested_kind where billing_user_id=r.user_id and is_primary;
 -- Existing application recipient snapshots remain immutable. Re-review future advertising.
 update public.jobs set advertiser_kind=r.requested_kind,status='draft',moderation_status='pending',publication_requested=false,moderation_updated_at=clock_timestamp() where organisation_id=r.organisation_id;
 if r.requested_kind='agency' then
  insert into private.agency_job_engagements(job_id,agency_id,lead_user_id) select id,r.organisation_id,r.user_id from public.jobs where organisation_id=r.organisation_id on conflict do nothing;
  insert into private.agency_job_assignments(job_id,user_id,assigned_by) select id,r.user_id,r.user_id from public.jobs where organisation_id=r.organisation_id on conflict do nothing;
 end if;
 insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason) values(r.reviewer_id,'business_type',r.id,'completed','Reviewed account-type correction completed with compatible billing.');
end;$$;
revoke all on function private.complete_business_type_correction(uuid) from public,anon,authenticated;

create function private.manage_business_type(p_action text,p_id uuid default null,p_details jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();r private.business_type_corrections%rowtype;o public.organisations%rowtype;v_kind text;v_id uuid;v_status text;
begin
 if u is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_action='list' then return jsonb_build_object('requests',(select coalesce(jsonb_agg(to_jsonb(c) order by created_at desc),'[]') from private.business_type_corrections c where user_id=u));end if;
 if p_action='request' then
  v_kind:=p_details->>'kind';
  if v_kind not in ('employer','agency') or length(trim(p_details->>'evidence')) not between 30 and 6000 then raise exception 'Choose a type and provide authority evidence' using errcode='22023';end if;
  if v_kind='agency' and (jsonb_array_length(coalesce(p_details->'specialisms','[]'))=0 or jsonb_array_length(coalesce(p_details->'regions','[]'))=0) then raise exception 'Agency specialisms and regions are required' using errcode='22023';end if;
  if p_id is null then
   if not exists(select 1 from public.business_accounts where user_id=u) or exists(select 1 from public.organisation_members m join public.organisations o on o.id=m.organisation_id where m.user_id=u and m.role='owner' and o.is_verified) or exists(select 1 from public.organisation_billing_accounts where billing_user_id=u and is_primary) then raise exception 'Choose your owned organisation for independent review' using errcode='42501';end if;
   update public.business_accounts set kind=v_kind where user_id=u;
   update public.employer_verification_requests set status='rejected',applicant_message='Superseded by your account-type correction. Submit the corrected verification details.',updated_at=clock_timestamp() where applicant_id=u and status in ('pending','needs_information');
   return jsonb_build_object('corrected',true);
  end if;
  select * into o from public.organisations where id=p_id;
  if not exists(select 1 from public.organisation_members where organisation_id=p_id and user_id=u and role='owner') or o.kind=v_kind then raise exception 'Only the owner can request a different approved business type' using errcode='42501';end if;
  insert into private.business_type_corrections(organisation_id,user_id,previous_kind,requested_kind,evidence,specialisms,regions) values(o.id,u,o.kind,v_kind,trim(p_details->>'evidence'),array(select jsonb_array_elements_text(coalesce(p_details->'specialisms','[]'))),array(select jsonb_array_elements_text(coalesce(p_details->'regions','[]')))) returning id into v_id;
  return jsonb_build_object('id',v_id);
 end if;
 select * into r from private.business_type_corrections where id=p_id for update;
 if not found then raise exception 'Correction unavailable' using errcode='42501';end if;
 if p_action='cancel' then
  if r.user_id<>u or r.status not in ('pending','needs_information','awaiting_billing') or r.accepted_at is not null then raise exception 'This correction cannot be cancelled' using errcode='42501';end if;
  update private.business_type_corrections set status='cancelled',updated_at=clock_timestamp() where id=r.id;return jsonb_build_object('saved',true);
 elsif p_action='review' then
  if private.my_staff_role() is null or u=r.user_id or exists(select 1 from public.organisation_members where organisation_id=r.organisation_id and user_id=u) then raise exception 'Independent review required' using errcode='42501';end if;
  if r.status not in ('pending','needs_information') or r.updated_at is distinct from (p_details->>'version')::timestamptz then raise exception 'Refresh the correction before reviewing' using errcode='40001';end if;
  if length(trim(p_details->>'reason')) not between 10 and 2000 then raise exception 'Review feedback is required' using errcode='22023';end if;
  v_status:=case p_details->>'decision' when 'approve' then 'awaiting_billing' when 'reject' then 'rejected' when 'request_information' then 'needs_information' else null end;
  if v_status is null or (v_status='awaiting_billing' and (not coalesce((p_details->>'identityChecked')::boolean,false) or not coalesce((p_details->>'authorityChecked')::boolean,false))) then raise exception 'Independent identity and authority checks are required' using errcode='22023';end if;
  if v_status='awaiting_billing' and exists(select 1 from private.business_plan_organisations where billing_user_id=r.user_id and organisation_id<>r.organisation_id) then raise exception 'Other owned businesses use this billing stream. Review coverage before approving a type correction.' using errcode='23514';end if;
  update private.business_type_corrections set status=v_status,reviewer_id=u,feedback=p_details->>'reason',reviewed_at=now(),updated_at=clock_timestamp() where id=r.id;
  insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason) values(u,'business_type',r.id,p_details->>'decision',p_details->>'reason');
  if v_status='awaiting_billing' and not exists(select 1 from public.organisation_billing_accounts b join public.business_subscriptions s on s.organisation_id=b.organisation_id where b.billing_user_id=r.user_id and b.is_primary and s.status not in ('canceled','incomplete_expired')) then perform private.complete_business_type_correction(r.id);end if;
  return jsonb_build_object('saved',true);
 elsif p_action='accept' then
  if r.user_id<>u or r.status<>'awaiting_billing' or r.quote_hash is distinct from p_details->>'quoteHash' or r.quote_expires_at<=now() or r.billing_quote is null then raise exception 'Refresh the proposed billing terms before accepting' using errcode='40001';end if;
  update private.business_type_corrections set accepted_at=coalesce(accepted_at,now()) where id=r.id;
  return to_jsonb(r)||jsonb_build_object('accepted',true);
 end if;
 raise exception 'Unknown account-type action' using errcode='22023';
end;$$;
revoke all on function private.manage_business_type(text,uuid,jsonb) from public,anon;
grant execute on function private.manage_business_type(text,uuid,jsonb) to authenticated;
create function public.manage_business_type(p_action text,p_id uuid default null,p_details jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.manage_business_type(p_action,p_id,p_details);$$;
revoke all on function public.manage_business_type(text,uuid,jsonb) from public,anon;
grant execute on function public.manage_business_type(text,uuid,jsonb) to authenticated;
-- Trusted server owns quoting and reconciliation; the public RPC can only accept the exact saved hash.
create function public.business_type_billing(p_action text,p_id uuid default null,p_user uuid default null,p_details jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.business_type_corrections%rowtype;b public.organisation_billing_accounts%rowtype;
begin
 if p_action='pending' then return (select to_jsonb(c) from private.business_type_corrections c where user_id=p_user and status='awaiting_billing' and accepted_at is not null limit 1);end if;
 select * into r from private.business_type_corrections where id=p_id and (p_user is null or user_id=p_user) for update;
 if r.id is null or r.status<>'awaiting_billing' then raise exception 'Reviewed correction unavailable' using errcode='42501';end if;
 select * into b from public.organisation_billing_accounts where billing_user_id=r.user_id and is_primary;
 if p_action='context' then return to_jsonb(r)||jsonb_build_object('billing',to_jsonb(b));end if;
 if p_action='quote' then
  if r.accepted_at is not null then raise exception 'A billing transition is already pending; refresh its status.' using errcode='40001';end if;
  update private.business_type_corrections set billing_quote=p_details->'quote',quote_hash=p_details->>'hash',quote_expires_at=now()+interval '15 minutes' where id=r.id;
  return jsonb_build_object('saved',true);
 elsif p_action='complete' then
  if r.accepted_at is null or r.billing_quote->>'subscriptionId' is distinct from p_details->>'subscriptionId' or r.billing_quote->>'priceId' is distinct from p_details->>'priceId' then raise exception 'Confirmed subscription does not match accepted terms' using errcode='42501';end if;
  perform private.complete_business_type_correction(r.id);return jsonb_build_object('completed',true,'audience',r.requested_kind);
 end if;
 raise exception 'Unknown trusted billing action' using errcode='22023';
end;$$;
revoke all on function public.business_type_billing(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.business_type_billing(text,uuid,uuid,jsonb) to service_role;
commit;

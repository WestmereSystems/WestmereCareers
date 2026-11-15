-- Audited recovery after a successful business appeal. Existing vacancies stay closed.
begin;
create or replace function private.review_trust_item(p_kind text,p_id uuid,p_action text,p_reason text,p_version timestamptz,p_identity_checked boolean,p_ownership_checked boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_request public.employer_verification_requests%rowtype; v_job public.jobs%rowtype;
  v_report public.response_reports%rowtype; v_case public.moderation_cases%rowtype; v_org uuid; v_status text;
begin
  if private.my_staff_role() is null then raise exception 'Reviewer access required' using errcode='42501'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 10 and 2000 then raise exception 'A review reason is required' using errcode='22023'; end if;
  if p_kind='verification' then
    select * into v_request from public.employer_verification_requests where id=p_id for update;
    if not found or v_request.applicant_id=v_user then raise exception 'Independent review required' using errcode='42501'; end if;
    if p_version is distinct from v_request.updated_at or v_request.status not in ('pending','needs_information') then raise exception 'This item changed; refresh it' using errcode='40001'; end if;
    if p_action='approve' then
      if not coalesce(p_identity_checked,false) or not coalesce(p_ownership_checked,false) then raise exception 'Complete both evidence checks' using errcode='22023'; end if;
      if exists(select 1 from public.organisations where abn=v_request.abn) then raise exception 'Existing business ownership requires a separate review' using errcode='22023'; end if;
      insert into public.organisations(name,slug,abn,website,is_verified,verified_at)
        values(v_request.business_name,coalesce(nullif(trim(both '-' from regexp_replace(lower(v_request.business_name),'[^a-z0-9]+','-','g')),''),'employer')||'-'||left(p_id::text,8),v_request.abn,v_request.website,true,now()) returning id into v_org;
      insert into public.organisation_members(organisation_id,user_id,role) values(v_org,v_request.applicant_id,'owner');
      v_status:='approved'; perform private.refresh_response_insights(v_org);
    elsif p_action in ('reject','request_information') then v_status:=case when p_action='reject' then 'rejected' else 'needs_information' end;
    else raise exception 'Invalid review action' using errcode='22023'; end if;
    update public.employer_verification_requests set status=v_status,applicant_message=trim(p_reason),organisation_id=v_org,updated_at=now() where id=p_id;
  elsif p_kind='job' then
    select * into v_job from public.jobs where id=p_id for update;
    if not found then raise exception 'Listing not found' using errcode='22023'; end if;
    if exists(select 1 from public.organisation_members where organisation_id=v_job.organisation_id and user_id=v_user) then raise exception 'Independent review required' using errcode='42501'; end if;
    if p_version is distinct from v_job.moderation_updated_at then raise exception 'This item changed; refresh it' using errcode='40001'; end if;
    if p_action='approve' then
      if not v_job.publication_requested or v_job.moderation_status<>'pending' then raise exception 'Submit the listing for review first' using errcode='22023'; end if;
      if not exists(select 1 from public.organisations where id=v_job.organisation_id and is_verified and suspended_at is null) then raise exception 'Business verification required' using errcode='22023'; end if;
      v_status:='approved';
      update public.jobs set moderation_status=v_status,status='published',published_at=coalesce(published_at,now()),expires_at=greatest(expires_at,now()+interval '30 days'),publication_requested=false,moderation_updated_at=now() where id=p_id;
    elsif p_action in ('reject','quarantine') then
      v_status:=case when p_action='reject' then 'rejected' else 'quarantined' end;
      update public.jobs set moderation_status=v_status,status='draft',publication_requested=false,moderation_updated_at=now() where id=p_id;
    else raise exception 'Invalid review action' using errcode='22023'; end if;
    insert into public.listing_review_feedback(job_id,organisation_id,message) values(p_id,v_job.organisation_id,trim(p_reason)) on conflict(job_id) do update set message=excluded.message,updated_at=now();
  elsif p_kind='response_report' then
    select * into v_report from public.response_reports where id=p_id for update;
    if not found or v_report.candidate_id=v_user or exists(select 1 from public.organisation_members where organisation_id=v_report.organisation_id and user_id=v_user) then raise exception 'Independent review required' using errcode='42501'; end if;
    if p_version is distinct from v_report.moderation_updated_at then raise exception 'This item changed; refresh it' using errcode='40001'; end if;
    if p_action not in ('accept','reject','quarantine') then raise exception 'Invalid review action' using errcode='22023'; end if;
    v_status:=case p_action when 'accept' then 'accepted' when 'reject' then 'rejected' else 'quarantined' end;
    update public.response_reports set moderation_status=v_status where id=p_id;
  elsif p_kind='case' then
    select * into v_case from public.moderation_cases where id=p_id for update;
    if not found or v_case.requester_id=v_user or exists(select 1 from public.organisation_members where organisation_id=v_case.organisation_id and user_id=v_user) then raise exception 'Independent review required' using errcode='42501'; end if;
    if p_version is distinct from v_case.updated_at then raise exception 'This item changed; refresh it' using errcode='40001'; end if;
    if p_action not in ('review','resolve','dismiss') then raise exception 'Invalid review action' using errcode='22023'; end if;
    v_status:=case p_action when 'review' then 'in_review' when 'resolve' then 'resolved' else 'dismissed' end;
    update public.moderation_cases set status=v_status,resolution=trim(p_reason),updated_at=now() where id=p_id;
  elsif p_kind='organisation' and p_action in ('suspend','reinstate') then
    if private.my_staff_role()<>'admin' then raise exception 'Administrator access required' using errcode='42501'; end if;
    if exists(select 1 from public.organisation_members where organisation_id=p_id and user_id=v_user) then raise exception 'Independent review required' using errcode='42501'; end if;
    perform 1 from public.organisations where id=p_id for update;
    if not found then raise exception 'Business not found' using errcode='22023'; end if;
    if p_action='suspend' then
      update public.organisations set is_verified=false,suspended_at=now() where id=p_id;
      update public.jobs set status='closed',moderation_status='quarantined',publication_requested=false,moderation_updated_at=now() where organisation_id=p_id;
      v_status:='suspended';
    else
      if not coalesce(p_identity_checked,false) or not coalesce(p_ownership_checked,false) then raise exception 'Repeat independent business and authority checks' using errcode='22023'; end if;
      update public.organisations set is_verified=true,suspended_at=null,verified_at=now() where id=p_id;
      -- Existing roles stay closed. The employer must resubmit each listing for review.
      v_status:='reinstated';
    end if;
  else raise exception 'Invalid review type' using errcode='22023'; end if;
  insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason,evidence_checks)
    values(v_user,p_kind,p_id,p_action,trim(p_reason),jsonb_build_object('identity_checked',coalesce(p_identity_checked,false),'ownership_checked',coalesce(p_ownership_checked,false),'result',v_status));
  return jsonb_build_object('status',v_status,'organisationId',v_org);
end;
$$;
commit;

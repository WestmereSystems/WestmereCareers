begin;
-- A legal entity can operate multiple independently verified trading brands.
-- Never attach a new applicant to a different existing organisation.
alter table public.organisations drop constraint organisations_abn_key;
create unique index organisations_abn_brand on public.organisations(abn,lower(name)) where abn is not null;
alter table public.employer_verification_requests add column approved_kind text check(approved_kind in ('employer','agency'));
alter table public.employer_verification_requests add column shared_abn_checked boolean not null default false;

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
      if exists(select 1 from public.organisations where abn=v_request.abn and lower(name)=lower(v_request.business_name)) then
        raise exception 'This business already exists; review ownership separately' using errcode='23505'; end if;
      if exists(select 1 from public.organisations where abn=v_request.abn) and not v_request.shared_abn_checked then
        raise exception 'Independently confirm this separate trading brand and shared ABN first' using errcode='22023'; end if;
      if coalesce(v_request.approved_kind,v_request.requested_kind)='agency' and (cardinality(v_request.agency_specialisms)=0 or cardinality(v_request.agency_regions)=0) then
        raise exception 'Agency specialisms and regions are required; request more information' using errcode='22023'; end if;
      -- An established billing stream is changed only through the separate reviewed/accepted correction.
      if exists(select 1 from public.business_accounts where user_id=v_request.applicant_id and kind<>coalesce(v_request.approved_kind,v_request.requested_kind)) then
        if exists(select 1 from public.organisation_billing_accounts where billing_user_id=v_request.applicant_id and is_primary)
          or exists(select 1 from public.organisation_members m join public.organisations o on o.id=m.organisation_id where m.user_id=v_request.applicant_id and m.role='owner' and o.is_verified and o.removed_at is null) then
          raise exception 'Use the account-type correction review for this existing account' using errcode='22023'; end if;
        update public.business_accounts set kind=coalesce(v_request.approved_kind,v_request.requested_kind) where user_id=v_request.applicant_id;
      end if;
      insert into public.organisations(name,slug,abn,website,is_verified,verified_at,kind)
        values(v_request.business_name,coalesce(nullif(trim(both '-' from regexp_replace(lower(v_request.business_name),'[^a-z0-9]+','-','g')),''),'employer')||'-'||left(p_id::text,8),v_request.abn,v_request.website,true,now(),coalesce(v_request.approved_kind,v_request.requested_kind)) returning id into v_org;
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
      if not v_job.publication_requested or v_job.moderation_status not in ('pending','quarantined') then raise exception 'Submit the listing for review first' using errcode='22023'; end if;
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
    values(v_user,p_kind,p_id,p_action,trim(p_reason),jsonb_build_object('identity_checked',coalesce(p_identity_checked,false),'ownership_checked',coalesce(p_ownership_checked,false),'result',v_status,'approved_kind',case when p_kind='verification' then coalesce(v_request.approved_kind,v_request.requested_kind) end,'shared_abn_checked',case when p_kind='verification' then v_request.shared_abn_checked end));
  return jsonb_build_object('status',v_status,'organisationId',v_org);
end;
$$;


create function private.review_business_verification(p_id uuid,p_action text,p_reason text,p_version timestamptz,p_identity_checked boolean,p_ownership_checked boolean,p_approved_kind text,p_shared_abn_checked boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.employer_verification_requests%rowtype;
begin
 if private.my_staff_role() is null then raise exception 'Independent reviewer access required' using errcode='42501';end if;
 select * into r from public.employer_verification_requests where id=p_id for update;
 if not found or r.applicant_id=auth.uid() then raise exception 'Independent review required' using errcode='42501';end if;
 if r.updated_at is distinct from p_version or r.status not in ('pending','needs_information') then raise exception 'Refresh this request' using errcode='40001';end if;
 if p_action='approve' then
  if p_approved_kind is null or p_approved_kind not in ('employer','agency') or not coalesce(p_identity_checked,false) or not coalesce(p_ownership_checked,false) then raise exception 'Choose a type and complete independent evidence checks' using errcode='22023';end if;
  update public.employer_verification_requests set approved_kind=p_approved_kind,shared_abn_checked=coalesce(p_shared_abn_checked,false) where id=p_id;
 end if;
 return private.review_trust_item('verification',p_id,p_action,p_reason,p_version,p_identity_checked,p_ownership_checked);
end;$$;
revoke all on function private.review_business_verification(uuid,text,text,timestamptz,boolean,boolean,text,boolean) from public,anon;
grant execute on function private.review_business_verification(uuid,text,text,timestamptz,boolean,boolean,text,boolean) to authenticated;
create function public.review_business_verification(p_id uuid,p_action text,p_reason text,p_version timestamptz,p_identity_checked boolean,p_ownership_checked boolean,p_approved_kind text,p_shared_abn_checked boolean default false)
returns jsonb language sql security invoker set search_path='' as $$ select private.review_business_verification(p_id,p_action,p_reason,p_version,p_identity_checked,p_ownership_checked,p_approved_kind,p_shared_abn_checked); $$;
revoke all on function public.review_business_verification(uuid,text,text,timestamptz,boolean,boolean,text,boolean) from public,anon;
grant execute on function public.review_business_verification(uuid,text,text,timestamptz,boolean,boolean,text,boolean) to authenticated;
create or replace function private.apply_reviewed_business_type() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='approved' and old.status is distinct from new.status and new.organisation_id is not null then
  if private.my_staff_role() is null or auth.uid()=new.applicant_id then raise exception 'Independent classification review required' using errcode='42501';end if;
  update public.organisations set kind=coalesce(new.approved_kind,new.requested_kind),agency_specialisms=new.agency_specialisms,agency_regions=new.agency_regions where id=new.organisation_id;
 end if;return new;
end;$$;

create or replace function private.admin_queue(p_kind text,p_after timestamptz,p_after_id uuid,p_all boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if private.my_staff_role() is null then raise exception 'Reviewer access required' using errcode='42501'; end if;
  if p_kind not in ('verification','job','response_report','case','audit') or p_kind is null then raise exception 'Invalid queue' using errcode='22023'; end if;
  with items as (
    select id,created_at,to_jsonb(v)||jsonb_build_object('shared_abn',exists(select 1 from public.organisations o where o.abn=v.abn),'account_kind',(select kind from public.business_accounts where user_id=v.applicant_id)) as item from public.employer_verification_requests v where p_kind='verification' and (p_all or status in ('pending','needs_information'))
    union all select id,created_at,to_jsonb(j)-'search_vector' from public.jobs j where p_kind='job' and (p_all or (publication_requested and moderation_status in ('pending','quarantined')))
    union all select r.id,r.created_at,to_jsonb(r)||jsonb_build_object('company',o.name) from public.response_reports r join public.organisations o on o.id=r.organisation_id where p_kind='response_report' and (p_all or r.moderation_status in ('pending','quarantined'))
    union all select id,created_at,to_jsonb(c) from public.moderation_cases c where p_kind='case' and (p_all or status in ('open','in_review'))
    union all select id,created_at,to_jsonb(a) from private.moderation_audit a where p_kind='audit'
  ), page as (
    select * from items where p_after is null or (created_at,id)>(p_after,p_after_id) order by created_at,id limit 6
  ), visible as (select * from page order by created_at,id limit 5)
  select jsonb_build_object('items',coalesce((select jsonb_agg(item order by created_at,id) from visible),'[]'),
    'hasMore',(select count(*)>5 from page),'cursor',(select jsonb_build_object('at',created_at,'id',id) from visible order by created_at desc,id desc limit 1)) into v_result;
  return v_result;
end;
$$;

create or replace function private.admin_activity(p_before timestamptz default null,p_before_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if private.my_staff_role() is null then raise exception 'Staff access required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(r order by r.created_at desc,r.id desc),'[]') from (
  select e.*,u.email actor_email,t.email target_email from (
   select id,actor_id,target_id,'testing'::text category,action,tier,reason,created_at from private.testing_audit
   union all
   select id,actor_id,subject_id,'moderation',action,null,reason,created_at from private.moderation_audit
  ) e left join auth.users u on u.id=e.actor_id left join auth.users t on t.id=e.target_id
  where p_before is null or (e.created_at,e.id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
  order by e.created_at desc,e.id desc limit 11
 ) r);
end;$$;


alter table private.alert_preview_allowance drop constraint alert_preview_allowance_recent_requests_check;
alter table private.alert_preview_allowance add check(cardinality(recent_requests)<=96);
-- One preview every 15 minutes. The former three-per-day cap produced a ~1,400-minute timer.
create or replace function private.my_preview_available_at() returns timestamptz language sql stable security definer set search_path='' as $$
 select max(t)+interval '15 minutes' from private.alert_preview_allowance a cross join lateral unnest(a.recent_requests) t where a.user_id=auth.uid();
$$;

create or replace function private.preview_search_alert_before_cooldown(p_search uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.saved_searches%rowtype; v_email text; v_settings private.alert_settings%rowtype; v_id uuid; v_recent timestamptz[]; v_at timestamptz;
begin
  select * into s from public.saved_searches where id=p_search and user_id=(select auth.uid()) and alerts_enabled for update;
  if not found then raise exception 'Enable alerts for your saved search first' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('alert_preview:'||s.user_id::text,0));
  v_at:=clock_timestamp();
  -- Initialise lazily from retained requests; no bulk backfill or record deletion.
  insert into private.alert_preview_allowance(user_id,recent_requests)
    select s.user_id,coalesce(array_agg(created_at order by created_at),'{}'::timestamptz[]) from
      (select created_at from private.alert_outbox where user_id=s.user_id and kind='preview' and created_at>v_at-interval '1 day' order by created_at desc limit 96) retained
    on conflict(user_id) do nothing;
  select coalesce(array_agg(t order by t),'{}'::timestamptz[]) into v_recent
    from private.alert_preview_allowance a cross join lateral unnest(a.recent_requests) t
    where a.user_id=s.user_id and t>v_at-interval '1 day';
  if cardinality(v_recent)>=96 then raise exception 'Preview limit reached' using errcode='P0001'; end if;
  select * into v_settings from private.alert_settings where singleton and sending_enabled;
  if not found then raise exception 'Email delivery is being configured' using errcode='P0001'; end if;
  select email into v_email from auth.users where id=s.user_id and email_confirmed_at is not null;
  if v_email is null or exists(select 1 from private.alert_suppressions where user_id=s.user_id) then raise exception 'Email delivery unavailable' using errcode='P0001'; end if;
  insert into private.alert_outbox(search_id,user_id,recipient,kind,snapshot) values(s.id,s.user_id,v_email,'preview',
    jsonb_build_object('searchName',s.name,'jobs','[]'::jsonb,'siteOrigin',v_settings.site_origin,'unsubscribeUrl',v_settings.unsubscribe_origin||'?token='||s.unsubscribe_token::text)) returning id into v_id;
  update private.alert_preview_allowance set recent_requests=array_append(v_recent,v_at) where user_id=s.user_id;
  return v_id;
end;
$$;

create function private.my_alert_activity(p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_page is null or p_page not between 1 and 10000 then raise exception 'Choose an email activity page' using errcode='22023';end if;
 return jsonb_build_object('configured',exists(select 1 from private.alert_settings where sending_enabled),
 'suppressed',exists(select 1 from private.alert_suppressions where user_id=auth.uid()),
 'deliveryTotal',(select count(*) from private.alert_outbox where user_id=auth.uid()),
 'deliveries',(select coalesce(jsonb_agg(to_jsonb(d) order by created_at desc,id desc),'[]') from(select id,search_id,kind,status,created_at,accepted_at,delivered_at from private.alert_outbox where user_id=auth.uid() order by created_at desc,id desc limit 10 offset (p_page-1)*10) d));
end;$$;
revoke all on function private.my_alert_activity(integer) from public,anon;
grant execute on function private.my_alert_activity(integer) to authenticated;
create function public.my_alert_activity(p_page integer default 1) returns jsonb language sql security invoker set search_path='' as $$ select private.my_alert_activity(p_page); $$;
revoke all on function public.my_alert_activity(integer) from public,anon;
grant execute on function public.my_alert_activity(integer) to authenticated;
create index alert_outbox_user_activity on private.alert_outbox(user_id,created_at desc,id desc);

-- Privacy-conscious popularity: recognised terms only, one event per search view,
-- consent enforced in the API; daily rotating network hashes; suppress small samples.
create table private.site_search_events(view_id uuid primary key,day date not null default current_date,keyword text not null check(length(keyword) between 2 and 80),network text not null check(length(network)=64));
create index site_search_popularity on private.site_search_events(day,keyword);
alter table private.site_search_events enable row level security;
revoke all on private.site_search_events from public,anon,authenticated;
grant all on private.site_search_events to service_role;
create function public.record_site_search(p_view uuid,p_keyword text,p_network text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_keyword is null or length(p_keyword) not between 2 and 80 or length(p_network)<>64 then return;end if;
 perform pg_advisory_xact_lock(hashtextextended('search-popularity:'||p_network,0));
 delete from private.site_search_events where day<current_date-29;
 if (select count(*) from private.site_search_events where day=current_date and network=p_network)>=20 then return;end if;
 insert into private.site_search_events(view_id,keyword,network) values(p_view,p_keyword,p_network) on conflict do nothing;
end;$$;
revoke all on function public.record_site_search(uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_site_search(uuid,text,text) to service_role;
create function public.popular_site_searches() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(keyword order by searches desc,keyword),'[]') from(
 select keyword,count(*) searches from private.site_search_events where day>=current_date-29
 and (select count(*) from private.site_search_events where day>=current_date-29)>=30
 group by keyword having count(*)>=5 and count(distinct (day,network))>=5 order by count(*) desc,keyword limit 6) ranked;
$$;
revoke all on function public.popular_site_searches() from public,anon,authenticated;
grant execute on function public.popular_site_searches() to service_role;

-- Explicit high-risk statements are held for independent review, including direct Data API publication.
-- This detects examples, not every unlawful ad; awards and lawful exemptions require human assessment.
alter table public.jobs add column compliance_confirmed_at timestamptz;
alter table public.jobs add column compliance_version text;
create function private.guard_listing_compliance() returns trigger language plpgsql security definer set search_path='' as $$
declare content text;
begin
 if new.status<>'published' or auth.uid() is null or private.my_staff_role() is not null then return new;end if;
 content:=lower(concat_ws(' ',new.title,new.description,array_to_string(new.requirements,' '),array_to_string(new.responsibilities,' ')));
 if content ~ '(below[- ]award|less than (the )?(award|minimum wage)|no super(annuation)? (paid|payable)|unpaid (trial|training) (shift|week)|pay (us |a |an )?(recruitment|application|placement) fee|australian[- ]born only|native english speakers? only|under [0-9]{2} only|male applicants? only|female applicants? only)' then
  new.status:='draft';new.moderation_status:='quarantined';new.publication_requested:=true;new.moderation_updated_at:=clock_timestamp();
 end if;
 return new;
end;$$;
revoke all on function private.guard_listing_compliance() from public,anon,authenticated;
create trigger zzzz_listing_compliance before insert or update on public.jobs for each row execute function private.guard_listing_compliance();
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('westmere-search-popularity-retention','30 3 * * *','delete from private.site_search_events where day<current_date-29;');
 end if;
end;$$;
commit;

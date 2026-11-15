-- Reviewed business ownership, human moderation and privacy-preserving response snapshots.
begin;

alter table public.organisations add column abn text unique check (abn is null or abn ~ '^[0-9]{11}$');
alter table public.organisations add column suspended_at timestamptz;
alter table public.organisations add column verified_at timestamptz;
alter table public.jobs add column moderation_status text not null default 'pending'
  check (moderation_status in ('pending','approved','rejected','quarantined'));
alter table public.jobs add column publication_requested boolean not null default false;
alter table public.jobs add column moderation_updated_at timestamptz not null default now();
alter table public.jobs add column response_snapshot_at timestamptz;
alter table public.response_reports add column moderation_updated_at timestamptz not null default now();
alter table public.response_reports add column created_at timestamptz not null default now();
create index jobs_review_queue on public.jobs(created_at) where publication_requested and moderation_status = 'pending';
create index response_reports_cohort on public.response_reports(organisation_id, application_date, candidate_id)
  where moderation_status = 'accepted';

create table private.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('reviewer','admin')),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table private.moderation_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  subject_type text not null,
  subject_id uuid not null,
  action text not null,
  reason text not null check (char_length(reason) between 10 and 2000),
  evidence_checks jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index moderation_audit_subject on private.moderation_audit(subject_type,subject_id,created_at desc);
create index moderation_audit_actor on private.moderation_audit(actor_id);
alter table private.staff_members enable row level security;
alter table private.moderation_audit enable row level security;
revoke all on private.staff_members, private.moderation_audit from public, anon, authenticated;
grant all on private.staff_members, private.moderation_audit to service_role;

create table public.employer_verification_requests (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null check (char_length(business_name) between 2 and 180),
  abn text not null check (abn ~ '^[0-9]{11}$'),
  website text not null check (website ~ '^https://[^ /]+'),
  contact_role text not null check (char_length(contact_role) between 2 and 120),
  ownership_evidence text not null check (char_length(ownership_evidence) between 30 and 4000),
  status text not null default 'pending' check (status in ('pending','needs_information','approved','rejected')),
  applicant_message text not null default '',
  organisation_id uuid references public.organisations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index verification_applicant on public.employer_verification_requests(applicant_id,created_at desc);
create index verification_organisation on public.employer_verification_requests(organisation_id);
create index verification_pending on public.employer_verification_requests(created_at) where status in ('pending','needs_information');
create unique index verification_one_pending_abn on public.employer_verification_requests(applicant_id,abn)
  where status in ('pending','needs_information');
alter table public.employer_verification_requests enable row level security;
revoke all on public.employer_verification_requests from public, anon, authenticated;
grant select on public.employer_verification_requests to authenticated;
grant all on public.employer_verification_requests to service_role;
create policy verification_own_read on public.employer_verification_requests for select to authenticated
  using (applicant_id = (select auth.uid()));

create table public.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  job_id uuid references public.jobs(id) on delete set null,
  kind text not null check (kind in ('listing_concern','business_concern','response_appeal')),
  detail text not null check (char_length(detail) between 20 and 4000),
  status text not null default 'open' check (status in ('open','in_review','resolved','dismissed')),
  resolution text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index moderation_cases_requester on public.moderation_cases(requester_id,created_at desc);
create index moderation_cases_org on public.moderation_cases(organisation_id);
create index moderation_cases_job on public.moderation_cases(job_id);
create index moderation_cases_pending on public.moderation_cases(created_at) where status in ('open','in_review');
alter table public.moderation_cases enable row level security;
revoke all on public.moderation_cases from public, anon, authenticated;
grant select on public.moderation_cases to authenticated;
grant all on public.moderation_cases to service_role;
create policy cases_own_read on public.moderation_cases for select to authenticated
  using (requester_id = (select auth.uid()));

create table public.organisation_response_insights (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  eligible_reports integer,
  no_response_reports integer,
  response_reports integer,
  median_response_days numeric,
  is_unresponsive boolean not null default false,
  period_start date not null,
  period_end date not null,
  as_of timestamptz not null,
  methodology_version text not null default 'mature-unique-v1',
  check (eligible_reports is null or eligible_reports >= 10),
  check ((eligible_reports is null and no_response_reports is null and response_reports is null and median_response_days is null and not is_unresponsive)
    or (eligible_reports >= 10 and no_response_reports between 0 and eligible_reports and response_reports between 0 and eligible_reports))
);
alter table public.organisation_response_insights enable row level security;
revoke all on public.organisation_response_insights from public, anon, authenticated;
grant select on public.organisation_response_insights to anon, authenticated;
grant all on public.organisation_response_insights to service_role;
create policy insights_public on public.organisation_response_insights for select to anon, authenticated using (true);

create table public.listing_review_feedback (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  message text not null,
  updated_at timestamptz not null default now()
);
create index listing_feedback_org on public.listing_review_feedback(organisation_id);
alter table public.listing_review_feedback enable row level security;
revoke all on public.listing_review_feedback from public,anon,authenticated;
grant select on public.listing_review_feedback to authenticated;
grant all on public.listing_review_feedback to service_role;
create policy listing_feedback_team on public.listing_review_feedback for select to authenticated using(exists(select 1 from public.organisation_members m where m.organisation_id=listing_review_feedback.organisation_id and m.user_id=(select auth.uid())));

create function private.my_staff_role() returns text language sql stable security definer set search_path = '' as $$
  select role from private.staff_members where user_id = (select auth.uid()) and enabled;
$$;
revoke all on function private.my_staff_role() from public, anon;
grant execute on function private.my_staff_role() to authenticated;
create function public.my_staff_role() returns text language sql stable security invoker set search_path = '' as $$ select private.my_staff_role(); $$;
revoke all on function public.my_staff_role() from public, anon;
grant execute on function public.my_staff_role() to authenticated;

create function private.submit_employer_verification(p_name text,p_abn text,p_website text,p_contact_role text,p_evidence text,p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null) then raise exception 'Verify your account email first' using errcode='42501'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 180 or p_abn is null or p_abn !~ '^[0-9]{11}$'
    or p_website is null or p_website !~ '^https://[^ /]+' or char_length(p_website)>500
    or p_contact_role is null or char_length(trim(p_contact_role)) not between 2 and 120
    or p_evidence is null or char_length(trim(p_evidence)) not between 30 and 4000 then
    raise exception 'Check your business details' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('verification:'||v_user::text,0));
  if p_request_id is not null then
    update public.employer_verification_requests set business_name=trim(p_name),abn=p_abn,website=p_website,
      contact_role=trim(p_contact_role),ownership_evidence=trim(p_evidence),status='pending',updated_at=now()
      where id=p_request_id and applicant_id=v_user and status='needs_information' returning id into v_id;
    if v_id is null then raise exception 'Request cannot be edited' using errcode='42501'; end if;
  else
    if (select count(*) from public.employer_verification_requests where applicant_id=v_user and created_at>now()-interval '30 days')>=5 then
      raise exception 'Verification request limit reached' using errcode='P0001';
    end if;
    insert into public.employer_verification_requests(applicant_id,business_name,abn,website,contact_role,ownership_evidence)
      values(v_user,trim(p_name),p_abn,p_website,trim(p_contact_role),trim(p_evidence)) returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function private.submit_employer_verification(text,text,text,text,text,uuid) from public, anon;
grant execute on function private.submit_employer_verification(text,text,text,text,text,uuid) to authenticated;
create function public.submit_employer_verification(p_name text,p_abn text,p_website text,p_contact_role text,p_evidence text,p_request_id uuid default null)
returns uuid language sql security invoker set search_path='' as $$ select private.submit_employer_verification(p_name,p_abn,p_website,p_contact_role,p_evidence,p_request_id); $$;
revoke all on function public.submit_employer_verification(text,text,text,text,text,uuid) from public, anon;
grant execute on function public.submit_employer_verification(text,text,text,text,text,uuid) to authenticated;

create function private.submit_moderation_case(p_org uuid,p_job uuid,p_kind text,p_detail text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('listing_concern','business_concern','response_appeal') or p_detail is null or char_length(trim(p_detail)) not between 20 and 4000 then
    raise exception 'Add the concern and context' using errcode='22023'; end if;
  if not exists(select 1 from public.organisations where id=p_org) or
    (p_job is not null and not exists(select 1 from public.jobs where id=p_job and organisation_id=p_org)) then
    raise exception 'Employer or listing unavailable' using errcode='22023'; end if;
  if p_kind='response_appeal' and not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=v_user and role in ('owner','admin')) then
    raise exception 'Employer access required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('moderation_case:'||v_user::text,0));
  if (select count(*) from public.moderation_cases where requester_id=v_user and created_at>now()-interval '1 day')>=10 then
    raise exception 'Case limit reached' using errcode='P0001'; end if;
  insert into public.moderation_cases(requester_id,organisation_id,job_id,kind,detail) values(v_user,p_org,p_job,p_kind,trim(p_detail)) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.submit_moderation_case(uuid,uuid,text,text) from public, anon;
grant execute on function private.submit_moderation_case(uuid,uuid,text,text) to authenticated;
create function public.submit_moderation_case(p_org uuid,p_job uuid,p_kind text,p_detail text) returns uuid language sql security invoker set search_path='' as $$ select private.submit_moderation_case(p_org,p_job,p_kind,p_detail); $$;
revoke all on function public.submit_moderation_case(uuid,uuid,text,text) from public, anon;
grant execute on function public.submit_moderation_case(uuid,uuid,text,text) to authenticated;

-- Only unique candidates in the mature 3–6 calendar-month cohort contribute.
-- Silence requires recent confirmation; a late response replaces that candidate's silence report.
create function private.refresh_response_insights(p_org uuid,p_as_of timestamptz default now()) returns void
language plpgsql security definer set search_path='' as $$
declare v_start date; v_end date; v_count integer; v_silent integer; v_replied integer; v_median numeric;
begin
  if not exists(select 1 from public.organisations where id=p_org) then return; end if;
  v_start:=((p_as_of at time zone 'Australia/Melbourne')::date-interval '6 months')::date;
  v_end:=((p_as_of at time zone 'Australia/Melbourne')::date-interval '3 months')::date;
  with candidates as (
    select distinct on(r.candidate_id) r.* from public.response_reports r
    where r.organisation_id=p_org and r.moderation_status='accepted'
      and r.application_date >= (v_start::timestamp at time zone 'Australia/Melbourne')
      and r.application_date < (v_end::timestamp at time zone 'Australia/Melbourne')
      and r.confirmed_at<=p_as_of
      and (r.response_received or r.confirmed_at>=p_as_of-interval '30 days')
      and not exists(select 1 from public.organisation_members m where m.organisation_id=p_org and m.user_id=r.candidate_id)
    order by r.candidate_id,r.application_date desc,r.confirmed_at desc,r.id
  )
  select count(*)::integer,
    count(*) filter(where not response_received and p_as_of > ((application_date at time zone 'Australia/Melbourne')+interval '2 months') at time zone 'Australia/Melbourne')::integer,
    count(*) filter(where response_received)::integer,
    round((percentile_cont(0.5) within group(order by extract(epoch from(response_date-application_date))/86400.0)
      filter(where response_received))::numeric,1)
    into v_count,v_silent,v_replied,v_median from candidates;
  insert into public.organisation_response_insights(organisation_id,eligible_reports,no_response_reports,response_reports,median_response_days,is_unresponsive,period_start,period_end,as_of)
    values(p_org,case when v_count>=10 then v_count end,case when v_count>=10 then v_silent end,
      case when v_count>=10 then v_replied end,case when v_count>=10 and v_replied>=5 then v_median end,
      v_count>=10 and v_silent::numeric/nullif(v_count,0)>0.5,v_start,v_end,p_as_of)
    on conflict(organisation_id) do update set eligible_reports=excluded.eligible_reports,no_response_reports=excluded.no_response_reports,
      response_reports=excluded.response_reports,median_response_days=excluded.median_response_days,is_unresponsive=excluded.is_unresponsive,
      period_start=excluded.period_start,period_end=excluded.period_end,as_of=excluded.as_of;
  update public.jobs set response_days=case when v_count>=10 and v_replied>=5 then v_median end,
    eligible_reports=case when v_count>=10 then v_count else 0 end,no_response_reports=case when v_count>=10 then v_silent else 0 end,
    response_reports=case when v_count>=10 then v_replied else 0 end,response_snapshot_at=p_as_of where organisation_id=p_org;
end;
$$;
revoke all on function private.refresh_response_insights(uuid,timestamptz) from public, anon, authenticated;
grant execute on function private.refresh_response_insights(uuid,timestamptz) to service_role;
create function public.refresh_response_insights() returns integer language plpgsql security definer set search_path='' as $$
declare r record; v_count integer:=0;
begin
  for r in select id from public.organisations loop perform private.refresh_response_insights(r.id); v_count:=v_count+1; end loop;
  return v_count;
end;
$$;
revoke all on function public.refresh_response_insights() from public, anon, authenticated;
grant execute on function public.refresh_response_insights() to service_role;
create function private.report_snapshot_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.refresh_response_insights(case when tg_op='DELETE' then old.organisation_id else new.organisation_id end);
  return null;
end;
$$;
revoke all on function private.report_snapshot_changed() from public, anon, authenticated;
create trigger response_snapshot_changed after insert or update or delete on public.response_reports for each row execute function private.report_snapshot_changed();
create function private.report_review_version() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.moderation_updated_at:=now(); return new; end;
$$;
revoke all on function private.report_review_version() from public, anon, authenticated;
create trigger report_review_version before update on public.response_reports for each row execute function private.report_review_version();

-- Browser writes can request publication, never approve their own listing.
create function private.require_job_review() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and current_user='authenticated' and new.status is distinct from old.status then new.moderation_updated_at:=clock_timestamp(); end if;
  if current_user='authenticated' and (tg_op='INSERT' or
    row(new.title,new.location,new.city,new.state,new.category,new.work_mode,new.employment_type,new.salary_min,new.salary_max,new.salary_period,new.super_included,new.description,new.responsibilities,new.requirements,new.skills,new.external_url,new.expires_at)
      is distinct from row(old.title,old.location,old.city,old.state,old.category,old.work_mode,old.employment_type,old.salary_min,old.salary_max,old.salary_period,old.super_included,old.description,old.responsibilities,old.requirements,old.skills,old.external_url,old.expires_at)
    or (new.status='published' and old.status<>'published') or (new.publication_requested and not old.publication_requested)) then
    new.publication_requested:=new.publication_requested or new.status='published' or coalesce(old.publication_requested,false) or coalesce(old.status='published',false);
    new.status:='draft'; new.published_at:=null; new.moderation_status:='pending'; new.moderation_updated_at:=now();
  end if;
  return new;
end;
$$;
revoke all on function private.require_job_review() from public, anon, authenticated;
create trigger require_job_review before insert or update on public.jobs for each row execute function private.require_job_review();
grant insert(publication_requested),update(publication_requested) on public.jobs to authenticated;

drop policy jobs_live on public.jobs;
drop policy jobs_authenticated_read on public.jobs;
create policy jobs_live on public.jobs for select to anon using (
  status='published' and moderation_status='approved' and published_at<=now() and expires_at>now()
  and exists(select 1 from public.organisations o where o.id=organisation_id and o.is_verified and o.suspended_at is null)
);
create policy jobs_authenticated_read on public.jobs for select to authenticated using (
  (status='published' and moderation_status='approved' and published_at<=now() and expires_at>now()
    and exists(select 1 from public.organisations o where o.id=organisation_id and o.is_verified and o.suspended_at is null))
  or exists(select 1 from public.organisation_members m where m.organisation_id=jobs.organisation_id and m.user_id=(select auth.uid()))
);

create function private.admin_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if private.my_staff_role() is null then raise exception 'Reviewer access required' using errcode='42501'; end if;
  return jsonb_build_object(
    'verifications',(select coalesce(jsonb_agg(to_jsonb(v)),'[]') from (select * from public.employer_verification_requests where status in ('pending','needs_information') order by created_at limit 50) v),
    'jobs',(select coalesce(jsonb_agg(to_jsonb(j)),'[]') from (select id,organisation_id,title,company,location,description,requirements,responsibilities,skills,salary_min,salary_max,salary_period,moderation_status,moderation_updated_at from public.jobs where publication_requested and moderation_status='pending' order by created_at limit 50) j),
    'reports',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from (select r.id,r.organisation_id,o.name as company,r.candidate_id,r.application_id,r.application_date,r.response_received,r.response_date,r.confirmed_at,r.evidence_source,r.moderation_status,r.moderation_updated_at from public.response_reports r join public.organisations o on o.id=r.organisation_id order by (r.moderation_status in ('pending','quarantined')) desc,r.confirmed_at desc limit 50) r),
    'cases',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from (select * from public.moderation_cases where status in ('open','in_review') order by created_at limit 50) c),
    'audit',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from (select * from private.moderation_audit order by created_at desc limit 30) a)
  );
end;
$$;
revoke all on function private.admin_snapshot() from public, anon;
grant execute on function private.admin_snapshot() to authenticated;
create function public.admin_snapshot() returns jsonb language sql security invoker set search_path='' as $$ select private.admin_snapshot(); $$;
revoke all on function public.admin_snapshot() from public, anon;
grant execute on function public.admin_snapshot() to authenticated;

create function private.review_trust_item(p_kind text,p_id uuid,p_action text,p_reason text,p_version timestamptz,p_identity_checked boolean,p_ownership_checked boolean)
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
  elsif p_kind='organisation' and p_action='suspend' then
    if private.my_staff_role()<>'admin' then raise exception 'Administrator access required' using errcode='42501'; end if;
    if exists(select 1 from public.organisation_members where organisation_id=p_id and user_id=v_user) then raise exception 'Independent review required' using errcode='42501'; end if;
    update public.organisations set is_verified=false,suspended_at=now() where id=p_id;
    if not found then raise exception 'Business not found' using errcode='22023'; end if;
    update public.jobs set status='closed',moderation_status='quarantined',publication_requested=false,moderation_updated_at=now() where organisation_id=p_id;
    v_status:='suspended';
  else raise exception 'Invalid review type' using errcode='22023'; end if;
  insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason,evidence_checks)
    values(v_user,p_kind,p_id,p_action,trim(p_reason),jsonb_build_object('identity_checked',coalesce(p_identity_checked,false),'ownership_checked',coalesce(p_ownership_checked,false),'result',v_status));
  return jsonb_build_object('status',v_status,'organisationId',v_org);
end;
$$;
revoke all on function private.review_trust_item(text,uuid,text,text,timestamptz,boolean,boolean) from public, anon;
grant execute on function private.review_trust_item(text,uuid,text,text,timestamptz,boolean,boolean) to authenticated;
create function public.review_trust_item(p_kind text,p_id uuid,p_action text,p_reason text,p_version timestamptz,p_identity_checked boolean default false,p_ownership_checked boolean default false)
returns jsonb language sql security invoker set search_path='' as $$ select private.review_trust_item(p_kind,p_id,p_action,p_reason,p_version,p_identity_checked,p_ownership_checked); $$;
revoke all on function public.review_trust_item(text,uuid,text,text,timestamptz,boolean,boolean) from public, anon;
grant execute on function public.review_trust_item(text,uuid,text,text,timestamptz,boolean,boolean) to authenticated;

-- Suspension also revokes recruiter access to candidate documents through every existing entry point.
create function private.is_active_hiring_team(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.organisation_members m join public.organisations o on o.id=m.organisation_id
    where m.organisation_id=p_org and m.user_id=(select auth.uid()) and m.role in ('owner','admin','recruiter') and o.is_verified and o.suspended_at is null);
$$;
revoke all on function private.is_active_hiring_team(uuid) from public, anon;
grant execute on function private.is_active_hiring_team(uuid) to authenticated;
drop policy applications_authorised_read on public.applications;
create policy applications_authorised_read on public.applications for select to authenticated using (
  candidate_id=(select auth.uid()) or (withdrawn_at is null and exists(select 1 from public.jobs j where j.id=job_id and private.is_active_hiring_team(j.organisation_id)))
);

alter function private.open_application_internal(uuid) rename to open_application_before_trust;
revoke all on function private.open_application_before_trust(uuid) from public, anon, authenticated;
create function private.open_application_internal(p_application_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.applications a join public.jobs j on j.id=a.job_id where a.id=p_application_id and private.is_active_hiring_team(j.organisation_id)) then raise exception 'Hiring access unavailable' using errcode='42501'; end if;
  return private.open_application_before_trust(p_application_id);
end;
$$;
revoke all on function private.open_application_internal(uuid) from public, anon;
grant execute on function private.open_application_internal(uuid) to authenticated;
create or replace function public.open_application(p_application_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.open_application_internal(p_application_id); $$;

alter function private.list_job_applications_internal(uuid) rename to list_job_applications_before_trust;
revoke all on function private.list_job_applications_before_trust(uuid) from public, anon, authenticated;
create function private.list_job_applications_internal(p_job_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.jobs j where j.id=p_job_id and private.is_active_hiring_team(j.organisation_id)) then raise exception 'Hiring access unavailable' using errcode='42501'; end if;
  return private.list_job_applications_before_trust(p_job_id);
end;
$$;
revoke all on function private.list_job_applications_internal(uuid) from public, anon;
grant execute on function private.list_job_applications_internal(uuid) to authenticated;
create or replace function public.list_job_applications(p_job_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.list_job_applications_internal(p_job_id); $$;

alter function private.update_application_stage_internal(uuid,text,text) rename to update_application_stage_before_trust;
revoke all on function private.update_application_stage_before_trust(uuid,text,text) from public, anon, authenticated;
create function private.update_application_stage_internal(p_application_id uuid,p_status text,p_message text) returns uuid language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.applications a join public.jobs j on j.id=a.job_id where a.id=p_application_id and private.is_active_hiring_team(j.organisation_id)) then raise exception 'Hiring access unavailable' using errcode='42501'; end if;
  return private.update_application_stage_before_trust(p_application_id,p_status,p_message);
end;
$$;
revoke all on function private.update_application_stage_internal(uuid,text,text) from public, anon;
grant execute on function private.update_application_stage_internal(uuid,text,text) to authenticated;
create or replace function public.update_application_stage(p_application_id uuid,p_status text,p_message text) returns uuid language sql security invoker set search_path='' as $$ select private.update_application_stage_internal(p_application_id,p_status,p_message); $$;

-- Keyset pagination keeps every review reachable as the queues grow.
create function private.admin_queue(p_kind text,p_after timestamptz,p_after_id uuid,p_all boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if private.my_staff_role() is null then raise exception 'Reviewer access required' using errcode='42501'; end if;
  if p_kind not in ('verification','job','response_report','case','audit') or p_kind is null then raise exception 'Invalid queue' using errcode='22023'; end if;
  with items as (
    select id,created_at,to_jsonb(v) as item from public.employer_verification_requests v where p_kind='verification' and (p_all or status in ('pending','needs_information'))
    union all select id,created_at,to_jsonb(j)-'search_vector' from public.jobs j where p_kind='job' and (p_all or (publication_requested and moderation_status='pending'))
    union all select r.id,r.created_at,to_jsonb(r)||jsonb_build_object('company',o.name) from public.response_reports r join public.organisations o on o.id=r.organisation_id where p_kind='response_report' and (p_all or r.moderation_status in ('pending','quarantined'))
    union all select id,created_at,to_jsonb(c) from public.moderation_cases c where p_kind='case' and (p_all or status in ('open','in_review'))
    union all select id,created_at,to_jsonb(a) from private.moderation_audit a where p_kind='audit'
  ), page as (
    select * from items where p_after is null or (created_at,id)>(p_after,p_after_id) order by created_at,id limit 26
  ), visible as (select * from page order by created_at,id limit 25)
  select jsonb_build_object('items',coalesce((select jsonb_agg(item order by created_at,id) from visible),'[]'),
    'hasMore',(select count(*)>25 from page),'cursor',(select jsonb_build_object('at',created_at,'id',id) from visible order by created_at desc,id desc limit 1)) into v_result;
  return v_result;
end;
$$;
revoke all on function private.admin_queue(text,timestamptz,uuid,boolean) from public,anon;
grant execute on function private.admin_queue(text,timestamptz,uuid,boolean) to authenticated;
create function public.admin_queue(p_kind text,p_after timestamptz default null,p_after_id uuid default null,p_all boolean default false) returns jsonb language sql security invoker set search_path='' as $$ select private.admin_queue(p_kind,p_after,p_after_id,p_all); $$;
revoke all on function public.admin_queue(text,timestamptz,uuid,boolean) from public,anon;
grant execute on function public.admin_queue(text,timestamptz,uuid,boolean) to authenticated;

-- Refresh existing snapshots; published legacy inventory enters the review queue.
update public.jobs set status='draft',publication_requested=true where status='published';
select public.refresh_response_insights();
commit;

-- Candidate-owned CV/search defaults and private retained listing copies.
begin;
create function private.select_first_base_cv() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('base_cv:'||new.user_id::text,0));
 if not exists(select 1 from public.candidate_cvs where user_id=new.user_id and id<>new.id) then
  insert into public.profiles(id,active_cv_id,cv_text) values(new.user_id,new.id,new.extracted_text)
   on conflict(id) do update set active_cv_id=excluded.active_cv_id,cv_text=excluded.cv_text,updated_at=now() where public.profiles.active_cv_id is null;
 end if;
 return new;
end;$$;
revoke all on function private.select_first_base_cv() from public,anon,authenticated;
create trigger first_base_cv after insert on public.candidate_cvs for each row execute function private.select_first_base_cv();

create function private.retained_listing(j public.jobs) returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('id',j.id,'organisation_id',j.organisation_id,'title',j.title,'company',j.company,'advertiser_kind',j.advertiser_kind,'client_label',j.client_label,'recruitment_lead',j.recruitment_lead,
 'category',j.category,'location',j.location,'city',j.city,'state',j.state,'work_mode',j.work_mode,'employment_type',j.employment_type,'salary_min',j.salary_min,'salary_max',j.salary_max,'salary_period',j.salary_period,'super_included',j.super_included,'published_at',j.published_at,'source',j.source,'description',j.description,'responsibilities',j.responsibilities,'requirements',j.requirements,'skills',j.skills,'tags',j.tags,'content_labels',j.content_labels,'is_test',j.is_test);
$$;
revoke all on function private.retained_listing(public.jobs) from public,anon,authenticated;
alter table public.saved_jobs add column listing_snapshot jsonb;
alter table public.applications add column listing_snapshot jsonb;
grant select(listing_snapshot) on public.applications to authenticated;
create function private.capture_retained_listing() returns trigger language plpgsql security definer set search_path='' as $$
declare j public.jobs%rowtype;
begin
 if tg_op='UPDATE' then
  if new.listing_snapshot is distinct from old.listing_snapshot then raise exception 'Retained listing copies are immutable' using errcode='42501';end if;
 else
  select * into j from public.jobs where id=new.job_id for share;
  new.listing_snapshot:=private.retained_listing(j);
 end if;
 return new;
end;$$;
revoke all on function private.capture_retained_listing() from public,anon,authenticated;
-- Existing approved listings can be retained; older edited drafts use limited historical identity.
update public.saved_jobs s set listing_snapshot=private.retained_listing(j) from public.jobs j where j.id=s.job_id and j.moderation_status='approved';
update public.applications a set listing_snapshot=case when j.moderation_status='approved' then private.retained_listing(j) else jsonb_build_object('id',a.job_id,'title',a.job_title_snapshot,'company',a.company_snapshot,'location',a.location_snapshot) end from public.jobs j where j.id=a.job_id;
create trigger saved_listing_copy before insert or update on public.saved_jobs for each row execute function private.capture_retained_listing();
create trigger application_listing_copy before insert or update on public.applications for each row execute function private.capture_retained_listing();
create function private.my_retained_roles() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',x.job_id,'snapshot',x.listing_snapshot,'closed',not(j.status='published' and j.moderation_status='approved' and j.published_at<=now() and (j.expires_at is null or j.expires_at>now()) and o.is_verified and o.suspended_at is null and o.removed_at is null and private.agency_job_available(j.id)))),'[]') from
 (select job_id,listing_snapshot from public.saved_jobs where user_id=auth.uid() union all select job_id,listing_snapshot from public.applications where candidate_id=auth.uid()) x join public.jobs j on j.id=x.job_id join public.organisations o on o.id=j.organisation_id);
end;$$;
revoke all on function private.my_retained_roles() from public,anon;
grant execute on function private.my_retained_roles() to authenticated;
create function public.my_retained_roles() returns jsonb language sql security invoker set search_path='' as $$select private.my_retained_roles();$$;
revoke all on function public.my_retained_roles() from public,anon;
grant execute on function public.my_retained_roles() to authenticated;

-- Count independent, restrictive filter groups. Location+radius and a date range each count once.
create function private.search_filter_count(p jsonb) returns integer language sql immutable security invoker set search_path='' as $$
 select (case when length(trim(coalesce(p->>'keyword','')))>0 then 1 else 0 end)+(case when length(trim(coalesce(p->>'location','')))>0 then 1 else 0 end)+
 (case when jsonb_array_length(coalesce(p->'workMode','[]')) between 1 and 2 then 1 else 0 end)+(case when jsonb_array_length(coalesce(p->'employmentType','[]')) between 1 and 3 then 1 else 0 end)+
 (case when coalesce((p->>'minSalary')::numeric,0)>0 then 1 else 0 end)+(case when coalesce((p->>'directOnly')::boolean,false) then 1 else 0 end)+
 (case when p->>'listedWithin' is not null or p->>'listedFrom' is not null or p->>'listedTo' is not null then 1 else 0 end);
$$;
revoke all on function private.search_filter_count(jsonb) from public,anon,authenticated;
alter function private.save_search(uuid,text,jsonb,boolean,text,boolean) rename to save_search_before_filter_minimum;
revoke all on function private.save_search_before_filter_minimum(uuid,text,jsonb,boolean,text,boolean) from public,anon,authenticated;
create function private.save_search(p_id uuid,p_name text,p_filters jsonb,p_alerts boolean,p_frequency text,p_consent boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare old_search public.saved_searches%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 -- Pausing an existing broad search must remain possible.
 if p_id is not null and not exists(select 1 from public.saved_searches where id=p_id and user_id=auth.uid()) then raise exception 'Search access denied' using errcode='42501';end if;
 if private.search_filter_count(p_filters)<2 then
  select * into old_search from public.saved_searches where id=p_id and user_id=auth.uid();
  if not found then raise exception 'Choose at least two specific search filters' using errcode='22023';end if;
  if p_alerts or not old_search.alerts_enabled or row(old_search.keyword,old_search.location,old_search.work_modes,old_search.employment_types,old_search.min_salary,old_search.direct_only,old_search.distance,old_search.listed_within,old_search.listed_from,old_search.listed_to) is distinct from row(coalesce(p_filters->>'keyword',''),coalesce(p_filters->>'location',''),array(select jsonb_array_elements_text(coalesce(p_filters->'workMode','[]'))),array(select jsonb_array_elements_text(coalesce(p_filters->'employmentType','[]'))),(p_filters->>'minSalary')::numeric,coalesce((p_filters->>'directOnly')::boolean,false),(p_filters->>'distance')::integer,(p_filters->>'listedWithin')::integer,(p_filters->>'listedFrom')::date,(p_filters->>'listedTo')::date) then raise exception 'Choose at least two specific search filters' using errcode='22023';end if;
 end if;
 return private.save_search_before_filter_minimum(p_id,p_name,p_filters,p_alerts,p_frequency,p_consent);
end;$$;
revoke all on function private.save_search(uuid,text,jsonb,boolean,text,boolean) from public,anon;
grant execute on function private.save_search(uuid,text,jsonb,boolean,text,boolean) to authenticated;
-- Existing daily abuse cap remains; add a rolling, per-account cooldown across all searches.
alter function private.preview_search_alert(uuid) rename to preview_search_alert_before_cooldown;
revoke all on function private.preview_search_alert_before_cooldown(uuid) from public,anon,authenticated;
create function private.preview_search_alert(p_search uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare last_at timestamptz;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('alert_preview:'||auth.uid()::text,0));
 select max(t) into last_at from private.alert_preview_allowance a cross join lateral unnest(a.recent_requests) t where a.user_id=auth.uid();
 if last_at>clock_timestamp()-interval '15 minutes' then raise exception 'Wait 15 minutes between preview emails' using errcode='P0001';end if;
 return private.preview_search_alert_before_cooldown(p_search);
end;$$;
revoke all on function private.preview_search_alert(uuid) from public,anon;
grant execute on function private.preview_search_alert(uuid) to authenticated;

create function private.my_preview_available_at() returns timestamptz language sql stable security definer set search_path='' as $$
 select greatest(max(t)+interval '15 minutes',case when count(*)>=3 then min(t)+interval '1 day' end) from private.alert_preview_allowance a cross join lateral unnest(a.recent_requests) t where a.user_id=auth.uid() and t>now()-interval '1 day';
$$;
revoke all on function private.my_preview_available_at() from public,anon;
grant execute on function private.my_preview_available_at() to authenticated;
create function public.my_preview_available_at() returns timestamptz language sql security invoker set search_path='' as $$ select private.my_preview_available_at(); $$;
revoke all on function public.my_preview_available_at() from public,anon;
grant execute on function public.my_preview_available_at() to authenticated;

-- Actual, attributable employer communications; never list views, receipts or generic closure notices.
alter table public.application_events add column meaningful_response boolean not null default false;
create function private.mark_meaningful_response() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.meaningful_response:=new.source='westmere_recorded' and new.actor_id is not null and new.event_type in ('employer_update','decision')
 and new.actor_id<>(select candidate_id from public.applications where id=new.application_id)
 and new.message not like 'This vacancy has closed.%';
 return new;
end;$$;
revoke all on function private.mark_meaningful_response() from public,anon,authenticated;
update public.application_events e set meaningful_response=true from public.applications a where a.id=e.application_id and e.source='westmere_recorded' and e.actor_id is not null and e.actor_id<>a.candidate_id and e.event_type in ('employer_update','decision') and e.message not like 'This vacancy has closed.%';
create trigger meaningful_response_recorded before insert on public.application_events for each row execute function private.mark_meaningful_response();
create index application_meaningful_response on public.application_events(application_id,occurred_at) where meaningful_response;
alter table public.response_reports add column review_job_id uuid references public.jobs(id) on delete set null,add column review_title_key text,add column corroborated boolean;
create unique index response_report_one_title on public.response_reports(candidate_id,organisation_id,review_title_key) where review_title_key is not null;
create index response_report_job on public.response_reports(review_job_id);
grant select(review_job_id,review_title_key,corroborated) on public.response_reports to authenticated;
create function private.response_report_roles(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if not exists(select 1 from public.organisations where id=p_org and is_verified and suspended_at is null and removed_at is null) then return '[]';end if;
 return (select coalesce(jsonb_agg(x order by x.title),'[]') from (select distinct on(lower(regexp_replace(trim(j.title),'\s+',' ','g'))) j.id,j.title,j.source,(j.status<>'published' or j.expires_at<=now()) as closed,
 exists(select 1 from public.response_reports r left join public.applications a on a.id=r.application_id left join public.jobs old_j on old_j.id=a.job_id where r.candidate_id=auth.uid() and r.organisation_id=p_org and (r.review_title_key=lower(regexp_replace(trim(j.title),'\s+',' ','g')) or lower(trim(r.job_reference))=lower(trim(j.title)) or lower(trim(old_j.title))=lower(trim(j.title)))) as reviewed,
 (select a.id from public.applications a where a.job_id=j.id and a.candidate_id=auth.uid() order by a.created_at desc limit 1) as application_id
 from public.jobs j where j.organisation_id=p_org and j.published_at>=now()-interval '6 months' and j.published_at<=now() order by lower(regexp_replace(trim(j.title),'\s+',' ','g')),j.published_at desc) x);
end;$$;
revoke all on function private.response_report_roles(uuid) from public,anon;
grant execute on function private.response_report_roles(uuid) to authenticated;
create function public.response_report_roles(p_org uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.response_report_roles(p_org); $$;
revoke all on function public.response_report_roles(uuid) from public,anon;
grant execute on function public.response_report_roles(uuid) to authenticated;

create or replace function private.submit_response_report_internal(p_application_id uuid,p_organisation_id uuid,p_job_reference text,p_application_date timestamptz,p_response_received boolean,p_response_date timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();j public.jobs%rowtype;a public.applications%rowtype;v_title text;v_date timestamptz;v_response timestamptz;v_corroborated boolean;v_id uuid;
begin
 if u is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_response_received is null then raise exception 'Choose a response option' using errcode='22023';end if;
 if p_application_id is not null then
  select * into a from public.applications where id=p_application_id and candidate_id=u;
  if not found then raise exception 'Application access denied' using errcode='42501';end if;
  select * into j from public.jobs where id=a.job_id;
 else
  select * into j from public.jobs where id::text=p_job_reference and organisation_id=p_organisation_id and published_at>=now()-interval '6 months' and published_at<=now();
  if not found then raise exception 'Select a role published in the last six months' using errcode='22023';end if;
  if j.source='direct' then
   select * into a from public.applications where job_id=j.id and candidate_id=u order by created_at desc limit 1;
   if not found then raise exception 'Your recorded application is required' using errcode='42501';end if;
  end if;
 end if;
 v_date:=case when j.source='direct' then a.created_at else p_application_date end;
 if v_date is null or v_date>now() or (p_response_received and (p_response_date is null or p_response_date<v_date or p_response_date>now())) or (not p_response_received and p_response_date is not null) then raise exception 'Check the application and response dates' using errcode='22023';end if;
 v_title:=lower(regexp_replace(trim(j.title),'\s+',' ','g'));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('response_report:'||u::text,0));
 if exists(select 1 from public.response_reports r left join public.applications old_a on old_a.id=r.application_id left join public.jobs old_j on old_j.id=old_a.job_id where r.candidate_id=u and r.organisation_id=j.organisation_id and (r.review_title_key=v_title or lower(regexp_replace(trim(r.job_reference),'\s+',' ','g'))=v_title or lower(regexp_replace(trim(old_j.title),'\s+',' ','g'))=v_title)) then raise exception 'You have already reviewed this job title' using errcode='23505';end if;
 if (select count(*) from public.response_reports where candidate_id=u and created_at>now()-interval '7 days')>=100 then raise exception 'Report limit reached' using errcode='P0001';end if;
 if j.source='direct' then
  select min(occurred_at) into v_response from public.application_events where application_id=a.id and meaningful_response;
  v_corroborated:=case when p_response_received then v_response is not null and (p_response_date at time zone 'Australia/Melbourne')::date=(v_response at time zone 'Australia/Melbourne')::date else v_response is null end;
 end if;
 insert into public.response_reports(candidate_id,application_id,organisation_id,job_reference,application_date,response_date,response_received,evidence_source,review_job_id,review_title_key,corroborated,moderation_status)
 values(u,a.id,j.organisation_id,j.title,v_date,p_response_date,p_response_received,case when j.source='direct' then 'direct_application' else 'external_application' end,j.id,v_title,v_corroborated,case when v_corroborated then 'accepted' else 'pending' end) returning id into v_id;
 return v_id;
end;$$;

-- The same mature cohort and small-sample safeguards apply, with source-specific evidence.
alter table public.organisation_response_insights add column average_response_days numeric;
grant select(average_response_days) on public.organisation_response_insights to anon,authenticated;
create function private.response_cohort(p_org uuid,p_as_of timestamptz) returns table(candidate_id uuid,application_date timestamptz,response_date timestamptz,evidence_source text) language sql stable security definer set search_path='' as $$
 with evidence as (
 select a.candidate_id,a.created_at as application_date,(select min(e.occurred_at) from public.application_events e where e.application_id=a.id and e.meaningful_response and e.occurred_at<=p_as_of) as response_date,'direct_application'::text as evidence_source
 from public.applications a join public.jobs j on j.id=a.job_id where j.organisation_id=p_org and j.source='direct' and a.withdrawn_at is null
 union all
 select r.candidate_id,r.application_date,r.response_date,'external_application' from public.response_reports r where r.organisation_id=p_org and r.evidence_source='external_application' and r.moderation_status='accepted' and r.confirmed_at<=p_as_of and (r.response_received or r.confirmed_at>=p_as_of-interval '30 days')
 ) select e.* from evidence e where e.application_date>=((((p_as_of at time zone 'Australia/Melbourne')::date-interval '6 months')::date)::timestamp at time zone 'Australia/Melbourne') and e.application_date<((((p_as_of at time zone 'Australia/Melbourne')::date-interval '3 months')::date)::timestamp at time zone 'Australia/Melbourne')
 and not exists(select 1 from public.organisation_members m where m.organisation_id=p_org and m.user_id=e.candidate_id);
$$;
revoke all on function private.response_cohort(uuid,timestamptz) from public,anon,authenticated;
create or replace function private.refresh_response_insights(p_org uuid,p_as_of timestamptz default now()) returns void language plpgsql security definer set search_path='' as $$
declare v_start date;v_end date;n integer;silent integer;replied integer;med numeric;av numeric;src text;
begin
 if not exists(select 1 from public.organisations where id=p_org) then return;end if;
 v_start:=((p_as_of at time zone 'Australia/Melbourne')::date-interval '6 months')::date;v_end:=((p_as_of at time zone 'Australia/Melbourne')::date-interval '3 months')::date;
 with unique_candidates as (select distinct on(candidate_id) * from private.response_cohort(p_org,p_as_of) order by candidate_id,application_date desc,response_date nulls last)
 select count(*)::integer,count(*) filter(where response_date is null and p_as_of>((application_date at time zone 'Australia/Melbourne')+interval '2 months') at time zone 'Australia/Melbourne')::integer,count(response_date)::integer,round((percentile_cont(0.5) within group(order by extract(epoch from(response_date-application_date))/86400.0) filter(where response_date is not null))::numeric,1),round(avg(extract(epoch from(response_date-application_date))/86400.0)::numeric,1) into n,silent,replied,med,av from unique_candidates;
 insert into public.organisation_response_insights(organisation_id,eligible_reports,no_response_reports,response_reports,median_response_days,average_response_days,is_unresponsive,period_start,period_end,as_of)
 values(p_org,case when n>=10 then n end,case when n>=10 then silent end,case when n>=10 then replied end,case when n>=10 and replied>=5 then med end,case when n>=10 and replied>=5 then av end,n>=10 and silent::numeric/nullif(n,0)>0.5,v_start,v_end,p_as_of)
 on conflict(organisation_id) do update set eligible_reports=excluded.eligible_reports,no_response_reports=excluded.no_response_reports,response_reports=excluded.response_reports,median_response_days=excluded.median_response_days,average_response_days=excluded.average_response_days,is_unresponsive=excluded.is_unresponsive,period_start=excluded.period_start,period_end=excluded.period_end,as_of=excluded.as_of;
 foreach src in array array['direct_application','external_application'] loop
  with unique_candidates as (select distinct on(candidate_id) * from private.response_cohort(p_org,p_as_of) where evidence_source=src order by candidate_id,application_date desc,response_date nulls last)
  select count(*)::integer,count(*) filter(where response_date is null)::integer,count(response_date)::integer,round(avg(extract(epoch from(response_date-application_date))/86400.0)::numeric,1) into n,silent,replied,av from unique_candidates;
  update public.jobs set response_days=case when n>=10 and replied>=5 then av end,eligible_reports=case when n>=10 then n else 0 end,no_response_reports=case when n>=10 then silent else 0 end,response_reports=case when n>=10 then replied else 0 end,response_snapshot_at=p_as_of where organisation_id=p_org and source=case when src='direct_application' then 'direct' else 'external' end;
 end loop;
end;$$;
create function private.refresh_recorded_response() returns trigger language plpgsql security definer set search_path='' as $$
declare o uuid;
begin
 if new.meaningful_response then select j.organisation_id into o from public.applications a join public.jobs j on j.id=a.job_id where a.id=new.application_id;perform private.refresh_response_insights(o);end if;
 return new;
end;$$;
revoke all on function private.refresh_recorded_response() from public,anon,authenticated;
create trigger recorded_response_insight after insert on public.application_events for each row execute function private.refresh_recorded_response();

create function private.confirm_response_report(p_report uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 update public.response_reports set confirmed_at=now() where id=p_report and candidate_id=auth.uid() and evidence_source='external_application' and not response_received;
 if not found then raise exception 'No-response report access required' using errcode='42501';end if;
end;$$;
revoke all on function private.confirm_response_report(uuid) from public,anon;
grant execute on function private.confirm_response_report(uuid) to authenticated;
create function public.confirm_response_report(p_report uuid) returns void language sql security invoker set search_path='' as $$select private.confirm_response_report(p_report);$$;
revoke all on function public.confirm_response_report(uuid) from public,anon;
grant execute on function public.confirm_response_report(uuid) to authenticated;

-- Prompt dispatch with one global worker lease, provider backoff, and minute fallback.
create table private.alert_dispatch_control(singleton boolean primary key default true check(singleton),lease_until timestamptz not null default '-infinity',next_kick_at timestamptz not null default '-infinity',provider_resume_at timestamptz not null default '-infinity');
insert into private.alert_dispatch_control(singleton) values(true);
alter table private.alert_dispatch_control enable row level security;
revoke all on private.alert_dispatch_control from public,anon,authenticated;
grant all on private.alert_dispatch_control to service_role;
create function private.kick_alert_dispatch() returns void language plpgsql security definer set search_path='' as $$
begin
 if to_regprocedure('private.dispatch_job_alerts(boolean)') is null then return;end if;
 update private.alert_dispatch_control set next_kick_at=clock_timestamp()+interval '5 seconds' where singleton and next_kick_at<=clock_timestamp() and lease_until<=clock_timestamp() and provider_resume_at<=clock_timestamp();
 if found then execute 'select private.dispatch_job_alerts(false)';end if;
end;$$;
revoke all on function private.kick_alert_dispatch() from public,anon,authenticated;
create function private.kick_queued_email() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.alert_outbox where status='queued' and available_at<=now() and recipient !~* '[.]invalid$') then perform private.kick_alert_dispatch();end if;
 return null;
end;$$;
revoke all on function private.kick_queued_email() from public,anon,authenticated;
create trigger prompt_email_dispatch after insert on private.alert_outbox for each statement execute function private.kick_queued_email();
alter function public.claim_job_alerts(integer) rename to claim_job_alerts_before_dispatch_lease;
revoke all on function public.claim_job_alerts_before_dispatch_lease(integer) from public,anon,authenticated,service_role;
-- Move the old implementation out of the exposed schema.
alter function public.claim_job_alerts_before_dispatch_lease(integer) set schema private;
create function private.claim_job_alerts(p_limit integer default 10) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 update private.alert_dispatch_control set lease_until=clock_timestamp()+interval '90 seconds' where singleton and lease_until<=clock_timestamp() and provider_resume_at<=clock_timestamp();
 if not found then return '[]';end if;
 return private.claim_job_alerts_before_dispatch_lease(least(p_limit,10));
end;$$;
revoke all on function private.claim_job_alerts(integer) from public,anon,authenticated;
grant execute on function private.claim_job_alerts(integer) to service_role;
create function public.claim_job_alerts(p_limit integer default 10) returns jsonb language sql security invoker set search_path='' as $$select private.claim_job_alerts(p_limit);$$;
revoke all on function public.claim_job_alerts(integer) from public,anon,authenticated;
grant execute on function public.claim_job_alerts(integer) to service_role;
create function private.finish_alert_dispatch(p_retry_seconds integer default 0) returns void language plpgsql security definer set search_path='' as $$
begin
 update private.alert_dispatch_control set lease_until=clock_timestamp(),provider_resume_at=case when p_retry_seconds>0 then greatest(provider_resume_at,clock_timestamp()+least(p_retry_seconds,86400)*interval '1 second') else provider_resume_at end,next_kick_at=clock_timestamp() where singleton;
 if p_retry_seconds<=0 and exists(select 1 from private.alert_outbox where status='queued' and available_at<=now() and recipient !~* '[.]invalid$') then perform private.kick_alert_dispatch();end if;
end;$$;
revoke all on function private.finish_alert_dispatch(integer) from public,anon,authenticated;
grant execute on function private.finish_alert_dispatch(integer) to service_role;
create function public.finish_alert_dispatch(p_retry_seconds integer default 0) returns void language sql security invoker set search_path='' as $$select private.finish_alert_dispatch(p_retry_seconds);$$;
revoke all on function public.finish_alert_dispatch(integer) from public,anon,authenticated;
grant execute on function public.finish_alert_dispatch(integer) to service_role;
-- Reserved documentation domains must never consume delivery quota or cause bounces.
alter function private.delivery_eligible(private.alert_outbox) rename to delivery_eligible_before_fixture_guard;
revoke all on function private.delivery_eligible_before_fixture_guard(private.alert_outbox) from public,anon,authenticated;
create function private.delivery_eligible(b private.alert_outbox) returns boolean language sql stable security definer set search_path='' as $$ select b.recipient !~* '[.]invalid$' and private.delivery_eligible_before_fixture_guard(b);$$;
revoke all on function private.delivery_eligible(private.alert_outbox) from public,anon,authenticated;
do $$begin if to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') is not null then execute $sql$select cron.alter_job(jobid,schedule:='* * * * *') from cron.job where jobname='westmere-job-alerts'$sql$;end if;end;$$;
commit;

-- Archive rather than delete. Keep application snapshots, statistics and attributable history.
alter table public.organisations add column removed_at timestamptz;
create policy organisation_not_removed on public.organisations as restrictive for select to anon,authenticated using(removed_at is null);
alter table public.jobs alter column expires_at set default now()+interval '40 days';
create index jobs_expiry on public.jobs(expires_at) where status='published';

create table private.job_activity(
 id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs(id),
 actor_id uuid references auth.users(id) on delete set null,action text not null,
 details jsonb not null default '{}',created_at timestamptz not null default now()
);
create index job_activity_history on private.job_activity(job_id,created_at desc);
alter table private.job_activity enable row level security;
revoke all on private.job_activity from public,anon,authenticated;
grant all on private.job_activity to service_role;

-- Publication is serialised per organisation, including direct Data API writes.
create function private.enforce_listing_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$
declare paid boolean; owner_id uuid; test jsonb;
begin
 if new.status='published' then
  perform 1 from public.organisations where id=new.organisation_id and is_verified and suspended_at is null and removed_at is null for update;
  if not found then raise exception 'An active verified business is required' using errcode='42501';end if;
  select exists(select 1 from public.business_subscriptions where organisation_id=new.organisation_id and status in ('active','trialing') and current_period_start<=now() and current_period_end>now())
    or exists(select 1 from public.employer_plans where organisation_id=new.organisation_id and starts_at<=now() and ends_at>now())
    or exists(select 1 from private.test_entitlements e join public.organisation_members m on m.user_id=e.user_id join auth.users u on u.id=e.user_id join private.test_account_allowlist a on a.email=lower(u.email) where m.organisation_id=new.organisation_id and m.role='owner' and e.tier<>'careers_plus' and e.starts_at<=now() and e.expires_at>now() and u.email_confirmed_at is not null)
  into paid;
  if not paid and exists(select 1 from public.jobs where organisation_id=new.organisation_id and id<>new.id and status='published' and expires_at>now()) then
   raise exception 'Free accounts include one active job posting per company. Archive the existing role before publishing or renewing another.' using errcode='23514';
  end if;
  if tg_op='INSERT' then
   new.expires_at:=least(coalesce(new.expires_at,now()+interval '40 days'),now()+interval '40 days');
  elsif old.published_at is null and (old.expires_at=old.created_at+interval '40 days' or old.expires_at=old.created_at+interval '30 days') then
   new.expires_at:=now()+interval '40 days';
  elsif old.status is distinct from 'published' and new.expires_at<=now() then
   new.expires_at:=now()+interval '40 days';
  else
   new.expires_at:=least(new.expires_at,now()+interval '40 days');
  end if;
  if new.expires_at<=now() then raise exception 'Choose a closing time in the future' using errcode='22023';end if;
 end if;
 return new;
end;$$;
revoke all on function private.enforce_listing_lifecycle() from public,anon,authenticated;
create trigger zz_listing_lifecycle before insert or update on public.jobs for each row execute function private.enforce_listing_lifecycle();

create function private.log_listing_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$
declare activity text;
begin
 if tg_op='INSERT' then activity:=case when new.status='published' then 'published' else 'draft_created' end;
 elsif new.status='closed' and old.status<>'closed' then activity:=case when old.expires_at<=now() then 'expired' else 'archived' end;
 elsif new.status='published' and old.status<>'published' then activity:=case when old.published_at is not null then 'renewed' else 'published' end;
 elsif new.status='published' and new.expires_at>old.expires_at then activity:='renewed';
 end if;
 if activity is not null then insert into private.job_activity(job_id,actor_id,action,details) values(new.id,auth.uid(),activity,jsonb_build_object('expiresAt',new.expires_at,'status',new.status));end if;
 return new;
end;$$;
revoke all on function private.log_listing_lifecycle() from public,anon,authenticated;
create trigger listing_lifecycle_history after insert or update on public.jobs for each row execute function private.log_listing_lifecycle();

-- Preserve publication date on archive, so history and search dates survive renewal.
create or replace function private.require_job_review() returns trigger language plpgsql security invoker set search_path='' as $$
declare requested boolean;
begin
 if current_user='authenticated' then
  requested:=new.publication_requested or new.status='published';
  if tg_op='UPDATE' and old.moderation_status in ('quarantined','rejected') then
   new.status:='draft';new.published_at:=old.published_at;new.publication_requested:=requested;new.moderation_status:=old.moderation_status;return new;
  end if;
  if requested then
   if not private.is_active_hiring_team(new.organisation_id) then raise exception 'Verified hiring authority required' using errcode='42501';end if;
   new.status:='published';new.published_at:=coalesce(new.published_at,now());new.publication_requested:=false;new.moderation_status:='approved';new.moderation_updated_at:=clock_timestamp();
  else new.moderation_status:='approved'; if tg_op='UPDATE' then new.published_at:=old.published_at;end if;end if;
 end if;return new;
end;$$;

create function private.renew_listing(p_job uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.jobs%rowtype;old_expiry timestamptz;old_status text;
begin
 select * into j from public.jobs where id=p_job for update;
 if not found or not private.is_active_hiring_team(j.organisation_id) then raise exception 'Verified hiring access required' using errcode='42501';end if;
 if j.moderation_status<>'approved' then raise exception 'Resolve moderation feedback before renewing' using errcode='22023';end if;
 old_expiry:=j.expires_at;old_status:=j.status;
 update public.jobs set status='published',expires_at=clock_timestamp()+interval '40 days',published_at=coalesce(published_at,now()),publication_requested=false where id=p_job returning * into j;
 if old_status='published' and j.expires_at<=old_expiry then insert into private.job_activity(job_id,actor_id,action,details) values(p_job,auth.uid(),'renewed',jsonb_build_object('expiresAt',j.expires_at,'status',j.status));end if;
 return jsonb_build_object('id',j.id,'expiresAt',j.expires_at,'status',j.status);
end;$$;
revoke all on function private.renew_listing(uuid) from public,anon;grant execute on function private.renew_listing(uuid) to authenticated;
create function public.renew_listing(p_job uuid) returns jsonb language sql security invoker set search_path='' as $$select private.renew_listing(p_job);$$;
revoke all on function public.renew_listing(uuid) from public,anon;grant execute on function public.renew_listing(uuid) to authenticated;

create function private.archive_expired_listings() returns integer language plpgsql security definer set search_path='' as $$
declare total integer;
begin
 update public.jobs set status='closed',publication_requested=false where status='published' and expires_at<=now();get diagnostics total=row_count;return total;
end;$$;
revoke all on function private.archive_expired_listings() from public,anon,authenticated;grant execute on function private.archive_expired_listings() to service_role;
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron') then perform cron.schedule('westmere-listing-expiry','*/5 * * * *','select private.archive_expired_listings();');end if;
end;$$;

create function private.remove_company(p_org uuid,p_name text) returns void language plpgsql security definer set search_path='' as $$
declare o public.organisations%rowtype;
begin
 select * into o from public.organisations where id=p_org for update;
 if not found or not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=auth.uid() and role='owner') then raise exception 'Only the company owner can remove it' using errcode='42501';end if;
 if p_name is distinct from o.name then raise exception 'Enter the exact business name to confirm removal' using errcode='22023';end if;
 if exists(select 1 from public.business_subscriptions where organisation_id=p_org and status not in ('canceled','incomplete_expired')) then raise exception 'Cancel the business subscription and wait until it has ended before removing this company. Billing remains available.' using errcode='22023';end if;
 update public.jobs set status='closed',publication_requested=false where organisation_id=p_org and status<>'closed';
 update public.organisations set removed_at=now(),is_verified=false,suspended_at=coalesce(suspended_at,now()) where id=p_org;
 insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason) values(auth.uid(),'organisation',p_org,'owner_removed','Company removed by its owner after exact business-name confirmation. Records are archived.');
end;$$;
revoke all on function private.remove_company(uuid,text) from public,anon;grant execute on function private.remove_company(uuid,text) to authenticated;
create function public.remove_company(p_org uuid,p_name text) returns void language sql security invoker set search_path='' as $$select private.remove_company(p_org,p_name);$$;
revoke all on function public.remove_company(uuid,text) from public,anon;grant execute on function public.remove_company(uuid,text) to authenticated;

-- A single transaction closes applications and records each candidate's outcome.
create function private.finalise_candidate_pool(p_job uuid,p_selected uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.jobs%rowtype;a record;selected_count integer:=0;other_count integer:=0;
begin
 select * into j from public.jobs where id=p_job for update;
 if not found or not private.is_active_hiring_team(j.organisation_id) then raise exception 'Verified hiring access required' using errcode='42501';end if;
 if p_selected is null or cardinality(p_selected)>1000 then raise exception 'Choose a valid candidate pool' using errcode='22023';end if;
 if exists(select 1 from unnest(p_selected) chosen(id) where not exists(select 1 from public.applications where id=chosen.id and job_id=p_job and withdrawn_at is null and status<>'not_proceeding')) then raise exception 'The pool contains an unavailable application. Refresh the candidate list.' using errcode='22023';end if;
 update public.jobs set status='closed',publication_requested=false where id=p_job;
 for a in select id,status from public.applications where job_id=p_job and withdrawn_at is null order by id for update loop
  if a.id=any(p_selected) then
   if a.status not in ('interview','offer') then perform private.update_application_stage_internal(a.id,'interview','You have been selected for the interview candidate pool. The hiring team will contact you with the interview arrangements.');selected_count:=selected_count+1;end if;
  elsif a.status not in ('interview','offer','not_proceeding') then
   perform private.update_application_stage_internal(a.id,'not_proceeding','Applications have closed and the employer has selected its interview candidate pool. You have not been selected to proceed to the interview stage for this role. Thank you for your application.');other_count:=other_count+1;
  end if;
 end loop;
 insert into private.job_activity(job_id,actor_id,action,details) values(p_job,auth.uid(),'candidate_pool_confirmed',jsonb_build_object('selected',selected_count,'notSelected',other_count));
 return jsonb_build_object('selected',selected_count,'notSelected',other_count);
end;$$;
revoke all on function private.finalise_candidate_pool(uuid,uuid[]) from public,anon;grant execute on function private.finalise_candidate_pool(uuid,uuid[]) to authenticated;
create function public.finalise_candidate_pool(p_job uuid,p_selected uuid[]) returns jsonb language sql security invoker set search_path='' as $$select private.finalise_candidate_pool(p_job,p_selected);$$;
revoke all on function public.finalise_candidate_pool(uuid,uuid[]) from public,anon;grant execute on function public.finalise_candidate_pool(uuid,uuid[]) to authenticated;

-- Optional, consented listing views use the existing deduplicated discovery event.
create table private.job_view_events(view_id uuid primary key,job_id uuid not null references public.jobs(id),recorded_at timestamptz not null default now());
create index job_view_events_job on private.job_view_events(job_id);
alter table private.job_view_events enable row level security;revoke all on private.job_view_events from public,anon,authenticated;grant all on private.job_view_events to service_role;
create function public.record_job_view(p_view uuid,p_job uuid) returns void language sql security definer set search_path='' as $$
 insert into private.job_view_events(view_id,job_id) select p_view,p_job where exists(select 1 from private.discovery_views where view_id=p_view) and exists(select 1 from public.jobs j join public.organisations o on o.id=j.organisation_id where j.id=p_job and j.status='published' and j.expires_at>now() and o.is_verified and o.suspended_at is null and o.removed_at is null) on conflict do nothing;
$$;
revoke all on function public.record_job_view(uuid,uuid) from public,anon,authenticated;grant execute on function public.record_job_view(uuid,uuid) to service_role;
create function private.role_overview() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'views',(select count(*) from private.job_view_events v where v.job_id=j.id),'applications',(select count(*) from public.applications a where a.job_id=j.id and a.withdrawn_at is null),'activity',(select coalesce(jsonb_agg(h),'[]') from (select x.action,x.created_at,x.details,u.email actor_email from private.job_activity x left join auth.users u on u.id=x.actor_id where x.job_id=j.id order by x.created_at desc limit 20) h))),'[]') from public.jobs j where private.is_active_hiring_team(j.organisation_id));
end;$$;
revoke all on function private.role_overview() from public,anon;grant execute on function private.role_overview() to authenticated;
create function public.role_overview() returns jsonb language sql security invoker set search_path='' as $$select private.role_overview();$$;
revoke all on function public.role_overview() from public,anon;grant execute on function public.role_overview() to authenticated;

-- Names are part of the submitted material, never read live from another user's private profile.
alter table public.applications add column candidate_name_snapshot text;
create function private.application_candidate_name() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then select full_name into new.candidate_name_snapshot from public.profiles where id=new.candidate_id;
 elsif new.candidate_name_snapshot is distinct from old.candidate_name_snapshot then raise exception 'Submitted candidate identity is immutable' using errcode='42501';end if;return new;
end;$$;
revoke all on function private.application_candidate_name() from public,anon,authenticated;
create trigger application_candidate_name before insert or update on public.applications for each row execute function private.application_candidate_name();
create or replace function private.list_job_applications_internal(p_job_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.jobs j where j.id=p_job_id and private.is_active_hiring_team(j.organisation_id)) then raise exception 'Hiring access unavailable' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(s order by s.created_at desc),'[]') from (select id,job_id,status,created_at,withdrawn_at,case when withdrawn_at is null then candidate_name_snapshot else null end candidate_name from public.applications where job_id=p_job_id order by created_at desc limit 1000) s);
end;$$;

alter table public.jobs add column latitude double precision check(latitude between -90 and 90),add column longitude double precision check(longitude between -180 and 180);
grant insert(latitude,longitude),update(latitude,longitude) on public.jobs to authenticated;
create index jobs_coordinates on public.jobs(latitude,longitude) where status='published';
create function public.jobs_within_distance(p_lat double precision,p_lon double precision,p_km double precision) returns setof public.jobs language sql stable security invoker set search_path='' as $$
 select j.* from public.jobs j where p_lat between -90 and 90 and p_lon between -180 and 180 and p_km between 1 and 250 and (
  (j.work_mode='Remote' and j.city='Anywhere in Australia') or
  (j.latitude between p_lat-p_km/110.0 and p_lat+p_km/110.0 and 6371.0088*2*asin(sqrt(least(1.0,power(sin(radians(j.latitude-p_lat)/2),2)+cos(radians(p_lat))*cos(radians(j.latitude))*power(sin(radians(j.longitude-p_lon)/2),2))))<=p_km)
 );
$$;
revoke all on function public.jobs_within_distance(double precision,double precision,double precision) from public;
grant execute on function public.jobs_within_distance(double precision,double precision,double precision) to anon,authenticated,service_role;

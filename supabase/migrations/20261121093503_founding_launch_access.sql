-- Scope: employer onboarding and public release only. No existing account, subscription or application rows are updated or deleted.
begin;
grant usage on schema private to anon;
-- Founding access is independent of identity review, payment and public release.
create table private.launch_settings(singleton boolean primary key default true check(singleton),marketplace_open boolean not null default false,existing_before timestamptz not null default clock_timestamp(),updated_at timestamptz not null default now());
insert into private.launch_settings(singleton) values(true);
create table private.launch_requests(
 id uuid primary key default gen_random_uuid(),email text not null check(email=lower(email) and length(email)<=254),
 kind text not null check(kind in('employer','agency','candidate')),name text not null check(length(name)<=120),business_name text not null default '' check(length(business_name)<=180),
 vacancy_url text not null default '' check(length(vacancy_url)<=500),status text not null default 'pending' check(status in('pending','approved','declined','revoked')),
 consent_version text not null default 'founding-2026-11-21',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(email,kind));
create index launch_request_queue on private.launch_requests(created_at desc,id);
create table private.launch_access(email text primary key,kind text not null check(kind in('employer','agency','candidate','existing')),user_id uuid references auth.users(id) on delete cascade,expires_at timestamptz,revoked_at timestamptz,approved_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now());
create index launch_access_user on private.launch_access(user_id);
-- Existing identities retain access through the immutable cutoff; no existing access rows are changed.
create index launch_access_approver on private.launch_access(approved_by);
create table private.launch_rate_limits(network text not null,window_at timestamptz not null,hits integer not null default 1,primary key(network,window_at));
create table private.launch_profiles(organisation_id uuid primary key references public.organisations(id) on delete cascade,consented_at timestamptz,consented_by uuid references auth.users(id),released_at timestamptz,released_by uuid references auth.users(id));
create table private.launch_jobs(job_id uuid primary key references public.jobs(id) on delete cascade,consented_at timestamptz,consented_by uuid references auth.users(id),released_at timestamptz,released_by uuid references auth.users(id));
create index launch_profiles_consent_owner on private.launch_profiles(consented_by);
create index launch_profiles_reviewer on private.launch_profiles(released_by);
create index launch_jobs_consent_owner on private.launch_jobs(consented_by);
create index launch_jobs_reviewer on private.launch_jobs(released_by);
do $$declare t text;begin foreach t in array array['launch_settings','launch_requests','launch_access','launch_rate_limits','launch_profiles','launch_jobs'] loop execute format('alter table private.%I enable row level security',t);execute format('revoke all on private.%I from public,anon,authenticated',t);execute format('grant all on private.%I to service_role',t);end loop;end;$$;

create function private.launch_open() returns boolean language sql stable security definer set search_path='' as $$select coalesce((select marketplace_open from private.launch_settings where singleton),false);$$;
create function public.launch_status() returns boolean language sql stable security invoker set search_path='' as $$select private.launch_open();$$;
revoke all on function private.launch_open(),public.launch_status() from public;
grant execute on function private.launch_open(),public.launch_status() to anon,authenticated,service_role;

create function private.launch_email_allowed(p_email text) returns boolean language sql stable security definer set search_path='' as $$
 select private.launch_open() or exists(select 1 from auth.users u where lower(u.email)=lower(p_email) and u.created_at<(select existing_before from private.launch_settings where singleton)) or exists(select 1 from private.launch_access a where a.email=lower(p_email) and a.revoked_at is null and (a.expires_at is null or a.expires_at>now()))
 or exists(select 1 from private.business_invitations i where i.email=lower(p_email) and i.revoked_at is null and i.accepted_at is null and i.expires_at>now() and private.business_team_enabled(i.organisation_id));$$;
revoke all on function private.launch_email_allowed(text) from public,anon,authenticated;
create function public.launch_signin_allowed(p_email text) returns boolean language sql stable security invoker set search_path='' as $$select private.launch_email_allowed(p_email);$$;
revoke all on function public.launch_signin_allowed(text) from public,anon,authenticated;
grant execute on function private.launch_email_allowed(text),public.launch_signin_allowed(text) to service_role;

create function private.launch_account_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (private.launch_open() or private.my_staff_role() is not null or exists(select 1 from auth.users u where u.id=auth.uid() and u.created_at<(select existing_before from private.launch_settings where singleton)) or exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null and (
 exists(select 1 from private.launch_access a where a.revoked_at is null and (a.expires_at is null or a.expires_at>now()) and (a.user_id=u.id or (a.user_id is null and a.email=lower(u.email))))
 or exists(select 1 from private.business_invitations i where i.email=lower(u.email) and i.revoked_at is null and i.accepted_at is null and i.expires_at>now() and private.business_team_enabled(i.organisation_id))
 or exists(select 1 from public.organisation_members m where m.user_id=u.id and m.role<>'owner' and private.business_team_enabled(m.organisation_id)))));$$;
revoke all on function private.launch_account_allowed() from public,anon;
grant execute on function private.launch_account_allowed() to authenticated,service_role;
create function private.require_launch_account() returns void language plpgsql stable security definer set search_path='' as $$begin
 if current_setting('role',true)='service_role' then return;end if;
 if not private.launch_account_allowed() then raise exception 'Founding access is required. Request access on the employer launch page.' using errcode='42501';end if;
end;$$;
revoke all on function private.require_launch_account() from public,anon;
grant execute on function private.require_launch_account() to authenticated,service_role;
create function private.my_launch_access() returns jsonb language plpgsql security definer set search_path='' as $$declare a private.launch_access%rowtype;begin
 if auth.uid() is not null then
 update private.launch_access x set user_id=auth.uid() where x.user_id is null and x.email=(select lower(email) from auth.users where id=auth.uid() and email_confirmed_at is not null) and x.revoked_at is null and (x.expires_at is null or x.expires_at>now());
 select * into a from private.launch_access where user_id=auth.uid();end if;
 return jsonb_build_object('allowed',private.launch_account_allowed(),'kind',a.kind,'expiresAt',a.expires_at,'marketplaceOpen',private.launch_open());end;$$;
revoke all on function private.my_launch_access() from public,anon;
grant execute on function private.my_launch_access() to authenticated;
create function public.my_launch_access() returns jsonb language sql security invoker set search_path='' as $$select private.my_launch_access();$$;
revoke all on function public.my_launch_access() from public,anon;
grant execute on function public.my_launch_access() to authenticated;

create function private.submit_launch_request(p_email text,p_kind text,p_name text,p_business text,p_url text,p_network text) returns void language plpgsql security definer set search_path='' as $$declare n integer;begin
 if p_kind not in('employer','agency','candidate') or p_email !~ '^[^ @]+@[^ @]+[.][^ @]+$' or length(p_email)>254 or length(p_name)>120 or length(p_business)>180 or length(p_url)>500 or (p_kind<>'candidate' and length(trim(p_business))<2) or p_network !~ '^[a-f0-9]{64}$' then raise exception 'Check the request details' using errcode='22023';end if;
 insert into private.launch_rate_limits(network,window_at) values(p_network,date_trunc('hour',now())) on conflict(network,window_at) do update set hits=private.launch_rate_limits.hits+1 returning hits into n;
 if n>6 then raise exception 'Please try again later' using errcode='P0001';end if;
 delete from private.launch_rate_limits where window_at<now()-interval '2 days';
 insert into private.launch_requests(email,kind,name,business_name,vacancy_url) values(lower(trim(p_email)),p_kind,trim(p_name),trim(p_business),p_url) on conflict(email,kind) do nothing;
end;$$;
revoke all on function private.submit_launch_request(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function private.submit_launch_request(text,text,text,text,text,text) to service_role;
create function public.submit_launch_request(p_email text,p_kind text,p_name text,p_business text,p_url text,p_network text) returns void language sql security invoker set search_path='' as $$select private.submit_launch_request(p_email,p_kind,p_name,p_business,p_url,p_network);$$;
revoke all on function public.submit_launch_request(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_launch_request(text,text,text,text,text,text) to service_role;

-- Owners and reviewers retain private access. Public discovery requires a separate release.
create function private.launch_profile_public(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from private.launch_profiles p join public.organisations o on o.id=p.organisation_id where p.organisation_id=p_org and p.consented_at is not null and p.released_at is not null and not o.is_test and o.is_verified and o.suspended_at is null and o.removed_at is null);$$;
create function private.launch_job_public(p_job uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from private.launch_jobs p join public.jobs j on j.id=p.job_id where p.job_id=p_job and p.consented_at is not null and p.released_at is not null and not j.is_test and j.status='published' and j.moderation_status='approved' and j.published_at<=now() and j.expires_at>now() and private.launch_profile_public(j.organisation_id));$$;
create function private.launch_can_prepare(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$select private.launch_account_allowed() and (private.my_staff_role() is not null or exists(select 1 from public.organisation_members m where m.organisation_id=p_org and m.user_id=auth.uid()));$$;
revoke all on function private.launch_profile_public(uuid),private.launch_job_public(uuid),private.launch_can_prepare(uuid) from public;
grant execute on function private.launch_profile_public(uuid),private.launch_job_public(uuid),private.launch_can_prepare(uuid) to anon,authenticated,service_role;
create policy launch_profile_visibility on public.organisations as restrictive for select to anon,authenticated using(private.launch_profile_public(id) or private.launch_can_prepare(id));
create function private.launch_candidate_history(p_job uuid) returns boolean language sql stable security definer set search_path='' as $$select private.launch_account_allowed() and exists(select 1 from public.applications a where a.job_id=p_job and a.candidate_id=auth.uid());$$;
revoke all on function private.launch_candidate_history(uuid) from public;
grant execute on function private.launch_candidate_history(uuid) to anon,authenticated;
create policy launch_staff_job_read on public.jobs for select to authenticated using(private.my_staff_role() is not null);
create policy launch_job_visibility on public.jobs as restrictive for select to anon,authenticated using(private.launch_job_public(id) or private.launch_can_prepare(organisation_id) or private.launch_candidate_history(id));
-- Public category counts also obey release instead of exposing the staging inventory.
-- employer_role_categories already uses invoker security and therefore inherits the new release policies.

-- Real founding workspace access, with no Stripe object, card or premium AI entitlement.
create or replace function private.account_business_tier(p_user uuid) returns text language sql stable security definer set search_path='' as $$select coalesce(
 (select t.tier from private.test_entitlements t join auth.users u on u.id=t.user_id join private.test_account_allowlist l on l.email=lower(u.email) join public.business_accounts a on a.user_id=t.user_id where t.user_id=p_user and t.starts_at<=now() and t.expires_at>now() and u.email_confirmed_at is not null and t.tier<>'careers_plus' and case when t.tier like 'agency_%' then a.kind='agency' else a.kind='employer' end),
 (select s.tier from public.organisation_billing_accounts b join public.business_subscriptions s using(organisation_id) where b.billing_user_id=p_user and b.is_primary and s.status in('active','trialing') and s.current_period_start<=now() and s.current_period_end>now()),
 (select p.tier from public.employer_plans p join public.organisation_members m using(organisation_id) where m.user_id=p_user and m.role='owner' and p.starts_at<=now() and p.ends_at>now() order by private.business_plan_limit(p.tier) desc,p.starts_at desc limit 1),
 (select case when a.kind='agency' then 'agency_starter' else 'starter' end from private.launch_access a join auth.users u on u.id=p_user join public.business_accounts b on b.user_id=u.id and b.kind=a.kind where a.user_id=u.id and a.kind in('agency','employer') and a.revoked_at is null and a.expires_at>now() and u.email_confirmed_at is not null)
 );$$;

-- Approval stages the listing. Only an explicit release may make it published.
create function private.hold_launch_publication() returns trigger language plpgsql security definer set search_path='' as $$begin
 -- Trusted database maintenance can prepare rows, but public RLS still requires a release record.
 if current_setting('role',true)='none' then return new;end if;
 if new.status='published' and not exists(select 1 from private.launch_jobs r where r.job_id=new.id and r.released_at is not null and r.consented_at is not null) then new.status:='draft';new.published_at:=null;end if;return new;
end;$$;
revoke all on function private.hold_launch_publication() from public,anon,authenticated;
create trigger a_launch_publication_hold before insert or update on public.jobs for each row execute function private.hold_launch_publication();
create trigger zzzzzzz_launch_publication_hold before insert or update on public.jobs for each row execute function private.hold_launch_publication();
create function private.invalidate_launch_consent() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_table_name='organisations' then
 if (to_jsonb(new)-array['is_verified','verified_at','suspended_at','removed_at']) is distinct from (to_jsonb(old)-array['is_verified','verified_at','suspended_at','removed_at']) then update private.launch_profiles set consented_at=null,released_at=null where organisation_id=new.id;end if;
 else
 if (new.status<>'published' and old.status='published') or (to_jsonb(new)-array['status','moderation_status','publication_requested','published_at','expires_at','moderation_updated_at','response_days','response_reports','no_response_reports','eligible_reports','response_snapshot_at','search_vector']) is distinct from (to_jsonb(old)-array['status','moderation_status','publication_requested','published_at','expires_at','moderation_updated_at','response_days','response_reports','no_response_reports','eligible_reports','response_snapshot_at','search_vector']) then update private.launch_jobs set consented_at=null,released_at=null where job_id=new.id;if new.status<>'closed' then new.status:='draft';end if;end if;
 end if;return new;end;$$;
revoke all on function private.invalidate_launch_consent() from public,anon,authenticated;
create trigger zzzzz_launch_consent before update on public.jobs for each row execute function private.invalidate_launch_consent();
create trigger launch_profile_consent before update on public.organisations for each row execute function private.invalidate_launch_consent();

-- Replacing or removing a public attachment changes the vacancy being approved.
create function private.invalidate_launch_document() returns trigger language plpgsql security definer set search_path='' as $$begin
 update private.launch_jobs set consented_at=null,released_at=null where job_id=case when tg_op='DELETE' then old.job_id else new.job_id end;
 if tg_op='DELETE' then return old;end if;return new;end;$$;
revoke all on function private.invalidate_launch_document() from public,anon,authenticated;
create trigger launch_document_consent after insert or update or delete on public.listing_documents for each row execute function private.invalidate_launch_document();

create function private.manage_launch_content(p_kind text,p_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$declare oid uuid;staff record;begin
 perform private.require_launch_account();
 if p_kind='profile' then oid:=p_id;elsif p_kind='job' then select organisation_id into oid from public.jobs where id=p_id;else raise exception 'Unknown content' using errcode='22023';end if;
 perform 1 from public.organisations where id=oid for update;
 if not exists(select 1 from public.organisation_members where organisation_id=oid and user_id=auth.uid() and role='owner') then raise exception 'The business owner must approve publication' using errcode='42501';end if;
 if p_action not in('consent','withdraw') then raise exception 'Unknown action' using errcode='22023';end if;
 if p_kind='profile' then insert into private.launch_profiles(organisation_id,consented_at,consented_by) values(p_id,case when p_action='consent' then now() end,auth.uid()) on conflict(organisation_id) do update set consented_at=excluded.consented_at,consented_by=excluded.consented_by,released_at=null,released_by=null;
 else insert into private.launch_jobs(job_id,consented_at,consented_by) values(p_id,case when p_action='consent' then now() end,auth.uid()) on conflict(job_id) do update set consented_at=excluded.consented_at,consented_by=excluded.consented_by,released_at=null,released_by=null;
 end if;
 if p_action='consent' then for staff in select user_id from private.staff_members where enabled loop perform private.queue_account_notice(staff.user_id,'launch-ready:'||p_id||':'||clock_timestamp(),'Content approved for launch review','A business owner approved a '||p_kind||' for public release. Review it in the founding launch controls.','/account?tab=admin',false);end loop;end if;
 insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason) values(auth.uid(),'launch_'||p_kind,p_id,p_action,'Business owner recorded or withdrew permission for public launch.');end;$$;
revoke all on function private.manage_launch_content(text,uuid,text) from public,anon;
grant execute on function private.manage_launch_content(text,uuid,text) to authenticated;
create function public.manage_launch_content(p_kind text,p_id uuid,p_action text) returns void language sql security invoker set search_path='' as $$select private.manage_launch_content(p_kind,p_id,p_action);$$;
revoke all on function public.manage_launch_content(text,uuid,text) from public,anon;
grant execute on function public.manage_launch_content(text,uuid,text) to authenticated;

create function private.my_launch_content() returns jsonb language plpgsql stable security definer set search_path='' as $$begin perform private.require_launch_account();return jsonb_build_object(
 'profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'verified',o.is_verified,'owner',m.role='owner','consentedAt',p.consented_at,'releasedAt',p.released_at)),'[]') from public.organisations o join public.organisation_members m on m.organisation_id=o.id and m.user_id=auth.uid() left join private.launch_profiles p on p.organisation_id=o.id where o.removed_at is null),
 'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'title',j.title,'organisationId',j.organisation_id,'review',j.moderation_status,'status',j.status,'owner',m.role='owner','consentedAt',p.consented_at,'releasedAt',p.released_at)),'[]') from public.jobs j join public.organisation_members m on m.organisation_id=j.organisation_id and m.user_id=auth.uid() left join private.launch_jobs p on p.job_id=j.id where private.can_access_hiring_job(j.id,'listing') or (m.role='owner' and (select kind from public.organisations where id=m.organisation_id)<>'agency')));end;$$;
revoke all on function private.my_launch_content() from public,anon;
grant execute on function private.my_launch_content() to authenticated;
create function public.my_launch_content() returns jsonb language sql stable security invoker set search_path='' as $$select private.my_launch_content();$$;
revoke all on function public.my_launch_content() from public,anon;
grant execute on function public.my_launch_content() to authenticated;

create function private.admin_launch(p_action text,p_id uuid,p_kind text,p_reason text,p_open boolean,p_offset integer) returns jsonb language plpgsql security definer set search_path='' as $$declare r private.launch_requests%rowtype;v_job public.jobs%rowtype;begin
 perform private.require_launch_account();
 if private.my_staff_role() not in('admin','reviewer') or private.my_staff_role() is null then raise exception 'Reviewer access required' using errcode='42501';end if;
 if p_action='list' then return jsonb_build_object('marketplaceOpen',private.launch_open(),
 'requestCount',(select count(*) from private.launch_requests),'requests',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]') from(select * from private.launch_requests order by created_at desc,id limit 100 offset greatest(0,least(p_offset,10000)))x),
 'profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'description',o.description,'website',o.website,'careersEmail',o.careers_email,'avatarPath',o.avatar_path,'bannerPath',o.banner_path,'verified',o.is_verified,'test',o.is_test,'consentedAt',p.consented_at,'releasedAt',p.released_at)),'[]') from public.organisations o left join private.launch_profiles p on p.organisation_id=o.id where o.removed_at is null),
 'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'title',j.title,'organisationId',j.organisation_id,'review',j.moderation_status,'status',j.status,'test',j.is_test,'consentedAt',p.consented_at,'releasedAt',p.released_at)),'[]') from public.jobs j left join private.launch_jobs p on p.job_id=j.id where j.status<>'closed'));
 end if;
 if length(trim(p_reason))<10 or length(p_reason)>2000 then raise exception 'Record a decision reason' using errcode='22023';end if;
 if p_action in('approve','decline','revoke') then
 select * into r from private.launch_requests where id=p_id for update;if not found then raise exception 'Request unavailable' using errcode='22023';end if;
 update private.launch_requests set status=case p_action when 'approve' then 'approved' when 'decline' then 'declined' else 'revoked' end,updated_at=now() where id=p_id;
 if p_action='approve' then insert into private.launch_access(email,kind,user_id,expires_at,approved_by) values(r.email,r.kind,(select id from auth.users where lower(email)=r.email and email_confirmed_at is not null),now()+interval '60 days',auth.uid()) on conflict(email) do update set kind=case when private.launch_access.kind='existing' then 'existing' else excluded.kind end,expires_at=case when private.launch_access.kind='existing' then private.launch_access.expires_at else excluded.expires_at end,revoked_at=null,approved_by=auth.uid();
 elsif p_action='revoke' then update private.launch_access set revoked_at=now() where email=r.email and kind<>'existing';end if;
 elsif p_action='mode' then
 if private.my_staff_role()<>'admin' then raise exception 'Administrator access required' using errcode='42501';end if;
 update private.launch_settings set marketplace_open=p_open,updated_at=now() where singleton;
 elsif p_action in('release','hide') then
 if p_kind='profile' then
 perform 1 from public.organisations where id=p_id and is_verified and not is_test and suspended_at is null and removed_at is null for update;
 if not found then raise exception 'A real verified business is required' using errcode='22023';end if;
 if p_action='release' and not exists(select 1 from private.launch_profiles where organisation_id=p_id and consented_at is not null) then raise exception 'Owner publication permission is required' using errcode='22023';end if;
 update private.launch_profiles set released_at=case when p_action='release' then now() end,released_by=auth.uid() where organisation_id=p_id;
 elsif p_kind='job' then
 select * into v_job from public.jobs where id=p_id for update;
 if not found or v_job.is_test or v_job.status='closed' then raise exception 'Choose a current genuine vacancy' using errcode='22023';end if;
 if p_action='release' then
 if v_job.moderation_status<>'approved' or not private.launch_profile_public(v_job.organisation_id) or not exists(select 1 from private.launch_jobs where job_id=p_id and consented_at is not null) then raise exception 'Review, owner permission and a public profile are required' using errcode='22023';end if;
 update private.launch_jobs set released_at=now(),released_by=auth.uid() where job_id=p_id;
 update public.jobs set status='published',published_at=now(),expires_at=now()+interval '30 days' where id=p_id;
 else update private.launch_jobs set released_at=null,released_by=auth.uid() where job_id=p_id;end if;
 else raise exception 'Unknown content' using errcode='22023';end if;
 else raise exception 'Unknown action' using errcode='22023';end if;
 insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason) values(auth.uid(),'launch_'||coalesce(p_kind,'access'),coalesce(p_id,'00000000-0000-4000-8000-000000000001'::uuid),p_action,p_reason);
 return jsonb_build_object('saved',true);end;$$;
revoke all on function private.admin_launch(text,uuid,text,text,boolean,integer) from public,anon;
grant execute on function private.admin_launch(text,uuid,text,text,boolean,integer) to authenticated;
create function public.admin_launch(p_action text,p_id uuid default null,p_kind text default null,p_reason text default '',p_open boolean default false,p_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$select private.admin_launch(p_action,p_id,p_kind,p_reason,p_open,p_offset);$$;
revoke all on function public.admin_launch(text,uuid,text,text,boolean,integer) from public,anon;
grant execute on function public.admin_launch(text,uuid,text,text,boolean,integer) to authenticated;

-- Gate only the employer onboarding and team-management RPC entry points.
-- Candidate records, billing, reporting and unrelated public-table writes are unchanged.
do $$declare r record;body text;begin
 for r in select p.oid,p.proname,pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname='public' and l.lanname='sql' and not p.prosecdef and has_function_privilege('authenticated',p.oid,'execute') and not has_function_privilege('anon',p.oid,'execute') and p.proname in('submit_employer_verification','submit_business_verification','submit_typed_business_verification','manage_agency','manage_business_team','manage_business_type','my_business_registration_capacity','set_business_plan_organisations','set_default_business') loop
 body:=replace(r.def,'AS $function$','AS $function$select private.require_launch_account(); ');execute body;
 end loop;
end;$$;
-- Explicit mutating guards also apply when a security-definer RPC writes a public table.
create function private.guard_launch_account_write() returns trigger language plpgsql security definer set search_path='' as $$begin if auth.uid() is not null then perform private.require_launch_account();end if;if tg_op='DELETE' then return old;end if;return new;end;$$;
revoke all on function private.guard_launch_account_write() from public,anon,authenticated;
create trigger a_founding_access before insert or update or delete on public.jobs for each row execute function private.guard_launch_account_write();
create trigger a_founding_access before insert or update or delete on public.organisations for each row execute function private.guard_launch_account_write();
create trigger a_founding_access before insert or update or delete on public.employer_verification_requests for each row execute function private.guard_launch_account_write();
-- Candidate applications cannot target private/staged vacancies, even through a privileged RPC.
create function private.guard_launch_application() returns trigger language plpgsql security definer set search_path='' as $$begin
 if not private.launch_job_public(new.job_id) or (not private.launch_open() and not private.launch_account_allowed()) then raise exception 'This vacancy is not open for applications' using errcode='42501';end if;return new;end;$$;
revoke all on function private.guard_launch_application() from public,anon,authenticated;
create trigger a_launch_application before insert on public.applications for each row execute function private.guard_launch_application();
commit;

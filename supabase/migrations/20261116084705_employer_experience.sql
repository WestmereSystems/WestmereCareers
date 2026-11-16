-- Business identity never grants hiring authority or a paid entitlement.
begin;
alter table public.notifications drop constraint notifications_path_check;
alter table public.notifications add constraint notifications_path_check check(path in ('/applications','/employers/dashboard','/account','/employers/sample','/account?tab=dashboard','/account?tab=verification'));
create table public.business_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 kind text not null check(kind in ('employer','agency')),
 trading_name text not null check(length(trading_name) between 2 and 180),
 terms_version text not null, terms_sha256 text not null check(terms_sha256 ~ '^[a-f0-9]{64}$'),
 accepted_at timestamptz not null default now(), created_at timestamptz not null default now()
);
alter table public.business_accounts enable row level security;
revoke all on public.business_accounts from public,anon,authenticated;
grant select on public.business_accounts to authenticated; grant all on public.business_accounts to service_role;
create policy business_account_own on public.business_accounts for select to authenticated using(user_id=(select auth.uid()));


create table private.business_agreements(user_id uuid not null references auth.users(id) on delete cascade,terms_version text not null,terms_sha256 text not null,accepted_at timestamptz not null default now(),primary key(user_id,terms_version,terms_sha256));
alter table private.business_agreements enable row level security;
revoke all on private.business_agreements from public,anon,authenticated;grant all on private.business_agreements to service_role;
create function private.record_business_agreement() returns trigger language plpgsql security definer set search_path='' as $$begin insert into private.business_agreements(user_id,terms_version,terms_sha256,accepted_at) values(new.user_id,new.terms_version,new.terms_sha256,new.accepted_at) on conflict do nothing;return new;end;$$;
revoke all on function private.record_business_agreement() from public,anon,authenticated;
create trigger business_agreement after insert or update on public.business_accounts for each row execute function private.record_business_agreement();

-- Orders are recorded by an authorised operator after separate acceptance, never by the browser.
create table public.employer_plans (
 organisation_id uuid primary key references public.organisations(id) on delete cascade,
 tier text not null check(tier in ('starter','growth','enterprise','agency_growth','agency_enterprise')),
 order_reference text not null check(length(order_reference) between 3 and 200),
 starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at),
 created_at timestamptz not null default now()
);
alter table public.employer_plans enable row level security;
revoke all on public.employer_plans from public,anon,authenticated;
grant select on public.employer_plans to authenticated; grant all on public.employer_plans to service_role;
create policy employer_plan_member on public.employer_plans for select to authenticated using(exists(select 1 from public.organisation_members m where m.organisation_id=employer_plans.organisation_id and m.user_id=(select auth.uid())));
alter table public.organisations add column social_links jsonb not null default '{}' check(jsonb_typeof(social_links)='object');
alter table public.employer_verification_requests add column linkedin_url text, add column hr_email text,
 add column hr_phone text, add column contact_source text, add column contact_permission_at timestamptz;

create function private.submit_business_verification(p_request_id uuid,p_name text,p_abn text,p_website text,p_contact_role text,p_evidence text,p_linkedin text,p_hr_email text,p_hr_phone text,p_contact_source text,p_contact_permission boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null or not coalesce(p_contact_permission,false) or p_linkedin !~ '^https://([a-z]+[.])?linkedin[.]com/' or p_hr_email !~ '^[^ @]+@[^ @]+[.][^ @]+$' or length(p_hr_phone) not between 6 and 40 or p_contact_source !~ '^https://[^ /]+' then raise exception 'Public verification contacts and permission are required' using errcode='22023'; end if;
 v_id:=private.submit_employer_verification(p_name,p_abn,p_website,p_contact_role,p_evidence,p_request_id);
 update public.employer_verification_requests set linkedin_url=left(p_linkedin,500),hr_email=left(p_hr_email,254),hr_phone=p_hr_phone,contact_source=left(p_contact_source,500),contact_permission_at=now() where id=v_id and applicant_id=auth.uid();
 return v_id;
end; $$;
revoke all on function private.submit_business_verification(uuid,text,text,text,text,text,text,text,text,text,boolean) from public,anon;
grant execute on function private.submit_business_verification(uuid,text,text,text,text,text,text,text,text,text,boolean) to authenticated;
create function public.submit_business_verification(p_request_id uuid,p_name text,p_abn text,p_website text,p_contact_role text,p_evidence text,p_linkedin text,p_hr_email text,p_hr_phone text,p_contact_source text,p_contact_permission boolean) returns uuid language sql security invoker set search_path='' as $$select private.submit_business_verification(p_request_id,p_name,p_abn,p_website,p_contact_role,p_evidence,p_linkedin,p_hr_email,p_hr_phone,p_contact_source,p_contact_permission);$$;
revoke all on function public.submit_business_verification(uuid,text,text,text,text,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.submit_business_verification(uuid,text,text,text,text,text,text,text,text,text,boolean) to authenticated;

create table public.employer_notification_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 submissions boolean not null default true, milestones boolean not null default true,
 closing_reminders boolean not null default true, follow_up_reminders boolean not null default true,
 follow_up_days integer not null default 7 check(follow_up_days between 1 and 60),
 email_enabled boolean not null default false, updated_at timestamptz not null default now()
);
alter table public.employer_notification_preferences enable row level security;
revoke all on public.employer_notification_preferences from public,anon,authenticated;
grant select,insert,update on public.employer_notification_preferences to authenticated;
grant all on public.employer_notification_preferences to service_role;
create policy employer_prefs_own on public.employer_notification_preferences for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create or replace function private.queue_account_notice(p_user uuid,p_key text,p_title text,p_message text,p_path text,p_email boolean default true) returns void language plpgsql security definer set search_path='' as $$
declare v_email text;v_origin text;v_site_key text;
begin
 v_site_key:=case when p_key like 'hiring-submission:%' then 'hiring:'||split_part(p_key,':',2) else p_key end;
 if p_key like 'hiring-submission:%' then
 insert into public.notifications(user_id,event_key,title,message,path) values(p_user,v_site_key,p_title,left(p_message,2000),p_path) on conflict(user_id,event_key) do update set read_at=null,created_at=now(),message=excluded.message;
 else insert into public.notifications(user_id,event_key,title,message,path) values(p_user,v_site_key,p_title,left(p_message,2000),p_path) on conflict do nothing;if not found then return;end if;end if;
 if not p_email then return;end if;
 select email into v_email from auth.users where id=p_user and email_confirmed_at is not null;
 select site_origin into v_origin from private.alert_settings limit 1;
 if v_email is null or v_origin is null or exists(select 1 from private.alert_suppressions where user_id=p_user) then return;end if;
 insert into private.alert_outbox(user_id,recipient,kind,event_key,snapshot) values(p_user,v_email,'account',p_key,jsonb_build_object('title',p_title,'message',case when p_key like 'business-%' then left(p_message,2000) when p_key='welcome' then 'A little clarity. A world of possibility. Your private profile, applications and career tools are ready when you are.' else 'There is a new service update in your Westmere account. Sign in to read it.' end,'path',p_path,'siteOrigin',v_origin)) on conflict do nothing;
end;$$;

create function private.business_account_welcome() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.queue_account_notice(new.user_id,'business-welcome','Welcome to Westmere Careers for employers','Your company workspace is ready. Verify your business before publishing or viewing candidate applications. We aim to review a complete submission within 48 hours.','/account?tab=verification',true);
 return new;
end; $$;
create trigger business_welcome after insert on public.business_accounts for each row execute function private.business_account_welcome();
create function private.business_verification_notice() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='approved' and old.status is distinct from new.status then
 perform private.queue_account_notice(new.applicant_id,'business-verified:'||new.id,'Your business is verified','Your business identity and hiring authority have been checked. You can now access your hiring workspace. Each job advertisement still requires listing review.','/account?tab=dashboard',true);
 elsif new.status in ('needs_information','rejected') and old.status is distinct from new.status then
 perform private.queue_account_notice(new.applicant_id,'business-review:'||new.id||':'||new.updated_at,'Business verification update','There is an update to your business verification request. Open Verification to read the private feedback.','/account?tab=verification',true);
 end if; return new;
end; $$;
create trigger business_verified_notice after update of status on public.employer_verification_requests for each row execute function private.business_verification_notice();

-- Aggregate first-party discovery data: no user ID, raw IP, exact location or arbitrary keyword text.
create table private.discovery_daily (
 organisation_id uuid not null references public.organisations(id) on delete cascade,
 day date not null, kind text not null check(kind in ('search','listing','profile')),
 region text not null check(region in ('ACT','NSW','NT','QLD','SA','TAS','VIC','WA','OTHER','UNKNOWN')),
 keyword text not null default '' check(length(keyword)<=80), events integer not null default 1 check(events>0),
 primary key(organisation_id,day,kind,region,keyword)
);
alter table private.discovery_daily enable row level security;
revoke all on private.discovery_daily from public,anon,authenticated; grant all on private.discovery_daily to service_role;
create table private.discovery_rate(network text not null,day date not null,events integer not null default 1,primary key(network,day));
alter table private.discovery_rate enable row level security;revoke all on private.discovery_rate from public,anon,authenticated;grant all on private.discovery_rate to service_role;
create function public.record_discovery(p_orgs uuid[],p_kind text,p_region text,p_keyword text,p_network text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_network !~ '^[a-f0-9]{64}$' then return; end if;
 insert into private.discovery_rate(network,day) values(p_network,current_date) on conflict(network,day) do update set events=discovery_rate.events+1;
 if (select events from private.discovery_rate where network=p_network and day=current_date)>120 then return; end if;
 delete from private.discovery_rate where day<current_date-1;
 if p_kind not in ('search','listing','profile') or p_region not in ('ACT','NSW','NT','QLD','SA','TAS','VIC','WA','OTHER','UNKNOWN') or length(p_keyword)>80 then raise exception 'Invalid discovery event'; end if;
 insert into private.discovery_daily(organisation_id,day,kind,region,keyword)
 select o.id,(now() at time zone 'Australia/Melbourne')::date,p_kind,p_region,coalesce(p_keyword,'') from public.organisations o where o.id=any(p_orgs[1:24]) and o.is_verified and o.suspended_at is null
 on conflict(organisation_id,day,kind,region,keyword) do update set events=discovery_daily.events+1;
end; $$;
revoke all on function public.record_discovery(uuid[],text,text,text,text) from public,anon,authenticated; grant execute on function public.record_discovery(uuid[],text,text,text,text) to service_role;
create function public.read_discovery(p_org uuid,p_days integer) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('totals',coalesce((select jsonb_agg(x) from(select kind,sum(events)::integer as count from private.discovery_daily where organisation_id=p_org and day>=((now() at time zone 'Australia/Melbourne')::date-(least(greatest(p_days,1),365)-1)) group by kind)x),'[]'::jsonb),
 'regions',coalesce((select jsonb_agg(x) from(select region,sum(events)::integer as count from private.discovery_daily where organisation_id=p_org and day>=((now() at time zone 'Australia/Melbourne')::date-(least(greatest(p_days,1),365)-1)) group by region having sum(events)>=5)x),'[]'::jsonb),
 'keywords',coalesce((select jsonb_agg(x) from(select keyword,sum(events)::integer as count from private.discovery_daily where organisation_id=p_org and day>=((now() at time zone 'Australia/Melbourne')::date-(least(greatest(p_days,1),365)-1)) and keyword<>'' group by keyword having sum(events)>=5 order by sum(events) desc limit 12)x),'[]'::jsonb));
$$;
revoke all on function public.read_discovery(uuid,integer) from public,anon,authenticated; grant execute on function public.read_discovery(uuid,integer) to service_role;

-- Reminders prompt a human update. They never fabricate progress or contact candidates automatically.
create function public.queue_employer_reminders() returns integer language plpgsql security definer set search_path='' as $$
declare m record; j record; a record; p public.employer_notification_preferences%rowtype; n integer:=0; c integer; threshold integer;
begin
 delete from private.discovery_daily where day<current_date-interval '12 months';
 for m in select om.user_id,om.organisation_id from public.organisation_members om join public.organisations o on o.id=om.organisation_id where om.role in ('owner','admin','recruiter') and o.is_verified and o.suspended_at is null loop
 select * into p from public.employer_notification_preferences where user_id=m.user_id;
 for j in select id,title,expires_at from public.jobs where organisation_id=m.organisation_id and status='published' loop
  if coalesce(p.closing_reminders,true) and j.expires_at>now() and j.expires_at<=now()+interval '3 days' then
   perform private.queue_account_notice(m.user_id,'closing:'||j.id||':'||j.expires_at,'A vacancy is closing soon',j.title||' closes within 3 days. Review your listing and outstanding applications.','/account?tab=dashboard',coalesce(p.email_enabled,false)); n:=n+1;
  end if;
  select count(*) into c from public.applications where job_id=j.id and withdrawn_at is null;
  if coalesce(p.milestones,true) then foreach threshold in array array[25,50,100,200] loop
   if c>=threshold then perform private.queue_account_notice(m.user_id,'milestone:'||j.id||':'||threshold,'An application milestone',j.title||' has reached '||threshold||' applications.','/account?tab=dashboard',coalesce(p.email_enabled,false)); n:=n+1; end if;
  end loop; end if;
  if coalesce(p.follow_up_reminders,true) then
   for a in select id from public.applications where job_id=j.id and withdrawn_at is null and status not in ('not_proceeding','offer') and created_at<now()-make_interval(days=>coalesce(p.follow_up_days,7)) and not exists(select 1 from public.application_events e where e.application_id=applications.id and e.event_type in ('employer_update','decision')) loop
    perform private.queue_account_notice(m.user_id,'follow-up:'||a.id,'A candidate is waiting for an update',j.title||' has an application with no recorded team update after '||coalesce(p.follow_up_days,7)||' days. Review it and send an accurate update when appropriate.','/account?tab=dashboard',coalesce(p.email_enabled,false)); n:=n+1;
   end loop;
  end if;
 end loop; end loop;
 return n;
end; $$;
revoke all on function public.queue_employer_reminders() from public,anon,authenticated; grant execute on function public.queue_employer_reminders() to service_role;

-- Extend the existing notification trigger while preserving candidate notices.
create or replace function private.notify_application_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.applications%rowtype; m record; v_email boolean; v_title text; p public.employer_notification_preferences%rowtype;
begin
 select * into a from public.applications where id=new.application_id;
 if new.event_type not in ('received','opened','employer_update','decision') or a.withdrawn_at is not null then return new; end if;
 select application_email_enabled into v_email from public.profiles where id=a.candidate_id;
 v_title:=case
 when new.event_type='received' then 'Application received'
 when new.event_type='opened' then 'Application opened'
 when new.message='This vacancy has closed. Your recorded application stage remains available; closure does not itself mean a rejection.' then 'Vacancy closed'
 when a.status='interview' then 'Interview selection update'
 when a.status='shortlisted' then 'Application shortlisted'
 when a.status='offer' then 'Application offer update'
 when a.status='not_proceeding' then 'Application decision'
 else 'Application updated' end;
 perform private.queue_account_notice(a.candidate_id,'application:'||new.id,v_title,a.job_title_snapshot||' · '||left(new.message,1500),'/applications',coalesce(v_email,true));
 if new.event_type='received' then
  for m in select om.user_id from public.organisation_members om join public.jobs j on j.organisation_id=om.organisation_id join public.organisations o on o.id=om.organisation_id where j.id=a.job_id and om.role in ('owner','admin','recruiter') and o.suspended_at is null loop
   select * into p from public.employer_notification_preferences where user_id=m.user_id;
   if coalesce(p.submissions,true) then perform private.queue_account_notice(m.user_id,'hiring-submission:'||a.job_id||':'||a.id,'New applications to review','A new application has arrived in your hiring workspace.','/account?tab=dashboard',coalesce(p.email_enabled,false)); end if;
  end loop;
 end if; return new;
end; $$;
revoke all on function private.business_account_welcome(),private.business_verification_notice() from public,anon,authenticated;

create function private.account_notice_email_allowed(p_user uuid,p_key text) returns boolean language sql stable security definer set search_path='' as $$
 select case when p_key='welcome' or p_key like 'business-%' then true
 when p_key like 'hiring-submission:%' then exists(select 1 from public.employer_notification_preferences where user_id=p_user and email_enabled and submissions)
 when p_key like 'milestone:%' then exists(select 1 from public.employer_notification_preferences where user_id=p_user and email_enabled and milestones)
 when p_key like 'closing:%' then exists(select 1 from public.employer_notification_preferences where user_id=p_user and email_enabled and closing_reminders)
 when p_key like 'follow-up:%' then exists(select 1 from public.employer_notification_preferences where user_id=p_user and email_enabled and follow_up_reminders)
 else not exists(select 1 from public.profiles where id=p_user and not application_email_enabled) end;
$$;
revoke all on function private.account_notice_email_allowed(uuid,text) from public,anon,authenticated;

create or replace function public.claim_job_alerts(p_limit integer default 10) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if not exists(select 1 from private.alert_settings where sending_enabled) then return '[]'::jsonb; end if;
  update private.alert_outbox set status='ambiguous',error_code='IDEMPOTENCY_WINDOW_EXPIRED',lease_token=null,lease_expires_at=null
    where status in ('queued','leased') and first_attempt_at<now()-interval '23 hours';
  update private.alert_outbox set status='blocked',error_code='ATTEMPT_LIMIT_REACHED',lease_token=null,lease_expires_at=null
    where attempts>=8 and (status='queued' or (status='leased' and lease_expires_at<now()));
  update private.alert_outbox b set status='canceled',error_code='ALERT_NO_LONGER_ELIGIBLE',lease_token=null,lease_expires_at=null
    where b.status in ('queued','leased') and (b.created_at<now()-interval '7 days' or
      ((b.kind<>'account' and not exists(select 1 from public.saved_searches s join auth.users u on u.id=s.user_id where s.id=b.search_id and s.alerts_enabled and u.email=b.recipient and u.email_confirmed_at is not null and (b.kind<>'account' or private.account_notice_email_allowed(b.user_id,b.event_key)))) or (b.kind='account' and not exists(select 1 from auth.users u where u.id=b.user_id and u.email=b.recipient and u.email_confirmed_at is not null and (b.kind<>'account' or private.account_notice_email_allowed(b.user_id,b.event_key)))))
      or exists(select 1 from private.alert_suppressions x where x.user_id=b.user_id));
  with next_items as (
    select id from private.alert_outbox where (status='queued' or (status='leased' and lease_expires_at<now())) and available_at<=now() and attempts<8 order by available_at,id limit least(greatest(p_limit,1),10) for update skip locked
  ), claimed as (
    update private.alert_outbox b set status='leased',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '2 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now())
      from next_items n where b.id=n.id returning b.id,b.recipient,b.kind,b.snapshot,b.provider_request,b.lease_token,b.attempts
  ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into v_result from claimed;
  return v_result;
end;
$$;
revoke all on function public.claim_job_alerts(integer) from public, anon, authenticated;
grant execute on function public.claim_job_alerts(integer) to service_role;

create or replace function public.freeze_job_alert(p_id uuid,p_lease uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b private.alert_outbox%rowtype; v_valid integer; v_total integer;
begin
  select * into b from private.alert_outbox where id=p_id and lease_token=p_lease and status='leased' and lease_expires_at>now() for update;
  if not found then return null; end if;
  if not exists(select 1 from private.alert_settings where sending_enabled) then return null; end if;
  if ((b.kind<>'account' and not exists(select 1 from public.saved_searches s join auth.users u on u.id=s.user_id where s.id=b.search_id and s.alerts_enabled and u.email=b.recipient and u.email_confirmed_at is not null and (b.kind<>'account' or private.account_notice_email_allowed(b.user_id,b.event_key)))) or (b.kind='account' and not exists(select 1 from auth.users u where u.id=b.user_id and u.email=b.recipient and u.email_confirmed_at is not null and (b.kind<>'account' or private.account_notice_email_allowed(b.user_id,b.event_key)))))
    or exists(select 1 from private.alert_suppressions where user_id=b.user_id) then
    update private.alert_outbox set status='canceled',error_code='UNSUBSCRIBED',lease_token=null,lease_expires_at=null where id=p_id; return null;
  end if;
  if b.kind='digest' then
    select count(*) into v_total from private.alert_job_deliveries where outbox_id=b.id;
    select count(*) into v_valid from private.alert_job_deliveries d join public.jobs j on j.id=d.job_id join public.organisations o on o.id=j.organisation_id
      where d.outbox_id=b.id and j.status='published' and j.moderation_status='approved' and j.expires_at>now() and o.is_verified and o.suspended_at is null;
    if v_valid<>v_total or v_total=0 then
      update private.alert_outbox set status='canceled',error_code='VACANCY_CHANGED',lease_token=null,lease_expires_at=null where id=p_id; return null;
    end if;
  end if;
  if b.provider_request is null then
    if p_request is null or jsonb_typeof(p_request)<>'object' or p_request->>'from' is distinct from 'Westmere Careers <hello@westmere.com.au>' or p_request->'to' is distinct from jsonb_build_array(b.recipient) then raise exception 'Invalid frozen email' using errcode='22023'; end if;
    update private.alert_outbox set provider_request=p_request where id=p_id; return p_request;
  end if;
  return b.provider_request;
end;
$$;

commit;

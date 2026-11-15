-- Private saved searches, explicit notification consent and a durable Resend outbox.
begin;
create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  keyword text not null default '' check (char_length(keyword)<=120),
  location text not null default '' check (char_length(location)<=120),
  work_modes text[] not null default '{}' check (work_modes <@ array['On-site','Hybrid','Remote']::text[]),
  employment_types text[] not null default '{}' check (employment_types <@ array['Full time','Part time','Contract','Casual']::text[]),
  min_salary numeric check (min_salary between 0 and 1000000),
  direct_only boolean not null default false,
  alerts_enabled boolean not null default false,
  frequency text not null default 'daily' check (frequency in ('daily','weekly')),
  consent_at timestamptz,
  next_run_at timestamptz,
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not alerts_enabled or consent_at is not null)
);
create index saved_searches_user on public.saved_searches(user_id,created_at desc);
create index saved_searches_due on public.saved_searches(next_run_at) where alerts_enabled;
alter table public.saved_searches enable row level security;
revoke all on public.saved_searches from public, anon, authenticated;
grant select(id,user_id,name,keyword,location,work_modes,employment_types,min_salary,direct_only,alerts_enabled,frequency,consent_at,next_run_at,created_at,updated_at) on public.saved_searches to authenticated;
grant all on public.saved_searches to service_role;
create policy saved_searches_own on public.saved_searches for select to authenticated using(user_id=(select auth.uid()));

create table private.alert_settings (
  singleton boolean primary key default true check (singleton),
  site_origin text not null check (site_origin ~ '^https://[^/]+$'),
  unsubscribe_origin text not null check (unsubscribe_origin ~ '^https://[^/]+'),
  sending_enabled boolean not null default false,
  dispatch_token_hash text check (dispatch_token_hash ~ '^[a-f0-9]{64}$')
);
create table private.alert_suppressions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null check (reason in ('bounced','complained','suppressed')),
  created_at timestamptz not null default now()
);
create table private.alert_outbox (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.saved_searches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient text not null,
  kind text not null default 'digest' check (kind in ('digest','preview')),
  snapshot jsonb not null,
  provider_request jsonb,
  status text not null default 'queued' check (status in ('queued','leased','accepted','delivered','failed','blocked','ambiguous','canceled')),
  attempts integer not null default 0,
  first_attempt_at timestamptz,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_id text unique,
  provider_event_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  delivered_at timestamptz
);
create index alert_outbox_search on private.alert_outbox(search_id,created_at desc);
create index alert_outbox_user on private.alert_outbox(user_id);
create index alert_outbox_available on private.alert_outbox(available_at) where status in ('queued','leased');
create table private.alert_job_deliveries (
  search_id uuid not null references public.saved_searches(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  outbox_id uuid not null references private.alert_outbox(id) on delete cascade,
  primary key(search_id,job_id)
);
create index alert_job_deliveries_job on private.alert_job_deliveries(job_id);
create index alert_job_deliveries_outbox on private.alert_job_deliveries(outbox_id);
create table private.alert_webhook_events (
  id text primary key,
  provider_id text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  outbox_id uuid references private.alert_outbox(id) on delete cascade,
  received_at timestamptz not null default now()
);
create index alert_webhooks_outbox on private.alert_webhook_events(outbox_id);

alter table private.alert_settings enable row level security;
alter table private.alert_suppressions enable row level security;
alter table private.alert_outbox enable row level security;
alter table private.alert_job_deliveries enable row level security;
alter table private.alert_webhook_events enable row level security;
revoke all on private.alert_settings, private.alert_suppressions, private.alert_outbox, private.alert_job_deliveries, private.alert_webhook_events from public, anon, authenticated;
grant all on private.alert_settings, private.alert_suppressions, private.alert_outbox, private.alert_job_deliveries, private.alert_webhook_events to service_role;

-- Cron receives an alerts-only credential. The Edge Function verifies it with its
-- own injected server credential; no database service key is placed in pg_net.
create function public.verify_alert_dispatch(p_authorization text) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select (select sum(ascii(substr(dispatch_token_hash,n,1)) # ascii(substr(encode(sha256(convert_to(substr(p_authorization,8),'UTF8')),'hex'),n,1)))=0 from generate_series(1,64) n)
    from private.alert_settings where singleton and dispatch_token_hash is not null and p_authorization ~ '^Bearer [a-f0-9]{64}$'),false);
$$;
revoke all on function public.verify_alert_dispatch(text) from public,anon,authenticated;
grant execute on function public.verify_alert_dispatch(text) to service_role;

create function private.save_search(p_id uuid,p_name text,p_filters jsonb,p_alerts boolean,p_frequency text,p_consent boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_id uuid; v_old public.saved_searches%rowtype; v_keyword text; v_location text; v_work text[]; v_types text[]; v_salary numeric; v_direct boolean; v_reset boolean;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 100 or p_frequency is null or p_frequency not in ('daily','weekly') or p_alerts is null or p_filters is null or jsonb_typeof(p_filters)<>'object'
    or (p_filters-array['keyword','location','workMode','employmentType','minSalary','directOnly'])<>'{}'::jsonb then raise exception 'Invalid saved search' using errcode='22023'; end if;
  v_keyword:=coalesce(p_filters->>'keyword',''); v_location:=coalesce(p_filters->>'location','');
  if char_length(v_keyword)>120 or char_length(v_location)>120 or
    (p_filters ? 'workMode' and jsonb_typeof(p_filters->'workMode')<>'array') or
    (p_filters ? 'employmentType' and jsonb_typeof(p_filters->'employmentType')<>'array') then raise exception 'Invalid search filters' using errcode='22023'; end if;
  select coalesce(array_agg(distinct x),'{}') into v_work from jsonb_array_elements_text(coalesce(p_filters->'workMode','[]')) x;
  select coalesce(array_agg(distinct x),'{}') into v_types from jsonb_array_elements_text(coalesce(p_filters->'employmentType','[]')) x;
  if not(v_work <@ array['On-site','Hybrid','Remote']::text[]) or not(v_types <@ array['Full time','Part time','Contract','Casual']::text[]) then raise exception 'Invalid filters' using errcode='22023'; end if;
  if p_filters->>'minSalary' is not null then
    if jsonb_typeof(p_filters->'minSalary')<>'number' then raise exception 'Invalid salary' using errcode='22023'; end if;
    v_salary:=(p_filters->>'minSalary')::numeric;
    if v_salary<0 or v_salary>1000000 then raise exception 'Invalid salary' using errcode='22023'; end if;
  end if;
  if p_filters ? 'directOnly' and jsonb_typeof(p_filters->'directOnly')<>'boolean' then raise exception 'Invalid filter' using errcode='22023'; end if;
  v_direct:=coalesce((p_filters->>'directOnly')::boolean,false);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saved_search:'||v_user::text,0));
  if p_id is not null then
    select * into v_old from public.saved_searches where id=p_id and user_id=v_user for update;
    if not found then raise exception 'Search access denied' using errcode='42501'; end if;
  elsif (select count(*) from public.saved_searches where user_id=v_user)>=20 then raise exception 'Saved search limit reached' using errcode='P0001'; end if;
  v_reset:=p_id is null or not v_old.alerts_enabled or row(v_keyword,v_location,v_work,v_types,v_salary,v_direct) is distinct from row(v_old.keyword,v_old.location,v_old.work_modes,v_old.employment_types,v_old.min_salary,v_old.direct_only);
  if p_alerts and ((v_reset and not coalesce(p_consent,false)) or not exists(select 1 from auth.users where id=v_user and email is not null and email_confirmed_at is not null)) then
    raise exception 'Confirm alerts for your verified account email' using errcode='22023'; end if;
  if p_alerts and exists(select 1 from private.alert_suppressions where user_id=v_user) then raise exception 'Email alerts are suppressed; contact support' using errcode='P0001'; end if;
  if p_id is null then
    insert into public.saved_searches(user_id,name,keyword,location,work_modes,employment_types,min_salary,direct_only,alerts_enabled,frequency,consent_at,next_run_at)
      values(v_user,trim(p_name),v_keyword,v_location,v_work,v_types,v_salary,v_direct,p_alerts,p_frequency,case when p_alerts then now() end,
        case when p_alerts then now()+case p_frequency when 'daily' then interval '1 day' else interval '7 days' end end) returning id into v_id;
  else
    update public.saved_searches set name=trim(p_name),keyword=v_keyword,location=v_location,work_modes=v_work,employment_types=v_types,min_salary=v_salary,direct_only=v_direct,
      alerts_enabled=p_alerts,frequency=p_frequency,consent_at=case when not p_alerts then null when v_reset then now() else consent_at end,
      next_run_at=case when not p_alerts then null when v_reset or frequency<>p_frequency then now()+case p_frequency when 'daily' then interval '1 day' else interval '7 days' end else next_run_at end,
      updated_at=now() where id=p_id returning id into v_id;
    update private.alert_outbox set status='canceled',error_code='PREFERENCES_CHANGED',lease_token=null,lease_expires_at=null
      where search_id=p_id and status in ('queued','leased') and (not p_alerts or v_reset);
  end if;
  return v_id;
end;
$$;
revoke all on function private.save_search(uuid,text,jsonb,boolean,text,boolean) from public, anon;
grant execute on function private.save_search(uuid,text,jsonb,boolean,text,boolean) to authenticated;
create function public.save_search(p_id uuid,p_name text,p_filters jsonb,p_alerts boolean,p_frequency text,p_consent boolean default false) returns uuid language sql security invoker set search_path='' as $$ select private.save_search(p_id,p_name,p_filters,p_alerts,p_frequency,p_consent); $$;
revoke all on function public.save_search(uuid,text,jsonb,boolean,text,boolean) from public, anon;
grant execute on function public.save_search(uuid,text,jsonb,boolean,text,boolean) to authenticated;
create function private.remove_saved_search(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  delete from public.saved_searches where id=p_id and user_id=(select auth.uid()); return found;
end;
$$;
revoke all on function private.remove_saved_search(uuid) from public, anon;
grant execute on function private.remove_saved_search(uuid) to authenticated;
create function public.remove_saved_search(p_id uuid) returns boolean language sql security invoker set search_path='' as $$ select private.remove_saved_search(p_id); $$;
revoke all on function public.remove_saved_search(uuid) from public, anon;
grant execute on function public.remove_saved_search(uuid) to authenticated;

create function public.unsubscribe_job_alert(p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  update public.saved_searches set alerts_enabled=false,consent_at=null,next_run_at=null,updated_at=now() where unsubscribe_token=p_token returning id into v_id;
  if v_id is not null then update private.alert_outbox set status='canceled',error_code='UNSUBSCRIBED',lease_token=null,lease_expires_at=null where search_id=v_id and status in ('queued','leased'); end if;
  return v_id is not null;
end;
$$;
revoke all on function public.unsubscribe_job_alert(uuid) from public, anon, authenticated;
grant execute on function public.unsubscribe_job_alert(uuid) to service_role;

create function private.job_matches_search(j public.jobs,s public.saved_searches) returns boolean language plpgsql stable security invoker set search_path='' as $$
declare v_location text:=trim(regexp_replace(lower(s.location),'[^a-z0-9 ]',' ','g')); v_city text; v_state text;
begin
  v_location:=regexp_replace(v_location,'\s+',' ','g'); v_city:=regexp_replace(v_location,' (vic|nsw|qld|sa|wa|tas|act|nt)$','');
  v_state:=substring(v_location from '(vic|nsw|qld|sa|wa|tas|act|nt)$');
  return j.status='published' and j.moderation_status='approved' and j.published_at<=now() and j.expires_at>now()
    and (s.keyword='' or j.search_vector @@ websearch_to_tsquery('english',s.keyword))
    and (s.location='' or (j.work_mode='Remote' and j.city='Anywhere in Australia') or
      (v_location in ('vic','nsw','qld','sa','wa','tas','act','nt') and lower(j.state)=v_location) or
      (v_location='anywhere in australia' and j.work_mode='Remote') or
      (v_location not in ('vic','nsw','qld','sa','wa','tas','act','nt','anywhere in australia') and lower(j.city) like '%'||v_city||'%' and (v_state is null or lower(j.state)=v_state)))
    and (cardinality(s.work_modes)=0 or j.work_mode=any(s.work_modes))
    and (cardinality(s.employment_types)=0 or j.employment_type=any(s.employment_types))
    and (s.min_salary is null or (j.salary_period='year' and j.salary_max>=s.min_salary))
    and (not s.direct_only or j.source='direct');
end;
$$;
revoke all on function private.job_matches_search(public.jobs,public.saved_searches) from public, anon, authenticated;

-- Claimed searches and their selected jobs are recorded in one transaction. Unique deliveries
-- avoid watermark/commit-order gaps and repeat alerts for the same role.
create function public.prepare_job_alerts(p_limit integer default 50) returns integer language plpgsql security definer set search_path='' as $$
declare s public.saved_searches%rowtype; v_email text; v_jobs jsonb; v_ids uuid[]; v_id uuid; v_count integer:=0; v_settings private.alert_settings%rowtype;
begin
  select * into v_settings from private.alert_settings where singleton;
  if not found or not v_settings.sending_enabled then return 0; end if;
  for s in select * from public.saved_searches where alerts_enabled and next_run_at<=now() order by next_run_at limit least(greatest(p_limit,1),100) for update skip locked loop
    select email into v_email from auth.users where id=s.user_id and email_confirmed_at is not null;
    if v_email is null or exists(select 1 from private.alert_suppressions where user_id=s.user_id) then
      update public.saved_searches set alerts_enabled=false,consent_at=null,next_run_at=null,updated_at=now() where id=s.id; continue;
    end if;
    select jsonb_agg(to_jsonb(matches) order by matches.published_at desc,matches.id),array_agg(matches.id) into v_jobs,v_ids from (
      select j.id,j.title,j.company,j.location,j.published_at from public.jobs j join public.organisations o on o.id=j.organisation_id
      where o.is_verified and o.suspended_at is null and private.job_matches_search(j,s) and j.published_at>=s.consent_at
        and not exists(select 1 from private.alert_job_deliveries d where d.search_id=s.id and d.job_id=j.id)
      order by j.published_at desc,j.id limit 8
    ) matches;
    if v_jobs is not null then
      insert into private.alert_outbox(search_id,user_id,recipient,snapshot) values(s.id,s.user_id,v_email,
        jsonb_build_object('searchName',s.name,'jobs',v_jobs,'siteOrigin',v_settings.site_origin,'unsubscribeUrl',v_settings.unsubscribe_origin||'?token='||s.unsubscribe_token::text)) returning id into v_id;
      insert into private.alert_job_deliveries(search_id,job_id,outbox_id) select s.id,unnest(v_ids),v_id;
      v_count:=v_count+1;
    end if;
    update public.saved_searches set next_run_at=now()+case frequency when 'daily' then interval '1 day' else interval '7 days' end where id=s.id;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.prepare_job_alerts(integer) from public, anon, authenticated;
grant execute on function public.prepare_job_alerts(integer) to service_role;

create function private.preview_search_alert(p_search uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.saved_searches%rowtype; v_email text; v_settings private.alert_settings%rowtype; v_id uuid;
begin
  select * into s from public.saved_searches where id=p_search and user_id=(select auth.uid()) and alerts_enabled for update;
  if not found then raise exception 'Enable alerts for your saved search first' using errcode='42501'; end if;
  if (select count(*) from private.alert_outbox where user_id=s.user_id and kind='preview' and created_at>now()-interval '1 day')>=3 then raise exception 'Preview limit reached' using errcode='P0001'; end if;
  select * into v_settings from private.alert_settings where singleton and sending_enabled;
  if not found then raise exception 'Email delivery is being configured' using errcode='P0001'; end if;
  select email into v_email from auth.users where id=s.user_id and email_confirmed_at is not null;
  if v_email is null or exists(select 1 from private.alert_suppressions where user_id=s.user_id) then raise exception 'Email delivery unavailable' using errcode='P0001'; end if;
  insert into private.alert_outbox(search_id,user_id,recipient,kind,snapshot) values(s.id,s.user_id,v_email,'preview',
    jsonb_build_object('searchName',s.name,'jobs','[]'::jsonb,'siteOrigin',v_settings.site_origin,'unsubscribeUrl',v_settings.unsubscribe_origin||'?token='||s.unsubscribe_token::text)) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.preview_search_alert(uuid) from public, anon;
grant execute on function private.preview_search_alert(uuid) to authenticated;
create function public.preview_search_alert(p_search uuid) returns uuid language sql security invoker set search_path='' as $$ select private.preview_search_alert(p_search); $$;
revoke all on function public.preview_search_alert(uuid) from public, anon;
grant execute on function public.preview_search_alert(uuid) to authenticated;

create function public.claim_job_alerts(p_limit integer default 10) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if not exists(select 1 from private.alert_settings where sending_enabled) then return '[]'::jsonb; end if;
  update private.alert_outbox set status='ambiguous',error_code='IDEMPOTENCY_WINDOW_EXPIRED',lease_token=null,lease_expires_at=null
    where status in ('queued','leased') and first_attempt_at<now()-interval '23 hours';
  update private.alert_outbox set status='blocked',error_code='ATTEMPT_LIMIT_REACHED',lease_token=null,lease_expires_at=null
    where attempts>=8 and (status='queued' or (status='leased' and lease_expires_at<now()));
  update private.alert_outbox b set status='canceled',error_code='ALERT_NO_LONGER_ELIGIBLE',lease_token=null,lease_expires_at=null
    where b.status in ('queued','leased') and (b.created_at<now()-interval '7 days' or
      not exists(select 1 from public.saved_searches s join auth.users u on u.id=s.user_id where s.id=b.search_id and s.alerts_enabled and u.email=b.recipient and u.email_confirmed_at is not null)
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

create function public.freeze_job_alert(p_id uuid,p_lease uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b private.alert_outbox%rowtype; v_valid integer; v_total integer;
begin
  select * into b from private.alert_outbox where id=p_id and lease_token=p_lease and status='leased' and lease_expires_at>now() for update;
  if not found then return null; end if;
  if not exists(select 1 from private.alert_settings where sending_enabled) then return null; end if;
  if not exists(select 1 from public.saved_searches s join auth.users u on u.id=s.user_id where s.id=b.search_id and s.alerts_enabled and u.email=b.recipient and u.email_confirmed_at is not null)
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
revoke all on function public.freeze_job_alert(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.freeze_job_alert(uuid,uuid,jsonb) to service_role;

create function public.settle_job_alert(p_id uuid,p_lease uuid,p_status text,p_provider_id text default null,p_error text default null,p_retry_seconds integer default 60)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_status is null or p_status not in ('accepted','queued','blocked','ambiguous') or char_length(coalesce(p_error,''))>80 or (p_status='accepted' and (p_provider_id is null or char_length(p_provider_id)>200)) then raise exception 'Invalid delivery result' using errcode='22023'; end if;
  update private.alert_outbox set status=case when status in ('delivered','failed') then status when p_status='queued' and attempts>=8 then 'blocked' else p_status end,
    provider_id=coalesce(provider_id,p_provider_id),accepted_at=case when p_status='accepted' then coalesce(accepted_at,now()) else accepted_at end,
    error_code=p_error,available_at=now()+make_interval(secs=>least(greatest(p_retry_seconds,60),3600)),lease_token=null,lease_expires_at=null
    where id=p_id and lease_token=p_lease and lease_expires_at>now();
  return found;
end;
$$;
revoke all on function public.settle_job_alert(uuid,uuid,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.settle_job_alert(uuid,uuid,text,text,text,integer) to service_role;

create function public.apply_alert_webhook(p_event_id text,p_email_id text,p_type text,p_occurred_at timestamptz,p_outbox_id uuid default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare b private.alert_outbox%rowtype; v_terminal boolean;
begin
  if p_type is null or p_type not in ('email.sent','email.delivered','email.delivery_delayed','email.failed','email.bounced','email.complained','email.suppressed') or p_event_id is null or char_length(p_event_id) not between 1 and 200 or p_email_id is null or char_length(p_email_id) not between 1 and 200 or p_occurred_at is null or p_occurred_at>now()+interval '5 minutes' then raise exception 'Invalid delivery event' using errcode='22023'; end if;
  -- Only Westmere alert IDs are mapped. OrderWard and Auth SMTP events are ignored.
  select * into b from private.alert_outbox where provider_id=p_email_id or (id=p_outbox_id and provider_request is not null) for update;
  if not found then return false; end if;
  if b.provider_id is not null and b.provider_id<>p_email_id then raise exception 'Email mapping conflict' using errcode='22023'; end if;
  insert into private.alert_webhook_events(id,provider_id,event_type,occurred_at,outbox_id) values(p_event_id,p_email_id,p_type,p_occurred_at,b.id) on conflict do nothing;
  if not found then return true; end if;
  v_terminal:=p_type in ('email.bounced','email.complained','email.suppressed');
  if v_terminal then
    insert into private.alert_suppressions(user_id,reason) values(b.user_id,split_part(p_type,'.',2))
      on conflict(user_id) do update set reason=excluded.reason,created_at=now();
    update public.saved_searches set alerts_enabled=false,consent_at=null,next_run_at=null,updated_at=now() where user_id=b.user_id;
    update private.alert_outbox set status='canceled',error_code='EMAIL_SUPPRESSED',lease_token=null,lease_expires_at=null where user_id=b.user_id and id<>b.id and status in ('queued','leased');
  end if;
  update private.alert_outbox set provider_id=p_email_id,
    status=case when v_terminal then 'failed' when status='failed' then status
      when p_type='email.delivered' then 'delivered' when p_type='email.failed' and status<>'delivered' then 'failed'
      when status='delivered' then status when p_type='email.sent' then 'accepted' else status end,
    delivered_at=case when p_type='email.delivered' then coalesce(delivered_at,p_occurred_at) else delivered_at end,
    provider_event_at=greatest(coalesce(provider_event_at,p_occurred_at),p_occurred_at),
    error_code=case when v_terminal or p_type='email.failed' then upper(replace(p_type,'.','_')) else error_code end
    where id=b.id;
  return true;
end;
$$;
revoke all on function public.apply_alert_webhook(text,text,text,timestamptz,uuid) from public, anon, authenticated;
grant execute on function public.apply_alert_webhook(text,text,text,timestamptz,uuid) to service_role;

create function private.alert_status_for_user() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  return jsonb_build_object('configured',exists(select 1 from private.alert_settings where sending_enabled),
    'suppressed',exists(select 1 from private.alert_suppressions where user_id=(select auth.uid())),
    'deliveries',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from(select id,search_id,kind,status,created_at,accepted_at,delivered_at from private.alert_outbox where user_id=(select auth.uid()) order by created_at desc limit 20) d));
end;
$$;
revoke all on function private.alert_status_for_user() from public, anon;
grant execute on function private.alert_status_for_user() to authenticated;
create function public.alert_status_for_user() returns jsonb language sql stable security invoker set search_path='' as $$ select private.alert_status_for_user(); $$;
revoke all on function public.alert_status_for_user() from public, anon;
grant execute on function public.alert_status_for_user() to authenticated;
commit;

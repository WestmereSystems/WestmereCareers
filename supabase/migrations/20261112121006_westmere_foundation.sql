-- Westmere Careers foundation. Generated with the Supabase CLI; not applied to a hosted project.
-- Deliberately separate from the user's existing OrderWard projects.
begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  cv_text text not null default '' check (char_length(cv_text) <= 40000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 180),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '',
  website text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.organisation_members (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'recruiter', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (organisation_id, user_id)
);
create index organisation_members_user on public.organisation_members(user_id, organisation_id);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  title text not null check (char_length(title) between 3 and 180),
  company text not null check (char_length(company) between 2 and 180),
  location text not null check (char_length(location) between 2 and 180),
  city text not null,
  state text not null check (state in ('ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA')),
  category text not null default 'Other',
  work_mode text not null check (work_mode in ('On-site', 'Hybrid', 'Remote')),
  employment_type text not null check (employment_type in ('Full time', 'Part time', 'Contract', 'Casual')),
  salary_min numeric(12,2) not null check (salary_min >= 0 and salary_min <= 100000000),
  salary_max numeric(12,2) not null check (salary_max >= salary_min and salary_max <= 100000000),
  salary_period text not null default 'year' check (salary_period in ('year', 'hour')),
  salary_note text not null default '+ super',
  super_included boolean not null default false,
  description text not null check (char_length(description) between 20 and 20000),
  responsibilities text[] not null default '{}',
  requirements text[] not null default '{}',
  skills text[] not null default '{}',
  tags text[] not null default '{}',
  source text not null default 'direct' check (source in ('direct', 'external')),
  external_url text,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  published_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now(),
  -- Moderated response projections are writable only by trusted service workers.
  response_days numeric check (response_days >= 0),
  response_reports integer not null default 0 check (response_reports >= 0),
  no_response_reports integer not null default 0 check (no_response_reports >= 0),
  eligible_reports integer not null default 0 check (eligible_reports >= no_response_reports),
  company_size text not null default '',
  company_description text not null default '',
  search_vector tsvector not null default ''::tsvector,
  check ((source = 'external' and external_url ~ '^https://') or (source = 'direct' and external_url is null)),
  check (status <> 'published' or published_at is not null)
);
create index jobs_live_newest on public.jobs(published_at desc, id) where status = 'published';
create index jobs_location_filter on public.jobs(state, city, work_mode) where status = 'published';
create index jobs_organisation on public.jobs(organisation_id, created_at desc);
create index jobs_search_vector on public.jobs using gin(search_vector);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete restrict,
  candidate_id uuid not null references auth.users(id) on delete cascade,
  cv_text_snapshot text not null check (char_length(cv_text_snapshot) between 50 and 40000),
  cover_letter text not null default '' check (char_length(cover_letter) <= 15000),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  job_title_snapshot text not null default '',
  company_snapshot text not null default '',
  location_snapshot text not null default '',
  status text not null default 'received' check (status in ('received', 'opened', 'shortlisted', 'interview', 'offer', 'not_proceeding')),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  unique(job_id, candidate_id)
);
create index applications_candidate on public.applications(candidate_id, created_at desc);
create index applications_job on public.applications(job_id, created_at desc);

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('received', 'opened', 'document_downloaded', 'employer_update', 'decision', 'withdrawn')),
  source text not null default 'westmere_recorded' check (source in ('westmere_recorded', 'candidate_reported', 'ats_import')),
  message text not null default '',
  occurred_at timestamptz not null default now()
);
create index application_events_application on public.application_events(application_id, occurred_at);
create unique index application_first_open on public.application_events(application_id) where event_type = 'opened';

create table public.response_reports (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  job_reference text not null check (char_length(job_reference) between 3 and 300),
  application_date timestamptz not null,
  response_date timestamptz,
  response_received boolean not null,
  evidence_source text not null check (evidence_source in ('direct_application', 'external_application')),
  confirmed_at timestamptz not null default now(),
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'accepted', 'quarantined', 'rejected')),
  check ((response_received and response_date is not null and response_date >= application_date) or (not response_received and response_date is null)),
  unique (candidate_id, organisation_id, job_reference)
);

create table public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  last_reconciliation_attempt_at timestamptz,
  last_reconciled_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null references public.billing_customers(stripe_customer_id),
  stripe_subscription_id text unique,
  status text not null,
  price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_event_created bigint not null default 0,
  updated_at timestamptz not null default now(),
  check (current_period_end is null or current_period_start is null or current_period_end > current_period_start)
);

create table public.stripe_events (
  id text primary key,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('improve', 'tailor', 'match')),
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'failed')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index ai_usage_user_period on public.ai_usage(user_id, period_start, status);

create table private.billing_leases (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token uuid not null,
  expires_at timestamptz not null
);
alter table private.billing_leases enable row level security;
revoke all on private.billing_leases from public, anon, authenticated;
grant all on private.billing_leases to service_role;

-- RLS and explicit grants are independent and both required.
alter table public.profiles enable row level security;
alter table public.organisations enable row level security;
alter table public.organisation_members enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
alter table public.application_events enable row level security;
alter table public.response_reports enable row level security;
alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stripe_events enable row level security;
alter table public.ai_usage enable row level security;
revoke all on public.profiles, public.organisations, public.organisation_members, public.jobs,
  public.applications, public.application_events, public.response_reports, public.billing_customers,
  public.subscriptions, public.stripe_events, public.ai_usage from anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select on public.organisations, public.jobs to anon, authenticated;
grant select on public.organisation_members, public.applications, public.application_events,
  public.response_reports, public.subscriptions, public.ai_usage to authenticated;
grant insert (job_id, candidate_id, cv_text_snapshot, cover_letter, answers) on public.applications to authenticated;
grant update (withdrawn_at) on public.applications to authenticated;
grant insert (organisation_id,title,company,location,city,state,category,work_mode,employment_type,
  salary_min,salary_max,salary_period,salary_note,super_included,description,responsibilities,requirements,
  skills,tags,source,external_url,status,published_at,expires_at,company_size,company_description) on public.jobs to authenticated;
grant update (title,company,location,city,state,category,work_mode,employment_type,salary_min,salary_max,
  salary_period,salary_note,super_included,description,responsibilities,requirements,skills,tags,source,
  external_url,status,published_at,expires_at,company_size,company_description) on public.jobs to authenticated;
grant all on public.profiles, public.organisations, public.organisation_members, public.jobs,
  public.applications, public.application_events, public.response_reports, public.billing_customers,
  public.subscriptions, public.stripe_events, public.ai_usage to service_role;

create policy profiles_own on public.profiles for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy organisations_public on public.organisations for select to anon, authenticated using (true);
-- No authenticated membership writes: business verification and invitations need a trusted audited process.
create policy memberships_own on public.organisation_members for select to authenticated
  using (user_id = (select auth.uid()));
create policy jobs_live on public.jobs for select to anon, authenticated
  using (status = 'published' and published_at <= now() and expires_at > now());
create policy jobs_team_read on public.jobs for select to authenticated using (
  exists (select 1 from public.organisation_members m where m.organisation_id = jobs.organisation_id and m.user_id = (select auth.uid()))
);
create policy jobs_team_insert on public.jobs for insert to authenticated with check (
  exists (select 1 from public.organisation_members m where m.organisation_id = jobs.organisation_id and m.user_id = (select auth.uid()) and m.role in ('owner','admin','recruiter'))
  and (status <> 'published' or exists (select 1 from public.organisations o where o.id = organisation_id and o.is_verified))
);
create policy jobs_team_update on public.jobs for update to authenticated using (
  exists (select 1 from public.organisation_members m where m.organisation_id = jobs.organisation_id and m.user_id = (select auth.uid()) and m.role in ('owner','admin','recruiter'))
) with check (
  exists (select 1 from public.organisation_members m where m.organisation_id = jobs.organisation_id and m.user_id = (select auth.uid()) and m.role in ('owner','admin','recruiter'))
  and (status <> 'published' or exists (select 1 from public.organisations o where o.id = organisation_id and o.is_verified))
);
create policy applications_candidate_read on public.applications for select to authenticated using (candidate_id = (select auth.uid()));
create policy applications_team_read on public.applications for select to authenticated using (
  withdrawn_at is null and exists (select 1 from public.jobs j join public.organisation_members m on m.organisation_id = j.organisation_id
    where j.id = applications.job_id and m.user_id = (select auth.uid()) and m.role in ('owner','admin','recruiter'))
);
create policy applications_candidate_insert on public.applications for insert to authenticated with check (
  candidate_id = (select auth.uid()) and status = 'received' and withdrawn_at is null
  and exists (select 1 from public.jobs j where j.id = job_id and j.source = 'direct'
    and j.status = 'published' and j.published_at <= now() and j.expires_at > now())
);
create policy applications_candidate_withdraw on public.applications for update to authenticated
  using (candidate_id = (select auth.uid()) and withdrawn_at is null)
  with check (candidate_id = (select auth.uid()) and withdrawn_at is not null);
create policy events_authorised_read on public.application_events for select to authenticated using (
  exists (select 1 from public.applications a where a.id = application_id)
);
create policy reports_own_read on public.response_reports for select to authenticated using (candidate_id = (select auth.uid()));
create policy subscriptions_own_read on public.subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy ai_usage_own_read on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));
-- No anon/authenticated policies or grants on billing_customers and stripe_events.

create function private.enforce_job_organisation_name() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  select name into new.company from public.organisations where id = new.organisation_id;
  return new;
end;
$$;
revoke all on function private.enforce_job_organisation_name() from public, anon, authenticated;
create trigger jobs_organisation_name before insert or update of company,organisation_id on public.jobs
  for each row execute function private.enforce_job_organisation_name();

create function private.refresh_job_search_vector() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.search_vector := pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.english',new.title || ' ' || new.company),'A')
    || pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.english',new.category || ' ' || pg_catalog.array_to_string(new.skills,' ')),'B')
    || pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.english',new.description),'C');
  return new;
end;
$$;
revoke all on function private.refresh_job_search_vector() from public, anon, authenticated;
create trigger jobs_search_vector before insert or update of title,company,category,description,skills on public.jobs
  for each row execute function private.refresh_job_search_vector();

create function private.application_context_snapshot() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_job public.jobs%rowtype;
begin
  -- Lock the role while checking it, so closure and application submission cannot race.
  select * into v_job from public.jobs where id = new.job_id for share;
  if not found or v_job.source <> 'direct' or v_job.status <> 'published'
    or v_job.published_at > now() or v_job.expires_at <= now() then
    raise exception 'This role is not accepting direct applications.' using errcode = '42501';
  end if;
  new.job_title_snapshot := v_job.title;
  new.company_snapshot := v_job.company;
  new.location_snapshot := v_job.location;
  return new;
end;
$$;
revoke all on function private.application_context_snapshot() from public, anon, authenticated;
create trigger application_context_snapshot before insert on public.applications for each row execute function private.application_context_snapshot();

create function private.application_received_event() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.application_events(application_id,actor_id,event_type,message)
  values(new.id,new.candidate_id,'received','Application received by Westmere.');
  return new;
end;
$$;
revoke all on function private.application_received_event() from public, anon, authenticated;
create trigger application_received after insert on public.applications for each row execute function private.application_received_event();

create function private.application_snapshot_immutable() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.job_id is distinct from old.job_id or new.candidate_id is distinct from old.candidate_id
    or new.cv_text_snapshot is distinct from old.cv_text_snapshot or new.cover_letter is distinct from old.cover_letter
    or new.answers is distinct from old.answers or new.created_at is distinct from old.created_at
    or new.job_title_snapshot is distinct from old.job_title_snapshot or new.company_snapshot is distinct from old.company_snapshot
    or new.location_snapshot is distinct from old.location_snapshot then
    raise exception 'Submitted application material is immutable.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.application_snapshot_immutable() from public, anon, authenticated;
create trigger application_snapshot_immutable before update on public.applications for each row execute function private.application_snapshot_immutable();

create function private.open_application_internal(p_application_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_application public.applications%rowtype;
begin
  if v_user is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  select a.* into v_application from public.applications a
    join public.jobs j on j.id = a.job_id
    join public.organisation_members m on m.organisation_id = j.organisation_id
    where a.id = p_application_id and m.user_id = v_user and m.role in ('owner','admin','recruiter')
    for update of a;
  if not found or v_application.withdrawn_at is not null then raise exception 'Application access denied.' using errcode = '42501'; end if;
  insert into public.application_events(application_id,actor_id,event_type,message)
    values(v_application.id,v_user,'opened','Application opened by the hiring team.') on conflict do nothing;
  if v_application.status = 'received' then
    update public.applications set status = 'opened' where id = v_application.id returning * into v_application;
  end if;
  return to_jsonb(v_application);
end;
$$;
revoke all on function private.open_application_internal(uuid) from public, anon;
grant execute on function private.open_application_internal(uuid) to authenticated;
create function public.open_application(p_application_id uuid) returns jsonb language sql security invoker set search_path = '' as $$
  select private.open_application_internal(p_application_id);
$$;
revoke all on function public.open_application(uuid) from public, anon;
grant execute on function public.open_application(uuid) to authenticated;

-- Withdrawal revokes further CV access while preserving a non-sensitive hiring-workspace summary.
create function private.list_job_applications_internal(p_job_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_result jsonb;
begin
  if v_user is null or not exists (
    select 1 from public.jobs j join public.organisation_members m on m.organisation_id = j.organisation_id
    where j.id = p_job_id and m.user_id = v_user and m.role in ('owner','admin','recruiter')
  ) then raise exception 'Application access denied.' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(summaries) order by summaries.created_at desc),'[]'::jsonb) into v_result from (
    select id,job_id,status,created_at,withdrawn_at from public.applications where job_id = p_job_id order by created_at desc limit 100
  ) summaries;
  return v_result;
end;
$$;
revoke all on function private.list_job_applications_internal(uuid) from public, anon;
grant execute on function private.list_job_applications_internal(uuid) to authenticated;
create function public.list_job_applications(p_job_id uuid) returns jsonb language sql security invoker set search_path = '' as $$
  select private.list_job_applications_internal(p_job_id);
$$;
revoke all on function public.list_job_applications(uuid) from public, anon;
grant execute on function public.list_job_applications(uuid) to authenticated;

create function private.update_application_stage_internal(p_application_id uuid,p_status text,p_message text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_application public.applications%rowtype; v_event uuid;
begin
  if v_user is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('shortlisted','interview','offer','not_proceeding')
    or p_message is null or char_length(trim(p_message)) < 10 or char_length(p_message) > 4000 then
    raise exception 'Choose a valid stage and write a candidate update.' using errcode = '22023';
  end if;
  select a.* into v_application from public.applications a
    join public.jobs j on j.id = a.job_id
    join public.organisation_members m on m.organisation_id = j.organisation_id
    where a.id = p_application_id and m.user_id = v_user and m.role in ('owner','admin','recruiter') for update of a;
  if not found then raise exception 'Application access denied.' using errcode = '42501'; end if;
  if v_application.withdrawn_at is not null then raise exception 'This application has been withdrawn.' using errcode = '22023'; end if;
  update public.applications set status = p_status where id = v_application.id;
  insert into public.application_events(application_id,actor_id,event_type,message)
    values(v_application.id,v_user,case when p_status in ('offer','not_proceeding') then 'decision' else 'employer_update' end,trim(p_message)) returning id into v_event;
  return v_event;
end;
$$;
revoke all on function private.update_application_stage_internal(uuid,text,text) from public, anon;
grant execute on function private.update_application_stage_internal(uuid,text,text) to authenticated;
create function public.update_application_stage(p_application_id uuid,p_status text,p_message text) returns uuid language sql security invoker set search_path = '' as $$
  select private.update_application_stage_internal(p_application_id,p_status,p_message);
$$;
revoke all on function public.update_application_stage(uuid,text,text) from public, anon;
grant execute on function public.update_application_stage(uuid,text,text) to authenticated;

create function private.submit_response_report_internal(p_application_id uuid,p_organisation_id uuid,p_job_reference text,p_application_date timestamptz,p_response_received boolean,p_response_date timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_org uuid; v_date timestamptz; v_reference text; v_source text; v_id uuid;
begin
  if v_user is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  if p_response_received is null then raise exception 'Confirm whether a response was received.' using errcode = '22023'; end if;
  if p_application_id is not null then
    select j.organisation_id,a.created_at into v_org,v_date from public.applications a join public.jobs j on j.id = a.job_id
      where a.id = p_application_id and a.candidate_id = v_user;
    if not found then raise exception 'Application access denied.' using errcode = '42501'; end if;
    v_reference := p_application_id::text;
    v_source := 'direct_application';
  else
    if p_organisation_id is null or p_job_reference is null or char_length(trim(p_job_reference)) not between 3 and 300
      or p_application_date is null then raise exception 'Add the employer, role reference and application date.' using errcode = '22023'; end if;
    if not exists (select 1 from public.organisations where id = p_organisation_id) then raise exception 'Employer not found.' using errcode = '22023'; end if;
    v_org := p_organisation_id; v_date := p_application_date; v_reference := trim(p_job_reference); v_source := 'external_application';
  end if;
  if v_date > now() or (p_response_received and (p_response_date is null or p_response_date < v_date or p_response_date > now()))
    or (not p_response_received and p_response_date is not null) then raise exception 'Check the application and response dates.' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('response_report:' || v_user::text, 0));
  if (select count(*) from public.response_reports where candidate_id = v_user and confirmed_at > now()-interval '7 days') >= 100 then
    raise exception 'Please wait before submitting more application reports.' using errcode = 'P0001';
  end if;
  insert into public.response_reports(candidate_id,application_id,organisation_id,job_reference,application_date,response_date,response_received,evidence_source)
    values(v_user,p_application_id,v_org,v_reference,v_date,p_response_date,p_response_received,v_source)
    on conflict(candidate_id,organisation_id,job_reference) do update set response_date = excluded.response_date,
      response_received = excluded.response_received,confirmed_at = now(),moderation_status = 'pending' returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.submit_response_report_internal(uuid,uuid,text,timestamptz,boolean,timestamptz) from public, anon;
grant execute on function private.submit_response_report_internal(uuid,uuid,text,timestamptz,boolean,timestamptz) to authenticated;
create function public.submit_response_report(p_application_id uuid,p_organisation_id uuid,p_job_reference text,p_application_date timestamptz,p_response_received boolean,p_response_date timestamptz)
returns uuid language sql security invoker set search_path = '' as $$
  select private.submit_response_report_internal(p_application_id,p_organisation_id,p_job_reference,p_application_date,p_response_received,p_response_date);
$$;
revoke all on function public.submit_response_report(uuid,uuid,text,timestamptz,boolean,timestamptz) from public, anon;
grant execute on function public.submit_response_report(uuid,uuid,text,timestamptz,boolean,timestamptz) to authenticated;

-- Non-exposed privileged implementation; public callable entry point is SECURITY INVOKER.
create function private.reserve_ai_usage_internal(p_mode text) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_subscription public.subscriptions%rowtype;
  v_count integer;
  v_id uuid;
begin
  if v_user is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  if p_mode not in ('improve','tailor','match') then raise exception 'Unknown generation mode.' using errcode = '22023'; end if;
  -- Serialise reservations for this user; row writes are not exposed to the authenticated role.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 0));
  select * into v_subscription from public.subscriptions where user_id = v_user;
  if not found or v_subscription.status not in ('active','trialing') or v_subscription.price_id is null
    or v_subscription.current_period_start is null or v_subscription.current_period_start > now()
    or v_subscription.current_period_end is null or v_subscription.current_period_end <= now() then
    raise exception 'A current Careers+ subscription is required.' using errcode = '42501';
  end if;
  update public.ai_usage set status = 'failed', settled_at = now()
    where user_id = v_user and status = 'reserved' and created_at < now() - interval '15 minutes';
  select count(*) into v_count from public.ai_usage where user_id = v_user
    and period_start = v_subscription.current_period_start and status in ('reserved','completed');
  if v_count >= 30 then raise exception 'Monthly application allowance reached.' using errcode = 'P0001'; end if;
  insert into public.ai_usage(user_id,mode,period_start,period_end)
    values(v_user,p_mode,v_subscription.current_period_start,v_subscription.current_period_end) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.reserve_ai_usage_internal(text) from public, anon;
grant execute on function private.reserve_ai_usage_internal(text) to authenticated;
create function public.reserve_ai_usage(p_mode text) returns uuid language sql security invoker set search_path = '' as $$
  select private.reserve_ai_usage_internal(p_mode);
$$;
revoke all on function public.reserve_ai_usage(text) from public, anon;
grant execute on function public.reserve_ai_usage(text) to authenticated;

-- Only trusted server processing can settle usage. A candidate cannot refund their own successful output.
create function public.settle_ai_usage(p_reservation_id uuid,p_success boolean) returns void language sql security invoker set search_path = '' as $$
  update public.ai_usage set status = case when p_success then 'completed' else 'failed' end, settled_at = now()
    where id = p_reservation_id and status = 'reserved';
$$;
revoke all on function public.settle_ai_usage(uuid,boolean) from public, anon, authenticated;
grant execute on function public.settle_ai_usage(uuid,boolean) to service_role;

create function public.acquire_billing_lease(p_user_id uuid) returns uuid language sql security invoker set search_path = '' as $$
  with acquired as (
    insert into private.billing_leases(user_id,token,expires_at) values(p_user_id,gen_random_uuid(),now()+interval '90 seconds')
    on conflict(user_id) do update set token = excluded.token,expires_at = excluded.expires_at
      where private.billing_leases.expires_at <= now() returning token
  ) select token from acquired;
$$;
revoke all on function public.acquire_billing_lease(uuid) from public, anon, authenticated;
grant execute on function public.acquire_billing_lease(uuid) to service_role;
create function public.release_billing_lease(p_user_id uuid,p_token uuid) returns void language sql security invoker set search_path = '' as $$
  delete from private.billing_leases where user_id = p_user_id and token = p_token;
$$;
revoke all on function public.release_billing_lease(uuid,uuid) from public, anon, authenticated;
grant execute on function public.release_billing_lease(uuid,uuid) to service_role;

create function public.apply_subscription_state(
  p_user_id uuid,p_stripe_customer_id text,p_stripe_subscription_id text,p_status text,p_price_id text,
  p_current_period_start timestamptz,p_current_period_end timestamptz,p_cancel_at_period_end boolean,p_event_created bigint,p_lease_token uuid
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from private.billing_leases where user_id = p_user_id and token = p_lease_token and expires_at > now() for update;
  if not found then raise exception 'A current billing lease is required.' using errcode = '42501'; end if;
  if not exists (select 1 from public.billing_customers c where c.user_id = p_user_id and c.stripe_customer_id = p_stripe_customer_id) then
    raise exception 'Unknown billing customer mapping.' using errcode = '42501';
  end if;
  insert into public.subscriptions(user_id,stripe_customer_id,stripe_subscription_id,status,price_id,
    current_period_start,current_period_end,cancel_at_period_end,last_event_created,updated_at)
  values(p_user_id,p_stripe_customer_id,p_stripe_subscription_id,p_status,p_price_id,p_current_period_start,
    p_current_period_end,p_cancel_at_period_end,p_event_created,now())
  on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,status = excluded.status,price_id = excluded.price_id,
    current_period_start = excluded.current_period_start,current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    last_event_created = greatest(public.subscriptions.last_event_created,excluded.last_event_created),updated_at = now();
end;
$$;
revoke all on function public.apply_subscription_state(uuid,text,text,text,text,timestamptz,timestamptz,boolean,bigint,uuid) from public, anon, authenticated;
grant execute on function public.apply_subscription_state(uuid,text,text,text,text,timestamptz,timestamptz,boolean,bigint,uuid) to service_role;

-- Private document bucket; upload and parsing require a separate scanning workflow before public launch.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('candidate-documents','candidate-documents',false,10485760,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain'])
on conflict (id) do nothing;
-- No direct object upload grants/policies yet: initial applications use private text snapshots.
commit;

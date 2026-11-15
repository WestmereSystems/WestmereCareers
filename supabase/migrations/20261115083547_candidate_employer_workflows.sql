-- Private candidate documents, account activity and employer publishing enhancements.
begin;
alter table public.profiles add column active_cv_id uuid, add column application_email_enabled boolean not null default true;
create table public.candidate_cvs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 filename text not null check(char_length(filename) between 1 and 180), storage_path text not null unique,
 media_type text not null check(media_type in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
 bytes integer not null check(bytes between 1 and 4194304), extracted_text text not null check(char_length(extracted_text) between 50 and 40000),
 created_at timestamptz not null default now()
);
create index candidate_cvs_user on public.candidate_cvs(user_id,created_at desc);
alter table public.candidate_cvs enable row level security;
revoke all on public.candidate_cvs from public,anon,authenticated;
grant select on public.candidate_cvs to authenticated;
grant all on public.candidate_cvs to service_role;
create policy cv_owner on public.candidate_cvs for select to authenticated using(user_id=(select auth.uid()));
alter table public.profiles add constraint active_cv_fk foreign key(active_cv_id) references public.candidate_cvs(id) on delete set null;
create function private.guard_active_cv() returns trigger language plpgsql set search_path='' as $$
begin
 if new.active_cv_id is not null and not exists(select 1 from public.candidate_cvs where id=new.active_cv_id and user_id=new.id) then raise exception 'Choose one of your own CVs' using errcode='42501'; end if;
 return new;
end; $$;
create trigger validate_active_cv before insert or update of active_cv_id on public.profiles for each row execute function private.guard_active_cv();
create table public.saved_jobs (
 user_id uuid not null references auth.users(id) on delete cascade, job_id uuid not null references public.jobs(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(user_id,job_id)
);
alter table public.saved_jobs enable row level security;
revoke all on public.saved_jobs from public,anon,authenticated;
grant select,insert,delete on public.saved_jobs to authenticated; grant all on public.saved_jobs to service_role;
create policy saved_jobs_read on public.saved_jobs for select to authenticated using(user_id=(select auth.uid()));
create policy saved_jobs_remove on public.saved_jobs for delete to authenticated using(user_id=(select auth.uid()));
create policy saved_jobs_add on public.saved_jobs for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.jobs where id=job_id and status='published' and moderation_status='approved' and expires_at>now()));

create function private.limit_saved_jobs() returns trigger language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('saved-jobs:'||new.user_id::text,0));
 if (select count(*) from public.saved_jobs where user_id=new.user_id)>=200 then raise exception 'Your saved list holds up to 200 jobs' using errcode='22023';end if;
 return new;
end;$$;
create trigger saved_jobs_limit before insert on public.saved_jobs for each row execute function private.limit_saved_jobs();
create function private.limit_cv_history() returns trigger language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('cv-history:'||new.user_id::text,0));
 if (select count(*) from public.candidate_cvs where user_id=new.user_id)>=20 then raise exception 'Your CV history holds up to 20 versions' using errcode='22023';end if;
 return new;
end;$$;
create trigger cv_history_limit before insert on public.candidate_cvs for each row execute function private.limit_cv_history();
create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 event_key text not null, title text not null check(char_length(title)<=200), message text not null check(char_length(message)<=2000),
 path text not null check(path in ('/applications','/employers/dashboard','/account','/employers/sample')),
 read_at timestamptz, created_at timestamptz not null default now(), unique(user_id,event_key)
);
create index notifications_user on public.notifications(user_id,created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from public,anon,authenticated;
grant select on public.notifications to authenticated; grant update(read_at) on public.notifications to authenticated; grant all on public.notifications to service_role;
create policy notifications_read on public.notifications for select to authenticated using(user_id=(select auth.uid()));
create policy notifications_mark on public.notifications for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

alter table private.alert_outbox alter column search_id drop not null;
alter table private.alert_outbox drop constraint alert_outbox_kind_check;
alter table private.alert_outbox add constraint alert_outbox_kind_check check(kind in ('digest','preview','account'));
alter table private.alert_outbox add column event_key text;
create unique index account_mail_once on private.alert_outbox(user_id,event_key) where event_key is not null;
create table private.welcome_eligible(user_id uuid primary key references auth.users(id) on delete cascade,completed_at timestamptz);
alter table private.welcome_eligible enable row level security;
revoke all on private.welcome_eligible from public,anon,authenticated; grant all on private.welcome_eligible to service_role;
create function private.new_account_welcome_eligible() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into private.welcome_eligible(user_id) values(new.id) on conflict do nothing; return new; end; $$;
create trigger westmere_new_account after insert on auth.users for each row execute function private.new_account_welcome_eligible();

create function private.queue_account_notice(p_user uuid,p_key text,p_title text,p_message text,p_path text,p_email boolean default true) returns void language plpgsql security definer set search_path='' as $$
declare v_email text; v_origin text;
begin
 insert into public.notifications(user_id,event_key,title,message,path) values(p_user,p_key,p_title,left(p_message,2000),p_path) on conflict do nothing;
 if not p_email then return; end if;
 select email into v_email from auth.users where id=p_user and email_confirmed_at is not null;
 select site_origin into v_origin from private.alert_settings limit 1;
 if v_email is null or v_origin is null or exists(select 1 from private.alert_suppressions where user_id=p_user) then return; end if;
 insert into private.alert_outbox(user_id,recipient,kind,event_key,snapshot) values(p_user,v_email,'account',p_key,jsonb_build_object('title',p_title,'message',case when p_key='welcome' then 'A little clarity. A world of possibility. Your private profile, applications and career tools are ready when you are.' else 'There is a new update in your Westmere account. Sign in to read it and see your application timeline.' end,'path',p_path,'siteOrigin',v_origin)) on conflict do nothing;
end; $$;
revoke all on function private.queue_account_notice(uuid,text,text,text,text,boolean) from public,anon,authenticated;
create function private.welcome_on_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if length(trim(new.full_name))>0 then
  update private.welcome_eligible set completed_at=now() where user_id=new.id and completed_at is null;
  if found then perform private.queue_account_notice(new.id,'welcome','Welcome to Westmere Careers','Your career starts with Westmere. Explore your private profile, saved roles and application timeline.','/account',true); end if;
 end if;
 return new;
end; $$;
create trigger westmere_profile_welcome after insert or update of full_name on public.profiles for each row execute function private.welcome_on_profile();
create function private.notify_application_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.applications%rowtype; m record; v_email boolean;
begin
 select * into a from public.applications where id=new.application_id;
 if new.event_type not in ('received','opened','employer_update','decision') or a.withdrawn_at is not null then return new; end if;
 select application_email_enabled into v_email from public.profiles where id=a.candidate_id;
 perform private.queue_account_notice(a.candidate_id,'application:'||new.id,'Application '||case new.event_type when 'received' then 'received' when 'opened' then 'opened' else 'updated' end,a.job_title_snapshot||' · '||left(new.message,1500),'/applications',coalesce(v_email,true));
 if new.event_type='received' then
  for m in select om.user_id from public.organisation_members om join public.jobs j on j.organisation_id=om.organisation_id join public.organisations o on o.id=om.organisation_id where j.id=a.job_id and om.role in ('owner','admin','recruiter') and o.suspended_at is null loop
   -- One unread card per role groups applications; employers receive no per-application email.
   insert into public.notifications(user_id,event_key,title,message,path) values(m.user_id,'hiring:'||a.job_id,'New applications to review',a.job_title_snapshot||' has new applications. Open your hiring workspace to review them.','/employers/dashboard')
   on conflict(user_id,event_key) do update set read_at=null,created_at=now(),message=excluded.message;
  end loop;
 end if;
 return new;
end; $$;
create trigger application_notifications after insert on public.application_events for each row execute function private.notify_application_activity();
create function private.notify_job_closed() returns trigger language plpgsql security definer set search_path='' as $$
declare a record;
begin
 if new.status='closed' and old.status<>'closed' then
  for a in select id,candidate_id from public.applications where job_id=new.id and withdrawn_at is null loop
   insert into public.application_events(application_id,actor_id,event_type,message) values(a.id,auth.uid(),'employer_update','This vacancy has closed. Your recorded application stage remains available; closure does not itself mean a rejection.');
  end loop;
 end if;
 return new;
end; $$;
create trigger job_closure_notice after update of status on public.jobs for each row execute function private.notify_job_closed();

alter table public.organisations add column careers_email text check(careers_email is null or (char_length(careers_email)<=254 and careers_email ~ '^[^ @]+@[^ @]+[.][^ @]+$')),
 add column avatar_path text, add column banner_path text;
alter table public.jobs add column contact_email text check(contact_email is null or (char_length(contact_email)<=254 and contact_email ~ '^[^ @]+@[^ @]+[.][^ @]+$'));
grant insert(contact_email),update(contact_email) on public.jobs to authenticated;
create function private.contact_edit_review() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user='authenticated' and new.contact_email is distinct from old.contact_email then
  new.status:='draft'; new.moderation_status:='pending'; new.publication_requested:=old.publication_requested or old.status='published';
 end if; return new;
end; $$;
create trigger contact_change_review before update of contact_email on public.jobs for each row execute function private.contact_edit_review();
create table public.listing_documents (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id) on delete cascade,
 uploaded_by uuid not null references auth.users(id), filename text not null check(char_length(filename)<=180), storage_path text not null unique,
 media_type text not null, bytes integer not null check(bytes between 1 and 4194304),created_at timestamptz not null default now()
);
create index listing_docs_job on public.listing_documents(job_id);
alter table public.listing_documents enable row level security;
revoke all on public.listing_documents from public,anon,authenticated;
grant select(id,job_id,filename,media_type,bytes,created_at) on public.listing_documents to anon,authenticated;grant all on public.listing_documents to service_role;
create function private.listing_document_review() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
 perform pg_advisory_xact_lock(hashtextextended('listing-docs:'||new.job_id::text,0));
 if(select count(*) from public.listing_documents where job_id=new.job_id)>=5 then raise exception 'A listing supports five documents' using errcode='22023';end if;
 end if;
 update public.jobs set status='draft',moderation_status='pending',publication_requested=true,moderation_updated_at=clock_timestamp() where id=case when tg_op='DELETE' then old.job_id else new.job_id end;
 return case when tg_op='DELETE' then old else new end;
end; $$;
create trigger document_change_review before insert or delete on public.listing_documents for each row execute function private.listing_document_review();
create policy listing_documents_visible on public.listing_documents for select to anon,authenticated using(exists(select 1 from public.jobs where id=job_id));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('employer-assets','employer-assets',false,4194304,array['image/webp','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) on conflict(id) do nothing;

create table private.sample_employer_invites(email text primary key check(email=lower(email)));
alter table private.sample_employer_invites enable row level security;
revoke all on private.sample_employer_invites from public,anon,authenticated;grant all on private.sample_employer_invites to service_role;
create function private.has_sample_workspace() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join private.sample_employer_invites i on i.email=lower(u.email) where u.id=auth.uid() and u.email_confirmed_at is not null);
$$;
revoke all on function private.has_sample_workspace() from public,anon;grant execute on function private.has_sample_workspace() to authenticated;
create function public.my_sample_workspace() returns boolean language sql stable security invoker set search_path='' as $$ select private.has_sample_workspace(); $$;
revoke all on function public.my_sample_workspace() from public,anon;grant execute on function public.my_sample_workspace() to authenticated;
create table public.sample_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(title) between 3 and 180),description text not null check(char_length(description) between 20 and 20000),
 status text not null default 'draft' check(status in ('draft','open','closed')),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.sample_applications (
 id uuid primary key default gen_random_uuid(),job_id uuid not null references public.sample_jobs(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, candidate_name text not null default 'Alex (synthetic candidate)',
 status text not null default 'received' check(status in ('received','opened','shortlisted','interview','offer','not_proceeding')),created_at timestamptz not null default now()
);
alter table public.sample_jobs enable row level security;alter table public.sample_applications enable row level security;
revoke all on public.sample_jobs,public.sample_applications from public,anon,authenticated;
grant select,insert,update,delete on public.sample_jobs to authenticated;grant select,update(status) on public.sample_applications to authenticated; grant all on public.sample_jobs,public.sample_applications to service_role;
create policy sample_jobs_own on public.sample_jobs for all to authenticated using(user_id=(select auth.uid()) and (select private.has_sample_workspace())) with check(user_id=(select auth.uid()) and (select private.has_sample_workspace()));
create policy sample_apps_own on public.sample_applications for select to authenticated using(user_id=(select auth.uid()) and (select private.has_sample_workspace()));
create policy sample_apps_update on public.sample_applications for update to authenticated using(user_id=(select auth.uid()) and (select private.has_sample_workspace())) with check(user_id=(select auth.uid()) and (select private.has_sample_workspace()));
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
      ((b.kind<>'account' and not exists(select 1 from public.saved_searches s join auth.users u on u.id=s.user_id where s.id=b.search_id and s.alerts_enabled and u.email=b.recipient and u.email_confirmed_at is not null and (b.event_key='welcome' or not exists(select 1 from public.profiles p where p.id=b.user_id and not p.application_email_enabled)))) or (b.kind='account' and not exists(select 1 from auth.users u where u.id=b.user_id and u.email=b.recipient and u.email_confirmed_at is not null and (b.event_key='welcome' or not exists(select 1 from public.profiles p where p.id=b.user_id and not p.application_email_enabled)))))
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
  if ((b.kind<>'account' and not exists(select 1 from public.saved_searches s join auth.users u on u.id=s.user_id where s.id=b.search_id and s.alerts_enabled and u.email=b.recipient and u.email_confirmed_at is not null and (b.event_key='welcome' or not exists(select 1 from public.profiles p where p.id=b.user_id and not p.application_email_enabled)))) or (b.kind='account' and not exists(select 1 from auth.users u where u.id=b.user_id and u.email=b.recipient and u.email_confirmed_at is not null and (b.event_key='welcome' or not exists(select 1 from public.profiles p where p.id=b.user_id and not p.application_email_enabled)))))
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


revoke all on function private.guard_active_cv(),private.limit_saved_jobs(),private.limit_cv_history(),private.new_account_welcome_eligible(),private.welcome_on_profile(),private.notify_application_activity(),private.notify_job_closed(),private.contact_edit_review(),private.listing_document_review() from public,anon,authenticated;
commit;
